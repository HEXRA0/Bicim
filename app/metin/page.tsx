import type { Metadata } from 'next';
import { TextConverter } from '@/components/text-converter';

export const metadata: Metadata = {
  title: 'Metin ve kodlama dönüştürücü — Biçim',
  description: 'Metin, Base64, Base64URL, HEX, URL ve HTML karakter kodlamalarını cihazında dönüştür.',
};

export default function TextPage() {
  return <TextConverter />;
}
