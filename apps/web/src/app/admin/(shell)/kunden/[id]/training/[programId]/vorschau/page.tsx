import { ArrowLeft, ImageIcon, Video } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/admin/states';
import { Badge, Card } from '@/components/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { formatDate } from '@/components/admin/management/labels';
import { SECTION_LABEL, WEEKDAY_LABEL, prescriptionSummary } from '@/lib/training-format';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Vorschau · Trainingsplan' };

/**
 * Coach/Admin preview of exactly what the client receives (the client DTO from the API) — web
 * rendering only, not the final Flutter design. Works for drafts before activation.
 */
export default async function ProgramPreviewPage({
  params,
}: {
  params: Promise<{ id: string; programId: string }>;
}) {
  const { id, programId } = await params;
  await requirePagePermission(
    'training.programs.read',
    `/admin/kunden/${id}/training/${programId}/vorschau`,
  );
  const [preview, program] = await Promise.all([
    trainingApi.preview(programId),
    trainingApi.program(programId),
  ]);
  if (!preview.ok && (preview.status === 404 || preview.status === 400)) notFound();
  if (!preview.ok || !program.ok)
    return <ErrorState message="Die Vorschau konnte nicht geladen werden." />;
  if (program.data.clientId !== id) notFound();
  const plan = preview.data;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/admin/kunden/${id}/training/${programId}`}
          className="type-caption inline-flex min-h-12 items-center gap-2 self-start text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" /> Zurück zum Plan
        </Link>
        <h2 className="type-h3 break-words">Vorschau: {plan.title}</h2>
        <p className="type-body-sm text-fg-muted">
          So erhält die Kund:in den Plan in der App (vereinfachte Web-Darstellung).
          {program.data.status === 'DRAFT' &&
            ' Der Plan ist noch ein Entwurf und für die Kund:in nicht sichtbar.'}
        </p>
        {plan.description && <p className="type-body whitespace-pre-line">{plan.description}</p>}
        {plan.startsOn && (
          <p className="type-body-sm text-fg-muted">
            Start: {formatDate(plan.startsOn)}
            {plan.endsOn ? ` · Ende: ${formatDate(plan.endsOn)}` : ''}
          </p>
        )}
      </div>
      {plan.weeks.length === 0 && <p className="type-body-sm text-fg-muted">Noch keine Inhalte.</p>}
      {plan.weeks.map((week) => (
        <section
          key={week.id}
          aria-labelledby={`vorschau-${week.id}`}
          className="flex flex-col gap-4"
        >
          <h3 id={`vorschau-${week.id}`} className="type-title">
            Woche {week.order + 1}
            {week.title ? ` · ${week.title}` : ''}
            {plan.currentWeekId === week.id && (
              <Badge tone="accent" className="ml-3">
                Aktuelle Woche
              </Badge>
            )}
          </h3>
          {week.days.map((day) => (
            <Card key={day.id} padding="md" className="flex flex-col gap-4">
              <h4 className="type-body font-semibold">
                Tag {day.order + 1} · {day.title}
                {day.scheduledWeekday ? (
                  <span className="type-caption ml-2 text-fg-subtle">
                    {WEEKDAY_LABEL[day.scheduledWeekday]}
                  </span>
                ) : null}
              </h4>
              {day.notes && (
                <p className="type-body-sm text-fg-muted whitespace-pre-line">{day.notes}</p>
              )}
              {day.sections.map((section) => (
                <div key={section.id} className="flex flex-col gap-2">
                  <h5 className="type-caption text-accent-text">
                    {SECTION_LABEL[section.type]}
                    {section.title ? ` · ${section.title}` : ''}
                  </h5>
                  {section.exercises.length === 0 ? (
                    <p className="type-body-sm text-fg-subtle">Keine Übungen.</p>
                  ) : (
                    <ol className="flex flex-col gap-2">
                      {section.exercises.map((exercise) => (
                        <li
                          key={exercise.assignmentId}
                          className="flex gap-3 rounded-xs bg-surface px-3 py-2"
                        >
                          <span aria-hidden className="mt-0.5 shrink-0 text-fg-subtle">
                            {exercise.media?.kind === 'VIDEO' ? (
                              <Video className="size-4" />
                            ) : exercise.media ? (
                              <ImageIcon className="size-4" />
                            ) : null}
                          </span>
                          <div className="min-w-0">
                            <p className="type-body-sm font-semibold break-words">
                              {exercise.name}
                            </p>
                            <p className="type-body-sm text-fg-muted">
                              {prescriptionSummary(exercise)}
                            </p>
                            {exercise.instructions && (
                              <p className="type-body-sm mt-1 whitespace-pre-line">
                                {exercise.instructions}
                              </p>
                            )}
                            {exercise.media && (
                              <p className="type-caption mt-1 text-fg-subtle">
                                {exercise.media.kind === 'VIDEO'
                                  ? 'Video verfügbar'
                                  : 'Bild verfügbar'}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}
