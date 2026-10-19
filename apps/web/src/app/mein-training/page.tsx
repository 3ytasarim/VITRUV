import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  Dumbbell,
  MessageSquareText,
  PlayCircle,
  Salad,
  Target,
  Video,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ErrorState } from '@/components/admin/states';
import { CountUp } from '@/components/portal/count-up';
import { Greeting } from '@/components/portal/greeting';
import { SessionList } from '@/components/portal/session-list';
import { StartWorkoutButton } from '@/components/portal/start-workout-button';
import { ButtonLink } from '@/components/ui';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { portalApi } from '@/lib/portal-api';
import {
  currentWeek,
  doneDayIds,
  exerciseCount,
  isoWeekday,
  nextDay,
  totals,
} from '@/lib/portal-progress';
import { WEEKDAY_LABEL, prescriptionSummary } from '@/lib/training-format';

export const metadata: Metadata = { title: 'Übersicht' };

function Kpi({
  i,
  icon,
  label,
  value,
  unit,
  hint,
  href,
  children,
}: {
  i: number;
  icon: ReactNode;
  label: string;
  value: number;
  unit?: string;
  hint: string;
  href?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden className="vt-pchip">
          {icon}
        </span>
        {href && <ArrowUpRight aria-hidden className="vt-pkpi__arrow size-4" />}
      </span>
      <span className="vt-pkpi__body">
        <span className="type-body-sm font-semibold">{label}</span>
        <span className="vt-pkpi__value">
          <CountUp value={value} />
          {unit && <span className="vt-pkpi__unit"> {unit}</span>}
        </span>
        <span className="type-body-sm text-fg-subtle">{hint}</span>
      </span>
      {children}
    </>
  );
  const style = { '--i': i } as CSSProperties;
  return href ? (
    <Link href={href} className="vt-pkpi vt-pkpi--link vt-rise" style={style}>
      {body}
    </Link>
  ) : (
    <div className="vt-pkpi vt-rise" style={style}>
      {body}
    </div>
  );
}

/**
 * Client dashboard (pattern of the Bleibsichtbar customer portal on VITRUV tokens): personal
 * greeting by time of day, this week's progress ring, four KPI tiles (counting up), the next
 * training with its exercises, this week's days and the latest sessions. Data: the API's client
 * DTOs only (profile, ACTIVE plan, running workout, own session summaries).
 */
export default async function PortalDashboardPage() {
  const [profile, active, current, history, nutrition] = await Promise.all([
    portalApi.me(),
    portalApi.activeProgram(),
    portalApi.currentWorkout(),
    portalApi.history(100),
    portalApi.nutrition(),
  ]);
  const mealPlan = nutrition.ok ? nutrition.data.document : null;
  if (!active.ok) return <ErrorState message="Dein Trainingsplan konnte nicht geladen werden." />;
  const program = active.data.program;
  const running = current.ok ? current.data.session : null;
  const items = history.ok ? history.data.items : [];
  const now = new Date();
  const stats = totals(items, now);
  const week = program ? currentWeek(program) : null;
  const done = program ? doneDayIds(program, items) : new Set<string>();
  const planned = week?.days.length ?? 0;
  const doneThisWeek = week ? week.days.filter((d) => done.has(d.id)).length : 0;
  const next = nextDay(week, done, isoWeekday(now));
  const ratio = planned ? doneThisWeek / planned : 0;
  const name = profile.ok ? `${profile.data.firstName} ${profile.data.lastName}`.trim() : '';
  const maxBar = Math.max(1, ...stats.perWeek);

  const subtitle = !program
    ? 'Dein Coach stellt gerade deinen Plan zusammen – sobald er freigegeben ist, findest du ihn hier.'
    : running
      ? `Dein Training „${running.dayTitle}“ läuft noch – mach dort weiter, wo du aufgehört hast.`
      : planned > 0 && doneThisWeek === planned
        ? 'Diese Woche ist geschafft. Stark – gönn dir die Erholung.'
        : next
          ? `Als Nächstes steht „${next.title}“ an. ${doneThisWeek} von ${planned} Einheiten dieser Woche sind geschafft.`
          : 'Schön, dass du da bist.';

  return (
    <>
      {/* ---- Greeting ---------------------------------------------------------------------- */}
      <section className="vt-pgreet vt-rise" aria-label="Begrüßung">
        <span aria-hidden className="vt-pgreet__orbs">
          <span />
          <span />
          <span />
        </span>
        <div className="relative z-10 flex min-w-0 flex-col gap-3">
          <Greeting name={name} />
          <p className="type-body max-w-xl text-fg-muted">{subtitle}</p>
          {profile.ok && profile.data.coach && (
            <p className="type-body-sm text-fg-subtle">
              Dein Coach:{' '}
              <span className="font-semibold text-fg">{profile.data.coach.displayName}</span>
            </p>
          )}
        </div>
        {program && planned > 0 && (
          <div
            className="vt-pring relative z-10"
            role="img"
            aria-label={`Diese Woche: ${doneThisWeek} von ${planned} Einheiten erledigt`}
            style={{ '--p': ratio } as CSSProperties}
          >
            <svg viewBox="0 0 120 120" aria-hidden>
              <circle className="vt-pring__track" cx="60" cy="60" r="52" />
              <circle className="vt-pring__bar" cx="60" cy="60" r="52" pathLength={1} />
            </svg>
            <span className="vt-pring__label">
              <span className="vt-pring__value tabular-nums">
                {doneThisWeek}
                <span className="vt-pring__of">/{planned}</span>
              </span>
              <span className="type-body-sm text-fg-muted">diese Woche</span>
            </span>
          </div>
        )}
      </section>

      {running && (
        <Link href={`${PORTAL_PATH}/einheit/${running.id}`} className="vt-plive vt-rise">
          <span aria-hidden className="vt-plive__pulse" />
          <PlayCircle aria-hidden className="size-6 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="type-body block font-semibold break-words">
              Laufendes Training: {running.dayTitle}
            </span>
            <span className="type-body-sm block opacity-80">
              {running.progress.completed} von {running.progress.total} Übungen erledigt
            </span>
          </span>
          <span className="type-body-sm inline-flex items-center gap-1 font-semibold">
            Fortsetzen <ArrowRight aria-hidden className="size-4" />
          </span>
        </Link>
      )}

      {/* ---- KPIs ---------------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          i={1}
          icon={<Target />}
          label="Diese Woche"
          value={doneThisWeek}
          unit={planned ? `von ${planned}` : undefined}
          hint={planned ? 'Einheiten geschafft' : 'noch keine Woche geplant'}
          href={`${PORTAL_PATH}/plan`}
        />
        <Kpi
          i={2}
          icon={<Dumbbell />}
          label="Einheiten gesamt"
          value={stats.completed}
          hint="abgeschlossen"
          href={`${PORTAL_PATH}/verlauf`}
        >
          <span aria-hidden className="vt-pbars">
            {stats.perWeek.map((n, idx) => (
              <span
                key={idx}
                style={{ '--h': n / maxBar, '--i': idx } as CSSProperties}
                data-now={idx === stats.perWeek.length - 1 || undefined}
              />
            ))}
          </span>
        </Kpi>
        <Kpi
          i={3}
          icon={<Clock />}
          label="Trainingszeit"
          value={Math.round(stats.totalSeconds / 60)}
          unit="Min."
          hint="in abgeschlossenen Einheiten"
        />
        <Kpi
          i={4}
          icon={<MessageSquareText />}
          label="Deine Notizen"
          value={stats.notes}
          hint="liest dein Coach mit"
          href={`${PORTAL_PATH}/verlauf`}
        />
      </div>

      {mealPlan && (
        <Link
          href={'/mein-training/ernaehrung'}
          className="vt-pmeal vt-rise"
          style={{ '--i': 5 } as CSSProperties}
        >
          <span aria-hidden className="vt-pchip">
            <Salad />
          </span>
          <span className="min-w-0 flex-1">
            <span className="type-body-sm block text-fg-subtle">Dein Ernährungsplan</span>
            <span className="type-body block font-semibold break-words">{mealPlan.title}</span>
          </span>
          <span className="type-body-sm inline-flex items-center gap-1 font-semibold text-accent-text">
            Öffnen <ArrowRight aria-hidden className="size-4" />
          </span>
        </Link>
      )}

      {/* ---- Next training + this week ---------------------------------------------------- */}
      {program && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="vt-pcard vt-rise" style={{ '--i': 5 } as CSSProperties}>
            <div className="vt-pcard__head">
              <span aria-hidden className="vt-pchip vt-pchip--sm">
                <PlayCircle />
              </span>
              <h2 className="vt-pcard__title">Nächstes Training</h2>
            </div>
            {next ? (
              <div className="mt-5 flex flex-col gap-5">
                <div>
                  <p className="type-body-sm text-fg-subtle">
                    Woche {(week?.order ?? 0) + 1} ·{' '}
                    {next.scheduledWeekday
                      ? WEEKDAY_LABEL[next.scheduledWeekday]
                      : `Tag ${next.order + 1}`}
                    {next.scheduledWeekday === isoWeekday(now) ? ' · heute' : ''}
                  </p>
                  <p className="vt-pnext__title break-words">{next.title}</p>
                  {next.notes && (
                    <p className="type-body-sm mt-2 whitespace-pre-line text-fg-muted">
                      {next.notes}
                    </p>
                  )}
                </div>
                <ol className="vt-pnext__list">
                  {next.sections
                    .flatMap((s) => s.exercises)
                    .slice(0, 5)
                    .map((exercise, idx) => (
                      <li key={exercise.assignmentId}>
                        <span aria-hidden className="vt-pnext__idx tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="type-body-sm block font-semibold break-words">
                            {exercise.name}
                          </span>
                          <span className="type-body-sm block text-fg-muted">
                            {prescriptionSummary(exercise)}
                          </span>
                        </span>
                        {exercise.media?.kind === 'VIDEO' && (
                          <Video
                            aria-label="mit Video"
                            className="size-4 shrink-0 text-accent-text"
                          />
                        )}
                      </li>
                    ))}
                </ol>
                {exerciseCount(next) > 5 && (
                  <p className="type-body-sm -mt-2 text-fg-subtle">
                    + {exerciseCount(next) - 5} weitere Übungen
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {running?.dayId === next.id ? (
                    <ButtonLink
                      href={`${PORTAL_PATH}/einheit/${running.id}`}
                      variant="primary"
                      size="lg"
                    >
                      Training fortsetzen
                    </ButtonLink>
                  ) : (
                    <StartWorkoutButton dayId={next.id} label="Training starten" />
                  )}
                  <ButtonLink href={`${PORTAL_PATH}/tag/${next.id}`} variant="ghost">
                    Videos ansehen
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <p className="type-body mt-4 text-fg-muted">
                {planned > 0
                  ? 'Alle Einheiten dieser Woche sind erledigt. 🎉'
                  : 'Für diese Woche sind noch keine Einheiten geplant.'}
              </p>
            )}
          </section>

          <section className="vt-pcard vt-rise" style={{ '--i': 6 } as CSSProperties}>
            <div className="vt-pcard__head">
              <span aria-hidden className="vt-pchip vt-pchip--sm">
                <Target />
              </span>
              <h2 className="vt-pcard__title">
                Woche {(week?.order ?? 0) + 1}
                {week?.title ? ` · ${week.title}` : ''}
              </h2>
            </div>
            {week?.notes && (
              <p className="type-body-sm mt-3 whitespace-pre-line text-fg-muted">{week.notes}</p>
            )}
            <ul className="vt-pweek mt-4">
              {(week?.days ?? []).map((day) => {
                const isDone = done.has(day.id);
                return (
                  <li key={day.id}>
                    <Link
                      href={`${PORTAL_PATH}/tag/${day.id}`}
                      className="vt-pweek__day"
                      data-done={isDone || undefined}
                      data-next={next?.id === day.id || undefined}
                    >
                      <span aria-hidden className="vt-pweek__check">
                        {isDone && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="type-body-sm block font-semibold break-words">
                          {day.title}
                        </span>
                        <span className="type-body-sm block text-fg-subtle">
                          {day.scheduledWeekday
                            ? WEEKDAY_LABEL[day.scheduledWeekday]
                            : `Tag ${day.order + 1}`}{' '}
                          · {isDone ? 'erledigt' : next?.id === day.id ? 'als Nächstes' : 'offen'}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link href={`${PORTAL_PATH}/plan`} className="vt-plink mt-4">
              Ganzer Plan <ArrowRight aria-hidden className="size-4" />
            </Link>
          </section>
        </div>
      )}

      {/* ---- Latest sessions ----------------------------------------------------------------- */}
      {items.length > 0 && (
        <section className="vt-pcard vt-pcard--flush vt-rise" style={{ '--i': 7 } as CSSProperties}>
          <div className="vt-pcard__head vt-pcard__head--pad">
            <span aria-hidden className="vt-pchip vt-pchip--sm">
              <MessageSquareText />
            </span>
            <h2 className="vt-pcard__title">Letzte Einheiten</h2>
            <Link href={`${PORTAL_PATH}/verlauf`} className="vt-plink ml-auto">
              Alle <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <SessionList items={items.slice(0, 5)} />
        </section>
      )}
    </>
  );
}
