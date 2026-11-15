/** The Orbis mark: a planet ringed by a tilted orbit with a small moon. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="orbis-core" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--accent) 45%, #ff7ad9)" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="12" fill="url(#orbis-core)" />
      <ellipse
        cx="24"
        cy="24"
        rx="21"
        ry="8.5"
        transform="rotate(-24 24 24)"
        fill="none"
        stroke="var(--text)"
        strokeOpacity="0.85"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="88 20"
      />
      <circle cx="40.2" cy="14.6" r="3.2" fill="var(--text)" />
    </svg>
  );
}
