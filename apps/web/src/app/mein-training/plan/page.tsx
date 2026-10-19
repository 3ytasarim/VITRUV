import { Check, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorState } from '@/components/admin/states';
import { DatedPlan } from '@/components/portal/dated-plan';
import { Badge } from '@/components/ui';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { portalApi } from '@/lib/portal-api';
import { currentWeek, doneDayIds, exerciseCount } from '@/lib/portal-progress';
import { WEEKDAY_LABEL } from '@/lib/training-format';

export const metadata: Metadata = { title: 'Trainingsplan' };

/**
 * The coach's dated plan (exercise + date + note, upcoming first) and, if there is one, the
 * ACTIVE weekly plan: every week (current first) with its days; done days are ticked.
 */
export default async function PortalPlanPage() {
  const [active, history, dated] = await Promise.all([
    portalApi.activeProgram(),
    portalApi.history(100),
    portalApi.plan(),
  ]);
  if (!active.ok) return <ErrorState message="Dein Trainingsplan konnte nicht geladen werden." />;
  const program = active.data.program;
  const datedPlan = dated.ok && dated.data.items.length > 0 ? dated.data : null;
  if (!program && datedPlan) {
    return (
      <>
        <div className="vt-phead">
          <p className="type-eyebrow text-accent-text">Trainingsplan</p>
          <h1 className="vt-phead__title">Deine Übungen</h1>
        </div>
        <DatedPlan plan={datedPlan} />
      </>
    );
  }
  if (!program) {
    return (
      <div className="vt-pcard">
        <h1 className="type-title">Noch kein aktiver Plan</h1>
        <p className="type-body mt-2 text-fg-muted">
          Sobald dein Coach deinen Wochenplan freigibt, findest du ihn hier – mit Videos zu jeder
          Übung.
        </p>
      </div>
    );
  }
  const done = doneDayIds(program, history.ok ? history.data.items : []);
  const current = currentWeek(program);
  const weeks = [...program.weeks].sort((a, b) =>
    a.id === current?.id ? -1 : b.id === current?.id ? 1 : a.order - b.order,
  );

  return (
    <>
      <div className="vt-phead">
        <p className="type-eyebrow text-accent-text">Trainingsplan</p>
        <h1 className="vt-phead__title break-words">{program.title}</h1>
        {program.description && (
          <p className="type-body max-w-measure whitespace-pre-line text-fg-muted">
            {program.description}
          </p>
        )}
      </div>
      {datedPlan && <DatedPlan plan={datedPlan} />}
      {weeks.map((week, wi) => {
        const doneCount = week.days.filter((d) => done.has(d.id)).length;
        return (
          <section
            key={week.id}
            aria-labelledby={`woche-${week.id}`}
            className="vt-pcard vt-rise"
            style={{ '--i': wi } as React.CSSProperties}
          >
            <div className="vt-pcard__head">
              <h2 id={`woche-${week.id}`} className="vt-pcard__title">
                Woche {week.order + 1}
                {week.title ? ` · ${week.title}` : ''}
              </h2>
              {current?.id === week.id && <Badge tone="accent">Diese Woche</Badge>}
              <span className="type-body-sm ml-auto text-fg-muted tabular-nums">
                {doneCount} / {week.days.length} erledigt
              </span>
            </div>
            {week.notes && (
              <p className="type-body-sm mt-2 max-w-measure whitespace-pre-line text-fg-muted">
                {week.notes}
              </p>
            )}
            {week.days.length === 0 ? (
              <p className="type-body-sm mt-4 text-fg-subtle">
                Für diese Woche sind noch keine Tage geplant.
              </p>
            ) : (
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {week.days.map((day) => {
                  const count = exerciseCount(day);
                  const isDone = done.has(day.id);
                  return (
                    <li key={day.id} className="flex">
                      <Link
                        href={`${PORTAL_PATH}/tag/${day.id}`}
                        className="vt-ptile w-full"
                        data-done={isDone || undefined}
                      >
                        <span aria-hidden className="vt-ptile__num">
                          {isDone ? <Check className="size-4" /> : day.order + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="type-body-sm block text-fg-subtle">
                            {day.scheduledWeekday
                              ? WEEKDAY_LABEL[day.scheduledWeekday]
                              : `Tag ${day.order + 1}`}
                            {isDone ? ' · erledigt' : ''}
                          </span>
                          <span className="type-title block break-words">{day.title}</span>
                          <span className="type-body-sm block text-fg-muted">
                            {count === 1 ? '1 Übung' : `${count} Übungen`}
                          </span>
                        </span>
                        <ChevronRight aria-hidden className="vt-ptile__chev size-5 shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
