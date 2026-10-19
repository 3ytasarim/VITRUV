'use server';

import { changePasswordRequestSchema } from '@vitruv/contracts';
import { redirect } from 'next/navigation';
import { authApi, clearSession, sessionTokens, storeSession } from '@/lib/auth/session';

/**
 * Session actions of the Admin/Coach panel. The API revokes sessions server-side; deleting the
 * cookies alone would leave a usable session behind, so logout always calls the API first.
 */
export async function logoutAction(): Promise<void> {
  const tokens = await sessionTokens();
  if (tokens.accessToken || tokens.refreshToken) await authApi().logout(tokens);
  await clearSession();
  redirect('/login?hinweis=abgemeldet');
}

export async function logoutAllAction(): Promise<void> {
  const { accessToken } = await sessionTokens();
  if (accessToken) await authApi().logoutAll(accessToken);
  await clearSession();
  redirect('/login?hinweis=alle');
}

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';
export type PasswordChangeState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<PasswordField, string>> };

/**
 * Password change. Policy (API): this session continues with a fresh token pair, all other
 * sessions of the account are revoked. Passwords are never echoed back into the form.
 */
export async function changePasswordAction(
  _prev: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const input = {
    currentPassword: String(formData.get('currentPassword') ?? ''),
    newPassword: String(formData.get('newPassword') ?? ''),
  };
  const fieldErrors: Partial<Record<PasswordField, string>> = {};
  const parsed = changePasswordRequestSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as PasswordField;
      fieldErrors[field] ??= issue.message;
    }
  }
  if (input.newPassword !== String(formData.get('confirmPassword') ?? '')) {
    fieldErrors.confirmPassword ??= 'Die Passwörter stimmen nicht überein.';
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Bitte prüfe deine Eingaben.', fieldErrors };
  }

  const { accessToken } = await sessionTokens();
  if (!accessToken) redirect('/login?next=/admin/konto');
  const result = await authApi().changePassword(accessToken, parsed.data);
  if (!result.ok) {
    if (result.status === 401) {
      await clearSession();
      redirect('/login?next=/admin/konto');
    }
    if (result.status === 400 && result.error.details?.length) {
      for (const detail of result.error.details) {
        fieldErrors[detail.path as PasswordField] ??= detail.message;
      }
      return { status: 'error', message: 'Bitte prüfe deine Eingaben.', fieldErrors };
    }
    return {
      status: 'error',
      message:
        result.status === 429
          ? 'Zu viele Versuche. Bitte warte einige Minuten.'
          : 'Das Passwort konnte nicht geändert werden. Bitte versuche es später erneut.',
    };
  }
  await storeSession(result.data.tokens);
  return { status: 'success' };
}
