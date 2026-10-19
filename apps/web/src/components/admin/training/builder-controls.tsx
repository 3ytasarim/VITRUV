'use client';

import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';

/** Returns the sibling ids with `index` moved by `delta` (−1 up, +1 down). */
export function moved(ids: string[], index: number, delta: -1 | 1): string[] {
  const next = [...ids];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  if (item) next.splice(target, 0, item);
  return next;
}

/**
 * Keyboard-accessible structure toolbar (no drag & drop required). Every button names its object,
 * e.g. "Klimmzüge nach oben verschieben"; disabled at the ends of the list.
 */
export function ItemToolbar({
  name,
  index,
  count,
  disabled,
  onMove,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  name: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove?: (delta: -1 | 1) => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label={`Aktionen für ${name}`}
    >
      {onEdit && (
        <Button
          variant="ghost"
          icon={<Pencil aria-hidden />}
          aria-label={`${name} bearbeiten`}
          disabled={disabled}
          onClick={onEdit}
        />
      )}
      {onMove && (
        <>
          <Button
            variant="ghost"
            icon={<ArrowUp aria-hidden />}
            aria-label={`${name} nach oben verschieben`}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
          />
          <Button
            variant="ghost"
            icon={<ArrowDown aria-hidden />}
            aria-label={`${name} nach unten verschieben`}
            disabled={disabled || index === count - 1}
            onClick={() => onMove(1)}
          />
        </>
      )}
      {onDuplicate && (
        <Button
          variant="ghost"
          icon={<Copy aria-hidden />}
          aria-label={`${name} duplizieren`}
          disabled={disabled}
          onClick={onDuplicate}
        />
      )}
      {onDelete && (
        <Button
          variant="ghost"
          icon={<Trash2 aria-hidden />}
          aria-label={`${name} löschen`}
          disabled={disabled}
          onClick={onDelete}
        />
      )}
    </div>
  );
}
