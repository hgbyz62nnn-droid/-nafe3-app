import type { CSSProperties, ReactNode } from 'react';

/**
 * Wraps any image-shaped area of the design (hero athlete photo, exercise
 * thumbnails, coach photo, avatar...) so the FINAL licensed/approved asset
 * can be dropped in later via `src` without touching layout, crop, or
 * spacing anywhere that uses this component.
 *
 * With no `src`, it renders an unmistakable placeholder (diagonal hatch +
 * a small "ASSET PLACEHOLDER" tag) inside the exact same box the real
 * photo will occupy — so it can never be mistaken for finished art, but
 * the composition it will sit in is already correct and won't shift when
 * the photo is swapped in.
 */
export function AssetSlot({
  src,
  alt = '',
  className = '',
  style,
  fit = 'cover',
  position = 'center',
  placeholderIcon,
  label,
  labelPosition = 'bottom-left',
  compact = false,
}: {
  src?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  fit?: CSSProperties['objectFit'];
  position?: CSSProperties['objectPosition'];
  placeholderIcon?: ReactNode;
  /** short tag shown on the placeholder, e.g. "ATHLETE PHOTO" */
  label?: string;
  labelPosition?: 'bottom-left' | 'top-left';
  /** For small boxes (e.g. list thumbnails) where the full text tag would
   * overflow: shows a small placeholder dot badge instead of text. The
   * hatch pattern still marks the whole box as a placeholder. */
  compact?: boolean;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ objectFit: fit, objectPosition: position, ...style }}
      />
    );
  }

  // Note: `className` (caller-supplied) carries its own `position` utility
  // (usually `absolute`, to sit inside a positioned card) — this wrapper
  // must NOT also set `relative` on that same element, or the two
  // Tailwind position classes fight over CSS source order and the layout
  // silently collapses. The positioning context for the inner hatch/icon/
  // label layers lives on a separate nested div instead.
  return (
    <div className={`${className} overflow-hidden`} style={style} data-asset-placeholder="true">
      <div className="relative w-full h-full">
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: '#141417',
            backgroundImage:
              'repeating-linear-gradient(135deg, rgba(224,39,46,0.10) 0 10px, rgba(255,255,255,0.03) 10px 20px)',
          }}
        />
        {placeholderIcon && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted/70">
            {placeholderIcon}
          </div>
        )}
        {label && !compact && (
          <div
            className={`absolute left-1.5 right-1.5 bg-black/70 border border-red/50 text-red text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded leading-tight ${
              labelPosition === 'top-left' ? 'top-1.5' : 'bottom-1.5'
            }`}
          >
            {label} · placeholder
          </div>
        )}
        {compact && (
          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red border border-black/60" />
        )}
      </div>
    </div>
  );
}
