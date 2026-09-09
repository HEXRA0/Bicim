import type { Metadata } from 'next';
import { ArchiveConverter } from '@/components/archive-converter';

export const metadata: Metadata = {
  title: 'Arşiv dönüştürücü — Biçim',
  description: 'ZIP, TAR, TAR.GZ, TGZ ve GZ arşivlerini cihazında aç, dönüştür ve yeniden paketle.',
};

export default function ArchivePage() {
  return <ArchiveConverter />;
}
