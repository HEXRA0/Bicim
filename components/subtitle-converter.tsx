'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Captions,
  Check,
  Download,
  FileText,
  LockKeyhole,
  RefreshCw,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type SubtitleFormat = 'srt' | 'vtt' | 'sbv' | 'lrc' | 'txt';
type Cue = { start: number; end: number; text: string };

const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;
const MAX_CUES = 20_000;

const formats: Array<{ value: SubtitleFormat; label: string; extensions: string[] }> = [
  { value: 'srt', label: 'SubRip (SRT)', extensions: ['srt'] },
  { value: 'vtt', label: 'WebVTT (VTT)', extensions: ['vtt'] },
  { value: 'sbv', label: 'YouTube SBV', extensions: ['sbv'] },
  { value: 'lrc', label: 'LRC şarkı sözü', extensions: ['lrc'] },
  { value: 'txt', label: 'Düz metin (TXT)', extensions: ['txt'] },
];

function parseTime(value: string) {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':').map(Number);
  if ((parts.length !== 2 && parts.length !== 3) || parts.some(Number.isNaN)) throw new Error(`Geçersiz zaman kodu: ${value}`);
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) throw new Error(`Geçersiz zaman kodu: ${value}`);
  return Math.round((hours * 3_600 + minutes * 60 + seconds) * 1_000);
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0');
}

function formatClock(milliseconds: number, separator: ',' | '.', includeHours = true) {
  const safeMilliseconds = Math.max(0, Math.floor(milliseconds));
  const totalSeconds = Math.floor(safeMilliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const millis = safeMilliseconds % 1_000;
  const body = `${pad(minutes)}:${pad(seconds)}${separator}${pad(millis, 3)}`;
  return includeHours || hours > 0 ? `${pad(hours)}:${body}` : body;
}

function formatLrcTime(milliseconds: number) {
  const totalHundredths = Math.floor(Math.max(0, milliseconds) / 10);
  const minutes = Math.floor(totalHundredths / 6_000);
  const seconds = Math.floor(totalHundredths / 100) % 60;
  const hundredths = totalHundredths % 100;
  return `${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}`;
}

function parseBlocks(source: string, format: 'srt' | 'vtt' | 'sbv') {
  const cleaned = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = cleaned.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (format === 'vtt' && (lines[0] === 'WEBVTT' || lines[0].startsWith('NOTE') || lines[0] === 'STYLE')) continue;
    const timingIndex = lines.findIndex((line) => line.includes('-->') || (format === 'sbv' && /^\s*[^,]+,[^,]+\s*$/.test(line)));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex];
    const parts = format === 'sbv' ? timing.split(',') : timing.split('-->').map((part) => part.trim().split(/\s+/)[0]);
    if (parts.length !== 2) continue;
    cues.push({ start: parseTime(parts[0]), end: parseTime(parts[1]), text: lines.slice(timingIndex + 1).join('\n').trim() });
  }
  return cues;
}

function parseLrc(source: string) {
  const points: Array<{ start: number; text: string }> = [];
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const matches = [...line.matchAll(/\[(\d+):(\d{2}(?:[.:]\d{1,3})?)\]/g)];
    if (!matches.length) continue;
    const text = line.replace(/\[[^\]]+\]/g, '').trim();
    matches.forEach((match) => {
      const minutes = Number(match[1]);
      const seconds = Number(match[2].replace(':', '.'));
      if (Number.isNaN(seconds) || seconds < 0 || seconds >= 60) throw new Error(`Geçersiz LRC zaman kodu: ${match[0]}`);
      points.push({ start: Math.round((minutes * 60 + seconds) * 1_000), text });
    });
  }
  points.sort((a, b) => a.start - b.start);
  return points.map((point, index) => ({ start: point.start, end: points[index + 1]?.start ?? point.start + 3_000, text: point.text }));
}

function parseSource(source: string, format: SubtitleFormat) {
  if (!source.trim()) throw new Error('Altyazı metni boş.');
  if (format === 'txt') {
    const cues = source.split(/\r?\n/).filter((line) => line.trim()).map((text, index) => ({ start: index * 3_000, end: index * 3_000 + 3_000, text }));
    if (cues.length > MAX_CUES) throw new Error(`En fazla ${MAX_CUES.toLocaleString('tr-TR')} metin satırı işlenebilir.`);
    return cues;
  }
  const cues = format === 'lrc' ? parseLrc(source) : parseBlocks(source, format);
  if (!cues.length) throw new Error('Geçerli altyazı satırı bulunamadı.');
  if (cues.length > MAX_CUES) throw new Error(`En fazla ${MAX_CUES.toLocaleString('tr-TR')} altyazı satırı işlenebilir.`);
  return cues;
}

function serializeCues(cues: Cue[], format: SubtitleFormat) {
  if (format === 'txt') return `${cues.map((cue) => cue.text).join('\n\n')}\n`;
  if (format === 'lrc') {
    return `${cues.map((cue) => `[${formatLrcTime(cue.start)}]${cue.text.replaceAll('\n', ' ')}`).join('\n')}\n`;
  }
  if (format === 'sbv') {
    return `${cues.map((cue) => `${formatClock(cue.start, '.', false)},${formatClock(cue.end, '.', false)}\n${cue.text}`).join('\n\n')}\n`;
  }
  const blocks = cues.map((cue, index) => {
    const timing = `${formatClock(cue.start, format === 'srt' ? ',' : '.')} --> ${formatClock(cue.end, format === 'srt' ? ',' : '.')}`;
    return `${format === 'srt' ? `${index + 1}\n` : ''}${timing}\n${cue.text}`;
  });
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}\n`;
}

function detectFormat(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  return formats.find((format) => format.extensions.includes(extension ?? ''))?.value;
}

export function SubtitleConverter() {
  const [sourceFormat, setSourceFormat] = useState<SubtitleFormat>('srt');
  const [targetFormat, setTargetFormat] = useState<SubtitleFormat>('vtt');
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [cues, setCues] = useState<Cue[]>([]);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const duration = useMemo(() => cues.length ? Math.max(...cues.map((cue) => cue.end)) : 0, [cues]);

  const loadFile = async (file: File) => {
    const detected = detectFormat(file.name);
    if (!detected) {
      setError('Bu altyazı biçimi desteklenmiyor.');
      return;
    }
    if (file.size > MAX_SUBTITLE_BYTES) {
      setError('Altyazı dosyası 5 MB sınırını aşıyor.');
      return;
    }
    setSource(await file.text());
    setFileName(file.name);
    setSourceFormat(detected);
    setTargetFormat(detected === 'srt' ? 'vtt' : 'srt');
    setCues([]);
    setResult('');
    setError('');
  };

  const convert = () => {
    setWorking(true);
    setError('');
    try {
      const parsed = parseSource(source, sourceFormat);
      setCues(parsed);
      setResult(serializeCues(parsed, targetFormat));
    } catch (caught) {
      setCues([]);
      setResult('');
      setError(caught instanceof Error ? caught.message : 'Altyazı dönüştürülemedi.');
    } finally {
      setWorking(false);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const base = fileName ? fileName.replace(/\.[^.]+$/, '') : 'bicim-altyazi';
    link.href = url;
    link.download = `${base}.${formats.find((format) => format.value === targetFormat)?.extensions[0] ?? targetFormat}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const clear = () => {
    setSource('');
    setFileName('');
    setCues([]);
    setResult('');
    setError('');
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader current="subtitle" />
      <section className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <div className="mb-8 max-w-4xl"><div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-[0.03em] text-primary"><Captions className="size-4" /> Altyazı dönüştürücü</div><h1 className="text-[clamp(2.5rem,5.2vw,4.9rem)] font-bold leading-[1.01] tracking-[-0.05em]">Zamanı koru.<br /><span className="text-primary">Altyazıyı dönüştür.</span></h1></div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="data-workspace">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div className="flex items-center gap-3"><span className="file-icon"><FileText /></span><div><p className="font-semibold">{fileName || 'Dosya seç veya altyazı yapıştır'}</p><p className="text-sm text-muted-foreground">SRT · WebVTT · SBV · LRC · TXT</p></div></div><div className="flex gap-2">{source && <Button variant="ghost" size="icon" aria-label="Altyazıyı temizle" onClick={clear}><X /></Button>}<Button variant="outline" onClick={() => inputRef.current?.click()}><UploadCloud /> Dosya seç</Button><input ref={inputRef} className="sr-only" type="file" accept=".srt,.vtt,.sbv,.lrc,.txt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); event.target.value = ''; }} /></div></div>
            <div className="grid gap-4 p-4 md:grid-cols-2"><div><label className="setting-label" htmlFor="subtitle-source-format">Kaynak biçim</label><NativeSelect id="subtitle-source-format" className="w-full" value={sourceFormat} onChange={(event) => { setSourceFormat(event.target.value as SubtitleFormat); setCues([]); setResult(''); }}>{formats.map((format) => <NativeSelectOption key={format.value} value={format.value}>{format.label}</NativeSelectOption>)}</NativeSelect></div><div><label className="setting-label" htmlFor="subtitle-target-format">Hedef biçim</label><NativeSelect id="subtitle-target-format" className="w-full" value={targetFormat} onChange={(event) => { setTargetFormat(event.target.value as SubtitleFormat); setResult(''); }}>{formats.map((format) => <NativeSelectOption key={format.value} value={format.value}>{format.label}</NativeSelectOption>)}</NativeSelect></div></div>
            <div className="px-4 pb-4"><label className="setting-label" htmlFor="subtitle-source">Altyazı</label><Textarea id="subtitle-source" className="min-h-80 resize-y font-mono text-sm leading-relaxed" value={source} onChange={(event) => { setSource(event.target.value); setCues([]); setResult(''); setError(''); }} placeholder={'1\n00:00:01,000 --> 00:00:04,000\nMerhaba!'} spellCheck={false} /></div>
          </section>

          <aside className="settings-card h-fit lg:sticky lg:top-8"><p className="eyebrow">Dönüşüm</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{formats.find((format) => format.value === sourceFormat)?.label} → {formats.find((format) => format.value === targetFormat)?.label}</h2><Button className="mt-7 h-14 w-full rounded-xl text-base font-semibold" onClick={convert} disabled={!source.trim() || working}>{working ? <RefreshCw className="animate-spin" /> : <WandSparkles />}{working ? 'Dönüştürülüyor…' : 'Dönüştür'}</Button>{result && <Button variant="outline" className="mt-3 h-12 w-full" onClick={download}><Download /> Sonucu indir</Button>}{cues.length > 0 && <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary"><Check className="size-4" /> {cues.length} satır · {formatClock(duration, '.', true)}</div>}{error && <p className="mt-4 text-sm font-medium text-destructive" role="alert">{error}</p>}<div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm leading-relaxed text-secondary-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><p>Altyazılar bu cihazda işlenir. Biçime özgü stil ve konum ayarları sadeleştirilebilir.</p></div></aside>
        </div>

        {cues.length > 0 && <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><p className="eyebrow">İlk 12 satır</p><h2 className="mt-1 text-xl font-semibold">Zaman kodu önizlemesi</h2></div><Table><TableHeader><TableRow><TableHead className="w-36">Başlangıç</TableHead><TableHead className="w-36">Bitiş</TableHead><TableHead>Metin</TableHead></TableRow></TableHeader><TableBody>{cues.slice(0, 12).map((cue, index) => <TableRow key={`${cue.start}-${index}`}><TableCell className="font-mono text-xs">{formatClock(cue.start, '.')}</TableCell><TableCell className="font-mono text-xs">{formatClock(cue.end, '.')}</TableCell><TableCell className="whitespace-pre-line">{cue.text}</TableCell></TableRow>)}</TableBody></Table></section>}
      </section>
    </main>
  );
}
