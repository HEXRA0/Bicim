'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Combine,
  Download,
  FileOutput,
  FileText,
  LockKeyhole,
  RefreshCw,
  RotateCw,
  Scissors,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { zipSync } from 'fflate';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

type Operation = 'merge' | 'extract' | 'split' | 'rotate';
type ResultFile = { url: string; name: string; size: number };

const MAX_TOTAL_BYTES = 75 * 1024 * 1024;
const MAX_PAGES = 500;

const operations: Array<{ value: Operation; label: string; detail: string }> = [
  { value: 'merge', label: 'PDF birleştir', detail: 'Birden fazla PDF’i tek dosyada sırala.' },
  { value: 'extract', label: 'Sayfa seç', detail: 'Seçtiğin sayfaları yeni bir PDF’e çıkar.' },
  { value: 'split', label: 'Sayfalara ayır', detail: 'Her sayfayı ayrı PDF olarak ZIP içinde indir.' },
  { value: 'rotate', label: 'Sayfa döndür', detail: 'Seçilen sayfaları 90°, 180° veya 270° döndür.' },
];

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_024 / 1_024).toFixed(1)} MB`;
}

function bytesToBlob(bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

function baseName(name: string) {
  return name.replace(/\.pdf$/i, '') || 'belge';
}

function parsePageSelection(value: string, total: number) {
  if (!value.trim()) return Array.from({ length: total }, (_, index) => index);
  const pages = new Set<number>();
  for (const part of value.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < start || end > total) throw new Error(`Sayfa aralığı 1-${total} içinde olmalı.`);
      for (let page = start; page <= end; page += 1) pages.add(page - 1);
      continue;
    }
    if (!/^\d+$/.test(token)) throw new Error('Sayfaları 1,3-5 gibi yaz.');
    const page = Number(token);
    if (page < 1 || page > total) throw new Error(`Sayfa numarası 1-${total} içinde olmalı.`);
    pages.add(page - 1);
  }
  if (!pages.size) throw new Error('En az bir sayfa seç.');
  return [...pages].sort((a, b) => a - b);
}

function triggerDownload(result: ResultFile) {
  const link = document.createElement('a');
  link.href = result.url;
  link.download = result.name;
  link.click();
}

export function PdfTools() {
  const [operation, setOperation] = useState<Operation>('merge');
  const [files, setFiles] = useState<File[]>([]);
  const [pageSelection, setPageSelection] = useState('');
  const [rotation, setRotation] = useState('90');
  const [result, setResult] = useState<ResultFile>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const needsPages = operation === 'extract' || operation === 'rotate';

  const clearResult = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(undefined);
  };

  const setSelectedFiles = (selected: File[]) => {
    const pdfs = selected.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    const limited = operation === 'merge' ? pdfs : pdfs.slice(0, 1);
    if (!limited.length) {
      setError('En az bir PDF dosyası seçmelisin.');
      return;
    }
    if (limited.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      setError('Toplam PDF boyutu 75 MB sınırını aşıyor.');
      return;
    }
    clearResult();
    setFiles(limited);
    setPageSelection('');
    setError('');
  };

  const removeFile = (index: number) => {
    clearResult();
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= files.length) return;
    clearResult();
    setFiles((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const process = async () => {
    if (!files.length) return;
    setWorking(true);
    setError('');
    clearResult();
    try {
      const { degrees, PDFDocument } = await import('pdf-lib');
      let output: Uint8Array;
      let name: string;
      let type = 'application/pdf';

      if (operation === 'merge') {
        if (files.length < 2) throw new Error('Birleştirmek için en az iki PDF seç.');
        const destination = await PDFDocument.create();
        let totalPages = 0;
        for (const file of files) {
          const source = await PDFDocument.load(await file.arrayBuffer());
          totalPages += source.getPageCount();
          if (totalPages > MAX_PAGES) throw new Error(`Toplam sayfa sayısı ${MAX_PAGES} sınırını aşıyor.`);
          const copied = await destination.copyPages(source, source.getPageIndices());
          copied.forEach((page) => destination.addPage(page));
        }
        output = await destination.save();
        name = 'bicim-birlestirilmis.pdf';
      } else {
        const source = await PDFDocument.load(await files[0].arrayBuffer());
        const totalPages = source.getPageCount();
        if (totalPages > MAX_PAGES) throw new Error(`PDF ${MAX_PAGES} sayfa sınırını aşıyor.`);
        const selected = parsePageSelection(pageSelection, totalPages);

        if (operation === 'extract') {
          const destination = await PDFDocument.create();
          const copied = await destination.copyPages(source, selected);
          copied.forEach((page) => destination.addPage(page));
          output = await destination.save();
          name = `${baseName(files[0].name)}-secili-sayfalar.pdf`;
        } else if (operation === 'split') {
          const entries: Record<string, Uint8Array> = {};
          for (let index = 0; index < totalPages; index += 1) {
            const destination = await PDFDocument.create();
            const [page] = await destination.copyPages(source, [index]);
            destination.addPage(page);
            entries[`${baseName(files[0].name)}-sayfa-${String(index + 1).padStart(3, '0')}.pdf`] = await destination.save();
          }
          output = zipSync(entries, { level: 6 });
          name = `${baseName(files[0].name)}-sayfalar.zip`;
          type = 'application/zip';
        } else {
          const angle = Number(rotation);
          selected.forEach((index) => {
            const page = source.getPage(index);
            page.setRotation(degrees((page.getRotation().angle + angle) % 360));
          });
          output = await source.save();
          name = `${baseName(files[0].name)}-dondurulmus.pdf`;
        }
      }

      const blob = bytesToBlob(output, type);
      setResult({ url: URL.createObjectURL(blob), name, size: blob.size });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PDF işlenemedi. Dosya şifreli veya bozuk olabilir.');
    } finally {
      setWorking(false);
    }
  };

  const changeOperation = (next: Operation) => {
    clearResult();
    setOperation(next);
    setFiles((current) => (next === 'merge' ? current : current.slice(0, 1)));
    setPageSelection('');
    setError('');
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader current="pdf" />
      <section className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <div className="mb-8 max-w-4xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-[0.03em] text-primary"><FileText className="size-4" /> PDF araçları</div>
          <h1 className="text-[clamp(2.5rem,5.2vw,4.9rem)] font-bold leading-[1.01] tracking-[-0.05em]">Sayfaları düzenle.<br /><span className="text-primary">PDF’ini yeniden kur.</span></h1>
        </div>

        <div className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {operations.map((item) => (
            <button key={item.value} type="button" className={`rounded-2xl border p-4 text-left transition ${operation === item.value ? 'border-primary bg-primary text-primary-foreground shadow-lg' : 'border-border bg-card hover:border-primary/50'}`} onClick={() => changeOperation(item.value)}>
              <span className="font-semibold">{item.label}</span><span className={`mt-1 block text-sm leading-relaxed ${operation === item.value ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{item.detail}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="data-workspace">
            {!files.length ? (
              <button type="button" className="drop-zone m-4 flex min-h-80 w-[calc(100%-2rem)] flex-col items-center justify-center px-6 text-center" onClick={() => inputRef.current?.click()}>
                <span className="mb-5 grid size-16 place-items-center rounded-2xl bg-secondary text-primary"><UploadCloud className="size-8" /></span>
                <span className="text-xl font-semibold">{operation === 'merge' ? 'PDF dosyalarını seç' : 'Bir PDF dosyası seç'}</span>
                <span className="mt-2 text-sm text-muted-foreground">Toplam dosya sınırı 75 MB · En fazla 500 sayfa</span>
              </button>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><p className="font-semibold">{files.length} PDF hazır</p><p className="text-sm text-muted-foreground">Toplam {formatBytes(totalSize)}</p></div><Button variant="outline" onClick={() => inputRef.current?.click()}><UploadCloud /> {operation === 'merge' ? 'PDF ekle' : 'PDF değiştir'}</Button></div>
                <div>
                  {files.map((file, index) => (
                    <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}><span className="file-icon"><FileText /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{file.name}</p><p className="text-sm text-muted-foreground">{formatBytes(file.size)}</p></div>{operation === 'merge' && <div className="flex"><Button variant="ghost" size="icon" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => moveFile(index, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon" aria-label="Aşağı taşı" disabled={index === files.length - 1} onClick={() => moveFile(index, 1)}><ArrowDown /></Button></div>}<Button variant="ghost" size="icon" aria-label="PDF’i kaldır" onClick={() => removeFile(index)}><Trash2 /></Button></div>
                  ))}
                </div>
              </>
            )}
            <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple={operation === 'merge'} onChange={(event) => { const selected = Array.from(event.target.files ?? []); setSelectedFiles(operation === 'merge' ? [...files, ...selected] : selected); event.target.value = ''; }} />
          </section>

          <aside className="settings-card h-fit lg:sticky lg:top-8">
            <p className="eyebrow">PDF işlemi</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{operations.find((item) => item.value === operation)?.label}</h2>
            {needsPages && <div className="mt-6"><label className="setting-label" htmlFor="pdf-pages">Sayfalar</label><Input id="pdf-pages" value={pageSelection} onChange={(event) => { setPageSelection(event.target.value); clearResult(); }} placeholder="Boş bırak: tümü · Örnek: 1,3-5" /><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Virgülle ayır; aralık için kısa çizgi kullan.</p></div>}
            {operation === 'rotate' && <div className="mt-5"><label className="setting-label" htmlFor="pdf-rotation">Döndürme açısı</label><NativeSelect id="pdf-rotation" className="w-full" value={rotation} onChange={(event) => { setRotation(event.target.value); clearResult(); }}><NativeSelectOption value="90">90° saat yönünde</NativeSelectOption><NativeSelectOption value="180">180°</NativeSelectOption><NativeSelectOption value="270">270° saat yönünde</NativeSelectOption></NativeSelect></div>}
            <Button className="mt-7 h-14 w-full rounded-xl text-base font-semibold" onClick={() => void process()} disabled={!files.length || working}>{working ? <RefreshCw className="animate-spin" /> : operation === 'merge' ? <Combine /> : operation === 'split' ? <Scissors /> : operation === 'rotate' ? <RotateCw /> : <FileOutput />}{working ? 'İşleniyor…' : 'PDF’i hazırla'}</Button>
            {result && <Button variant="outline" className="mt-3 h-12 w-full" onClick={() => triggerDownload(result)}><Download /> İndir · {formatBytes(result.size)}</Button>}
            {result && <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary"><Check className="size-4" /> Çıktı hazır</div>}
            {error && <p className="mt-4 text-sm font-medium text-destructive" role="alert">{error}</p>}
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm leading-relaxed text-secondary-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><p>PDF dosyaları yüklenmeden bu cihazda işlenir. Şifreli PDF’ler desteklenmez.</p></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
