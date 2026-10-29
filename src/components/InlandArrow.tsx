import type { Dictionary } from "@/i18n";

/** Below this speed the GPS heading is noise; fall back to a north-up arrow. */
const MIN_HEADING_SPEED = 2;

interface Props {
  bearing: number | null;
  heading: number | null;
  speed: number | null;
  t: Dictionary;
  size?: number;
}

/** Points from the shoreline to the user, i.e. the way to drive to get away from the water. */
export function InlandArrow({ bearing, heading, speed, t, size = 96 }: Props) {
  if (bearing === null) return null;
  const relative = heading !== null && speed !== null && speed >= MIN_HEADING_SPEED;
  const rotation = relative ? bearing - heading : bearing;
  const label = relative ? t.inlandRelative : t.northUp;
  return (
    <figure className="flex flex-col items-center gap-1" data-testid="inland-arrow">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={label}
        style={{ transform: `rotate(${rotation}deg)`, transition: "transform 300ms ease-out" }}
      >
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
        <path d="M50 10 L78 62 L56 54 V88 H44 V54 L22 62 Z" fill="currentColor" />
      </svg>
      <figcaption className="text-sm opacity-90">{label}</figcaption>
    </figure>
  );
}
