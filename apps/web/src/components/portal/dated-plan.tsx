import type { ClientPlan, ClientPlanItem } from '@vitruv/contracts';
import { CalendarDays, MessageSquareText } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Badge } from '@/components/ui';

/** YYYY-MM-DD of "today" in Europe/Berlin (the coach plans in local dates). */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now);
}

const at = (date: string) => new Date(`${date}T12:00:00`);
const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

/** "2. November 2026 – 13. Dezember 2026", "ab 2. November 2026", "bis …" or null. */
export function periodLabel(from: string | null, to: string | null) {
  if (from && to) return `${day.format(at(from))} – ${day.format(at(to))}`;
  if (from) return `ab ${day.format(at(from))}`;
  if (to) return `bis ${day.format(at(to))}`;
  return null;
}

/** Where today is relative to the plan period. */
export function planStatus(plan: Pick<ClientPlan, 'startsOn' | 'endsOn'>, today: string) {
  if (plan.startsOn && today < plan.startsOn) return 'upcoming' as const;
  if (plan.endsOn && today > plan.endsOn) return 'finished' as const;
  return 'running' as const;
}

export type PlanGroup = { key: string; name: string; items: ClientPlanItem[] };

/** Items grouped by category, groups in the order the coach first placed them. */
export function groupByCategory(items: ClientPlanItem[]): PlanGroup[] {
  const groups = new Map<string, PlanGroup>();
  for (const item of items) {
    const key = item.exercise.category?.id ?? '';
    const group = groups.get(key) ?? {
      key,
      name: item.exercise.category?.name ?? 'Weitere Übungen',
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function PlanItem({ item }: { item: ClientPlanItem }) {
  const { exercise } = item;
  const media = exercise.media;
  const facts = [exercise.standard, exercise.captureType].filter(Boolean).join(' · ');
  return (
    <li className="vt-dplan__item">
      {media &&
        (media.kind === 'VIDEO' ? (
          <video
            className="vt-dplan__media"
            src={media.url}
            controls
            playsInline
            preload="metadata"
            aria-label={`Video: ${exercise.name}`}
          />
        ) : (
          <img className="vt-dplan__media" src={media.url} alt="" loading="lazy" decoding="async" />
        ))}
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="type-body font-semibold break-words">
          {exercise.code && <span className="mr-2 text-accent-text">{exercise.code}</span>}
          {exercise.name}
        </p>
        {facts && <p className="type-caption text-fg-subtle">{facts}</p>}
        {item.note && (
          <p className="vt-dplan__note">
            <MessageSquareText aria-hidden className="size-4 shrink-0" />
            <span className="whitespace-pre-line">{item.note}</span>
          </p>
        )}
        {exercise.description && (
          <p className="type-body-sm whitespace-pre-line text-fg-muted">{exercise.description}</p>
        )}
      </div>
    </li>
  );
}

const STATUS_BADGE = {
  running: { tone: 'accent', label: 'Aktuell' },
  upcoming: { tone: 'neutral', label: 'Startet bald' },
  finished: { tone: 'neutral', label: 'Abgeschlossen' },
} as const;

/**
 * The client's training plan: the period on top (with its state), then the exercises grouped by
 * category in the coach's order — code, standard / Erfassung, the coach's note and the Ausführung.
 */
export function DatedPlan({ plan, now = new Date() }: { plan: ClientPlan; now?: Date }) {
  if (plan.items.length === 0) return null;
  const period = periodLabel(plan.startsOn, plan.endsOn);
  const status = STATUS_BADGE[planStatus(plan, todayIso(now))];
  return (
    <>
      {period && (
        <div className="vt-pcard vt-rise flex flex-wrap items-center justify-between gap-3">
          <p className="type-body flex items-center gap-2 font-semibold">
            <CalendarDays aria-hidden className="size-5 text-accent-text" />
            {period}
          </p>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      )}
      {groupByCategory(plan.items).map((group, i) => (
        <section
          key={group.key || 'none'}
          aria-labelledby={`plan-${group.key || 'none'}`}
          className="vt-pcard vt-rise"
          style={{ '--i': i + 1 } as CSSProperties}
        >
          <div className="vt-pcard__head">
            <h2 id={`plan-${group.key || 'none'}`} className="vt-pcard__title">
              {group.name}
            </h2>
            <span className="type-caption text-fg-subtle">
              {group.items.length} {group.items.length === 1 ? 'Übung' : 'Übungen'}
            </span>
          </div>
          <ul className="vt-dplan">
            {group.items.map((item) => (
              <PlanItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
