import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/admin/states';
import { ProgramBuilder } from '@/components/admin/training/program-builder';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Trainingsplan' };

/** Program builder. The API scopes the program to the client and the actor (COACH: own clients). */
export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string; programId: string }>;
}) {
  const { id, programId } = await params;
  const user = await requirePagePermission(
    'training.programs.read',
    `/admin/kunden/${id}/training/${programId}`,
  );
  const [program, list] = await Promise.all([
    trainingApi.program(programId),
    trainingApi.programs(id),
  ]);
  if (!program.ok && (program.status === 404 || program.status === 400)) notFound();
  if (!program.ok) return <ErrorState message="Der Trainingsplan konnte nicht geladen werden." />;
  // The URL's client must own the program (no cross-client mixing through the path).
  if (program.data.clientId !== id) notFound();
  const active = list.ok
    ? list.data.items.find((p) => p.status === 'ACTIVE' && p.id !== programId)
    : undefined;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/admin/kunden/${id}/training`}
          className="type-caption inline-flex min-h-12 items-center gap-2 self-start text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" /> Alle Trainingspläne
        </Link>
        <h2 className="type-h3 break-words">Trainingsplan: {program.data.title}</h2>
      </div>
      <ProgramBuilder
        initial={program.data}
        clientId={id}
        activeProgram={active ? { id: active.id, title: active.title } : null}
        canUpdate={user.permissions.includes('training.programs.update')}
        canActivate={user.permissions.includes('training.programs.activate')}
      />
    </div>
  );
}
