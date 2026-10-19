import type { ReactNode } from 'react';

export default function Breadcrumb({ href, onBack, children, path }: {
  href: string; onBack: () => void; children: ReactNode; path: string;
}) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <a href={href} onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onBack();
      }}>{children}</a>
      <span className="dim project-path">{path}</span>
    </nav>
  );
}
