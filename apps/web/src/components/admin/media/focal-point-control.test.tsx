// @vitest-environment happy-dom
import type { AdminMediaAsset, MediaRef, ResolvedMediaSlot } from '@vitruv/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CmsMedia } from '@/components/cms/cms-media';
import { FocalPointControl, dragFocalPoint } from './focal-point-control';

const image: AdminMediaAsset = {
  id: '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f',
  kind: 'IMAGE',
  visibility: 'PUBLIC',
  fileName: 'testmuster.webp',
  mimeType: 'image/webp',
  sizeBytes: 2048,
  width: 1600,
  height: 900,
  durationMs: null,
  altText: 'Neutrales Testmuster',
  url: 'http://localhost:4000/media/public/website/2026/10/x.webp',
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  usageCount: 0,
};

afterEach(cleanup);

describe('dragFocalPoint', () => {
  // 1600×900 image in a 400×400 frame → scaled to 711×400: 311 px horizontal play, none vertical.
  const frame = { width: 400, height: 400 };
  const media = { width: 1600, height: 900 };

  it('moves the focal point against the drag direction, within 0..1', () => {
    const start = { x: 0.5, y: 0.5 };
    const right = dragFocalPoint(start, { dx: 100, dy: 0 }, frame, media);
    expect(right.x).toBeLessThan(0.5);
    expect(right.y).toBe(0.5); // no vertical overflow → unchanged
    expect(dragFocalPoint(start, { dx: -10_000, dy: 0 }, frame, media).x).toBe(1);
    expect(dragFocalPoint(start, { dx: 10_000, dy: 0 }, frame, media).x).toBe(0);
  });

  it('maps the full drag range exactly onto 0..1', () => {
    const overflow = 1600 * (400 / 900) - 400;
    expect(dragFocalPoint({ x: 1, y: 0.5 }, { dx: overflow, dy: 0 }, frame, media).x).toBe(0);
  });
});

describe('FocalPointControl', () => {
  it('nudges with the arrow buttons and resets to the centre', () => {
    const onChange = vi.fn<(ref: MediaRef) => void>();
    const { rerender } = render(
      <FocalPointControl
        refValue={{ assetId: image.id, altText: 'x' }}
        asset={image}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ausschnitt nach links' }));
    expect(onChange).toHaveBeenLastCalledWith({
      assetId: image.id,
      altText: 'x',
      focalPoint: { x: 0.45, y: 0.5 },
    });
    expect(screen.getByRole('button', { name: 'Mitte' })).toHaveProperty('disabled', true);

    rerender(
      <FocalPointControl
        refValue={{ assetId: image.id, focalPoint: { x: 0.2, y: 0.8 } }}
        asset={image}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/Horizontal 20 % · Vertikal 80 %/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mitte' }));
    // Centre = no focal point stored (default rendering).
    expect(onChange).toHaveBeenLastCalledWith({ assetId: image.id });
  });

  it('moves with the arrow keys on the frame', () => {
    const onChange = vi.fn<(ref: MediaRef) => void>();
    render(
      <FocalPointControl refValue={{ assetId: image.id }} asset={image} onChange={onChange} />,
    );
    const frame = screen.getByRole('group', { name: 'Bildausschnitt' });
    fireEvent.keyDown(frame, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith({
      assetId: image.id,
      focalPoint: { x: 0.5, y: 0.55 },
    });
  });
});

describe('CmsMedia focal points', () => {
  const resolved = (focalPoint?: { x: number; y: number }) => ({
    assetId: image.id,
    kind: 'IMAGE' as const,
    url: image.url,
    mimeType: image.mimeType,
    width: 1600,
    height: 900,
    altText: 'Test',
    ...(focalPoint ? { focalPoint } : {}),
  });

  it('renders the desktop and the mobile image section', () => {
    const slot: ResolvedMediaSlot = {
      desktop: resolved({ x: 0.2, y: 0.3 }),
      mobile: resolved({ x: 0.7, y: 0.1 }),
    };
    const html = renderToStaticMarkup(<CmsMedia slot={slot} />);
    expect(html).toContain('object-position:20% 30%');
    expect(html).toContain('--vt-focal-mobile:70% 10%');
    expect(html).toContain('data-focal-mobile');
  });

  it('adds nothing without focal points', () => {
    const html = renderToStaticMarkup(<CmsMedia slot={{ desktop: resolved() }} />);
    expect(html).not.toContain('object-position');
    expect(html).not.toContain('data-focal-mobile');
  });
});
