import type { ActivationState, CoachingStatus, UserStatus } from '@vitruv/shared';
import type { BadgeTone } from '@/components/ui';

/** German labels for the three independent client states (text always shown, never colour only). */
export const COACHING_LABEL: Record<CoachingStatus, string> = {
  ACTIVE: 'Coaching aktiv',
  PAUSED: 'Pausiert',
  COMPLETED: 'Abgeschlossen',
};
export const COACHING_TONE: Record<CoachingStatus, BadgeTone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'neutral',
};

export const ACCOUNT_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Konto aktiv',
  DISABLED: 'Konto deaktiviert',
};

export const ACTIVATION_LABEL: Record<ActivationState, string> = {
  ACTIVATED: 'Aktiviert',
  PENDING: 'Aktivierung ausstehend',
  EXPIRED: 'Aktivierungslink abgelaufen',
};
export const ACTIVATION_TONE: Record<ActivationState, BadgeTone> = {
  ACTIVATED: 'success',
  PENDING: 'accent',
  EXPIRED: 'warning',
};

const DATE = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' });
const DATE_TIME = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
});

export const formatDate = (iso: string | null | undefined) =>
  iso ? DATE.format(new Date(iso)) : '—';
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? DATE_TIME.format(new Date(iso)) : '—';
