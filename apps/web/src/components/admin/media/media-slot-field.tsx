'use client';

import type { AdminMediaAsset, MediaRef, MediaSlot } from '@vitruv/contracts';
import { useId, useState } from 'react';
import { Button } from '@/components/ui';
import type { FieldErrors } from '../editor/editor-state';
import { FieldGroup } from '../editor/fields';
import { describeMedia } from './media-format';
import { useMediaIndex } from './media-index';
import { MediaPicker, type MediaKindFilter } from './media-picker';
import { MediaThumb } from './media-thumb';

type Variant = 'desktop' | 'mobile' | 'poster';

const VARIANT_LABEL: Record<Variant, string> = {
  desktop: 'Desktop (Standard)',
  mobile: 'Mobil (optional)',
  poster: 'Posterbild (optional)',
};

const VARIANT_HINT: Record<Variant, string> = {
  desktop: 'Wird überall verwendet, solange keine mobile Variante gesetzt ist.',
  mobile: 'Eigener Bildausschnitt für Smartphones (gleicher Typ wie Desktop).',
  poster: 'Standbild, das vor dem Video bzw. statt des Videos gezeigt wird.',
};

type AltMode = 'library' | 'custom' | 'decorative';

/** Copy of `value` without `key`. */
function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

const altModeOf = (ref: MediaRef): AltMode =>
  ref.altText === undefined ? 'library' : ref.altText === '' ? 'decorative' : 'custom';

/** Alt text of one placement: library default, own text, or explicitly decorative. */
function AltTextControl({
  refValue,
  asset,
  onChange,
}: {
  refValue: MediaRef;
  asset: AdminMediaAsset | undefined;
  onChange: (ref: MediaRef) => void;
}) {
  const id = useId();
  // Local mode: "custom" with an empty field must not collapse into "decorative" (empty string).
  const [mode, setModeState] = useState<AltMode>(() => altModeOf(refValue));
  const rest = omit(refValue, 'altText');
  const setMode = (next: AltMode) => {
    setModeState(next);
    if (next === 'library') onChange(rest);
    else if (next === 'decorative') onChange({ ...rest, altText: '' });
    else onChange(asset?.altText ? { ...rest, altText: asset.altText } : rest);
  };
  const libraryAlt = asset?.altText?.trim();
  return (
    <div className="grid gap-2">
      <label htmlFor={`${id}-mode`} className="type-body-sm font-semibold">
        Alt-Text dieser Platzierung
      </label>
      <select
        id={`${id}-mode`}
        className="vt-input type-body-sm"
        value={mode}
        onChange={(event) => setMode(event.target.value as AltMode)}
      >
        <option value="library">Aus der Mediathek übernehmen</option>
        <option value="custom">Eigener Alt-Text</option>
        <option value="decorative">Dekorativ (kein Alt-Text)</option>
      </select>
      {mode === 'library' && (
        <p className={libraryAlt ? 'type-caption text-fg-subtle' : 'type-caption text-warning'}>
          {libraryAlt
            ? `Mediathek: „${libraryAlt}“`
            : 'In der Mediathek fehlt ein Alt-Text — Veröffentlichen ist so nicht möglich.'}
        </p>
      )}
      {mode === 'custom' && (
        <>
          <input
            aria-label="Eigener Alt-Text"
            aria-describedby={`${id}-custom-hint`}
            className="vt-input type-body-sm"
            maxLength={300}
            value={refValue.altText ?? ''}
            onChange={(event) =>
              onChange(event.target.value.trim() ? { ...rest, altText: event.target.value } : rest)
            }
          />
          <p id={`${id}-custom-hint`} className="type-caption text-fg-subtle">
            Leer gelassen gilt der Alt-Text aus der Mediathek.
          </p>
        </>
      )}
    </div>
  );
}

function VariantRow({
  variant,
  refValue,
  kinds,
  error,
  onPick,
  onChange,
  onRemove,
}: {
  variant: Variant;
  refValue: MediaRef | undefined;
  kinds: readonly MediaKindFilter[];
  error?: string;
  onPick: () => void;
  onChange: (ref: MediaRef) => void;
  onRemove: () => void;
}) {
  const index = useMediaIndex();
  const asset = refValue ? index.get(refValue.assetId) : undefined;
  return (
    <div className="grid gap-4 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="w-40 max-w-full">
        <MediaThumb asset={refValue ? asset : undefined} />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="type-body-sm font-semibold">{VARIANT_LABEL[variant]}</p>
          <p className="type-caption text-fg-subtle">{VARIANT_HINT[variant]}</p>
        </div>
        {refValue ? (
          <p className="type-body-sm break-all text-fg-muted">
            {asset ? `${asset.fileName} · ${describeMedia(asset)}` : `Medium ${refValue.assetId}`}
          </p>
        ) : (
          <p className="type-body-sm text-fg-subtle">Kein Medium gewählt.</p>
        )}
        {error && <p className="type-body-sm text-error">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onPick}>
            {refValue ? 'Ändern' : 'Medium wählen'}
          </Button>
          {refValue && (
            <Button variant="ghost" onClick={onRemove}>
              Entfernen
            </Button>
          )}
        </div>
        {refValue && asset?.kind === 'IMAGE' && kinds.length > 0 && (
          <AltTextControl refValue={refValue} asset={asset} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

/**
 * Edits a media slot: desktop (required once media is set), optional mobile variant (same kind)
 * and, for videos, an optional poster image. Stores references only ({ assetId, altText? }).
 */
export function MediaSlotField({
  legend,
  value,
  onChange,
  kinds,
  errors = {},
}: {
  legend: string;
  value: MediaSlot | null;
  onChange: (value: MediaSlot | null) => void;
  kinds: readonly MediaKindFilter[];
  errors?: FieldErrors;
}) {
  const index = useMediaIndex();
  const [picking, setPicking] = useState<Variant | null>(null);
  const desktopAsset = value ? index.get(value.desktop.assetId) : undefined;
  const variants: Variant[] = value
    ? ['desktop', 'mobile', ...(desktopAsset?.kind === 'VIDEO' ? (['poster'] as const) : [])]
    : ['desktop'];

  const pickerKinds: readonly MediaKindFilter[] =
    picking === 'poster'
      ? ['IMAGE']
      : picking === 'mobile' && desktopAsset
        ? [desktopAsset.kind as MediaKindFilter]
        : kinds;

  const assign = (variant: Variant, asset: AdminMediaAsset) => {
    index.remember(asset);
    const ref: MediaRef = { assetId: asset.id };
    if (variant === 'desktop') {
      // Changing the desktop kind invalidates a mobile variant / poster of the other kind.
      const keepMobile =
        value?.mobile && index.get(value.mobile.assetId)?.kind === asset.kind
          ? value.mobile
          : undefined;
      const keepPoster = asset.kind === 'VIDEO' ? value?.poster : undefined;
      onChange({
        desktop: ref,
        ...(keepMobile ? { mobile: keepMobile } : {}),
        ...(keepPoster ? { poster: keepPoster } : {}),
      });
    } else if (value) {
      onChange({ ...value, [variant]: ref });
    }
  };

  const update = (variant: Variant, ref: MediaRef) => {
    if (value) onChange({ ...value, [variant]: ref });
  };

  const remove = (variant: Variant) => {
    if (!value) return;
    if (variant === 'desktop') onChange(null);
    else {
      onChange(omit(value, variant));
    }
  };

  return (
    <FieldGroup legend={legend} error={errors._}>
      {variants.map((variant) => (
        <VariantRow
          key={variant}
          variant={variant}
          refValue={value?.[variant]}
          kinds={kinds}
          error={errors[variant] ?? errors[`${variant}.assetId`]}
          onPick={() => setPicking(variant)}
          onChange={(ref) => update(variant, ref)}
          onRemove={() => remove(variant)}
        />
      ))}
      <MediaPicker
        open={picking !== null}
        title={`${legend} – ${picking ? VARIANT_LABEL[picking] : ''}`}
        kinds={pickerKinds}
        selectedId={picking && value ? value[picking]?.assetId : undefined}
        onSelect={(asset) => picking && assign(picking, asset)}
        onClose={() => setPicking(null)}
      />
    </FieldGroup>
  );
}
