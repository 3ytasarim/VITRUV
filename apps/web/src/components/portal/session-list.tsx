import type { WorkoutSessionSummary } from '@vitruv/contracts';
import { ChevronRight, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/components/admin/management/labels';
import { Badge } from '@/components/ui';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { WORKOUT_STATUS_LABEL, formatWorkoutDuration } from '@/lib/training-format';

/** The client's own sessions as linked rows (newest first): day, date, duration, notes, status. */
export function SessionList({ items }: { items: WorkoutSessionSummary[] }) {
  return (
    <ul className="vt-prows">
      {items.map((s) => (
        <li key={s.id}>
          <Link href={`${PORTAL_PATH}/einheit/${s.id}`} className="vt-prow">
            <span
              aria-hidden
              className="vt-prow__dot"
              data-status={
                s.status === 'COMPLETED' ? 'done' : s.status === 'IN_PROGRESS' ? 'live' : 'off'
              }
            />
            <span className="min-w-0 flex-[1_1_12rem]">
              <span className="type-body block font-semibold break-words">
                Woche {s.weekOrder + 1} · {s.dayTitle}
              </span>
              <span className="type-body-sm block text-fg-muted">
                <time dateTime={s.startedAt}>{formatDateTime(s.startedAt)}</time>
                {s.durationSeconds !== null ? ` · ${formatWorkoutDuration(s.durationSeconds)}` : ''}
                {` · ${s.exercisesCompleted} von ${s.exercisesTotal} Übungen`}
              </span>
            </span>
            {s.notesCount > 0 && (
              <span className="type-body-sm inline-flex items-center gap-1 text-fg-muted">
                <MessageSquareText aria-hidden className="size-4" />
                {s.notesCount === 1 ? '1 Notiz' : `${s.notesCount} Notizen`}
              </span>
            )}
            <Badge
              tone={
                s.status === 'COMPLETED'
                  ? 'success'
                  : s.status === 'IN_PROGRESS'
                    ? 'accent'
                    : 'neutral'
              }
              dot
            >
              {WORKOUT_STATUS_LABEL[s.status]}
            </Badge>
            <ChevronRight aria-hidden className="vt-prow__chev size-4 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
