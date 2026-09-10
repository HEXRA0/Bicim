'use client';

import { useMemo, useRef, useState } from 'react';
import { Braces, Check, Download, FileCode2, LockKeyhole, RefreshCw, UploadCloud, WandSparkles, X } from 'lucide-react';
import Papa from 'papaparse';
import { decode as parseIni, encode as stringifyIni } from 'ini';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { SiteHeader } from '@/components/site-header';
import { DataSectionNav } from '@/components/data-section-nav';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type DataFormat = 'json' | 'jsonl' | 'csv' | 'tsv' | 'yaml' | 'toml' | 'ini' | 'xml';
type Row = Record<string, unknown>;

const MAX_DATA_BYTES = 10 * 1024 * 1024;

const formatOptions: Array<{ value: DataFormat; label: string; extensions: string[] }> = [
  { value: 'json', label: 'JSON', extensions: ['json'] },
  { value: 'jsonl', label: 'JSONL / NDJSON', extensions: ['jsonl', 'ndjson'] },
  { value: 'csv', label: 'CSV', extensions: ['csv'] },
  { value: 'tsv', label: 'TSV', extensions: ['tsv', 'tab'] },
  { value: 'yaml', label: 'YAML', extensions: ['yaml', 'yml'] },
  { value: 'toml', label: 'TOML', extensions: ['toml'] },
  { value: 'ini', label: 'INI / CFG', extensions: ['ini', 'cfg', 'conf'] },
  { value: 'xml', label: 'XML', extensions: ['xml'] },
];

function scalar(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function toRows(value: unknown): Row[] {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? (item as Row)
        : { value: item },
    );
  }
  if (value !== null && typeof value === 'object') return [value as Row];
  return [{ value }];
}

function xmlNodeToValue(element: Element): unknown {
  const children = Array.from(element.children);
  if (!children.length) return element.textContent?.trim() ?? '';
  const result: Row = {};
  for (const child of children) {
    const value = xmlNodeToValue(child);
    const current = result[child.tagName];
    if (current === undefined) result[child.tagName] = value;
    else result[child.tagName] = Array.isArray(current) ? [...current, value] : [current, value];
  }
  return result;
}

function parseXml(source: string) {
  const xml = new DOMParser().parseFromString(source, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('XML yapısı geçerli değil.');
  const root = xml.documentElement;
  const children = Array.from(root.children);
  if (!children.length) return [{ value: root.textContent?.trim() ?? '' }];
  const sameTag = children.every((child) => child.tagName === children[0].tagName);
  return sameTag ? children.map((child) => toRows(xmlNodeToValue(child))[0]) : toRows(xmlNodeToValue(root));
}

function parseSource(source: string, format: DataFormat): Row[] {
  if (!source.trim()) throw new Error('Dönüştürülecek veri boş.');
  if (format === 'json') return toRows(JSON.parse(source));
  if (format === 'jsonl') {
    return source
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return toRows(JSON.parse(line))[0];
        } catch {
          throw new Error(`JSONL dosyasının ${index + 1}. satırı geçerli değil.`);
        }
      });
  }
  if (format === 'yaml') return toRows(parseYaml(source));
  if (format === 'toml') return toRows(parseToml(source));
  if (format === 'ini') {
    const parsed = parseIni(source) as Record<string, unknown>;
    const sections = Object.entries(parsed).filter(([, value]) => value !== null && typeof value === 'object' && !Array.isArray(value));
    const general = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === null || typeof value !== 'object'));
    return [
      ...(Object.keys(general).length ? [{ bolum: 'genel', ...general }] : []),
      ...sections.map(([name, value]) => ({ bolum: name, ...(value as Row) })),
    ];
  }
  if (format === 'xml') return parseXml(source);

  const parsed = Papa.parse<Row>(source, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: format === 'tsv' ? '\t' : '',
    dynamicTyping: true,
  });
  if (parsed.errors.length) {
    throw new Error(parsed.errors[0].message || 'Tablo verisi okunamadı.');
  }
  return parsed.data;
}

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function safeXmlName(value: string) {
  const cleaned = value.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '_');
  return /^[\p{L}_]/u.test(cleaned) ? cleaned : `alan_${cleaned || 'deger'}`;
}

function serializeRows(rows: Row[], format: DataFormat) {
  if (format === 'json') return JSON.stringify(rows, null, 2);
  if (format === 'jsonl') return rows.map((row) => JSON.stringify(row)).join('\n');
  if (format === 'yaml') return stringifyYaml(rows, { indent: 2 });
  if (format === 'toml') {
    return stringifyToml(rows.length === 1 ? rows[0] : { kayitlar: rows });
  }
  if (format === 'ini') {
    const sections = Object.fromEntries(
      rows.map((row, index) => {
        const name = typeof row.bolum === 'string' && row.bolum.trim() ? row.bolum : `kayit_${index + 1}`;
        return [name, Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'bolum').map(([key, value]) => [key, scalar(value)]))];
      }),
    );
    return stringifyIni(sections, { whitespace: true });
  }
  if (format === 'csv' || format === 'tsv') {
    return Papa.unparse(
      rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, scalar(value)]))),
      { delimiter: format === 'tsv' ? '\t' : ',' },
    );
  }
  const records = rows
    .map((row) => {
      const fields = Object.entries(row)
        .map(([key, value]) => `    <${safeXmlName(key)}>${xmlEscape(scalar(value))}</${safeXmlName(key)}>`)
        .join('\n');
      return `  <kayit>\n${fields}\n  </kayit>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kayitlar>\n${records}\n</kayitlar>\n`;
}

function detectFormat(name: string): DataFormat | undefined {
  const extension = name.split('.').pop()?.toLowerCase();
  return formatOptions.find((option) => option.extensions.includes(extension ?? ''))?.value;
}

export function DataConverter() {
  const [sourceFormat, setSourceFormat] = useState<DataFormat>('json');
  const [targetFormat, setTargetFormat] = useState<DataFormat>('csv');
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const columns = useMemo(
    () => Array.from(new Set(rows.slice(0, 20).flatMap((row) => Object.keys(row)))).slice(0, 8),
    [rows],
  );

  const loadFile = async (file: File) => {
    const detected = detectFormat(file.name);
    if (!detected) {
      setError('Bu dosya biçimi veri dönüştürücüde desteklenmiyor.');
      return;
    }
    if (file.size > MAX_DATA_BYTES) {
      setError('Veri dosyası 10 MB sınırını aşıyor.');
      return;
    }
    setSourceFormat(detected);
    setTargetFormat(detected === 'json' ? 'csv' : 'json');
    setSource(await file.text());
    setFileName(file.name);
    setRows([]);
    setResult('');
    setError('');
  };

  const convert = () => {
    setWorking(true);
    setError('');
    try {
      const parsedRows = parseSource(source, sourceFormat);
      setRows(parsedRows);
      setResult(serializeRows(parsedRows, targetFormat));
    } catch (caught) {
      setRows([]);
      setResult('');
      setError(caught instanceof Error ? caught.message : 'Dönüştürme başarısız oldu.');
    } finally {
      setWorking(false);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const base = fileName ? fileName.replace(/\.[^.]+$/, '') : 'bicim-veri';
    const extension = formatOptions.find((item) => item.value === targetFormat)?.extensions[0] ?? targetFormat;
    link.href = url;
    link.download = `${base}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const clear = () => {
    setSource('');
    setFileName('');
    setRows([]);
    setResult('');
    setError('');
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader current="data" />
      <section className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <DataSectionNav current="data" />
        <div className="mb-8 max-w-3xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-[0.03em] text-primary">
            <Braces className="size-4" /> Veri ve metin dönüştürücü
          </div>
          <h1 className="text-[clamp(2.5rem,5.2vw,4.9rem)] font-bold leading-[1.01] tracking-[-0.05em]">
            Veriyi aç.<br /><span className="text-primary">İstediğin gibi kaydet.</span>
          </h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="data-workspace">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div className="flex items-center gap-3">
                <span className="file-icon"><FileCode2 /></span>
                <div><p className="font-semibold">{fileName || 'Dosya seç veya metin yapıştır'}</p><p className="text-sm text-muted-foreground">JSON · JSONL · CSV · TSV · YAML · TOML · INI · XML</p></div>
              </div>
              <div className="flex gap-2">
                {source && <Button variant="ghost" size="icon" aria-label="Veriyi temizle" onClick={clear}><X /></Button>}
                <Button variant="outline" onClick={() => inputRef.current?.click()}><UploadCloud /> Dosya seç</Button>
                <input ref={inputRef} className="sr-only" type="file" accept=".json,.jsonl,.ndjson,.csv,.tsv,.tab,.yaml,.yml,.toml,.ini,.cfg,.conf,.xml" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); event.target.value = ''; }} />
              </div>
            </div>

            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div>
                <label className="setting-label" htmlFor="source-format">Kaynak biçim</label>
                <NativeSelect id="source-format" className="w-full" value={sourceFormat} onChange={(event) => setSourceFormat(event.target.value as DataFormat)}>
                  {formatOptions.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div>
                <label className="setting-label" htmlFor="target-data-format">Hedef biçim</label>
                <NativeSelect id="target-data-format" className="w-full" value={targetFormat} onChange={(event) => setTargetFormat(event.target.value as DataFormat)}>
                  {formatOptions.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
            </div>

            <div className="px-4 pb-4">
              <label className="setting-label" htmlFor="source-data">Veri</label>
              <Textarea id="source-data" className="min-h-72 resize-y font-mono text-sm leading-relaxed" value={source} onChange={(event) => { setSource(event.target.value); setResult(''); setRows([]); }} placeholder={'Örnek:\n[{"ad":"Ada","şehir":"İstanbul"}]'} spellCheck={false} />
              {error && <p className="mt-3 text-sm font-medium text-destructive" role="alert">{error}</p>}
            </div>
          </div>

          <aside className="settings-card h-fit lg:sticky lg:top-8">
            <p className="eyebrow">Dönüşüm</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{formatOptions.find((item) => item.value === sourceFormat)?.label} → {formatOptions.find((item) => item.value === targetFormat)?.label}</h2>
            <Button className="mt-7 h-14 w-full rounded-xl text-base font-semibold" onClick={convert} disabled={!source.trim() || working}>
              {working ? <RefreshCw className="animate-spin" /> : <WandSparkles />}{working ? 'Dönüştürülüyor…' : 'Dönüştür'}
            </Button>
            {result && <Button variant="outline" className="mt-3 h-12 w-full" onClick={download}><Download /> Sonucu indir</Button>}
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm leading-relaxed text-secondary-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><p>Metin ve dosyalar bu cihazda işlenir. Dosya sınırı 10 MB.</p></div>
            {rows.length > 0 && <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary"><Check className="size-4" /> {rows.length} kayıt hazır</div>}
          </aside>
        </div>

        {rows.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="preview-title">
            <div className="border-b border-border px-5 py-4"><p className="eyebrow">İlk 12 kayıt</p><h2 id="preview-title" className="mt-1 text-xl font-semibold">Tablo önizlemesi</h2></div>
            <Table>
              <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{rows.slice(0, 12).map((row, rowIndex) => <TableRow key={rowIndex}>{columns.map((column) => <TableCell key={column} className="max-w-64 truncate">{scalar(row[column])}</TableCell>)}</TableRow>)}</TableBody>
            </Table>
          </section>
        )}
      </section>
    </main>
  );
}
