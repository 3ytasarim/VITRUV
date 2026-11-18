'use client';

import type { WelcomeCategory } from '@vitruv/contracts';
import { useState } from 'react';

const ALL = '';

/**
 * "Willkommen" (owner request 2026-11-18): category pills ("Alle" + the admin's categories) and
 * the videos of the chosen category below. Videos never autoplay; `preload="metadata"` keeps the
 * page light. Filter buttons (aria-pressed) — the list below updates in place.
 */
export function WelcomeVideos({ categories }: { categories: WelcomeCategory[] }) {
  const [selected, setSelected] = useState<string>(ALL);
  const visible =
    selected === ALL ? categories : categories.filter((category) => category.id === selected);
  const pills = [{ id: ALL, name: 'Alle' }, ...categories];

  return (
    <div className="flex flex-col gap-6">
      {categories.length > 1 && (
        <div role="group" aria-label="Kategorien" className="vt-wtabs">
          {pills.map((pill) => (
            <button
              key={pill.id || 'alle'}
              type="button"
              className="vt-wtab"
              aria-pressed={selected === pill.id}
              onClick={() => setSelected(pill.id)}
            >
              {pill.name}
            </button>
          ))}
        </div>
      )}
      <div aria-live="polite" className="flex flex-col gap-10">
        {visible.map((category) => (
          <section
            key={category.id}
            aria-labelledby={`willkommen-${category.id}`}
            className="flex flex-col gap-4"
          >
            <h2 id={`willkommen-${category.id}`} className="vt-pcard__title">
              {category.name}
            </h2>
            <ul className="vt-wgrid">
              {category.videos.map((video) => (
                <li key={video.id} className="vt-pcard vt-pcard--flush vt-wcard">
                  <video
                    className="vt-wcard__video"
                    src={video.video.url}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`Video: ${video.title}`}
                  />
                  <div className="vt-wcard__body">
                    <h3 className="vt-wcard__title">{video.title}</h3>
                    {video.description && (
                      <p className="type-body-sm whitespace-pre-line text-fg-muted">
                        {video.description}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
