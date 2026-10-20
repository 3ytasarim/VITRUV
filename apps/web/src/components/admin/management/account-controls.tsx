'use client';

import type { AccountSummary } from '@vitruv/contracts';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { ActivationLink, FormState } from '@/app/admin/management-actions';
import { Button } from '@/components/ui';
import { ActivationLinkPanel } from './activation-link-panel';
import { ConfirmDialog } from './confirm-dialog';
import { FormStatus } from './form-field';
import { ACCOUNT_LABEL, ACTIVATION_LABEL, formatDateTime } from './labels';

/**
 * Account management for a client or coach: activation state + new one-time link (coaches
 * only — clients get a staff-set password instead, so `regenerate` is omitted for them), and
 * disable / re-enable (with confirmation). Disabling ends every session immediately;
 * re-enabling restores none.
 */
export function AccountControls({
  account,
  personName,
  canManage,
  setStatus,
  regenerate,
}: {
  account: AccountSummary;
  personName: string;
  canManage: boolean;
  setStatus: (status: 'ACTIVE' | 'DISABLED') => Promise<FormState>;
  regenerate?: () => Promise<FormState<ActivationLink>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<'DISABLED' | 'ACTIVE' | null>(null);
  const [state, setState] = useState<FormState<unknown>>({ status: 'idle' });
  const [link, setLink] = useState<ActivationLink | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const disabled = account.status === 'DISABLED';

  const runStatus = (status: 'ACTIVE' | 'DISABLED') =>
    startTransition(async () => {
      const result = await setStatus(status);
      setConfirm(null);
      setState(result);
      router.refresh();
      statusRef.current?.focus();
    });

  const runRegenerate = () =>
    startTransition(async () => {
      if (!regenerate) return;
      const result = await regenerate();
      if (result.status === 'success') {
        setLink(result.data);
        setState({ status: 'idle' });
        router.refresh();
      } else {
        setState(result);
        statusRef.current?.focus();
      }
    });

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <dt className="type-body-sm text-fg-muted">Konto</dt>
        <dd className="type-body">{ACCOUNT_LABEL[account.status]}</dd>
        {regenerate ? (
          <>
            <dt className="type-body-sm text-fg-muted">Aktivierung</dt>
            <dd className="type-body">
              {ACTIVATION_LABEL[account.activation]}
              {account.activation === 'PENDING' && (
                <span className="type-body-sm text-fg-muted">
                  {' '}
                  – Link gültig bis {formatDateTime(account.activationExpiresAt)}
                </span>
              )}
            </dd>
          </>
        ) : (
          <>
            <dt className="type-body-sm text-fg-muted">Passwort</dt>
            <dd className="type-body">
              {account.activation === 'ACTIVATED' ? 'gesetzt' : 'noch nicht gesetzt'}
            </dd>
          </>
        )}
        <dt className="type-body-sm text-fg-muted">Letzte Anmeldung</dt>
        <dd className="type-body">{formatDateTime(account.lastLoginAt)}</dd>
      </dl>

      <FormStatus
        state={state.status === 'error' ? state : { status: state.status }}
        success="Kontostatus geändert."
        focusRef={statusRef}
      />

      {link && (
        <ActivationLinkPanel url={link.url} expiresAt={link.expiresAt} personName={personName} />
      )}

      {canManage && (
        <div className="flex flex-wrap gap-3">
          {regenerate && account.activation !== 'ACTIVATED' && !disabled && (
            <Button variant="secondary" loading={pending && !confirm} onClick={runRegenerate}>
              {account.activation === 'PENDING'
                ? 'Neuen Aktivierungslink erstellen'
                : 'Aktivierungslink erstellen'}
            </Button>
          )}
          {disabled ? (
            <Button variant="secondary" onClick={() => setConfirm('ACTIVE')}>
              Konto wieder aktivieren
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setConfirm('DISABLED')}>
              Konto deaktivieren
            </Button>
          )}
        </div>
      )}
      {regenerate && account.activation === 'PENDING' && canManage && !link && (
        <p className="type-caption text-fg-subtle">
          Ein neuer Link macht den bisherigen sofort ungültig.
        </p>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'DISABLED' ? 'Konto deaktivieren?' : 'Konto wieder aktivieren?'}
        confirmLabel={confirm === 'DISABLED' ? 'Konto deaktivieren' : 'Wieder aktivieren'}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && runStatus(confirm)}
      >
        {confirm === 'DISABLED' ? (
          <p>
            {personName} wird sofort auf allen Geräten abgemeldet und kann sich nicht mehr anmelden.
            Offene Aktivierungslinks werden ungültig. Daten bleiben erhalten.
          </p>
        ) : (
          <p>
            {personName} kann sich danach wieder anmelden. Frühere Sitzungen bleiben beendet – eine
            neue Anmeldung ist nötig.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
