import type { Metadata } from 'next';
import { SubtitleConverter } from '@/components/subtitle-converter';

export const metadata: Metadata = {
  title: 'Altyazı dönüştürücü — Biçim',
  description: 'SRT, WebVTT, SBV ve LRC altyazılarını cihazında dönüştür veya düz metin olarak çıkar.',
};

export default function SubtitlePage() {
  return <SubtitleConverter />;
}
