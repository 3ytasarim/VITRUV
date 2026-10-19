import { cx } from './cx';

/** Corner cut sizes — map to `--chamfer-*` design tokens. */
export type ChamferCut = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Class names for the chamfer shape (see `styles/components.css` → `.vt-chamfer`).
 *
 * The element itself is never clipped; two pseudo layers paint the border ring and the fill.
 * That keeps borders intact on the diagonal and keeps focus outlines and glow visible.
 * Border/fill colours come from the component variant classes (`vt-btn--*`, `vt-card--*` …).
 */
export function chamfer(cut?: ChamferCut, ...extra: Array<string | false | undefined>): string {
  return cx('vt-chamfer', cut && `vt-cut-${cut}`, ...extra);
}
