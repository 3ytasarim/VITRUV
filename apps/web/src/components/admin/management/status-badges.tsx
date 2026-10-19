import type { AccountSummary } from '@vitruv/contracts';
import type { CoachingStatus } from '@vitruv/shared';
import { Badge } from '@/components/ui';
import {
  ACCOUNT_LABEL,
  ACTIVATION_LABEL,
  ACTIVATION_TONE,
  COACHING_LABEL,
  COACHING_TONE,
} from './labels';

/** Coaching lifecycle badge (text + tone). */
export function CoachingBadge({ status }: { status: CoachingStatus }) {
  return (
    <Badge tone={COACHING_TONE[status]} dot>
      {COACHING_LABEL[status]}
    </Badge>
  );
}

/** Account state: disabled wins; otherwise the activation state. Always spelled out. */
export function AccountBadge({ account }: { account: AccountSummary }) {
  if (account.status === 'DISABLED') {
    return (
      <Badge tone="error" dot>
        {ACCOUNT_LABEL.DISABLED}
      </Badge>
    );
  }
  return (
    <Badge tone={ACTIVATION_TONE[account.activation]} dot>
      {ACTIVATION_LABEL[account.activation]}
    </Badge>
  );
}
