import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Biçim — Hızlı görsel dönüştürücü',
  description:
    'PNG, JPEG ve WebP görsellerini cihazında hızlı ve güvenli biçimde dönüştür.',
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
