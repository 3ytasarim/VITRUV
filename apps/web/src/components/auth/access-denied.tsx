import { ShieldX } from 'lucide-react';
import { logoutAction } from '@/app/admin/account-actions';
import { Button } from '@/components/ui';
import { AuthShell } from './auth-shell';

/** Signed in, but the account has no access to this area. Offers only a logout. */
export function AccessDenied() {
  return (
    <AuthShell>
      <div className="flex flex-col gap-4">
        <span className="grid size-12 place-items-center rounded-pill border border-border-subtle bg-surface">
          <ShieldX aria-hidden className="size-5 text-error" />
        </span>
        <h1 className="type-h2">Kein Zugriff</h1>
        <p className="type-body text-fg-muted">
          Dieses Konto hat keinen Zugang zum Verwaltungsbereich.
        </p>
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="secondary">
          Abmelden
        </Button>
      </form>
    </AuthShell>
  );
}
