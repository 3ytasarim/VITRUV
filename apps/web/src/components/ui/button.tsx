import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentProps,
  ReactNode,
  Ref,
} from 'react';
import { chamfer } from './chamfer';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

interface ButtonStyleProps {
  /** primary: the one high-priority action (blue fill + glow) · secondary: outline · ghost: low emphasis */
  variant?: ButtonVariant;
  /** md = 48 px tap target (default) · lg = 56 px for hero-level calls to action */
  size?: ButtonSize;
  /** Optional decorative icon (Lucide). Rendered aria-hidden; the label carries the meaning. */
  icon?: ReactNode;
  iconPosition?: 'start' | 'end';
  /** Stretch to the container width (useful on narrow screens). */
  fullWidth?: boolean;
}

/**
 * Either a visible text label (children) or, for icon-only buttons, an `aria-label`.
 * Enforced at the type level so an unlabeled icon button cannot be written.
 */
type Labelled =
  | { children: ReactNode; 'aria-label'?: string }
  | { children?: undefined; 'aria-label': string; icon: ReactNode };

function buttonClassName(
  { variant = 'primary', size = 'md', fullWidth }: ButtonStyleProps,
  iconOnly: boolean,
  className?: string,
) {
  return chamfer(
    undefined,
    'vt-btn type-button',
    `vt-btn--${variant}`,
    size === 'lg' && 'vt-btn--lg',
    iconOnly && 'vt-btn--icon',
    fullWidth && 'w-full',
    className,
  );
}

function Content({
  icon,
  iconPosition = 'start',
  loading,
  children,
}: Pick<ButtonStyleProps, 'icon' | 'iconPosition'> & { loading?: boolean; children?: ReactNode }) {
  const iconNode = loading ? (
    <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
  ) : icon ? (
    <span aria-hidden className="inline-flex shrink-0 [&>svg]:size-4">
      {icon}
    </span>
  ) : null;
  return (
    <>
      {iconPosition === 'start' && iconNode}
      {children}
      {iconPosition === 'end' && iconNode}
    </>
  );
}

export type ButtonProps = ButtonStyleProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> &
  Labelled & {
    /** Shows a spinner, sets aria-busy and blocks further clicks while keeping the label. */
    loading?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

/** A real `<button>` (actions). For navigation use `ButtonLink`. */
export function Button({
  variant,
  size,
  icon,
  iconPosition,
  fullWidth,
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, fullWidth }, !children, className)}
      {...rest}
    >
      <Content icon={icon} iconPosition={iconPosition} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

export type ButtonLinkProps = ButtonStyleProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'aria-label' | 'href'> &
  Pick<ComponentProps<typeof Link>, 'href' | 'prefetch' | 'replace' | 'scroll'> &
  Labelled;

/**
 * Navigation styled as a button (renders `<a>` via next/link). Links have no disabled state —
 * render a disabled `Button` or nothing instead of a dead link.
 */
export function ButtonLink({
  variant,
  size,
  icon,
  iconPosition,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, fullWidth }, !children, className)} {...rest}>
      <Content icon={icon} iconPosition={iconPosition}>
        {children}
      </Content>
    </Link>
  );
}
