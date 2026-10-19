'use server';

import { activateRequestSchema, authTokenSchema } from '@vitruv/contracts';
import { authApi, clientIp } from '@/lib/auth/session';

/**
 * Account activation (public). The token comes from the link fragment and is passed through to
 * the API untouched — never logged, never echoed back. Every failure of the link itself is one
 * generic state ("invalid"), so a token holder learns nothing about the account.
 */
export type ActivationCheck =
  { status: 'valid'; expiresAt: string } | { status: 'invalid' } | { status: 'error' };

export async function checkActivationAction(token: string): Promise<ActivationCheck> {
  if (!authTokenSchema.safeParse(token).success) return { status: 'invalid' };
  const result = await authApi().checkActivation(token, await clientIp());
  if (result.ok) return { status: 'valid', expiresAt: result.data.expiresAt };
  return result.status === 400 ? { status: 'invalid' } : { status: 'error' };
}

export type ActivationState =
  | { status: 'idle' }
  | { status: 'invalid' }
  | {
      status: 'error';
      message: string;
      fieldErrors?: Partial<Record<'password' | 'confirm', string>>;
    }
  | { status: 'done'; destination: 'PANEL' | 'APP' };

export async function activateAction(
  _prev: ActivationState,
  form: FormData,
): Promise<ActivationState> {
  const password = String(form.get('password') ?? '');
  const parsed = activateRequestSchema.safeParse({
    token: String(form.get('token') ?? ''),
    password,
  });
  const fieldErrors: Partial<Record<'password' | 'confirm', string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'token') return { status: 'invalid' };
      if (issue.path[0] === 'password') fieldErrors.password ??= issue.message;
    }
  }
  if (password !== String(form.get('confirm') ?? '')) {
    fieldErrors.confirm = 'Die Passwörter stimmen nicht überein.';
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Bitte prüfe deine Eingaben.', fieldErrors };
  }
  const result = await authApi().activate(parsed.data, await clientIp());
  if (result.ok) return { status: 'done', destination: result.data.destination };
  if (result.error.code === 'ACTIVATION_INVALID') return { status: 'invalid' };
  if (result.status === 400 && result.error.details?.length) {
    return {
      status: 'error',
      message: 'Bitte prüfe deine Eingaben.',
      fieldErrors: { password: result.error.details[0]?.message },
    };
  }
  return {
    status: 'error',
    message:
      result.status === 429
        ? 'Zu viele Versuche. Bitte warte einige Minuten.'
        : 'Die Aktivierung ist gerade nicht möglich. Bitte versuche es später erneut.',
  };
}
