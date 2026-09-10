import type { Metadata } from 'next';
import { BinaryDataConverter } from '@/components/binary-data-converter';

export const metadata: Metadata = {
  title: 'İkili veri dönüştürücü — Biçim',
  description: 'JSON, MessagePack, CBOR ve BSON verilerini cihazında dönüştür.',
};

export default function BinaryDataPage() {
  return <BinaryDataConverter />;
}
