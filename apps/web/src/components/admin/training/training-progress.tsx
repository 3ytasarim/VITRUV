import type { ExerciseProgress, WorkoutSessionSummary } from '@vitruv/contracts';
import type { WeekStats } from '@vitruv/shared';
import { formatDateTime } from '@/components/admin/management/labels';
import { Card } from '@/components/ui';
import { chartPoints, progressSummary } from '@/lib/workout-results';

/**
 * Sprint 7 — "Trainingsfortschritt" of one client for the coach: this week's planned / done /
 * open / running workouts (the SAME `weekStats` rule the app uses) and the latest workout with its
 * recorded totals. Everything comes from the API; no value is invented.
 */
export function TrainingProgress({
  stats,
  latest,
}: {
  /** null = the week could not be loaded (shown as unknown, never as 0). */
  stats: WeekStats | null;
  latest: WorkoutSessionSummary | null;
}) {
  const tiles: { label: string; value: number | null }[] = [
    { label: 'Geplant', value: stats?.planned ?? null },
    { label: 'Erledigt', value: stats?.completed ?? null },
    { label: 'Offen', value: stats?.open ?? null },
    { label: 'Läuft gerade', value: stats?.inProgress ?? null },
  ];
  const totals = latest
    ? [
        latest.totalReps != null ? `${latest.totalReps} Wiederholungen` : null,
        latest.setsCompleted ? `${latest.setsCompleted} Sätze` : null,
        latest.roundsCompleted ? `${latest.roundsCompleted} Runden` : null,
      ].filter(Boolean)
    : [];
  return (
    <section aria-labelledby="trainingsfortschritt" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="trainingsfortschritt" className="type-title">
          Trainingsfortschritt
        </h2>
        <p className="type-body-sm text-fg-muted">
          Diese Woche (gleiche Zählung wie in der App). Details und den Vergleich mit dem letzten
          Training siehst du in jeder Einheit.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} padding="sm" className="flex flex-col gap-1">
            <dt className="type-caption text-fg-muted">{tile.label}</dt>
            <dd className="type-h3 tabular-nums">{tile.value ?? '–'}</dd>
          </Card>
        ))}
      </dl>
      {stats === null && (
        <p role="note" className="type-body-sm text-fg-muted">
          Die Wochenzahlen konnten nicht geladen werden.
        </p>
      )}
      <p className="type-body-sm">
        {latest ? (
          <>
            Letztes Training:{' '}
            <time dateTime={latest.startedAt}>{formatDateTime(latest.startedAt)}</time> ·{' '}
            {latest.dayTitle}
            {totals.length > 0 ? ` · ${totals.join(' · ')}` : ''}
          </>
        ) : (
          'Noch kein Training durchgeführt.'
        )}
      </p>
    </section>
  );
}

const W = 320;
const H = 96;

/** Recorded values of one exercise as a small line chart + text alternative (no chart library). */
export function ExerciseProgressChart({ progress }: { progress: ExerciseProgress }) {
  const summary = progressSummary(progress);
  if (summary === null) {
    return <p className="type-body-sm text-fg-muted">Noch zu wenige Daten für einen Verlauf.</p>;
  }
  const values = progress.points.map((p) => p.value);
  return (
    <figure className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={summary}
        viewBox={`-8 -8 ${W + 16} ${H + 16}`}
        className="h-auto w-full max-w-md text-accent-text"
        preserveAspectRatio="none"
      >
        <polyline
          points={chartPoints(values, W, H)}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {chartPoints(values, W, H)
          .split(' ')
          .map((point) => {
            const [x, y] = point.split(',');
            return <circle key={point} cx={x} cy={y} r={3} fill="currentColor" />;
          })}
      </svg>
      <figcaption className="type-body-sm text-fg-muted">{summary}</figcaption>
    </figure>
  );
}
