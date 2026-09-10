/* oxlint-disable next/no-html-link-for-pages -- Vinext navigation requires native document links here. */
import { Binary, Boxes, Database } from 'lucide-react';

type DataSectionNavProps = {
  current: 'data' | 'text' | 'binary';
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
      <a className={`nav-pill ${current === 'binary' ? 'active' : ''}`} href="/ikili-veri">
        <Boxes /> İkili veri
      </a>
    </nav>
  );
}
