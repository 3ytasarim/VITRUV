'use client';

import { Plus } from 'lucide-react';
import { useId, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { track } from '@/lib/analytics';

const subscribe = () => () => undefined;

/**
 * FAQ disclosure list. Each question is a real <button> with aria-expanded/aria-controls in a
 * heading; the answer is a labelled region. Progressive enhancement: the server HTML shows every
 * answer (readable without JavaScript); once hydrated, answers collapse until opened.
 * Opening an answer reveals it word by word out of a soft blur (pattern adapted from the 21st.dev
 * "text-reveal-faqs" BlurredStagger used on Meridius.ch — per WORD instead of per letter so
 * screen readers read normal words; CSS only, instant under reduced motion).
 */
export function FaqAccordion({
  items,
}: {
  items: readonly { id: string; question: string; answer: string }[];
}) {
  const baseId = useId();
  const enhanced = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        track('faq_open', { section: 'faq', label: id });
      }
      return next;
    });

  return (
    <ul className="vf-faq">
      {items.map((item) => {
        const expanded = !enhanced || open.has(item.id);
        const buttonId = `${baseId}-${item.id}-q`;
        const panelId = `${baseId}-${item.id}-a`;
        return (
          <li key={item.id} className="vf-faq__item" data-open={expanded || undefined}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="vf-faq__question"
              >
                <span className="vf-faq__text">{item.question}</span>
                <span aria-hidden className="vf-faq__icon">
                  <Plus className="size-4" strokeWidth={1.6} />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!expanded}
              className="vf-faq__answer"
            >
              <p className="vt-reveal-words">
                {/* Words (with their spacing) as inline spans: the text reads normally; CSS
                    staggers a short blur-in per word when the panel opens. */}
                {item.answer.split(/(\s+)/).map((part, i) =>
                  /^\s+$/.test(part) ? (
                    part
                  ) : (
                    <span key={i} style={{ '--i': Math.min(i / 2, 60) } as CSSProperties}>
                      {part}
                    </span>
                  ),
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
