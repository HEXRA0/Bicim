'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDown,
  Check,
  Download,
  FileImage,
  Files,
  LockKeyhole,
  Maximize2,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { gunzipSync, zipSync } from 'fflate';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';

type OutputFormat =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/gif'
  | 'image/bmp'
  | 'image/tiff'
  | 'image/x-icon'
  | 'application/pdf';
type JobStatus = 'ready' | 'working' | 'done' | 'error';

type ConversionJob = {
  id: string;
  file: File;
  status: JobStatus;
  outputUrl?: string;
  outputBlob?: Blob;
  outputSize?: number;
  outputName?: string;
  error?: string;
};

const formats: Array<{ mime: OutputFormat; label: string; ext: string }> = [
  { mime: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { mime: 'image/png', label: 'PNG', ext: 'png' },
  { mime: 'image/webp', label: 'WebP', ext: 'webp' },
  { mime: 'image/avif', label: 'AVIF', ext: 'avif' },
  { mime: 'image/gif', label: 'GIF (tek kare)', ext: 'gif' },
  { mime: 'image/bmp', label: 'BMP', ext: 'bmp' },
  { mime: 'image/tiff', label: 'TIFF', ext: 'tiff' },
  { mime: 'image/x-icon', label: 'ICO', ext: 'ico' },
  { mime: 'application/pdf', label: 'PDF', ext: 'pdf' },
];

const acceptedExtensions = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'avif',
  'gif',
  'bmp',
  'svg',
  'svgz',
  'heic',
  'heif',
  'tif',
  'tiff',
  'ico',
]);

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function outputName(name: string, mime: OutputFormat) {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${formats.find((item) => item.mime === mime)?.ext ?? 'jpg'}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== type) {
          reject(new Error('Bu hedef biçim tarayıcınızda desteklenmiyor.'));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function bytesToBlob(bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

function loadBrowserImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel tarayıcı tarafından açılamadı.'));
    };
    image.src = url;
  });
}

async function sanitizeSvg(file: File, compressed: boolean) {
  const source = compressed
    ? new TextDecoder().decode(gunzipSync(new Uint8Array(await file.arrayBuffer())))
    : await file.text();
  const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (documentNode.querySelector('parsererror')) {
    throw new Error('SVG dosyası okunamadı.');
  }

  documentNode.querySelectorAll('script, foreignObject, style').forEach((node) => node.remove());
  documentNode.querySelectorAll('*').forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith('on') ||
        (name === 'style' && /url\s*\(/i.test(value)) ||
        (['href', 'xlink:href', 'src'].includes(name) &&
          value !== '' &&
          !value.startsWith('#') &&
          !value.startsWith('data:image/'))
      ) {
        node.removeAttribute(attribute.name);
      }
    }
  });

  return new File(
    [new XMLSerializer().serializeToString(documentNode)],
    file.name.replace(/\.svgz$/i, '.svg'),
    { type: 'image/svg+xml' },
  );
}

async function decodeToCanvas(file: File) {
  const extension = extensionOf(file.name);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tarayıcı görsel motorunu başlatamadı.');

  if (extension === 'heic' || extension === 'heif') {
    const { heicTo } = await import('heic-to/csp');
    const bitmap = await heicTo({ blob: file, type: 'bitmap' });
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }

  if (extension === 'tif' || extension === 'tiff') {
    const UTIF = (await import('utif')).default;
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds.length) throw new Error('TIFF içinde görüntü bulunamadı.');
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    canvas.width = ifds[0].width;
    canvas.height = ifds[0].height;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height),
      0,
      0,
    );
    return canvas;
  }

  try {
    const browserFile =
      extension === 'svg' || extension === 'svgz'
        ? await sanitizeSvg(file, extension === 'svgz')
        : file;
    const image = await loadBrowserImage(browserFile);
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    context.drawImage(image, 0, 0);
    return canvas;
  } catch (error) {
    if (extension !== 'avif') throw error;
    const decodeAvif = (await import('@jsquash/avif/decode')).default;
    const imageData = await decodeAvif(await file.arrayBuffer());
    if (!imageData || imageData.data instanceof Uint16Array) {
      throw new Error('Bu AVIF alt türü desteklenmiyor.');
    }
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    context.putImageData(imageData, 0, 0);
    return canvas;
  }
}

function encodeBmp(imageData: ImageData) {
  const { width, height, data } = imageData;
  const offset = 54;
  const bytes = new Uint8Array(offset + width * height * 4);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x4d42, true);
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(34, width * height * 4, true);

  let targetIndex = offset;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (y * width + x) * 4;
      bytes[targetIndex++] = data[sourceIndex + 2];
      bytes[targetIndex++] = data[sourceIndex + 1];
      bytes[targetIndex++] = data[sourceIndex];
      bytes[targetIndex++] = data[sourceIndex + 3];
    }
  }
  return bytesToBlob(bytes, 'image/bmp');
}

async function encodeIco(canvas: HTMLCanvasElement) {
  const png = new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());
  const bytes = new Uint8Array(22 + png.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  bytes[6] = canvas.width >= 256 ? 0 : canvas.width;
  bytes[7] = canvas.height >= 256 ? 0 : canvas.height;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.byteLength, true);
  view.setUint32(18, 22, true);
  bytes.set(png, 22);
  return bytesToBlob(bytes, 'image/x-icon');
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  target: OutputFormat,
  quality: number,
) {
  if (target === 'image/jpeg' || target === 'image/png' || target === 'image/webp') {
    return canvasToBlob(canvas, target, quality / 100);
  }

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Çıktı pikselleri okunamadı.');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  if (target === 'image/avif') {
    const encodeAvif = (await import('@jsquash/avif/encode')).default;
    const buffer = await encodeAvif(imageData, { quality, speed: 6 });
    return new Blob([buffer], { type: target });
  }

  if (target === 'image/gif') {
    const { GIFEncoder, applyPalette, quantize } = await import('gifenc');
    const palette = quantize(imageData.data, 256, {
      format: 'rgba4444',
      oneBitAlpha: true,
    });
    const index = applyPalette(imageData.data, palette, 'rgba4444');
    const gif = GIFEncoder();
    gif.writeFrame(index, canvas.width, canvas.height, {
      palette,
      transparent: true,
    });
    gif.finish();
    return bytesToBlob(gif.bytes(), target);
  }

  if (target === 'image/bmp') return encodeBmp(imageData);

  if (target === 'image/tiff') {
    const UTIF = (await import('utif')).default;
    const rgba = new Uint8Array(imageData.data.byteLength);
    rgba.set(imageData.data);
    return new Blob([UTIF.encodeImage(rgba.buffer, canvas.width, canvas.height)], {
      type: target,
    });
  }

  if (target === 'image/x-icon') return encodeIco(canvas);

  const { PDFDocument } = await import('pdf-lib');
  const png = await canvasToBlob(canvas, 'image/png');
  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedPng(await png.arrayBuffer());
  const page = pdf.addPage([canvas.width, canvas.height]);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  });
  return bytesToBlob(await pdf.save(), 'application/pdf');
}

async function convertFile(
  file: File,
  target: OutputFormat,
  quality: number,
  background: string,
  resizeEnabled: boolean,
  maxEdge: number,
) {
  const source = await decodeToCanvas(file);
  const canvas = document.createElement('canvas');
  const longestEdge = Math.max(source.width, source.height);
  const requestedEdge =
    target === 'image/x-icon'
      ? resizeEnabled
        ? Math.min(maxEdge, 256)
        : 256
      : maxEdge;
  const shouldResize = (resizeEnabled || target === 'image/x-icon') && longestEdge > requestedEdge;
  const scale = shouldResize ? requestedEdge / longestEdge : 1;
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tarayıcı dönüştürme motorunu başlatamadı.');

  if (target === 'image/jpeg') {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return encodeCanvas(canvas, target, quality);
}

export default function Home() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [target, setTarget] = useState<OutputFormat>('image/jpeg');
  const [quality, setQuality] = useState(88);
  const [background, setBackground] = useState('#ffffff');
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [maxEdge, setMaxEdge] = useState(1920);
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [fileNotice, setFileNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    type ToolInput = {
      target?: string;
      quality?: number;
      background?: string;
      resize?: boolean;
      maxEdge?: number;
    };
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
            'Biçim arayüzündeki hedef görsel biçimini, kaliteyi, JPEG arka plan rengini ve boyutlandırmayı ayarlar.',
          inputSchema: {
            type: 'object',
            properties: {
              target: {
                type: 'string',
                enum: ['jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'ico', 'pdf'],
              },
              quality: { type: 'integer', minimum: 45, maximum: 100 },
              background: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
              resize: { type: 'boolean' },
              maxEdge: { type: 'integer', minimum: 64, maximum: 12000 },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const targetMap: Record<string, OutputFormat> = {
              jpeg: 'image/jpeg',
              png: 'image/png',
              webp: 'image/webp',
              avif: 'image/avif',
              gif: 'image/gif',
              bmp: 'image/bmp',
              tiff: 'image/tiff',
              ico: 'image/x-icon',
              pdf: 'application/pdf',
            };
            if (input.target !== undefined && !(input.target in targetMap)) {
              throw new Error('Geçerli bir hedef biçim seçilmeli.');
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
            if (
              input.maxEdge !== undefined &&
              (!Number.isInteger(input.maxEdge) || input.maxEdge < 64 || input.maxEdge > 12000)
            ) {
              throw new Error('En uzun kenar 64 ile 12000 piksel arasında olmalı.');
            }

            const nextTarget = input.target ? targetMap[input.target] : target;
            const nextQuality = input.quality ?? quality;
            const nextBackground = input.background ?? background;
            const nextResize = input.resize ?? resizeEnabled;
            const nextMaxEdge = input.maxEdge ?? maxEdge;
            setTarget(nextTarget);
            setQuality(nextQuality);
            setBackground(nextBackground);
            setResizeEnabled(nextResize);
            setMaxEdge(nextMaxEdge);
            return {
              target: nextTarget.replace('image/', ''),
              quality: nextQuality,
              background: nextBackground,
              resize: nextResize,
              maxEdge: nextMaxEdge,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [background, maxEdge, quality, resizeEnabled, target]);

  const readyCount = jobs.filter((job) => job.status !== 'done').length;
  const completedJobs = jobs.filter(
    (job) => job.status === 'done' && job.outputBlob && job.outputName,
  );
  const totalInput = useMemo(
    () => jobs.reduce((sum, job) => sum + job.file.size, 0),
    [jobs],
  );

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const incomingFiles = Array.from(incoming);
    const valid = incomingFiles.filter((file) =>
      acceptedExtensions.has(extensionOf(file.name)),
    );
    const rejected = incomingFiles.length - valid.length;
    setFileNotice(
      rejected
        ? `${rejected} dosya desteklenen görsel biçimlerinden biri olmadığı için eklenmedi.`
        : '',
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

  const downloadZip = async () => {
    if (completedJobs.length < 2) return;
    const files: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();

    for (const [index, job] of completedJobs.entries()) {
      let name = job.outputName as string;
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf('.');
        name = `${name.slice(0, dot)}-${index + 1}${name.slice(dot)}`;
      }
      usedNames.add(name);
      files[name] = new Uint8Array(await (job.outputBlob as Blob).arrayBuffer());
    }

    const zipped = zipSync(files, { level: 6 });
    const archiveBuffer = new ArrayBuffer(zipped.byteLength);
    new Uint8Array(archiveBuffer).set(zipped);
    const archive = new Blob([archiveBuffer], {
      type: 'application/zip',
    });
    const url = URL.createObjectURL(archive);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bicim-dosyalari.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
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
        const blob = await convertFile(
          job.file,
          target,
          quality,
          background,
          resizeEnabled,
          maxEdge,
        );
        const url = URL.createObjectURL(blob);
        setJobs((current) =>
          current.map((item) => {
            if (item.id !== job.id) return item;
            if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
            return {
              ...item,
              status: 'done',
              outputUrl: url,
              outputBlob: blob,
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
            <span className="text-xl font-bold tracking-[-0.025em]">biçim</span>
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
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-[0.03em] text-primary">
              <Sparkles className="size-4" /> Hızlı görsel dönüştürücü
            </div>
            <h1 className="text-[clamp(2.5rem,5.2vw,4.9rem)] font-bold leading-[1.01] tracking-[-0.05em]">
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
              accept=".png,.jpg,.jpeg,.webp,.avif,.gif,.bmp,.svg,.svgz,.heic,.heif,.tif,.tiff,.ico"
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
              <span className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Görsellerini buraya bırak</span>
              <span className="mt-3 text-base text-muted-foreground">veya seçmek için tıkla · 10+ giriş biçimi</span>
            </button>
            <div className="drop-footer">
              <span><Files className="size-4" /> PNG · JPEG · WebP · AVIF · GIF · BMP · SVG · HEIC · TIFF · ICO</span>
              <span><Zap className="size-4" /> 9 çıktı biçimi</span>
            </div>
          </div>

          {fileNotice && (
            <p className="mt-3 text-sm font-medium text-destructive" role="status">
              {fileNotice}
            </p>
          )}

          {jobs.length > 0 && (
            <section className="mt-8" aria-labelledby="files-title">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><p className="eyebrow">Dönüşüm sırası</p><h2 id="files-title" className="mt-1 text-2xl font-semibold tracking-tight">{jobs.length} dosya</h2></div>
                <div className="flex gap-2">
                  {completedJobs.length > 1 && (
                    <Button variant="outline" onClick={downloadZip}><Archive /> ZIP indir</Button>
                  )}
                  <Button variant="ghost" onClick={clearJobs} disabled={converting}><Trash2 /> <span className="hidden sm:inline">Tümünü temizle</span></Button>
                </div>
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
              <div><p className="eyebrow">Çıktı ayarları</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Nasıl olsun?</h2></div>
              <span className="step-badge">01</span>
            </div>

            <label className="setting-label" htmlFor="target-format">Hedef biçim</label>
            <NativeSelect id="target-format" className="w-full" value={target} onChange={(event) => setTarget(event.target.value as OutputFormat)}>
              {formats.map((format) => <NativeSelectOption key={format.mime} value={format.mime}>{format.label}</NativeSelectOption>)}
            </NativeSelect>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Hareketli görsellerin ilk karesi kullanılır. ICO çıktısı en fazla 256 px olur.
            </p>

            <div className="resize-setting">
              <label className="flex cursor-pointer items-center gap-3">
                <Checkbox
                  checked={resizeEnabled}
                  onCheckedChange={setResizeEnabled}
                  aria-label="Görseli boyutlandır"
                />
                <span className="flex items-center gap-2 font-semibold">
                  <Maximize2 className="size-4 text-primary" /> Boyutlandır
                </span>
              </label>
              {resizeEnabled && (
                <div className="mt-4">
                  <label className="setting-label" htmlFor="max-edge">En uzun kenar</label>
                  <div className="relative">
                    <Input
                      id="max-edge"
                      type="number"
                      min={64}
                      max={12000}
                      value={maxEdge}
                      onChange={(event) =>
                        setMaxEdge(Math.min(12000, Math.max(64, Number(event.target.value) || 64)))
                      }
                      className="h-11 pr-12"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">px</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Oran korunur; küçük görseller büyütülmez.</p>
                </div>
              )}
            </div>

            {(['image/jpeg', 'image/webp', 'image/avif'] as OutputFormat[]).includes(target) && (
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

            <Button className="h-14 w-full rounded-xl text-base font-semibold shadow-[0_12px_24px_oklch(0.55_0.24_260/22%)]" onClick={convertAll} disabled={!jobs.length || converting}>
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
