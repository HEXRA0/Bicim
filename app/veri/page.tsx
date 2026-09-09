import type { Metadata } from 'next';
import { DataConverter } from '@/components/data-converter';

export const metadata: Metadata = {
  title: 'Veri ve metin dönüştürücü — Biçim',
  description: 'JSON, JSONL, CSV, TSV, YAML ve XML dosyalarını cihazında dönüştür.',
};

export default function DataPage() {
  return <DataConverter />;
}
