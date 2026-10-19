'use client';

import type { WorkoutProgress, WorkoutSession, WorkoutSessionExercise } from '@vitruv/contracts';
import { Check, CircleSlash, Flag, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import {
  finishWorkoutAction,
  setExerciseStatusAction,
  setSetDoneAction,
  type PortalResult,
} from '@/app/mein-training/actions';
import { Badge, Button, Card, cx } from '@/components/ui';
import { SECTION_LABEL, prescriptionSummary } from '@/lib/training-format';
import { ExerciseMedia } from './exercise-media';
import { NoteEditor } from './note-editor';

type Update = PortalResult<{ exercise: WorkoutSessionExercise; progress: WorkoutProgress }>;

/**
 * A workout session: every exercise with its video, target (snapshot from the start), the
 * recording controls while it runs, and the client's note under each exercise plus one on the
 * whole session. Notes stay editable after the session ended; recorded results do not.
 */
export function WorkoutSessionView({ session }: { session: WorkoutSession }) {
  const [exercises, setExercises] = useState(session.exercises);
  const [progress, setProgress] = useState(session.progress);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = session.status === 'IN_PROGRESS';

  const apply = (run: () => Promise<Update>) =>
    start(async () => {
      setError(null);
      const result = await run();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setExercises((all) =>
        all.map((e) => (e.id === result.data.exercise.id ? result.data.exercise : e)),
      );
      setProgress(result.data.progress);
    });

  const finish = (target: 'complete' | 'abandon') => {
    if (target === 'abandon' && !window.confirm('Training wirklich abbrechen?')) return;
    start(async () => {
      setError(null);
      const result = await finishWorkoutAction(session.id, target);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div
        className="vt-portal__progress"
        role="progressbar"
        aria-label="Fortschritt"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.completed + progress.skipped}
        aria-valuetext={`${progress.completed} von ${progress.total} Übungen erledigt`}
      >
        <span
          style={{
            width: `${progress.total ? ((progress.completed + progress.skipped) / progress.total) * 100 : 0}%`,
          }}
        />
      </div>
      <p className="type-body-sm -mt-6 text-fg-muted">
        {progress.completed} von {progress.total} Übungen erledigt
        {progress.skipped > 0 ? ` · ${progress.skipped} übersprungen` : ''}
      </p>

      {error && (
        <p
          role="alert"
          className="type-body-sm rounded-md border border-error px-4 py-3 text-error"
        >
          {error}
        </p>
      )}

      <ol className="flex flex-col gap-5">
        {exercises.map((exercise, index) => {
          const previous = exercises[index - 1];
          const newSection =
            !previous ||
            previous.sectionOrder !== exercise.sectionOrder ||
            previous.sectionType !== exercise.sectionType;
          const current = running && progress.currentExerciseId === exercise.id;
          return (
            <li key={exercise.id} className="flex flex-col gap-3">
              {newSection && (
                <h2 className="type-h3 pt-2">
                  {SECTION_LABEL[exercise.sectionType]}
                  {exercise.sectionTitle ? ` · ${exercise.sectionTitle}` : ''}
                </h2>
              )}
              <Card
                tone={current ? 'accent' : 'default'}
                padding="md"
                className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
              >
                <div className="flex min-w-0 flex-col gap-3">
                  {exercise.media && <ExerciseMedia media={exercise.media} name={exercise.name} />}
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="type-title break-words">{exercise.name}</h3>
                    {exercise.status === 'COMPLETED' && (
                      <Badge tone="success" dot>
                        Erledigt
                      </Badge>
                    )}
                    {exercise.status === 'SKIPPED' && <Badge tone="neutral">Übersprungen</Badge>}
                  </div>
                  <p className="type-body-sm font-semibold text-accent-text">
                    {prescriptionSummary(exercise.target)}
                  </p>
                  {exercise.instructions && (
                    <p className="type-body-sm whitespace-pre-line text-fg-muted">
                      {exercise.instructions}
                    </p>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                  {running && exercise.executionMode === 'SETS_REPS' && (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="type-body-sm mb-2 font-semibold">Sätze abhaken</legend>
                      <div className="flex flex-wrap gap-2">
                        {exercise.sets.map((set) => (
                          <button
                            key={set.setNumber}
                            type="button"
                            aria-pressed={set.completed}
                            disabled={pending}
                            className={cx('vt-portal__set', set.completed && 'is-done')}
                            onClick={() =>
                              apply(() =>
                                setSetDoneAction(
                                  session.id,
                                  exercise.id,
                                  set.setNumber,
                                  !set.completed,
                                ),
                              )
                            }
                          >
                            {set.completed && <Check aria-hidden className="size-4" />}
                            Satz {set.setNumber}
                            {set.targetReps ? ` · ${set.targetReps}` : ''}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {running && (
                    <div className="flex flex-wrap gap-2">
                      {exercise.executionMode !== 'SETS_REPS' && (
                        <Button
                          variant={exercise.status === 'COMPLETED' ? 'secondary' : 'primary'}
                          icon={<Check aria-hidden />}
                          disabled={pending}
                          aria-pressed={exercise.status === 'COMPLETED'}
                          onClick={() =>
                            apply(() =>
                              setExerciseStatusAction(
                                session.id,
                                exercise.id,
                                exercise.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED',
                              ),
                            )
                          }
                        >
                          {exercise.status === 'COMPLETED' ? 'Wieder öffnen' : 'Erledigt'}
                        </Button>
                      )}
                      {exercise.status !== 'COMPLETED' && (
                        <Button
                          variant="ghost"
                          icon={<CircleSlash aria-hidden />}
                          disabled={pending}
                          aria-pressed={exercise.status === 'SKIPPED'}
                          onClick={() =>
                            apply(() =>
                              setExerciseStatusAction(
                                session.id,
                                exercise.id,
                                exercise.status === 'SKIPPED' ? 'PENDING' : 'SKIPPED',
                              ),
                            )
                          }
                        >
                          {exercise.status === 'SKIPPED' ? 'Doch machen' : 'Überspringen'}
                        </Button>
                      )}
                    </div>
                  )}
                  <NoteEditor
                    sessionId={session.id}
                    exerciseId={exercise.id}
                    initial={exercise.clientNote}
                    label="Deine Notiz zu dieser Übung"
                    placeholder="z. B. Gewicht, Gefühl, was schwer fiel …"
                  />
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <Card tone="sunken" padding="md" className="flex flex-col gap-5">
        <h2 className="type-h3">Notiz zum ganzen Training</h2>
        <NoteEditor
          sessionId={session.id}
          exerciseId={null}
          initial={session.clientNote}
          label="Wie lief es insgesamt?"
          placeholder="z. B. Energie, Schlaf, Schmerzen, Zeit …"
        />
        {running && (
          <div className="flex flex-wrap gap-3 border-t border-border-subtle pt-5">
            <Button
              variant="primary"
              size="lg"
              icon={<Flag aria-hidden />}
              loading={pending}
              onClick={() => finish('complete')}
            >
              Training abschließen
            </Button>
            <Button
              variant="ghost"
              icon={<X aria-hidden />}
              disabled={pending}
              onClick={() => finish('abandon')}
            >
              Abbrechen
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
