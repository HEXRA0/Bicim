'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Binary,
  Check,
  Clipboard,
  Download,
  FileText,
  LockKeyhole,
  RefreshCw,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react';
import { DataSectionNav } from '@/components/data-section-nav';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

type TextFormat = 'text' | 'base64' | 'base64url' | 'hex' | 'url' | 'html';

const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const encoder = new TextEncoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

const formats: Array<{ value: TextFormat; label: string; extension: string }> = [
  { value: 'text', label: 'Düz metin / UTF-8', extension: 'txt' },
  { value: 'base64', label: 'Base64', extension: 'base64.txt' },
  { value: 'base64url', label: 'Base64URL', extension: 'base64url.txt' },
  { value: 'hex', label: 'HEX', extension: 'hex.txt' },
  { value: 'url', label: 'URL kodlama', extension: 'url.txt' },
  { value: 'html', label: 'HTML karakterleri', extension: 'html.txt' },
];

function bytesToBinary(bytes: Uint8Array) {
  let result = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return result;
}

function decodeBase64(value: string, urlSafe: boolean) {
  const compact = value.replace(/\s/g, '');
  const normalized = urlSafe ? compact.replaceAll('-', '+').replaceAll('_', '/') : compact;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error('Base64 metni geçerli değil.');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    return strictDecoder.decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    throw new Error('Kodlanmış veri geçerli UTF-8 metin içermiyor.');
  }
}

function decodeHex(value: string) {
  const compact = value.replace(/\s/g, '');
  if (!compact || compact.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(compact)) {
    throw new Error('HEX metni çift sayıda geçerli onaltılık karakter içermeli.');
  }
  const bytes = new Uint8Array(compact.length / 2);
  for (let index = 0; index < compact.length; index += 2) {
    bytes[index / 2] = Number.parseInt(compact.slice(index, index + 2), 16);
  }
  try {
    return strictDecoder.decode(bytes);
  } catch {
    throw new Error('HEX verisi geçerli UTF-8 metin içermiyor.');
  }
}

function decodeHtml(value: string) {
  const documentNode = new DOMParser().parseFromString(`<textarea>${value}</textarea>`, 'text/html');
  return documentNode.querySelector('textarea')?.value ?? '';
}

function toPlainText(value: string, format: TextFormat) {
  if (format === 'text') return value;
  if (format === 'base64') return decodeBase64(value, false);
  if (format === 'base64url') return decodeBase64(value, true);
  if (format === 'hex') return decodeHex(value);
  if (format === 'html') return decodeHtml(value);
  try {
    return decodeURIComponent(value.replaceAll('+', '%20'));
  } catch {
    throw new Error('URL kodlaması geçerli değil.');
  }
}

function fromPlainText(value: string, format: TextFormat) {
  if (format === 'text') return value;
  if (format === 'url') return encodeURIComponent(value);
  if (format === 'html') {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  const bytes = encoder.encode(value);
  if (format === 'hex') return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const base64 = btoa(bytesToBinary(bytes));
  return format === 'base64url' ? base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') : base64;
}

function convertText(value: string, source: TextFormat, target: TextFormat) {
  return fromPlainText(toPlainText(value, source), target);
}

export function TextConverter() {
  const [sourceFormat, setSourceFormat] = useState<TextFormat>('text');
  const [targetFormat, setTargetFormat] = useState<TextFormat>('base64');
  const [source, setSource] = useState('');
  const [result, setResult] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sourceBytes = useMemo(() => encoder.encode(source).byteLength, [source]);

  const loadFile = async (file: File) => {
    if (file.size > MAX_TEXT_BYTES) {
      setError('Metin dosyası 5 MB sınırını aşıyor.');
      return;
    }
    setSource(await file.text());
    setFileName(file.name);
    setSourceFormat('text');
    setResult('');
    setError('');
  };

  const convert = () => {
    setWorking(true);
    setError('');
    setCopied(false);
    try {
      setResult(convertText(source, sourceFormat, targetFormat));
    } catch (caught) {
      setResult('');
      setError(caught instanceof Error ? caught.message : 'Metin dönüştürülemedi.');
    } finally {
      setWorking(false);
    }
  };

  const swap = () => {
    const nextSource = result || source;
    setSource(nextSource);
    setResult('');
    setSourceFormat(targetFormat);
    setTargetFormat(sourceFormat);
    setError('');
    setCopied(false);
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const base = fileName ? fileName.replace(/\.[^.]+$/, '') : 'bicim-metin';
    link.href = url;
    link.download = `${base}.${formats.find((format) => format.value === targetFormat)?.extension ?? 'txt'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const clear = () => {
    setSource('');
    setResult('');
    setFileName('');
    setError('');
    setCopied(false);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader current="data" />
      <section className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <DataSectionNav current="text" />
        <div className="mb-8 max-w-4xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-[0.03em] text-primary"><Binary className="size-4" /> Metin ve kodlama dönüştürücü</div>
          <h1 className="text-[clamp(2.5rem,5.2vw,4.9rem)] font-bold leading-[1.01] tracking-[-0.05em]">Metni kodla.<br /><span className="text-primary">Tek tıkla geri aç.</span></h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="data-workspace">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div className="flex items-center gap-3"><span className="file-icon"><FileText /></span><div><p className="font-semibold">{fileName || 'Metin yaz veya dosya seç'}</p><p className="text-sm text-muted-foreground">{source.length.toLocaleString('tr-TR')} karakter · {sourceBytes.toLocaleString('tr-TR')} bayt</p></div></div>
              <div className="flex gap-2">{source && <Button variant="ghost" size="icon" aria-label="Metni temizle" onClick={clear}><X /></Button>}<Button variant="outline" onClick={() => inputRef.current?.click()}><UploadCloud /> Dosya seç</Button><input ref={inputRef} className="sr-only" type="file" accept="text/*,.txt,.b64,.base64,.hex,.url" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); event.target.value = ''; }} /></div>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
              <div><label className="setting-label" htmlFor="source-text-format">Kaynak biçim</label><NativeSelect id="source-text-format" className="w-full" value={sourceFormat} onChange={(event) => { setSourceFormat(event.target.value as TextFormat); setResult(''); }}>{formats.map((format) => <NativeSelectOption key={format.value} value={format.value}>{format.label}</NativeSelectOption>)}</NativeSelect></div>
              <Button variant="outline" size="icon" aria-label="Kaynak ve hedef biçimleri değiştir" onClick={swap}><ArrowLeftRight /></Button>
              <div><label className="setting-label" htmlFor="target-text-format">Hedef biçim</label><NativeSelect id="target-text-format" className="w-full" value={targetFormat} onChange={(event) => { setTargetFormat(event.target.value as TextFormat); setResult(''); }}>{formats.map((format) => <NativeSelectOption key={format.value} value={format.value}>{format.label}</NativeSelectOption>)}</NativeSelect></div>
            </div>
            <div className="grid gap-4 px-4 pb-4 xl:grid-cols-2">
              <div><label className="setting-label" htmlFor="source-text">Kaynak</label><Textarea id="source-text" className="min-h-80 resize-y font-mono text-sm leading-relaxed" value={source} onChange={(event) => { setSource(event.target.value); setResult(''); setError(''); }} placeholder="Dönüştürülecek metni buraya yaz…" spellCheck={false} /></div>
              <div><label className="setting-label" htmlFor="result-text">Sonuç</label><Textarea id="result-text" className="min-h-80 resize-y bg-secondary/40 font-mono text-sm leading-relaxed" value={result} readOnly placeholder="Sonuç burada görünecek" spellCheck={false} /></div>
            </div>
          </section>

          <aside className="settings-card h-fit lg:sticky lg:top-8">
            <p className="eyebrow">Dönüşüm</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{formats.find((format) => format.value === sourceFormat)?.label} → {formats.find((format) => format.value === targetFormat)?.label}</h2>
            <Button className="mt-7 h-14 w-full rounded-xl text-base font-semibold" onClick={convert} disabled={!source || working}>{working ? <RefreshCw className="animate-spin" /> : <WandSparkles />}{working ? 'Dönüştürülüyor…' : 'Dönüştür'}</Button>
            {result && <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" className="h-12" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}{copied ? 'Kopyalandı' : 'Kopyala'}</Button><Button variant="outline" className="h-12" onClick={download}><Download /> İndir</Button></div>}
            {error && <p className="mt-4 text-sm font-medium text-destructive" role="alert">{error}</p>}
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm leading-relaxed text-secondary-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><p>Metinler bu cihazda işlenir. Dosya sınırı 5 MB.</p></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
