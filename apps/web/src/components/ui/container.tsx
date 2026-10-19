import type { ComponentPropsWithoutRef, ElementType } from 'react';

type ContainerProps<T extends ElementType> = { as?: T } & ComponentPropsWithoutRef<T>;

/** Page-width wrapper with fluid gutters (16px on small phones → 48px on wide screens). */
export function Container<T extends ElementType = 'div'>({
  as,
  className = '',
  ...props
}: ContainerProps<T>) {
  const Component = as ?? 'div';
  return (
    <Component className={`mx-auto w-full max-w-content px-(--gutter) ${className}`} {...props} />
  );
}
