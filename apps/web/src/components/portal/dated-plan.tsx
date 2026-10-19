import type { ClientPlan, ClientPlanItem } from '@vitruv/contracts';
import { CalendarDays, MessageSquareText } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Badge } from '@/components/ui';

/** YYYY-MM-DD of "today" in Europe/Berlin (the coach plans in local dates). */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now);
}

const at = (date: string) => new Date(`${date}T12:00:00`);
const long = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const short = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** "Montag, 2. November" for one day, "Mo., 2. Nov. – So., 8. Nov." for a period. */
export function periodLabel(from: string, to: string) {
  return from === to
    ? long.format(at(from))
    : `${short.format(at(from))} – ${short.format(at(to))}`;
}

export type PlanPeriod = { key: string; from: string; to: string; items: ClientPlanItem[] };

/**
 * Plan items grouped by period (same from – to); single days have from = to. Sorted by start,
 * then end; within a period the coach's order is kept.
 */
export function groupByPeriod(items: ClientPlanItem[]): PlanPeriod[] {
  const groups = new Map<string, PlanPeriod>();
  for (const item of items) {
    const to = item.endsOn ?? item.scheduledOn;
    const key = `${item.scheduledOn}_${to}`;
    const group = groups.get(key) ?? { key, from: item.scheduledOn, to, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
  );
}

/** Periods that include today, or else the next period that starts later. */
export function currentOrNext(periods: PlanPeriod[], today: string) {
  const running = periods.filter((p) => p.from <= today && p.to >= today);
  if (running.length > 0) return { now: true, periods: running };
  const next = periods.find((p) => p.from > today);
  return { now: false, periods: next ? [next] : [] };
}

function PlanItem({ item }: { item: ClientPlanItem }) {
  const media = item.exercise.media;
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
            aria-label={`Video: ${item.exercise.name}`}
          />
        ) : (
          <img className="vt-dplan__media" src={media.url} alt="" loading="lazy" decoding="async" />
        ))}
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="type-body font-semibold break-words">{item.exercise.name}</p>
        {item.note && (
          <p className="vt-dplan__note">
            <MessageSquareText aria-hidden className="size-4 shrink-0" />
            <span className="whitespace-pre-line">{item.note}</span>
          </p>
        )}
        {item.exercise.description && (
          <p className="type-body-sm whitespace-pre-line text-fg-muted">
            {item.exercise.description}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * The client's dated plan: running and upcoming periods first (the current one highlighted),
 * finished periods afterwards in a collapsed list. Notes are the coach's text, shown as written.
 */
export function DatedPlan({ plan, now = new Date() }: { plan: ClientPlan; now?: Date }) {
  const today = todayIso(now);
  const periods = groupByPeriod(plan.items);
  const upcoming = periods.filter((p) => p.to >= today);
  const past = periods.filter((p) => p.to < today).reverse();
  if (periods.length === 0) return null;

  const day = (d: PlanPeriod, i: number) => {
    const running = d.from <= today && d.to >= today;
    return (
      <section
        key={d.key}
        aria-labelledby={`plan-${d.key}`}
        className="vt-pcard vt-rise"
        style={{ '--i': i } as CSSProperties}
        data-today={running || undefined}
      >
        <div className="vt-pcard__head">
          <h2 id={`plan-${d.key}`} className="vt-pcard__title">
            <CalendarDays aria-hidden className="mr-2 inline size-5 align-[-3px]" />
            {periodLabel(d.from, d.to)}
          </h2>
          {running && <Badge tone="accent">{d.from === d.to ? 'Heute' : 'Aktuell'}</Badge>}
        </div>
        <ul className="vt-dplan">
          {d.items.map((item) => (
            <PlanItem key={item.id} item={item} />
          ))}
        </ul>
      </section>
    );
  };

  return (
    <>
      {upcoming.map(day)}
      {upcoming.length === 0 && (
        <div className="vt-pcard">
          <p className="type-body text-fg-muted">
            Aktuell sind keine weiteren Übungen geplant – dein Coach trägt die nächsten bald ein.
          </p>
        </div>
      )}
      {past.length > 0 && (
        <details className="vt-pcard vt-dplan__past">
          <summary className="type-body font-semibold">
            Vergangene Zeiträume ({past.length})
          </summary>
          <div className="mt-4 flex flex-col gap-4">{past.map(day)}</div>
        </details>
      )}
    </>
  );
}
