import { COACHING_STATUSES, WORKOUT_SESSION_STATUSES } from '@vitruv/shared';
import { z } from 'zod';

/**
 * Coach/Admin start page ("Übersicht", glass dashboard 2026-10-19). One read model, every number
 * scoped like the client list: ADMIN = all clients, COACH = only actively assigned clients.
 * Weeks are ISO calendar weeks (Monday) in Europe/Berlin.
 */
export const adminDashboardSchema = z.object({
  kpis: z.object({
    activeClients: z.number().int().min(0),
    totalClients: z.number().int().min(0),
    activePrograms: z.number().int().min(0),
    sessionsThisWeek: z.number().int().min(0),
    sessionsLastWeek: z.number().int().min(0),
    notesLast7Days: z.number().int().min(0),
    notesPrevious7Days: z.number().int().min(0),
  }),
  /** Completed sessions per calendar week, oldest → newest (8 weeks, the last one is this week). */
  sessionsPerWeek: z.array(z.object({ weekStart: z.iso.date(), count: z.number().int().min(0) })),
  clientsByStatus: z.object(
    Object.fromEntries(COACHING_STATUSES.map((s) => [s, z.number().int().min(0)])) as Record<
      (typeof COACHING_STATUSES)[number],
      z.ZodNumber
    >,
  ),
  /** Latest client notes (exercise or whole-session notes), newest first. */
  recentNotes: z.array(
    z.object({
      sessionId: z.uuid(),
      clientId: z.uuid(),
      clientName: z.string(),
      exerciseName: z.string().nullable(),
      excerpt: z.string(),
      at: z.iso.datetime(),
    }),
  ),
  recentSessions: z.array(
    z.object({
      sessionId: z.uuid(),
      clientId: z.uuid(),
      clientName: z.string(),
      dayTitle: z.string(),
      status: z.enum(WORKOUT_SESSION_STATUSES),
      startedAt: z.iso.datetime(),
      notesCount: z.number().int().min(0),
    }),
  ),
});
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
