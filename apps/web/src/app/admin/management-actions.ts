'use server';

import {
  createClientRequestSchema,
  setClientPasswordRequestSchema,
  createCoachRequestSchema,
  updateClientRequestSchema,
  updateCoachRequestSchema,
  type IssuedActivation,
} from '@vitruv/contracts';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminApi, type ApiFailure } from '@/lib/admin-api';
import { publicSiteUrl } from '@/lib/env';

/**
 * Coach & client management actions. They forward to the API, which checks the permission AND
 * the object scope (a coach only reaches their own clients). Inputs are re-validated here because
 * server actions are public HTTP endpoints. Activation links are returned to the calling page
 * exactly once and never stored (not in cookies, storage, URLs or logs).
 */
export type FieldErrors = Record<string, string>;
export type FormState<T = undefined> =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: FieldErrors }
  | { status: 'success'; data: T };

export interface ActivationLink {
  url: string;
  expiresAt: string;
}

const idSchema = z.uuid();
const GENERIC = 'Das hat nicht geklappt. Bitte versuche es erneut.';

function activationLink(activation: IssuedActivation): ActivationLink {
  return {
    url: `${publicSiteUrl()}${activation.path}#t=${activation.token}`,
    expiresAt: activation.expiresAt,
  };
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

function apiFailure(result: ApiFailure): {
  status: 'error';
  message: string;
  fieldErrors?: FieldErrors;
} {
  const details = result.error.details ?? [];
  if (details.length > 0) {
    return {
      status: 'error',
      message: 'Bitte prüfe die markierten Felder.',
      fieldErrors: Object.fromEntries(
        details.map((d) => [d.path.split('.')[0] ?? d.path, d.message]),
      ),
    };
  }
  const message =
    result.status === 404
      ? 'Nicht gefunden oder kein Zugriff.'
      : result.status === 403
        ? 'Dafür fehlt dir die Berechtigung.'
        : result.status === 409
          ? result.error.message.includes('activated')
            ? 'Das Konto ist bereits aktiviert.'
            : result.error.message.includes('disabled')
              ? 'Das Konto ist deaktiviert. Bitte zuerst wieder aktivieren.'
              : 'Konflikt mit bestehenden Daten.'
          : result.status === 401
            ? 'Bitte melde dich erneut an.'
            : GENERIC;
  return { status: 'error', message };
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : undefined;
};

// ---------------------------------------------------------------- clients

export type CreatedClient = {
  clientId: string;
  name: string;
  username: string | null;
  email: string | null;
};

/**
 * New client WITH a password set by staff (owner decision 2026-10-20: no activation e-mail).
 * E-mail, phone and username are optional; the API derives a unique username from the name.
 */
export async function createClientAction(
  _prev: FormState<CreatedClient>,
  form: FormData,
): Promise<FormState<CreatedClient>> {
  const coach = text(form, 'coachId');
  const optional = (key: string) => {
    const value = text(form, key)?.trim();
    return value ? value : null;
  };
  const parsed = createClientRequestSchema.safeParse({
    firstName: text(form, 'firstName') ?? '',
    lastName: text(form, 'lastName') ?? '',
    email: optional('email'),
    username: optional('username'),
    password: text(form, 'password') ?? '',
    phone: optional('phone'),
    coachingStatus: text(form, 'coachingStatus') || undefined,
    internalNotes: text(form, 'internalNotes') ?? null,
    ...(coach === undefined ? {} : { coachId: coach === '' ? null : coach }),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Bitte prüfe die markierten Felder.',
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const result = await adminApi.createClient(parsed.data);
  if (!result.ok) return apiFailure(result);
  revalidatePath('/admin/kunden');
  const { client } = result.data;
  return {
    status: 'success',
    data: {
      clientId: client.id,
      name: `${client.firstName} ${client.lastName}`,
      username: client.username,
      email: client.email,
    },
  };
}

/** Staff sets a new password for the client (told in person); all sessions of the client end. */
export async function setClientPasswordAction(
  clientId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  if (!idSchema.safeParse(clientId).success) return { status: 'error', message: GENERIC };
  const parsed = setClientPasswordRequestSchema.safeParse({
    password: text(form, 'password') ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Bitte prüfe das Passwort.',
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const result = await adminApi.setClientPassword(clientId, parsed.data.password);
  if (!result.ok) return apiFailure(result);
  revalidatePath(`/admin/kunden/${clientId}`, 'layout');
  return { status: 'success', data: undefined };
}

export async function updateClientAction(
  clientId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  if (!idSchema.safeParse(clientId).success) return { status: 'error', message: GENERIC };
  const parsed = updateClientRequestSchema.safeParse({
    firstName: text(form, 'firstName'),
    lastName: text(form, 'lastName'),
    phone: text(form, 'phone') ?? null,
    coachingStatus: text(form, 'coachingStatus'),
    internalNotes: text(form, 'internalNotes') ?? null,
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Bitte prüfe die markierten Felder.',
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const result = await adminApi.updateClient(clientId, parsed.data);
  if (!result.ok) return apiFailure(result);
  revalidatePath(`/admin/kunden/${clientId}`, 'layout');
  revalidatePath('/admin/kunden');
  return { status: 'success', data: undefined };
}

export async function assignClientAction(
  clientId: string,
  coachId: string | null,
): Promise<FormState> {
  if (
    !idSchema.safeParse(clientId).success ||
    (coachId !== null && !idSchema.safeParse(coachId).success)
  ) {
    return { status: 'error', message: GENERIC };
  }
  const result = await adminApi.assignClient(clientId, coachId);
  if (!result.ok) return apiFailure(result);
  revalidatePath(`/admin/kunden/${clientId}`, 'layout');
  revalidatePath('/admin/kunden');
  return { status: 'success', data: undefined };
}

export async function setClientAccountAction(
  clientId: string,
  status: 'ACTIVE' | 'DISABLED',
): Promise<FormState> {
  if (!idSchema.safeParse(clientId).success || !['ACTIVE', 'DISABLED'].includes(status)) {
    return { status: 'error', message: GENERIC };
  }
  const result = await adminApi.clientAccount(clientId, status);
  if (!result.ok) return apiFailure(result);
  revalidatePath(`/admin/kunden/${clientId}`, 'layout');
  revalidatePath('/admin/kunden');
  return { status: 'success', data: undefined };
}

export async function regenerateClientActivationAction(
  clientId: string,
): Promise<FormState<ActivationLink>> {
  if (!idSchema.safeParse(clientId).success) return { status: 'error', message: GENERIC };
  const result = await adminApi.clientActivation(clientId);
  if (!result.ok) return apiFailure(result);
  revalidatePath(`/admin/kunden/${clientId}`, 'layout');
  return { status: 'success', data: activationLink(result.data.activation) };
}

// ---------------------------------------------------------------- coaches

export async function createCoachAction(
  _prev: FormState<{ coachId: string; name: string; activation: ActivationLink }>,
  form: FormData,
): Promise<FormState<{ coachId: string; name: string; activation: ActivationLink }>> {
  const parsed = createCoachRequestSchema.safeParse({
    displayName: text(form, 'displayName') ?? '',
    email: text(form, 'email') ?? '',
    phone: text(form, 'phone'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Bitte prüfe die markierten Felder.',
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const result = await adminApi.createCoach(parsed.data);
  if (!result.ok) return apiFailure(result);
  revalidatePath('/admin/coaches');
  return {
    status: 'success',
    data: {
      coachId: result.data.coach.id,
      name: result.data.coach.displayName,
      activation: activationLink(result.data.activation),
    },
  };
}

export async function updateCoachAction(
  coachId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  if (!idSchema.safeParse(coachId).success) return { status: 'error', message: GENERIC };
  const parsed = updateCoachRequestSchema.safeParse({
    displayName: text(form, 'displayName'),
    phone: text(form, 'phone') ?? null,
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Bitte prüfe die markierten Felder.',
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const result = await adminApi.updateCoach(coachId, parsed.data);
  if (!result.ok) return apiFailure(result);
  revalidatePath('/admin/coaches', 'layout');
  return { status: 'success', data: undefined };
}

export async function setCoachAccountAction(
  coachId: string,
  status: 'ACTIVE' | 'DISABLED',
): Promise<FormState> {
  if (!idSchema.safeParse(coachId).success || !['ACTIVE', 'DISABLED'].includes(status)) {
    return { status: 'error', message: GENERIC };
  }
  const result = await adminApi.coachAccount(coachId, status);
  if (!result.ok) return apiFailure(result);
  revalidatePath('/admin/coaches', 'layout');
  return { status: 'success', data: undefined };
}

export async function regenerateCoachActivationAction(
  coachId: string,
): Promise<FormState<ActivationLink>> {
  if (!idSchema.safeParse(coachId).success) return { status: 'error', message: GENERIC };
  const result = await adminApi.coachActivation(coachId);
  if (!result.ok) return apiFailure(result);
  revalidatePath('/admin/coaches', 'layout');
  return { status: 'success', data: activationLink(result.data.activation) };
}
