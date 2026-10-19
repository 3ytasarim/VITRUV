import type { ReactNode } from 'react';
import { Eyebrow, SectionHeading } from '@/components/ui';

/** A titled group on the /design page (dev tool only — not a production component). */
export function PreviewGroup({
  id,
  eyebrow,
  title,
  note,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-design-group={id}
      className="border-t border-border-subtle py-(--section-space)"
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <SectionHeading level={2} size="h2" id={`${id}-title`} className="mt-3">
        {title}
      </SectionHeading>
      {note && <p className="type-body-sm mt-3 max-w-measure text-fg-muted">{note}</p>}
      <div className="mt-10 flex flex-col gap-12">{children}</div>
    </section>
  );
}

export function PreviewItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="type-caption text-fg-subtle">{label}</h3>
      {children}
    </div>
  );
}
