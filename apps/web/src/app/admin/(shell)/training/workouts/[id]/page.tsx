import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminPageHeader, ErrorState } from '@/components/admin/states';
import { TemplateActions } from '@/components/admin/training/template-actions';
import { WorkoutEditor } from '@/components/admin/training/workout-editor';
import { Badge } from '@/components/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';
import { TEMPLATE_CATEGORY_LABEL } from '@/lib/training-format';

export const metadata: Metadata = { title: 'Vorlage bearbeiten' };

const berlinToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

/** Detail + "Vorlage bearbeiten" (template only — client copies are edited per client). */
export default async function WorkoutTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requirePagePermission(
    'training.templates.read',
    `/admin/training/workouts/${id}`,
  );
  const query = await searchParams;
  const [template, capabilities] = await Promise.all([
    trainingApi.template(id),
    trainingApi.capabilities(),
  ]);
  if (!template.ok && (template.status === 404 || template.status === 400)) notFound();
  if (!template.ok) {
    return (
      <ErrorState message="Die Vorlage konnte nicht geladen werden. Bitte versuche es erneut." />
    );
  }
  const t = template.data;
  const canWrite = user.permissions.includes('training.templates.write');
  const canAssign = canWrite && user.permissions.includes('training.programs.update');
  return (
    <>
      <AdminPageHeader
        title={t.title}
        description={`Vorlage · Version ${t.version}${t.ownedByMe ? '' : ` · ${t.ownerName}`}`}
        actions={
          canWrite ? (
            <TemplateActions
              template={t}
              today={berlinToday()}
              canAssign={canAssign}
              variant="page"
            />
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {t.category && <Badge tone="accent">{TEMPLATE_CATEGORY_LABEL[t.category]}</Badge>}
        {t.archivedAt && <Badge tone="warning">Archiviert – nicht zuweisbar</Badge>}
      </div>
      {query.gespeichert === '1' && (
        <p role="status" className="type-body-sm mb-4 text-success">
          Workout gespeichert.
        </p>
      )}
      {query.dupliziert === '1' && (
        <p role="status" className="type-body-sm mb-4 text-success">
          Kopie erstellt. Du bearbeitest jetzt die neue Vorlage – das Original bleibt unverändert.
        </p>
      )}
      <WorkoutEditor
        key={`${t.id}-${t.version}`}
        target={{ kind: 'template', template: t }}
        extendedTypes={capabilities.ok && capabilities.data.extendedExecutionTypes}
        cancelHref="/admin/training/workouts"
        readOnly={!canWrite || Boolean(t.archivedAt)}
      />
    </>
  );
}
