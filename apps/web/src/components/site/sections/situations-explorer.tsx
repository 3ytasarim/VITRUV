'use client';

import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ArrowUpRight } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { CmsMedia } from '@/components/cms/cms-media';
import { RevealWords } from '@/components/ui';

export interface Situation {
  id: string;
  title: string;
  description?: string;
  icon: ResolvedMediaSlot | null;
}

const subscribe = () => () => undefined;
/** Seconds each situation stays on stage during autoplay. */
const STEP_SECONDS = 4.5;

/**
 * Lebenssituationen as an animated list → stage explorer:
 *  - autoplay: a gold progress bar fills under the active row; when it is full the next situation
 *    comes on stage (paused while hovered/focused or scrolled out of view; off under reduced
 *    motion — then rows switch only on hover/focus/click);
 *  - stage: large faint index, the icon floating on a disc inside a turning dashed gold ring with
 *    orbiting dots, title and text revealed word by word on every change;
 *  - phones: rows expand in place (accordion) and autoplay is off.
 * Rows are real buttons (aria-expanded/aria-controls); before hydration every description is
 * readable in its row. The stage is decorative (aria-hidden) — the rows carry the content.
 */
export function SituationsExplorer({ items }: { items: readonly Situation[] }) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  const enhanced = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const current = items[active] ?? items[0];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const next = () => setActive((index) => (index + 1) % items.length);

  return (
    <div
      ref={rootRef}
      className="vt-sx"
      data-enhanced={enhanced || undefined}
      data-paused={held || !visible || undefined}
      style={{ '--sx-step': `${STEP_SECONDS}s` } as CSSProperties}
      onMouseEnter={() => fine() && setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      <ol className="vt-sx__list">
        {items.map((item, index) => {
          const open = index === active;
          const panelId = `${uid}-${item.id}`;
          return (
            <li
              key={item.id}
              className="vt-sx__row"
              data-open={open || undefined}
              style={{ '--i': index } as CSSProperties}
            >
              <h3>
                <button
                  type="button"
                  className="vt-sx__btn"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onMouseEnter={() => fine() && setActive(index)}
                >
                  <span aria-hidden className="vt-sx__num">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="vt-sx__title">{item.title}</span>
                  <ArrowUpRight aria-hidden className="vt-sx__arrow" strokeWidth={1.5} />
                </button>
              </h3>
              {open && (
                <span
                  key={`${item.id}-${active}`}
                  aria-hidden
                  className="vt-sx__progress"
                  onAnimationEnd={next}
                />
              )}
              {item.description && (
                <div
                  id={panelId}
                  role="region"
                  aria-label={item.title}
                  hidden={enhanced && !open}
                  className="vt-sx__inline"
                >
                  <p>{item.description}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {current && (
        <div aria-hidden className="vt-sx__stage">
          <span key={`n-${current.id}`} className="vt-sx__ghost">
            {String(active + 1).padStart(2, '0')}
          </span>
          <div key={current.id} className="vt-sx__stage-inner">
            <span className="vt-sx__stage-num">
              {String(active + 1).padStart(2, '0')}
              <span> / {String(items.length).padStart(2, '0')}</span>
            </span>
            <div className="vt-sx__orbit">
              <span className="vt-sx__ring" />
              <span className="vt-sx__satellites">
                <span />
                <span />
                <span />
              </span>
              <div className="vt-sx__disc">
                {current.icon && <CmsMedia slot={current.icon} sizes="220px" />}
              </div>
            </div>
            <p className="vt-sx__stage-title">
              <RevealWords text={current.title} />
            </p>
            {current.description && <p className="vt-sx__stage-text">{current.description}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
