'use client';

import type { AdminMediaAsset, MediaRef } from '@vitruv/contracts';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';
import { getImageProps } from 'next/image';
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Button } from '@/components/ui';

type Point = { x: number; y: number };

const CENTER: Point = { x: 0.5, y: 0.5 };
/** One arrow-button / arrow-key step (5 % of the movable range). */
const STEP = 0.05;
const PREVIEW_WIDTH = 640;

/** Frame shapes to check the crop in — the site uses wide, tall and square frames. */
const FORMATS = [
  { key: 'wide', label: 'Quer 16:9', ratio: 16 / 9 },
  { key: 'tall', label: 'Hoch 4:5', ratio: 4 / 5 },
  { key: 'square', label: 'Quadrat', ratio: 1 },
  { key: 'phone', label: 'Handy 9:16', ratio: 9 / 16 },
] as const;
type FormatKey = (typeof FORMATS)[number]['key'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

/** Pure: focal point after dragging the image by (dx, dy) px inside a cover-fitted frame. */
export function dragFocalPoint(
  start: Point,
  delta: { dx: number; dy: number },
  frame: { width: number; height: number },
  media: { width: number; height: number },
): Point {
  const scale = Math.max(frame.width / media.width, frame.height / media.height);
  const overflowX = media.width * scale - frame.width;
  const overflowY = media.height * scale - frame.height;
  // Moving the image right shows more of its left side → the focal point moves left.
  return {
    x: overflowX >= 1 ? round(clamp(start.x - delta.dx / overflowX)) : start.x,
    y: overflowY >= 1 ? round(clamp(start.y - delta.dy / overflowY)) : start.y,
  };
}

const percent = (value: number) => `${Math.round(value * 100)} %`;

/**
 * Image section of ONE placement (owner request 2026-11-17), stored as `focalPoint` on the media
 * reference. Without its own, the placement uses the asset's default from Medien (shown here).
 */
export function FocalPointControl({
  refValue,
  asset,
  onChange,
}: {
  refValue: MediaRef;
  asset: AdminMediaAsset;
  onChange: (ref: MediaRef) => void;
}) {
  return (
    <FocalPointEditor
      asset={asset}
      value={refValue.focalPoint ?? null}
      fallback={asset.focalPoint}
      hint={
        refValue.focalPoint || !asset.focalPoint
          ? 'Bild im Rahmen ziehen (oder Pfeiltasten), bis der sichtbare Teil passt — danach den Inhalt speichern bzw. veröffentlichen.'
          : 'Übernimmt den Ausschnitt aus den Medien. Ziehen legt einen eigenen Ausschnitt nur für diese Stelle fest.'
      }
      resetLabel={asset.focalPoint ? 'Wie in Medien' : 'Mitte'}
      onChange={(next) => {
        const rest = { ...refValue };
        delete rest.focalPoint;
        onChange(next ? { ...rest, focalPoint: next } : rest);
      }}
    />
  );
}

/**
 * Frame editor (owner request 2026-11-17): the editor drags the image inside a frame (or uses the
 * arrow buttons / keys) until the visible part fits. The value is an object-position (0..1); the
 * file itself is never changed. `null` = no own value → `fallback` (or centred) is shown.
 */
export function FocalPointEditor({
  asset,
  value,
  fallback = null,
  hint,
  resetLabel = 'Mitte',
  onChange,
}: {
  asset: Pick<AdminMediaAsset, 'kind' | 'url' | 'width' | 'height'>;
  value: Point | null;
  fallback?: Point | null;
  hint: string;
  resetLabel?: string;
  onChange: (point: Point | null) => void;
}) {
  const id = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; start: Point } | null>(null);
  const [format, setFormat] = useState<FormatKey>('wide');
  const point = value ?? fallback ?? CENTER;
  const ratio = FORMATS.find((f) => f.key === format)?.ratio ?? 16 / 9;
  const media = { width: asset.width ?? 1600, height: asset.height ?? 900 };

  // Centred without a fallback = nothing to store (default rendering).
  const set = (next: Point | null) =>
    onChange(next && (fallback || next.x !== CENTER.x || next.y !== CENTER.y) ? next : null);
  const mediaRatio = media.width / media.height;
  const movable =
    Math.abs(mediaRatio - ratio) < 0.01 ? 'none' : mediaRatio > ratio ? 'horizontal' : 'vertical';
  const nudge = (dx: number, dy: number) =>
    set({ x: round(clamp(point.x + dx)), y: round(clamp(point.y + dy)) });

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: point };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    const frame = frameRef.current;
    if (!active || active.pointerId !== event.pointerId || !frame) return;
    const rect = frame.getBoundingClientRect();
    set(
      dragFocalPoint(
        active.start,
        { dx: event.clientX - active.x, dy: event.clientY - active.y },
        { width: rect.width, height: rect.height },
        media,
      ),
    );
  }
  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    nudge(...move);
  }

  const position = `${point.x * 100}% ${point.y * 100}%`;
  const preview =
    asset.kind === 'IMAGE'
      ? getImageProps({
          src: asset.url,
          alt: '',
          width: PREVIEW_WIDTH,
          height: Math.round((PREVIEW_WIDTH * media.height) / media.width),
          quality: 70,
          sizes: `${PREVIEW_WIDTH}px`,
        }).props
      : null;

  return (
    <div className="grid gap-3">
      <div>
        <p id={`${id}-label`} className="type-body-sm font-semibold">
          Bildausschnitt
        </p>
        <p id={`${id}-hint`} className="type-caption text-fg-subtle">
          {hint} Die Datei selbst bleibt unverändert.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Vorschau-Format">
        {FORMATS.map((f) => (
          <Button
            key={f.key}
            variant={format === f.key ? 'primary' : 'secondary'}
            aria-pressed={format === f.key}
            onClick={() => setFormat(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <div
        ref={frameRef}
        className="vt-focal-frame"
        style={{ aspectRatio: String(ratio), '--vt-focal-ratio': ratio } as CSSProperties}
        tabIndex={0}
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint ${id}-value`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        {preview ? (
          <img
            {...preview}
            alt=""
            draggable={false}
            className="vt-focal-frame__media"
            style={{ ...preview.style, objectPosition: position }}
          />
        ) : (
          <video
            src={asset.url}
            muted
            playsInline
            preload="metadata"
            aria-hidden
            className="vt-focal-frame__media"
            style={{ objectPosition: position }}
          />
        )}
      </div>
      <p className="type-caption text-fg-muted" aria-live="polite">
        {movable === 'none'
          ? 'In diesem Format ist das ganze Bild sichtbar — nichts zu verschieben. Anderes Format wählen.'
          : movable === 'horizontal'
            ? 'In diesem Format lässt sich das Bild nach links und rechts verschieben.'
            : 'In diesem Format lässt sich das Bild nach oben und unten verschieben.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={<ArrowLeft />}
          aria-label="Ausschnitt nach links"
          onClick={() => nudge(-STEP, 0)}
        />
        <Button
          variant="secondary"
          icon={<ArrowRight />}
          aria-label="Ausschnitt nach rechts"
          onClick={() => nudge(STEP, 0)}
        />
        <Button
          variant="secondary"
          icon={<ArrowUp />}
          aria-label="Ausschnitt nach oben"
          onClick={() => nudge(0, -STEP)}
        />
        <Button
          variant="secondary"
          icon={<ArrowDown />}
          aria-label="Ausschnitt nach unten"
          onClick={() => nudge(0, STEP)}
        />
        <Button
          variant="ghost"
          icon={<RotateCcw />}
          disabled={!value}
          onClick={() => onChange(null)}
        >
          {resetLabel}
        </Button>
        <span id={`${id}-value`} className="type-caption text-fg-subtle" aria-live="polite">
          Horizontal {percent(point.x)} · Vertikal {percent(point.y)}
        </span>
      </div>
    </div>
  );
}
