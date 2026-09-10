/* oxlint-disable next/no-html-link-for-pages -- Vinext navigation requires native document links here. */
import { Binary, Database } from 'lucide-react';

type DataSectionNavProps = {
  current: 'data' | 'text';
};

export function DataSectionNav({ current }: DataSectionNavProps) {
  return (
    <nav className="mb-8 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-secondary p-1" aria-label="Veri ve metin araçları">
      <a className={`nav-pill ${current === 'data' ? 'active' : ''}`} href="/veri">
        <Database /> Yapısal veri
      </a>
      <a className={`nav-pill ${current === 'text' ? 'active' : ''}`} href="/metin">
        <Binary /> Metin ve kodlama
      </a>
    </nav>
  );
}
