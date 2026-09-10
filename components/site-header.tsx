/* oxlint-disable next/no-html-link-for-pages, next/no-img-element -- Vinext navigation and the SVG brand mark use native elements. */
import { Archive, Braces, Captions, FileText, Images, LockKeyhole } from 'lucide-react';

type SiteHeaderProps = {
  current: 'images' | 'data' | 'archive' | 'pdf' | 'subtitle';
};

export function SiteHeader({ current }: SiteHeaderProps) {
  return (
    <header className="border-b border-border bg-background/95">
      <div className="mx-auto flex min-h-18 max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8 lg:px-12">
        <a href="/" className="flex items-center gap-3" aria-label="Biçim ana sayfa">
          <span className="logo-mark" aria-hidden="true">
            <img src="/favicon.svg" alt="" width={40} height={40} />
          </span>
          <span className="text-xl font-bold tracking-[-0.025em]">biçim</span>
        </a>

        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto rounded-xl bg-secondary p-1 sm:order-none sm:w-auto" aria-label="Dönüştürücü türü">
          <a className={`nav-pill ${current === 'images' ? 'active' : ''}`} href="/">
            <Images /> Görsel
          </a>
          <a className={`nav-pill ${current === 'data' ? 'active' : ''}`} href="/veri">
            <Braces /> Veri ve metin
          </a>
          <a className={`nav-pill ${current === 'archive' ? 'active' : ''}`} href="/arsiv">
            <Archive /> Arşiv
          </a>
          <a className={`nav-pill ${current === 'pdf' ? 'active' : ''}`} href="/pdf">
            <FileText /> PDF
          </a>
          <a className={`nav-pill ${current === 'subtitle' ? 'active' : ''}`} href="/altyazi">
            <Captions /> Altyazı
          </a>
        </nav>

        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <LockKeyhole className="size-4 text-primary" />
          <span className="hidden lg:inline">Dosyaların cihazından çıkmaz</span>
          <span className="lg:hidden">Yerel işlem</span>
        </div>
      </div>
    </header>
  );
}
