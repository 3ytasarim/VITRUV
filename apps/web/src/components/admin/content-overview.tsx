import type { AdminWebsitePage } from '@vitruv/contracts';
import { ChevronRight } from 'lucide-react';
import { Badge, CardLink } from '@/components/ui';
import {
  SECTION_LABELS,
  formatDateTime,
  isEditableContent,
  sectionStatuses,
} from './section-registry';
import { EmptyState } from './states';

/** Homepage sections with their real publication state (from the API). */
export function ContentOverview({ page }: { page: AdminWebsitePage }) {
  // Only the content the admin edits (the homepage); SEO lives under Einstellungen.
  const sections = page.sections.filter((s) => isEditableContent(s.type));
  if (sections.length === 0) {
    return (
      <EmptyState title="Diese Seite hat noch keine Bereiche">
        Die Seitenstruktur wird mit <code>pnpm --filter @vitruv/api seed:website</code> angelegt.
      </EmptyState>
    );
  }
  return (
    <ol className="grid gap-3">
      {sections.map((section, index) => {
        return (
          <li key={section.id}>
            <CardLink
              href={`/admin/website/inhalte/${section.key}`}
              padding="sm"
              cut="sm"
              className="flex items-center gap-4"
              aria-label={`${SECTION_LABELS[section.type]} bearbeiten`}
            >
              <span aria-hidden className="type-caption w-6 shrink-0 text-fg-subtle">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="type-title">{SECTION_LABELS[section.type]}</span>
                <span className="flex flex-wrap gap-2">
                  {sectionStatuses(section).map((status) => (
                    <Badge key={status.label} tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  ))}
                </span>
                <span className="type-caption text-fg-subtle">
                  {section.hasDraft
                    ? `Entwurf gespeichert ${formatDateTime(section.draftUpdatedAt)}`
                    : section.hasPublished
                      ? `Veröffentlicht ${formatDateTime(section.publishedAt)}`
                      : 'Noch nicht veröffentlicht'}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-subtle" />
            </CardLink>
          </li>
        );
      })}
    </ol>
  );
}
