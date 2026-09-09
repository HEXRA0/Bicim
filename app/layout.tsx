import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Biçim — Çok formatlı görsel dönüştürücü',
  description:
    'PNG, JPEG, WebP, AVIF, HEIC, TIFF, GIF, BMP, SVG ve ICO görsellerini cihazında dönüştür.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${manrope.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
