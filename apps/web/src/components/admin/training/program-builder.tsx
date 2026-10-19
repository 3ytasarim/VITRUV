'use client';

import type { AdminAssignment, AdminProgram } from '@vitruv/contracts';
import { TRAINING_SECTION_TYPES, type TrainingSectionType } from '@vitruv/shared';
import { ChevronDown, ChevronRight, Eye, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import {
  activateProgramAction,
  deleteProgramAction,
  retireProgramAction,
  trainingOpAction,
  type TrainingOp,
} from '@/app/admin/training-actions';
import { ConfirmDialog } from '@/components/admin/management/confirm-dialog';
import { Badge, Button, ButtonLink, Card, cx } from '@/components/ui';
import {
  PROGRAM_STATUS_LABEL,
  SECTION_LABEL,
  WEEKDAY_LABEL,
  prescriptionSummary,
} from '@/lib/training-format';
import { AssignmentDialog, type AssignmentValues } from './assignment-dialog';
import { ItemToolbar, moved } from './builder-controls';
import {
  ExerciseLibrary,
  isExerciseDrag,
  readDraggedExercise,
  type DraggedExercise,
} from './exercise-library';

type Confirm = { title: string; body: string; label: string; run: () => Promise<void> };
type DialogState =
  | { mode: 'create'; sectionId: string; label: string; preset?: DraggedExercise }
  | { mode: 'edit'; assignment: AdminAssignment }
  | null;

/**
 * Program builder: Program → Woche → Tag → Abschnitt → Übung. Every change is saved immediately
 * as one server mutation (the API re-checks permission + client scope) and the builder re-renders
 * from the returned program tree, so the screen never diverges from the database. The only
 * explicit "save" is the metadata form, which shows its unsaved state.
 */
export function ProgramBuilder({
  initial,
  clientId,
  activeProgram,
  canUpdate,
  canActivate,
}: {
  initial: AdminProgram;
  clientId: string;
  /** The client's current ACTIVE program, if it is a different one (activation archives it). */
  activeProgram: { id: string; title: string } | null;
  canUpdate: boolean;
  canActivate: boolean;
}) {
  const router = useRouter();
  const [program, setProgram] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** Section currently under a dragged library exercise / dragged assignment (highlight). */
  const [dropSection, setDropSection] = useState<string | null>(null);
  const [dropAssignment, setDropAssignment] = useState<string | null>(null);
  /** Assignment being dragged for reordering (dataTransfer is unreadable during dragover). */
  const draggedAssignment = useRef<{ id: string; sectionId: string } | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const editable = canUpdate && (program.status === 'DRAFT' || program.status === 'ACTIVE');

  const announce = (tone: 'success' | 'error', text: string) => {
    setStatus({ tone, text });
    if (tone === 'error') statusRef.current?.focus();
  };

  const run = (op: TrainingOp, success: string) =>
    new Promise<{ ok: true } | { ok: false; message: string; fieldErrors: Record<string, string> }>(
      (resolve) =>
        startTransition(async () => {
          const result = await trainingOpAction(op);
          if (result.ok) {
            setProgram(result.data);
            announce('success', success);
            resolve({ ok: true });
          } else {
            announce('error', result.message);
            resolve(result);
          }
        }),
    );

  const ask = (c: Confirm) => setConfirm(c);

  // ---- checklist for activation (the API validates the same rules)
  const days = program.weeks.flatMap((w) => w.days);
  const assignments = days.flatMap((d) => d.sections.flatMap((s) => s.assignments));
  const missing = [
    program.weeks.length === 0 && 'mindestens eine Woche',
    days.length === 0 && 'mindestens ein Trainingstag',
    assignments.length === 0 && 'mindestens eine Übung',
  ].filter(Boolean) as string[];

  const activate = () =>
    ask({
      title: 'Plan aktivieren?',
      body: activeProgram
        ? `Der aktuell aktive Plan „${activeProgram.title}“ wird archiviert. Die Kund:in sieht ab sofort nur diesen Plan.`
        : 'Die Kund:in sieht diesen Plan ab sofort in der App.',
      label: 'Plan aktivieren',
      run: async () => {
        const result = await activateProgramAction(program.id);
        if (result.ok) {
          setProgram(result.data.program);
          announce(
            'success',
            result.data.retiredProgramId
              ? 'Plan aktiviert. Der bisherige Plan wurde archiviert.'
              : 'Plan aktiviert.',
          );
          router.refresh();
        } else {
          announce('error', [result.message, ...Object.values(result.fieldErrors)].join(' '));
        }
      },
    });

  const retire = (target: 'complete' | 'archive') =>
    ask({
      title: target === 'complete' ? 'Plan abschließen?' : 'Plan archivieren?',
      body:
        target === 'complete'
          ? 'Der Plan gilt als beendet und ist danach schreibgeschützt. Die Kund:in sieht ihn nicht mehr als aktuellen Plan.'
          : 'Der Plan wird archiviert und ist danach schreibgeschützt.',
      label: target === 'complete' ? 'Abschließen' : 'Archivieren',
      run: async () => {
        const result = await retireProgramAction(program.id, target);
        if (result.ok) {
          setProgram(result.data);
          announce('success', target === 'complete' ? 'Plan abgeschlossen.' : 'Plan archiviert.');
          router.refresh();
        } else announce('error', result.message);
      },
    });

  const weekName = (index: number, title: string | null) =>
    `Woche ${index + 1}${title ? ` · ${title}` : ''}`;
  const dayName = (index: number, title: string) => `Tag ${index + 1} · ${title}`;

  return (
    <div className="flex flex-col gap-6">
      <div
        ref={statusRef}
        tabIndex={-1}
        role={status?.tone === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className={cx(
          'type-body-sm rounded-xs px-4 py-3',
          status
            ? status.tone === 'error'
              ? 'border border-error'
              : 'border border-success'
            : 'sr-only',
        )}
      >
        {pending ? 'Wird gespeichert …' : status?.text}
      </div>

      <Card padding="md" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            tone={
              program.status === 'ACTIVE'
                ? 'success'
                : program.status === 'DRAFT'
                  ? 'accent'
                  : 'neutral'
            }
            dot
          >
            {PROGRAM_STATUS_LABEL[program.status]}
          </Badge>
          <span className="type-body-sm text-fg-muted">
            {program.weekCount} {program.weekCount === 1 ? 'Woche' : 'Wochen'} ·{' '}
            {assignments.length} {assignments.length === 1 ? 'Übung' : 'Übungen'}
          </span>
        </div>
        {program.status === 'DRAFT' && (
          <p className="type-body-sm text-fg-muted">
            Entwurf – die Kund:in sieht diesen Plan noch nicht.
          </p>
        )}
        {program.status === 'ACTIVE' && (
          <p className="type-body-sm text-fg-muted">
            Änderungen gelten ab der nächsten Trainingseinheit. Bereits gestartete Einheiten
            behalten ihre Vorgaben.
          </p>
        )}
        {(program.status === 'COMPLETED' || program.status === 'ARCHIVED') && (
          <p className="type-body-sm text-fg-muted">Dieser Plan ist schreibgeschützt.</p>
        )}
        <div className="flex flex-wrap gap-3">
          <ButtonLink
            href={`/admin/kunden/${clientId}/training/${program.id}/vorschau`}
            variant="secondary"
            icon={<Eye aria-hidden />}
          >
            Vorschau
          </ButtonLink>
          {canActivate && program.status === 'DRAFT' && (
            <Button
              variant="primary"
              onClick={activate}
              disabled={missing.length > 0}
              aria-describedby={missing.length > 0 ? 'aktivierung-fehlt' : undefined}
            >
              Plan aktivieren
            </Button>
          )}
          {canActivate && program.status === 'ACTIVE' && (
            <Button variant="secondary" onClick={() => retire('complete')}>
              Plan abschließen
            </Button>
          )}
          {canActivate && program.status !== 'ARCHIVED' && (
            <Button variant="secondary" onClick={() => retire('archive')}>
              Archivieren
            </Button>
          )}
          {canUpdate && program.status === 'DRAFT' && (
            <Button
              variant="ghost"
              onClick={() =>
                ask({
                  title: 'Entwurf löschen?',
                  body: `„${program.title}“ wird mit allen Wochen, Tagen und Übungen gelöscht.`,
                  label: 'Entwurf löschen',
                  run: async () => {
                    const result = await deleteProgramAction(program.id, clientId);
                    if (result && !result.ok) announce('error', result.message);
                  },
                })
              }
            >
              Entwurf löschen
            </Button>
          )}
        </div>
        {program.status === 'DRAFT' && missing.length > 0 && (
          <p id="aktivierung-fehlt" className="type-body-sm text-fg-muted">
            Zum Aktivieren fehlt noch: {missing.join(', ')}.
          </p>
        )}
      </Card>

      <ProgramMetaForm
        program={program}
        editable={editable}
        onSave={(input) =>
          run({ type: 'updateProgram', programId: program.id, input }, 'Plandaten gespeichert.')
        }
      />

      <div className={editable ? 'vt-builder-grid' : undefined}>
        <section aria-labelledby="struktur-titel" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="struktur-titel" className="type-h3">
              Wochen
            </h2>
            {editable && (
              <Button
                variant="secondary"
                icon={<Plus aria-hidden />}
                disabled={pending}
                onClick={() =>
                  run({ type: 'addWeek', programId: program.id, input: {} }, 'Woche hinzugefügt.')
                }
              >
                Woche hinzufügen
              </Button>
            )}
          </div>
          {program.weeks.length === 0 && (
            <p className="type-body-sm text-fg-muted">
              Noch keine Woche. Beginne mit „Woche hinzufügen“.
            </p>
          )}
          {program.weeks.map((week, weekIndex) => {
            const name = weekName(weekIndex, week.title);
            const isCollapsed = collapsed.has(week.id);
            const weekIds = program.weeks.map((w) => w.id);
            return (
              <Card
                key={week.id}
                padding="md"
                className="flex flex-col gap-4"
                aria-labelledby={`woche-${week.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id={`woche-${week.id}`} className="type-title min-w-0 break-words">
                    <button
                      type="button"
                      className="inline-flex min-h-12 items-center gap-2 text-left"
                      aria-expanded={!isCollapsed}
                      aria-controls={`woche-inhalt-${week.id}`}
                      onClick={() =>
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(week.id)) next.delete(week.id);
                          else next.add(week.id);
                          return next;
                        })
                      }
                    >
                      {isCollapsed ? (
                        <ChevronRight aria-hidden className="size-4" />
                      ) : (
                        <ChevronDown aria-hidden className="size-4" />
                      )}
                      {name}
                    </button>
                  </h3>
                  {editable && (
                    <ItemToolbar
                      name={name}
                      index={weekIndex}
                      count={program.weeks.length}
                      disabled={pending}
                      onMove={(delta) =>
                        run(
                          {
                            type: 'reorderWeeks',
                            programId: program.id,
                            input: { ids: moved(weekIds, weekIndex, delta) },
                          },
                          `${name} verschoben.`,
                        )
                      }
                      onDuplicate={() =>
                        run({ type: 'duplicateWeek', weekId: week.id }, `${name} dupliziert.`)
                      }
                      onDelete={() =>
                        ask({
                          title: `${name} löschen?`,
                          body: 'Die Woche wird mit allen Tagen und Übungen entfernt.',
                          label: 'Woche löschen',
                          run: async () =>
                            void (await run(
                              { type: 'deleteWeek', weekId: week.id },
                              `${name} gelöscht.`,
                            )),
                        })
                      }
                    />
                  )}
                </div>
                <div
                  id={`woche-inhalt-${week.id}`}
                  hidden={isCollapsed}
                  className="flex flex-col gap-4"
                >
                  {editable && (
                    <InlineTextForm
                      label="Titel der Woche"
                      initial={week.title ?? ''}
                      optional
                      submitLabel="Titel speichern"
                      disabled={pending}
                      onSubmit={(title) =>
                        run(
                          { type: 'updateWeek', weekId: week.id, input: { title } },
                          'Titel gespeichert.',
                        )
                      }
                    />
                  )}
                  {week.days.length === 0 && (
                    <p className="type-body-sm text-fg-muted">
                      Noch kein Trainingstag in dieser Woche.
                    </p>
                  )}
                  {week.days.map((day, dayIndex) => {
                    const dName = dayName(dayIndex, day.title);
                    const dayIds = week.days.map((d) => d.id);
                    return (
                      <div
                        key={day.id}
                        className="flex flex-col gap-3 rounded-xs border border-border-subtle p-3 md:p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="type-body min-w-0 font-semibold break-words">
                            {dName}
                            {day.scheduledWeekday ? (
                              <span className="type-caption ml-2 text-fg-subtle">
                                {WEEKDAY_LABEL[day.scheduledWeekday]}
                              </span>
                            ) : null}
                          </h4>
                          {editable && (
                            <ItemToolbar
                              name={dName}
                              index={dayIndex}
                              count={week.days.length}
                              disabled={pending}
                              onMove={(delta) =>
                                run(
                                  {
                                    type: 'reorderDays',
                                    weekId: week.id,
                                    input: { ids: moved(dayIds, dayIndex, delta) },
                                  },
                                  `${dName} verschoben.`,
                                )
                              }
                              onDuplicate={() =>
                                run({ type: 'duplicateDay', dayId: day.id }, `${dName} dupliziert.`)
                              }
                              onDelete={() =>
                                ask({
                                  title: `${dName} löschen?`,
                                  body: 'Der Tag wird mit allen Abschnitten und Übungen entfernt.',
                                  label: 'Tag löschen',
                                  run: async () =>
                                    void (await run(
                                      { type: 'deleteDay', dayId: day.id },
                                      `${dName} gelöscht.`,
                                    )),
                                })
                              }
                            />
                          )}
                        </div>
                        {editable && (
                          <InlineTextForm
                            label="Titel des Tages"
                            initial={day.title}
                            submitLabel="Titel speichern"
                            disabled={pending}
                            onSubmit={(title) =>
                              run(
                                { type: 'updateDay', dayId: day.id, input: { title: title ?? '' } },
                                'Titel gespeichert.',
                              )
                            }
                          />
                        )}
                        {day.sections.map((section, sectionIndex) => {
                          const sName = `${SECTION_LABEL[section.type]}${section.title ? ` · ${section.title}` : ''}`;
                          const sectionIds = day.sections.map((s) => s.id);
                          const fullName = `${sName} (${dName})`;
                          return (
                            <section
                              key={section.id}
                              aria-label={fullName}
                              className="vt-dropzone flex flex-col gap-2 border-l-2 border-border-subtle pl-3"
                              data-drop={dropSection === section.id || undefined}
                              onDragOver={(event) => {
                                if (!editable || pending || !isExerciseDrag(event)) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'copy';
                                if (dropSection !== section.id) setDropSection(section.id);
                              }}
                              onDragLeave={(event) => {
                                if (
                                  !event.currentTarget.contains(event.relatedTarget as Node | null)
                                )
                                  setDropSection((current) =>
                                    current === section.id ? null : current,
                                  );
                              }}
                              onDrop={(event) => {
                                setDropSection(null);
                                if (!editable || !isExerciseDrag(event)) return;
                                event.preventDefault();
                                const preset = readDraggedExercise(event);
                                if (preset)
                                  setDialog({
                                    mode: 'create',
                                    sectionId: section.id,
                                    label: fullName,
                                    preset,
                                  });
                              }}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h5 className="type-caption text-accent-text">{sName}</h5>
                                {editable && (
                                  <ItemToolbar
                                    name={fullName}
                                    index={sectionIndex}
                                    count={day.sections.length}
                                    disabled={pending}
                                    onMove={(delta) =>
                                      run(
                                        {
                                          type: 'reorderSections',
                                          dayId: day.id,
                                          input: { ids: moved(sectionIds, sectionIndex, delta) },
                                        },
                                        `${sName} verschoben.`,
                                      )
                                    }
                                    onDelete={() =>
                                      ask({
                                        title: `${sName} löschen?`,
                                        body:
                                          section.assignments.length > 0
                                            ? `Der Abschnitt und seine ${section.assignments.length} Übung(en) werden entfernt.`
                                            : 'Der leere Abschnitt wird entfernt.',
                                        label: 'Abschnitt löschen',
                                        run: async () =>
                                          void (await run(
                                            { type: 'deleteSection', sectionId: section.id },
                                            `${sName} gelöscht.`,
                                          )),
                                      })
                                    }
                                  />
                                )}
                              </div>
                              {section.assignments.length === 0 && (
                                <p className="vt-dropzone__hint type-body-sm text-fg-subtle">
                                  {editable
                                    ? 'Keine Übungen – Übung hierher ziehen.'
                                    : 'Keine Übungen.'}
                                </p>
                              )}
                              <ol className="flex flex-col gap-2">
                                {section.assignments.map((assignment, index) => {
                                  const ids = section.assignments.map((a) => a.id);
                                  return (
                                    <li
                                      key={assignment.id}
                                      className="vt-assign flex flex-wrap items-center justify-between gap-2 rounded-xs bg-surface px-3 py-2"
                                      draggable={editable && !pending}
                                      data-drop={dropAssignment === assignment.id || undefined}
                                      onDragStart={(event) => {
                                        draggedAssignment.current = {
                                          id: assignment.id,
                                          sectionId: section.id,
                                        };
                                        event.dataTransfer.setData(
                                          'text/plain',
                                          assignment.exercise.name,
                                        );
                                        event.dataTransfer.effectAllowed = 'move';
                                      }}
                                      onDragEnd={() => {
                                        draggedAssignment.current = null;
                                        setDropAssignment(null);
                                      }}
                                      onDragOver={(event) => {
                                        const dragged = draggedAssignment.current;
                                        // reorder only within the same section
                                        if (!dragged || dragged.sectionId !== section.id) return;
                                        event.preventDefault();
                                        event.stopPropagation();
                                        event.dataTransfer.dropEffect = 'move';
                                        if (dropAssignment !== assignment.id)
                                          setDropAssignment(assignment.id);
                                      }}
                                      onDrop={(event) => {
                                        const dragged = draggedAssignment.current;
                                        if (!dragged || dragged.sectionId !== section.id) return;
                                        event.preventDefault();
                                        event.stopPropagation();
                                        draggedAssignment.current = null;
                                        setDropAssignment(null);
                                        const from = ids.indexOf(dragged.id);
                                        if (from < 0 || from === index) return;
                                        const order = ids.filter((x) => x !== dragged.id);
                                        order.splice(index, 0, dragged.id);
                                        void run(
                                          {
                                            type: 'reorderAssignments',
                                            sectionId: section.id,
                                            input: { ids: order },
                                          },
                                          'Reihenfolge gespeichert.',
                                        );
                                      }}
                                    >
                                      <div className="min-w-0 flex-[1_1_12rem]">
                                        <p className="type-body-sm font-semibold break-words">
                                          {assignment.exercise.name}
                                          {!assignment.exercise.active && (
                                            <span className="type-caption ml-2 text-fg-subtle">
                                              (inaktiv)
                                            </span>
                                          )}
                                        </p>
                                        <p className="type-body-sm text-fg-muted">
                                          {prescriptionSummary(assignment)}
                                        </p>
                                      </div>
                                      {editable && (
                                        <ItemToolbar
                                          name={assignment.exercise.name}
                                          index={index}
                                          count={section.assignments.length}
                                          disabled={pending}
                                          onEdit={() => setDialog({ mode: 'edit', assignment })}
                                          onMove={(delta) =>
                                            run(
                                              {
                                                type: 'reorderAssignments',
                                                sectionId: section.id,
                                                input: { ids: moved(ids, index, delta) },
                                              },
                                              `${assignment.exercise.name} verschoben.`,
                                            )
                                          }
                                          onDelete={() =>
                                            ask({
                                              title: `${assignment.exercise.name} entfernen?`,
                                              body: 'Die Übung wird aus diesem Abschnitt entfernt. Die Übung selbst bleibt in der Bibliothek.',
                                              label: 'Entfernen',
                                              run: async () =>
                                                void (await run(
                                                  {
                                                    type: 'deleteAssignment',
                                                    assignmentId: assignment.id,
                                                  },
                                                  `${assignment.exercise.name} entfernt.`,
                                                )),
                                            })
                                          }
                                        />
                                      )}
                                    </li>
                                  );
                                })}
                              </ol>
                              {editable && (
                                <Button
                                  variant="ghost"
                                  icon={<Plus aria-hidden />}
                                  className="self-start"
                                  disabled={pending}
                                  onClick={() =>
                                    setDialog({
                                      mode: 'create',
                                      sectionId: section.id,
                                      label: fullName,
                                    })
                                  }
                                >
                                  Übung hinzufügen
                                </Button>
                              )}
                            </section>
                          );
                        })}
                        {editable && (
                          <AddSectionForm
                            disabled={pending}
                            onAdd={(type) =>
                              run(
                                { type: 'addSection', dayId: day.id, input: { type } },
                                `${SECTION_LABEL[type]} hinzugefügt.`,
                              )
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                  {editable && (
                    <AddDayForm
                      disabled={pending}
                      onAdd={(title, withDefaultSections) =>
                        run(
                          {
                            type: 'addDay',
                            weekId: week.id,
                            input: { title, withDefaultSections },
                          },
                          `Tag „${title}“ hinzugefügt.`,
                        )
                      }
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </section>
        {editable && <ExerciseLibrary />}
      </div>

      <AssignmentDialog
        key={
          dialog
            ? dialog.mode === 'edit'
              ? dialog.assignment.id
              : `new-${dialog.sectionId}-${dialog.preset?.id ?? ''}`
            : 'closed'
        }
        open={dialog !== null}
        title={
          dialog?.mode === 'edit'
            ? `${dialog.assignment.exercise.name} bearbeiten`
            : `Übung hinzufügen – ${dialog?.mode === 'create' ? dialog.label : ''}`
        }
        assignment={dialog?.mode === 'edit' ? dialog.assignment : undefined}
        preset={dialog?.mode === 'create' ? dialog.preset : undefined}
        onClose={() => setDialog(null)}
        onSubmit={async (values: AssignmentValues) => {
          if (!dialog) return { ok: true };
          const result =
            dialog.mode === 'create'
              ? await run(
                  { type: 'addAssignment', sectionId: dialog.sectionId, input: values },
                  'Übung hinzugefügt.',
                )
              : await run(
                  {
                    type: 'updateAssignment',
                    assignmentId: dialog.assignment.id,
                    input:
                      dialog.assignment.exercise.id === values.exerciseId
                        ? { ...values, exerciseId: undefined }
                        : values,
                  },
                  'Übung gespeichert.',
                );
          if (result.ok) setDialog(null);
          return result;
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.label ?? ''}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const current = confirm;
          setConfirm(null);
          if (current) startTransition(current.run);
        }}
      >
        <p>{confirm?.body}</p>
      </ConfirmDialog>
    </div>
  );
}

/** Program metadata with an explicit save and a visible unsaved state (+ browser warning). */
function ProgramMetaForm({
  program,
  editable,
  onSave,
}: {
  program: AdminProgram;
  editable: boolean;
  onSave: (input: {
    title: string;
    description: string | null;
    startsOn: string | null;
    endsOn: string | null;
  }) => Promise<{ ok: true } | { ok: false; message: string; fieldErrors: Record<string, string> }>;
}) {
  const id = useId();
  const initial = {
    title: program.title,
    description: program.description ?? '',
    startsOn: program.startsOn ?? '',
    endsOn: program.endsOn ?? '',
  };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(initial);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await onSave({
      title: values.title,
      description: values.description.trim() === '' ? null : values.description,
      startsOn: values.startsOn || null,
      endsOn: values.endsOn || null,
    });
    if (result.ok) {
      setSaved(values);
      setErrors({});
    } else setErrors(result.fieldErrors);
  };

  const input = (key: 'title' | 'startsOn' | 'endsOn', label: string, type = 'text') => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${key}`} className="type-body-sm font-semibold">
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        type={type}
        value={values[key]}
        readOnly={!editable}
        maxLength={key === 'title' ? 160 : undefined}
        onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        className="vt-input type-body"
      />
      {errors[key] && (
        <p id={`${id}-${key}-error`} className="type-body-sm text-error">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <Card padding="md">
      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-4"
        aria-labelledby={`${id}-heading`}
      >
        <h2 id={`${id}-heading`} className="type-title">
          Plandaten
        </h2>
        {input('title', 'Titel')}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-description`} className="type-body-sm font-semibold">
            Beschreibung{' '}
            <span className="type-caption ml-2 text-fg-subtle">
              optional, für die Kund:in sichtbar
            </span>
          </label>
          <textarea
            id={`${id}-description`}
            rows={3}
            maxLength={4000}
            value={values.description}
            readOnly={!editable}
            onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
            className="vt-input type-body"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {input('startsOn', 'Start', 'date')}
          {input('endsOn', 'Ende', 'date')}
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={!dirty}>
              Plandaten speichern
            </Button>
            <p className="type-body-sm text-fg-muted" aria-live="polite">
              {dirty ? 'Ungespeicherte Änderungen' : 'Alle Änderungen gespeichert'}
            </p>
          </div>
        )}
      </form>
    </Card>
  );
}

function InlineTextForm({
  label,
  initial,
  optional = false,
  submitLabel,
  disabled,
  onSubmit,
}: {
  label: string;
  initial: string;
  optional?: boolean;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (value: string | null) => Promise<unknown>;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(value.trim() === '' && optional ? null : value);
      }}
    >
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
        <label htmlFor={id} className="type-caption text-fg-subtle">
          {label}
          {optional && ' (optional)'}
        </label>
        <input
          id={id}
          value={value}
          maxLength={120}
          onChange={(event) => setValue(event.target.value)}
          className="vt-input type-body-sm"
        />
      </div>
      <Button
        type="submit"
        variant="secondary"
        disabled={disabled || !dirty || (!optional && value.trim() === '')}
      >
        {submitLabel}
      </Button>
      {dirty && <span className="type-caption text-fg-subtle">Nicht gespeichert</span>}
    </form>
  );
}

function AddDayForm({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (title: string, withDefaultSections: boolean) => Promise<{ ok: boolean }>;
}) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [defaults, setDefaults] = useState(true);
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xs border border-dashed border-border-subtle p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (title.trim() === '') return;
        const result = await onAdd(title.trim(), defaults);
        if (result.ok) setTitle('');
      }}
    >
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
        <label htmlFor={`${id}-title`} className="type-body-sm font-semibold">
          Neuer Trainingstag
        </label>
        <input
          id={`${id}-title`}
          value={title}
          maxLength={120}
          placeholder="z. B. Oberkörper A"
          onChange={(event) => setTitle(event.target.value)}
          className="vt-input type-body"
        />
      </div>
      <label className="type-body-sm flex min-h-12 items-center gap-2">
        <input
          type="checkbox"
          className="vt-check"
          checked={defaults}
          onChange={(event) => setDefaults(event.target.checked)}
        />
        Warm-up, Hauptteil und Abschluss anlegen
      </label>
      <Button
        type="submit"
        variant="secondary"
        icon={<Plus aria-hidden />}
        disabled={disabled || title.trim() === ''}
      >
        Tag hinzufügen
      </Button>
    </form>
  );
}

function AddSectionForm({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (type: TrainingSectionType) => Promise<unknown>;
}) {
  const id = useId();
  const [type, setType] = useState<TrainingSectionType>('MAIN');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onAdd(type);
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="type-caption text-fg-subtle">
          Abschnitt hinzufügen
        </label>
        <select
          id={id}
          value={type}
          onChange={(event) => setType(event.target.value as TrainingSectionType)}
          className="vt-input type-body-sm"
        >
          {TRAINING_SECTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {SECTION_LABEL[value]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="ghost" icon={<Plus aria-hidden />} disabled={disabled}>
        Abschnitt hinzufügen
      </Button>
    </form>
  );
}
