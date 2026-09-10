import type { Metadata } from 'next';
import { PdfTools } from '@/components/pdf-tools';

export const metadata: Metadata = {
  title: 'PDF araçları — Biçim',
  description: 'PDF dosyalarını cihazında birleştir, böl, sayfa seç ve döndür.',
};

export default function PdfPage() {
  return <PdfTools />;
}
