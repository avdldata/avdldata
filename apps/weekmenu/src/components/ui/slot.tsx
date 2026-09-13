'use client';

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A minimal `asChild` implementation: merge our props onto the single child
 * element instead of rendering a wrapper. Keeps `<Button asChild><Link/></Button>`
 * working without pulling in a runtime dependency for one behaviour.
 */
export function Slot({
  children,
  className,
  ...props
}: { children?: ReactNode; className?: string } & Record<string, unknown>) {
  const child = Children.only(children as ReactElement<{ className?: string }>);
  if (!isValidElement(child)) return null;
  return cloneElement(child, {
    ...props,
    className: cn(className, child.props.className),
  } as never);
}
