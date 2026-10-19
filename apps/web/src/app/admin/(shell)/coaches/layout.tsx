import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { COACH_TEAM_ENABLED } from '@/lib/team';

/** Coach-team screens are switched off (one coach, see lib/team.ts) → 404 like any unknown page. */
export default function CoachesLayout({ children }: { children: ReactNode }) {
  if (!COACH_TEAM_ENABLED) notFound();
  return children;
}
