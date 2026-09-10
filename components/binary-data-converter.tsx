'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Boxes,
  Check,
  Download,
  FileCode2,
  FileDigit,
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

type BinaryFormat = 'json' | 'msgpack' | 'cbor' | 'bson';
type BinarySource = { name: string; bytes: Uint8Array };
type ConversionResult = { url: string; name: string; size: number; preview: string };

const MAX_BINARY_BYTES = 25 * 1024 * 1024;

const formats: Array<{ value: BinaryFormat; label: string; extensions: string[]; mime: string }> = [
  { value: 'json', label: 'JSON / Extended JSON', extensions: ['json'], mime: 'application/json' },
  { value: 'msgpack', label: 'MessagePack', extensions: ['msgpack', 'mpk'], mime: 'application/msgpack' },
  { value: 'cbor', label: 'CBOR', extensions: ['cbor'], mime: 'application/cbor' },
  { value: 'bson', label: 'BSON', extensions: ['bson'], mime: 'application/bson' },
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

function normalizeForJson(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return `${value}n`;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return { $bytes: Array.from(value) };
  if (seen.has(value)) return '[Döngüsel başvuru]';
  seen.add(value);
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), normalizeForJson(item, seen)]));
  if (value instanceof Set) return [...value].map((item) => normalizeForJson(item, seen));
  if (Array.isArray(value)) return value.map((item) => normalizeForJson(item, seen));
  const record = value as Record<string, unknown>;
  if (typeof record.toJSON === 'function') return normalizeForJson(record.toJSON(), seen);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, normalizeForJson(item, seen)]));
}

function prettyJson(value: unknown) {
  return JSON.stringify(normalizeForJson(value), null, 2);
}

function detectFormat(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  return formats.find((format) => format.extensions.includes(extension ?? ''))?.value;
}

async function decodeValue(format: BinaryFormat, sourceText: string, binary?: BinarySource) {
  if (format === 'json') {
    if (!sourceText.trim()) throw new Error('JSON verisi boş.');
    const { EJSON } = await import('bson');
    return EJSON.parse(sourceText, { relaxed: false });
  }
  if (!binary) throw new Error('Önce bir ikili veri dosyası seç.');
  if (format === 'msgpack') {
    const { decode } = await import('@msgpack/msgpack');
    return decode(binary.bytes, { useBigInt64: true });
  }
  if (format === 'cbor') {
    const { decode } = await import('cbor-x');
    return decode(binary.bytes);
  }
  const { deserialize } = await import('bson');
  return deserialize(binary.bytes, { promoteLongs: false, promoteValues: true });
}

async function encodeValue(format: BinaryFormat, value: unknown) {
  if (format === 'json') {
    const { EJSON } = await import('bson');
    return new TextEncoder().encode(EJSON.stringify(value, undefined, 2, { relaxed: false }));
  }
  if (format === 'msgpack') {
    const { encode } = await import('@msgpack/msgpack');
    return encode(value, { useBigInt64: true });
  }
  if (format === 'cbor') {
    const { encode } = await import('cbor-x');
    return new Uint8Array(encode(value));
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('BSON çıktısı için kök JSON değeri bir nesne olmalı.');
  }
  const { serialize } = await import('bson');
  return new Uint8Array(serialize(value));
}

export function BinaryDataConverter() {
  const [sourceFormat, setSourceFormat] = useState<BinaryFormat>('json');
  const [targetFormat, setTargetFormat] = useState<BinaryFormat>('msgpack');
  const [sourceText, setSourceText] = useState('');
  const [binarySource, setBinarySource] = useState<BinarySource>();
  const [result, setResult] = useState<ConversionResult>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sourceSize = useMemo(
    () => binarySource?.bytes.byteLength ?? new TextEncoder().encode(sourceText).byteLength,
    [binarySource, sourceText],
  );

  const clearResult = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(undefined);
  };

  const clear = () => {
    clearResult();
    setSourceText('');
    setBinarySource(undefined);
    setError('');
  };

  const loadFile = async (file: File) => {
    const detected = detectFormat(file.name);
    if (!detected) {
      setError('Bu ikili veri biçimi desteklenmiyor.');
      return;
    }
    if (file.size > MAX_BINARY_BYTES) {
      setError('Veri dosyası 25 MB sınırını aşıyor.');
      return;
    }
    clearResult();
    setSourceFormat(detected);
    setTargetFormat(detected === 'json' ? 'msgpack' : 'json');
    if (detected === 'json') {
      setSourceText(await file.text());
      setBinarySource(undefined);
    } else {
      setBinarySource({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      setSourceText('');
    }
    setError('');
  };

  const convert = async () => {
    setWorking(true);
    setError('');
    clearResult();
    try {
      const value = await decodeValue(sourceFormat, sourceText, binarySource);
      const bytes = await encodeValue(targetFormat, value);
      const target = formats.find((format) => format.value === targetFormat) ?? formats[0];
      const extension = target.extensions[0];
      const blob = bytesToBlob(bytes, target.mime);
      const sourceName = binarySource?.name ?? 'bicim-veri.json';
      const base = sourceName.replace(/\.[^.]+$/, '') || 'bicim-veri';
      setResult({ url: URL.createObjectURL(blob), name: `${base}.${extension}`, size: blob.size, preview: prettyJson(value) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'İkili veri dönüştürülemedi.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader current="data" />
      <section className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <DataSectionNav current="binary" />
        <div className="mb-8 max-w-4xl"><div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-[0.03em] text-primary"><Boxes className="size-4" /> İkili veri dönüştürücü</div><h1 className="text-[clamp(2.5rem,5.2vw,4.9rem)] font-bold leading-[1.01] tracking-[-0.05em]">Veriyi küçült.<br /><span className="text-primary">İstediğinde geri aç.</span></h1></div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="data-workspace">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div className="flex items-center gap-3"><span className="file-icon"><FileDigit /></span><div><p className="font-semibold">{binarySource?.name || 'JSON yaz veya veri dosyası seç'}</p><p className="text-sm text-muted-foreground">JSON · MessagePack · CBOR · BSON{sourceSize ? ` · ${formatBytes(sourceSize)}` : ''}</p></div></div><div className="flex gap-2">{(binarySource || sourceText) && <Button variant="ghost" size="icon" aria-label="Veriyi temizle" onClick={clear}><X /></Button>}<Button variant="outline" onClick={() => inputRef.current?.click()}><UploadCloud /> Dosya seç</Button><input ref={inputRef} className="sr-only" type="file" accept=".json,.msgpack,.mpk,.cbor,.bson,application/json,application/cbor" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); event.target.value = ''; }} /></div></div>
            <div className="grid gap-4 p-4 md:grid-cols-2"><div><label className="setting-label" htmlFor="binary-source-format">Kaynak biçim</label><NativeSelect id="binary-source-format" className="w-full" value={sourceFormat} onChange={(event) => { const next = event.target.value as BinaryFormat; setSourceFormat(next); clear(); }}>{formats.map((format) => <NativeSelectOption key={format.value} value={format.value}>{format.label}</NativeSelectOption>)}</NativeSelect></div><div><label className="setting-label" htmlFor="binary-target-format">Hedef biçim</label><NativeSelect id="binary-target-format" className="w-full" value={targetFormat} onChange={(event) => { setTargetFormat(event.target.value as BinaryFormat); clearResult(); }}>{formats.map((format) => <NativeSelectOption key={format.value} value={format.value}>{format.label}</NativeSelectOption>)}</NativeSelect></div></div>
            {sourceFormat === 'json' ? <div className="px-4 pb-4"><label className="setting-label" htmlFor="binary-json-source">JSON / Extended JSON</label><Textarea id="binary-json-source" className="min-h-80 resize-y font-mono text-sm leading-relaxed" value={sourceText} onChange={(event) => { setSourceText(event.target.value); clearResult(); setError(''); }} placeholder={'{"ad":"Biçim","aktif":true}'} spellCheck={false} /></div> : <button type="button" className="drop-zone m-4 flex min-h-72 w-[calc(100%-2rem)] flex-col items-center justify-center px-6 text-center" onClick={() => inputRef.current?.click()}><span className="mb-5 grid size-16 place-items-center rounded-2xl bg-secondary text-primary"><FileCode2 className="size-8" /></span><span className="text-xl font-semibold">{binarySource ? binarySource.name : `${formats.find((format) => format.value === sourceFormat)?.label} dosyası seç`}</span><span className="mt-2 text-sm text-muted-foreground">{binarySource ? `${formatBytes(binarySource.bytes.byteLength)} veri hazır` : 'Dosya içeriği cihazında çözümlenir.'}</span></button>}
          </section>

          <aside className="settings-card h-fit lg:sticky lg:top-8"><p className="eyebrow">Dönüşüm</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{formats.find((format) => format.value === sourceFormat)?.label} → {formats.find((format) => format.value === targetFormat)?.label}</h2><Button className="mt-7 h-14 w-full rounded-xl text-base font-semibold" onClick={() => void convert()} disabled={working || (sourceFormat === 'json' ? !sourceText.trim() : !binarySource)}>{working ? <RefreshCw className="animate-spin" /> : <WandSparkles />}{working ? 'Dönüştürülüyor…' : 'Dönüştür'}</Button>{result && <a className="download-link mt-3 h-12 w-full" href={result.url} download={result.name}><Download /> İndir · {formatBytes(result.size)}</a>}{result && <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary"><Check className="size-4" /> Çıktı hazır</div>}{error && <p className="mt-4 text-sm font-medium text-destructive" role="alert">{error}</p>}<div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm leading-relaxed text-secondary-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><p>Veri bu cihazda işlenir. Dosya sınırı 25 MB.</p></div></aside>
        </div>

        {result && <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><p className="eyebrow">Çözümlenen içerik</p><h2 className="mt-1 text-xl font-semibold">JSON önizlemesi</h2></div><pre className="max-h-[520px] overflow-auto p-5 text-sm leading-relaxed"><code>{result.preview}</code></pre></section>}
      </section>
    </main>
  );
}
