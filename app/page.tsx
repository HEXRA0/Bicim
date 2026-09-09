'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  Download,
  FileImage,
  Files,
  LockKeyhole,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';

type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';
type JobStatus = 'ready' | 'working' | 'done' | 'error';

type ConversionJob = {
  id: string;
  file: File;
  status: JobStatus;
  outputUrl?: string;
  outputSize?: number;
  outputName?: string;
  error?: string;
};

const formats: Array<{ mime: OutputFormat; label: string; ext: string }> = [
  { mime: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { mime: 'image/png', label: 'PNG', ext: 'png' },
  { mime: 'image/webp', label: 'WebP', ext: 'webp' },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function outputName(name: string, mime: OutputFormat) {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${formats.find((item) => item.mime === mime)?.ext ?? 'jpg'}`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel açılamadı.'));
    };
    image.src = url;
  });
}

function convertFile(
  file: File,
  target: OutputFormat,
  quality: number,
  background: string,
) {
  return loadImage(file).then(
    (image) =>
      new Promise<Blob>((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Tarayıcı dönüştürme motorunu başlatamadı.'));
          return;
        }

        if (target === 'image/jpeg') {
          context.fillStyle = background;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(image, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Bu hedef biçim tarayıcınızda desteklenmiyor.'));
          },
          target,
          quality / 100,
        );
      }),
  );
}

export default function Home() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [target, setTarget] = useState<OutputFormat>('image/jpeg');
  const [quality, setQuality] = useState(88);
  const [background, setBackground] = useState('#ffffff');
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    type ToolInput = { target?: string; quality?: number; background?: string };
    type ModelContext = {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: ToolInput) => Promise<object>;
        },
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const modelContext = (document as unknown as { modelContext?: ModelContext })
      .modelContext;
    if (!modelContext?.registerTool) return;

    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: 'configure_image_conversion',
          title: 'Görsel dönüşümünü ayarla',
          description:
            'Biçim arayüzündeki hedef görsel biçimini, kaliteyi ve JPEG arka plan rengini ayarlar.',
          inputSchema: {
            type: 'object',
            properties: {
              target: { type: 'string', enum: ['jpeg', 'png', 'webp'] },
              quality: { type: 'integer', minimum: 45, maximum: 100 },
              background: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const targetMap: Record<string, OutputFormat> = {
              jpeg: 'image/jpeg',
              png: 'image/png',
              webp: 'image/webp',
            };
            if (input.target !== undefined && !(input.target in targetMap)) {
              throw new Error('Hedef biçim jpeg, png veya webp olmalı.');
            }
            if (
              input.quality !== undefined &&
              (!Number.isInteger(input.quality) || input.quality < 45 || input.quality > 100)
            ) {
              throw new Error('Kalite 45 ile 100 arasında bir tam sayı olmalı.');
            }
            if (
              input.background !== undefined &&
              !/^#[0-9a-fA-F]{6}$/.test(input.background)
            ) {
              throw new Error('Arka plan rengi #RRGGBB biçiminde olmalı.');
            }

            const nextTarget = input.target ? targetMap[input.target] : target;
            const nextQuality = input.quality ?? quality;
            const nextBackground = input.background ?? background;
            setTarget(nextTarget);
            setQuality(nextQuality);
            setBackground(nextBackground);
            return {
              target: nextTarget.replace('image/', ''),
              quality: nextQuality,
              background: nextBackground,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [background, quality, target]);

  const readyCount = jobs.filter((job) => job.status !== 'done').length;
  const totalInput = useMemo(
    () => jobs.reduce((sum, job) => sum + job.file.size, 0),
    [jobs],
  );

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const valid = Array.from(incoming).filter((file) =>
      ['image/png', 'image/jpeg', 'image/webp'].includes(file.type),
    );
    setJobs((current) => [
      ...current,
      ...valid.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        status: 'ready' as const,
      })),
    ]);
  }, []);

  const removeJob = (id: string) => {
    setJobs((current) => {
      const selected = current.find((job) => job.id === id);
      if (selected?.outputUrl) URL.revokeObjectURL(selected.outputUrl);
      return current.filter((job) => job.id !== id);
    });
  };

  const clearJobs = () => {
    jobs.forEach((job) => job.outputUrl && URL.revokeObjectURL(job.outputUrl));
    setJobs([]);
  };

  const convertAll = async () => {
    if (!jobs.length || converting) return;
    setConverting(true);

    for (const job of jobs) {
      setJobs((current) =>
        current.map((item) =>
          item.id === job.id ? { ...item, status: 'working', error: undefined } : item,
        ),
      );
      try {
        const blob = await convertFile(job.file, target, quality, background);
        const url = URL.createObjectURL(blob);
        setJobs((current) =>
          current.map((item) => {
            if (item.id !== job.id) return item;
            if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
            return {
              ...item,
              status: 'done',
              outputUrl: url,
              outputSize: blob.size,
              outputName: outputName(item.file.name, target),
            };
          }),
        );
      } catch (error) {
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Dönüştürme başarısız oldu.',
                }
              : item,
          ),
        );
      }
    }
    setConverting(false);
  };

  const targetLabel = formats.find((format) => format.mime === target)?.label;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="#" className="flex items-center gap-3" aria-label="Biçim ana sayfa">
            <span className="logo-mark" aria-hidden="true"><span>B</span></span>
            <span className="text-xl font-extrabold tracking-[-0.04em]">biçim</span>
          </a>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <LockKeyhole className="size-4 text-primary" />
            <span className="hidden sm:inline">Dosyaların cihazından çıkmaz</span>
            <span className="sm:hidden">Yerel işlem</span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1440px] gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-12 lg:py-14">
        <div className="min-w-0">
          <div className="mb-8 max-w-3xl">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-primary">
              <Sparkles className="size-4" /> Hızlı görsel dönüştürücü
            </div>
            <h1 className="text-[clamp(2.6rem,6vw,5.8rem)] font-black leading-[0.9] tracking-[-0.075em]">
              Dosyanın biçimi<br /><span className="text-primary">sana uysun.</span>
            </h1>
          </div>

          <div
            className={`drop-zone ${dragging ? 'is-dragging' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="flex w-full flex-col items-center px-6 py-12 text-center sm:py-16"
              onClick={() => inputRef.current?.click()}
            >
              <span className="mb-7 grid size-20 place-items-center rounded-[1.6rem] bg-primary text-primary-foreground shadow-[0_12px_30px_oklch(0.55_0.24_260/24%)]">
                <UploadCloud className="size-9" strokeWidth={2.2} />
              </span>
              <span className="text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">Görsellerini buraya bırak</span>
              <span className="mt-3 text-base text-muted-foreground">veya seçmek için tıkla · PNG, JPEG ve WebP</span>
            </button>
            <div className="drop-footer">
              <span><Files className="size-4" /> Birden fazla dosya seçebilirsin</span>
              <span><Zap className="size-4" /> Yükleme beklemeden dönüştür</span>
            </div>
          </div>

          {jobs.length > 0 && (
            <section className="mt-8" aria-labelledby="files-title">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><p className="eyebrow">Dönüşüm sırası</p><h2 id="files-title" className="mt-1 text-2xl font-extrabold tracking-tight">{jobs.length} dosya</h2></div>
                <Button variant="ghost" onClick={clearJobs} disabled={converting}><Trash2 /> Tümünü temizle</Button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {jobs.map((job) => (
                  <div key={job.id} className="file-row">
                    <span className={`file-icon ${job.status}`}>
                      {job.status === 'done' ? <Check /> : job.status === 'working' ? <RefreshCw className="animate-spin" /> : <FileImage />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{job.file.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {formatBytes(job.file.size)}
                        {job.status === 'working' && ' · Dönüştürülüyor…'}
                        {job.status === 'done' && job.outputSize !== undefined && ` → ${formatBytes(job.outputSize)}`}
                        {job.status === 'error' && ` · ${job.error}`}
                      </p>
                    </div>
                    {job.status === 'done' && job.outputUrl ? (
                      <a className="download-link" href={job.outputUrl} download={job.outputName}>
                        <Download /> <span className="hidden sm:inline">İndir</span>
                      </a>
                    ) : (
                      <Button variant="ghost" size="icon" aria-label={`${job.file.name} dosyasını kaldır`} onClick={() => removeJob(job.id)} disabled={converting}><X /></Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start" aria-label="Dönüşüm ayarları">
          <div className="settings-card">
            <div className="mb-7 flex items-center justify-between">
              <div><p className="eyebrow">Çıktı ayarları</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight">Nasıl olsun?</h2></div>
              <span className="step-badge">01</span>
            </div>

            <label className="setting-label" htmlFor="target-format">Hedef biçim</label>
            <NativeSelect id="target-format" className="w-full" value={target} onChange={(event) => setTarget(event.target.value as OutputFormat)}>
              {formats.map((format) => <NativeSelectOption key={format.mime} value={format.mime}>{format.label}</NativeSelectOption>)}
            </NativeSelect>

            {target !== 'image/png' && (
              <div className="mt-7">
                <div className="mb-4 flex items-center justify-between"><span className="setting-label mb-0">Kalite</span><span className="quality-value">%{quality}</span></div>
                <Slider aria-label="Çıktı kalitesi" min={45} max={100} value={[quality]} onValueChange={(value) => setQuality(Array.isArray(value) ? value[0] : value)} />
                <div className="mt-3 flex justify-between text-xs font-medium text-muted-foreground"><span>Daha küçük</span><span>Daha net</span></div>
              </div>
            )}

            {target === 'image/jpeg' && (
              <div className="mt-7">
                <label className="setting-label" htmlFor="background-color">Şeffaf alanlar</label>
                <div className="color-field">
                  <input id="background-color" type="color" value={background} onChange={(event) => setBackground(event.target.value)} aria-label="JPEG arka plan rengi" />
                  <span>{background.toUpperCase()}</span><span className="ml-auto text-sm text-muted-foreground">Arka plan</span>
                </div>
              </div>
            )}

            <div className="my-8 flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" /><ArrowDown className="size-4" /><span className="h-px flex-1 bg-border" /></div>

            <Button className="h-14 w-full rounded-xl text-base font-bold shadow-[0_12px_24px_oklch(0.55_0.24_260/22%)]" onClick={convertAll} disabled={!jobs.length || converting}>
              {converting ? <RefreshCw className="animate-spin" /> : <Zap />}
              {converting ? 'Dönüştürülüyor…' : `${readyCount || jobs.length} dosyayı ${targetLabel} yap`}
            </Button>

            <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm leading-relaxed text-secondary-foreground">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><p>İşlem bu tarayıcıda gerçekleşir. Dosyaların hiçbir sunucuya gönderilmez.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="metric-card"><strong>{jobs.length || '—'}</strong><span>Dosya</span></div>
            <div className="metric-card"><strong>{jobs.length ? formatBytes(totalInput) : '—'}</strong><span>Toplam boyut</span></div>
          </div>
        </aside>
      </section>
    </main>
  );
}
