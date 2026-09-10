import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Biçim — Hızlı ve yerel format dönüştürücü',
  description:
    'Görselleri, metinleri, JSON ve ikili verileri, arşivleri, PDF belgelerini ve altyazıları cihazında dönüştür.',
  icons: { icon: '/favicon.svg' },
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
