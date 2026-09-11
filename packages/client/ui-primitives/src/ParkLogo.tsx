import type { IconProps } from './icons/props.ts'

/**
 * Render the ParkWork logo mark.
 * @param props.size - square edge in px (default 24; the source artwork is square).
 * @param props.className - extra class for layout placement.
 * @param props.src - image source override (default the static PNG; callers pass
 *   an animated GIF when the placement wants motion).
 * @returns the ParkWork logo image (aria-hidden; pair with the wordmark for accessibility).
 */
export function ParkLogo({ size = 24, className, src = '/park-logo.png' }: IconProps & { src?: string }) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'cover', display: 'block' }}
      aria-hidden="true"
    />
  )
}
