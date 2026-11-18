// @vitest-environment happy-dom
import type { WelcomeCategory } from '@vitruv/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WelcomeVideos } from './welcome-videos';

const video = (id: string, categoryId: string, title: string) => ({
  id,
  categoryId,
  title,
  description: null,
  video: {
    assetId: '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f',
    url: `http://localhost:4000/media/public/training/${id}.mp4`,
    mimeType: 'video/mp4',
    durationMs: 12_000,
  },
});

const categories: WelcomeCategory[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Start',
    videos: [video('a1', '11111111-1111-4111-8111-111111111111', 'Hallo und willkommen')],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Training',
    videos: [video('b1', '22222222-2222-4222-8222-222222222222', 'Dein erstes Training')],
  },
];

afterEach(cleanup);

describe('WelcomeVideos', () => {
  it('shows all categories first and filters by the chosen pill', () => {
    render(<WelcomeVideos categories={categories} />);
    expect(screen.getByRole('button', { name: 'Alle' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Video: Hallo und willkommen')).toBeTruthy();
    expect(screen.getByLabelText('Video: Dein erstes Training')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Training' }));
    expect(screen.getByRole('button', { name: 'Training' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByLabelText('Video: Hallo und willkommen')).toBeNull();
    expect(screen.getByLabelText('Video: Dein erstes Training')).toBeTruthy();
  });

  it('hides the pills when there is only one category', () => {
    render(<WelcomeVideos categories={categories.slice(0, 1)} />);
    expect(screen.queryByRole('button', { name: 'Alle' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Start' })).toBeTruthy();
  });
});
