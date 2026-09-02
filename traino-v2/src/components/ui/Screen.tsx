import type { ReactNode } from 'react';

/**
 * Phone-width shell every screen renders inside. Golden viewport is
 * 390x844 (see App.tsx meta), this just caps content width and reserves
 * space for the fixed bottom nav.
 */
export function Screen({
  children,
  withNav = true,
  className = '',
}: {
  children: ReactNode;
  withNav?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-h-screen max-w-[390px] mx-auto bg-bg ${withNav ? 'pb-24' : ''} ${className}`}>
      {children}
    </div>
  );
}
