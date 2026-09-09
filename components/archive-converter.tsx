'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Download,
  FileArchive,
  FilePlus2,
  Files,
  LockKeyhole,
  PackageOpen,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { gzipSync, gunzipSync, unzipSync, zipSync } from 'fflate';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type ArchiveFormat = 'zip' | 'tar' | 'tgz';
type Entry = { name: string; data: Uint8Array };

const MAX_FILES = 2_000;
const MAX_UNPACKED_BYTES = 250 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const targets: Array<{ value: ArchiveFormat; label: string; extension: string }> = [
  { value: 'zip', label: 'ZIP', extension: 'zip' },
  { value: 'tar', label: 'TAR', extension: 'tar' },
  { value: 'tgz', label: 'TAR.GZ / TGZ', extension: 'tar.gz' },
];

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_024 / 1_024).toFixed(1)} MB`;
}

function cleanPath(path: string) {
  const parts = path.replaceAll('\\', '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('Arşiv güvenli olmayan bir dosya yolu içeriyor.');
  return parts.join('/');
}

function validateEntries(entries: Entry[]) {
  if (!entries.length) throw new Error('Arşivde dönüştürülebilecek dosya bulunamadı.');
  if (entries.length > MAX_FILES) throw new Error(`Bir arşivde en fazla ${MAX_FILES} dosya işlenebilir.`);
  const total = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  if (total > MAX_UNPACKED_BYTES) throw new Error('Açılmış arşiv boyutu 250 MB sınırını aşıyor.');
  return entries;
}

function readText(bytes: Uint8Array, offset: number, length: number) {
  const value = decoder.decode(bytes.subarray(offset, offset + length));
  const end = value.indexOf('\0');
  return (end >= 0 ? value.slice(0, end) : value).trim();
}

function bytesToBlob(bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

function readOctal(bytes: Uint8Array, offset: number, length: number) {
  const value = readText(bytes, offset, length).replace(/\s/g, '');
  return value ? Number.parseInt(value, 8) : 0;
}

function writeText(target: Uint8Array, offset: number, length: number, value: string) {
  const bytes = encoder.encode(value);
  target.set(bytes.subarray(0, length), offset);
}

function writeOctal(target: Uint8Array, offset: number, length: number, value: number) {
  writeText(target, offset, length, value.toString(8).padStart(length - 1, '0') + '\0');
}

function splitTarName(name: string) {
  const safe = cleanPath(name);
  if (encoder.encode(safe).byteLength <= 100) return { name: safe, prefix: '' };
  const slash = safe.lastIndexOf('/');
  if (slash > 0) {
    const prefix = safe.slice(0, slash);
    const leaf = safe.slice(slash + 1);
    if (encoder.encode(prefix).byteLength <= 155 && encoder.encode(leaf).byteLength <= 100) {
      return { name: leaf, prefix };
    }
  }
  throw new Error(`Dosya yolu TAR için çok uzun: ${safe}`);
}

function createTar(entries: Entry[]) {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    const path = splitTarName(entry.name);
    writeText(header, 0, 100, path.name);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, entry.data.byteLength);
    writeOctal(header, 136, 12, Math.floor(Date.now() / 1_000));
    header.fill(32, 148, 156);
    header[156] = 48;
    writeText(header, 257, 6, 'ustar\0');
    writeText(header, 263, 2, '00');
    writeText(header, 345, 155, path.prefix);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeText(header, 148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
    chunks.push(header, entry.data);
    const padding = (512 - (entry.data.byteLength % 512)) % 512;
    if (padding) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(1_024));
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function extractTar(bytes: Uint8Array) {
  const entries: Entry[] = [];
  let offset = 0;
  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const leaf = readText(header, 0, 100);
    const prefix = readText(header, 345, 155);
    const name = cleanPath(prefix ? `${prefix}/${leaf}` : leaf);
    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const start = offset + 512;
    const end = start + size;
    if (end > bytes.byteLength) throw new Error('TAR arşivi eksik veya bozuk.');
    if (type === '0' && name) entries.push({ name, data: bytes.slice(start, end) });
    offset = start + Math.ceil(size / 512) * 512;
  }
  return validateEntries(entries);
}

function sourceKind(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tgz';
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.gz')) return 'gz';
  return 'files';
}

async function loadEntries(files: File[]) {
  if (files.length === 1) {
    const file = files[0];
    const kind = sourceKind(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kind === 'zip') {
      const unpacked = unzipSync(bytes);
      return validateEntries(
        Object.entries(unpacked)
          .filter(([name]) => !name.endsWith('/'))
          .map(([name, data]) => ({ name: cleanPath(name), data })),
      );
    }
    if (kind === 'tar') return extractTar(bytes);
    if (kind === 'tgz') return extractTar(gunzipSync(bytes));
    if (kind === 'gz') {
      return validateEntries([{ name: cleanPath(file.name.replace(/\.gz$/i, '') || 'dosya'), data: gunzipSync(bytes) }]);
    }
  }
  return validateEntries(
    await Promise.all(files.map(async (file) => ({ name: cleanPath(file.webkitRelativePath || file.name), data: new Uint8Array(await file.arrayBuffer()) }))),
  );
}

function createOutput(entries: Entry[], format: ArchiveFormat) {
  if (format === 'zip') {
    return bytesToBlob(
      zipSync(Object.fromEntries(entries.map((entry) => [entry.name, entry.data])), { level: 6 }),
      'application/zip',
    );
  }
  const tar = createTar(entries);
  if (format === 'tgz') return bytesToBlob(gzipSync(tar, { level: 6 }), 'application/gzip');
  return bytesToBlob(tar, 'application/x-tar');
}

export function ArchiveConverter() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sourceLabel, setSourceLabel] = useState('');
  const [target, setTarget] = useState<ArchiveFormat>('zip');
  const [result, setResult] = useState<{ url: string; name: string; size: number }>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalSize = useMemo(() => entries.reduce((sum, entry) => sum + entry.data.byteLength, 0), [entries]);

  const clearResult = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(undefined);
  };

  const selectFiles = async (files: File[]) => {
    if (!files.length) return;
    setWorking(true);
    setError('');
    clearResult();
    try {
      const loaded = await loadEntries(files);
      setEntries(loaded);
      setSourceLabel(files.length === 1 ? files[0].name : `${files.length} dosya`);
      if (files.length === 1 && sourceKind(files[0].name) === 'zip') setTarget('tgz');
      else setTarget('zip');
    } catch (caught) {
      setEntries([]);
      setSourceLabel('');
      setError(caught instanceof Error ? caught.message : 'Dosyalar okunamadı.');
    } finally {
      setWorking(false);
    }
  };

  const convert = () => {
    setWorking(true);
    setError('');
    clearResult();
    try {
      const blob = createOutput(entries, target);
      const extension = targets.find((item) => item.value === target)?.extension ?? target;
      setResult({ url: URL.createObjectURL(blob), name: `bicim-arsiv.${extension}`, size: blob.size });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Arşiv oluşturulamadı.');
    } finally {
      setWorking(false);
    }
  };

  const clear = () => {
    clearResult();
    setEntries([]);
    setSourceLabel('');
    setError('');
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader current="archive" />
      <section className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <div className="mb-8 max-w-4xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-[0.03em] text-primary">
            <Archive className="size-4" /> Arşiv dönüştürücü
          </div>
          <h1 className="text-[clamp(2.5rem,5.2vw,4.9rem)] font-bold leading-[1.01] tracking-[-0.05em]">
            Dosyaları aç.<br /><span className="text-primary">Yeniden paketle.</span>
          </h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="data-workspace">
            {!entries.length ? (
              <button className="drop-zone m-4 flex min-h-80 w-[calc(100%-2rem)] flex-col items-center justify-center px-6 text-center" type="button" onClick={() => inputRef.current?.click()}>
                <span className="mb-5 grid size-16 place-items-center rounded-2xl bg-secondary text-primary"><PackageOpen className="size-8" /></span>
                <span className="text-xl font-semibold">Arşiv veya dosyalarını seç</span>
                <span className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">ZIP, TAR, TAR.GZ, TGZ ve GZ açılır. Birden fazla normal dosyadan yeni arşiv oluşturulur.</span>
              </button>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <div className="flex items-center gap-3"><span className="file-icon"><FileArchive /></span><div><p className="font-semibold">{sourceLabel}</p><p className="text-sm text-muted-foreground">{entries.length} dosya · {formatBytes(totalSize)} açılmış boyut</p></div></div>
                  <div className="flex gap-2"><Button variant="outline" onClick={() => inputRef.current?.click()}><FilePlus2 /> Yeniden seç</Button><Button variant="ghost" size="icon" aria-label="Dosyaları temizle" onClick={clear}><Trash2 /></Button></div>
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                  {entries.map((entry, index) => (
                    <div className="file-row" key={`${entry.name}-${index}`}><span className="file-icon"><Files /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{entry.name}</p><p className="text-sm text-muted-foreground">{formatBytes(entry.data.byteLength)}</p></div></div>
                  ))}
                </div>
              </>
            )}
            <input ref={inputRef} className="sr-only" type="file" multiple onChange={(event) => { void selectFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
          </section>

          <aside className="settings-card h-fit lg:sticky lg:top-8">
            <p className="eyebrow">Hedef arşiv</p>
            <label className="setting-label mt-5" htmlFor="archive-target">Çıktı biçimi</label>
            <NativeSelect id="archive-target" className="w-full" value={target} onChange={(event) => { setTarget(event.target.value as ArchiveFormat); clearResult(); }}>
              {targets.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
            </NativeSelect>
            <Button className="mt-7 h-14 w-full rounded-xl text-base font-semibold" onClick={convert} disabled={!entries.length || working}>
              {working ? <RefreshCw className="animate-spin" /> : <Archive />}{working ? 'Hazırlanıyor…' : 'Arşivi oluştur'}
            </Button>
            {result && <a className="download-link mt-3 h-12 w-full" href={result.url} download={result.name}><Download /> İndir · {formatBytes(result.size)}</a>}
            {result && <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary"><Check className="size-4" /> Arşiv hazır</div>}
            {error && <p className="mt-4 text-sm font-medium text-destructive" role="alert">{error}</p>}
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm leading-relaxed text-secondary-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><p>Arşiv içeriği yüklenmeden bu cihazda işlenir. En fazla 2.000 dosya ve 250 MB açılmış boyut.</p></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
