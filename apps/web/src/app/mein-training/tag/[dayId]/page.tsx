import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/admin/states';
import { ExerciseMedia } from '@/components/portal/exercise-media';
import { StartWorkoutButton } from '@/components/portal/start-workout-button';
import { ButtonLink, Card } from '@/components/ui';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { portalApi } from '@/lib/portal-api';
import { SECTION_LABEL, WEEKDAY_LABEL, prescriptionSummary } from '@/lib/training-format';

export const metadata: Metadata = { title: 'Trainingstag' };

/**
 * One day of the client's ACTIVE plan: the coach's notes, every exercise with its demonstration
 * video, prescription and instructions — and "Training starten" (or resume when it is running).
 * The day is looked up inside the client's own active program only.
 */
export default async function PortalDayPage({ params }: { params: Promise<{ dayId: string }> }) {
  const { dayId } = await params;
  const [active, current] = await Promise.all([
    portalApi.activeProgram(),
    portalApi.currentWorkout(),
  ]);
  if (!active.ok) return <ErrorState message="Dein Trainingsplan konnte nicht geladen werden." />;
  const program = active.data.program;
  const week = program?.weeks.find((w) => w.days.some((d) => d.id === dayId));
  const day = week?.days.find((d) => d.id === dayId);
  if (!program || !week || !day) notFound();
  const running = current.ok ? current.data.session : null;
  const runningHere = running?.dayId === day.id ? running : null;
  const count = day.sections.reduce((n, s) => n + s.exercises.length, 0);

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          href={PORTAL_PATH}
          className="type-caption inline-flex min-h-12 items-center gap-2 self-start text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" /> Zur Übersicht
        </Link>
        <p className="type-eyebrow text-accent-text">
          Woche {week.order + 1} · Tag {day.order + 1}
          {day.scheduledWeekday ? ` · ${WEEKDAY_LABEL[day.scheduledWeekday]}` : ''}
        </p>
        <h1 className="type-h2 break-words">{day.title}</h1>
        {day.notes && (
          <Card tone="sunken" padding="sm" className="max-w-measure">
            <p className="type-caption text-fg-subtle">Hinweis von deinem Coach</p>
            <p className="type-body whitespace-pre-line">{day.notes}</p>
          </Card>
        )}
        <div className="pt-2">
          {count === 0 ? (
            <p className="type-body-sm text-fg-muted">
              Für diesen Tag sind noch keine Übungen geplant.
            </p>
          ) : runningHere ? (
            <ButtonLink
              href={`${PORTAL_PATH}/einheit/${runningHere.id}`}
              variant="primary"
              size="lg"
            >
              Training fortsetzen
            </ButtonLink>
          ) : (
            <StartWorkoutButton dayId={day.id} label="Training starten" />
          )}
        </div>
      </div>

      {day.sections.map((section) =>
        section.exercises.length === 0 ? null : (
          <section
            key={section.id}
            aria-labelledby={`abschnitt-${section.id}`}
            className="flex flex-col gap-4"
          >
            <h2 id={`abschnitt-${section.id}`} className="type-h3">
              {SECTION_LABEL[section.type]}
              {section.title ? ` · ${section.title}` : ''}
            </h2>
            <ol className="grid gap-4 md:grid-cols-2">
              {section.exercises.map((exercise, index) => (
                <li key={exercise.assignmentId}>
                  <Card padding="md" className="flex h-full flex-col gap-3">
                    {exercise.media && (
                      <ExerciseMedia media={exercise.media} name={exercise.name} />
                    )}
                    <div className="flex flex-col gap-1">
                      <p className="type-caption text-fg-subtle">Übung {index + 1}</p>
                      <h3 className="type-title break-words">{exercise.name}</h3>
                      <p className="type-body-sm font-semibold text-accent-text">
                        {prescriptionSummary(exercise)}
                      </p>
                    </div>
                    {exercise.instructions && (
                      <p className="type-body-sm whitespace-pre-line text-fg-muted">
                        {exercise.instructions}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          </section>
        ),
      )}
    </>
  );
}
