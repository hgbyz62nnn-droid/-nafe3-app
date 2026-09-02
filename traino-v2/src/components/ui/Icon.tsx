// TRAINO_PRO_Icon_System — ported verbatim from public/icons-pro.js (path
// data unchanged, shapes not redrawn). One extra icon (`ai-mascot`) is
// added below for the AI Coach avatar since no generic icon in the
// approved 44-icon set represents a coaching-assistant mascot; it is
// drawn in the exact same 24x24 / 1.8px-stroke line-art language as the
// rest of the system rather than sourced from a different icon library.
export const ICONS = {
  bookmark: 'M6.5 4.5h11v15l-5.5-3.4-5.5 3.4Z',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16"/>',
  chart: 'M4 19V5M4 19h16|m7 15 3-3 3 2 5-6',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.5 2.5 5.2-5.4"/>',
  client: '<circle cx="10" cy="8" r="3"/><path d="M4.5 20c.5-3.1 2.4-4.8 5.5-4.8s5 1.7 5.5 4.8M17 11.5a2.6 2.6 0 1 0 0-5.2M17.5 15.5c1.7.4 2.7 1.8 3 4.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
  close: 'M6 6l12 12M18 6 6 18',
  copy: '<rect x="8" y="7" width="11" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/>',
  dumbbell: 'M4 9v6M7 7v10M10 10h4M17 7v10M20 9v6M7 10h10M7 14h10',
  fatLoss: '<path d="M12 3.5c1.8 3 4.8 4.7 4.8 8.5a4.8 4.8 0 1 1-9.6 0c0-2.4 1.4-4.1 3.2-5.8.1 1.6.8 2.5 1.6 3.1.7-1.7.7-3.6 0-5.8Z"/><path d="M9.5 20h5"/>',
  fitness: '<path d="M4 15.5c2.1 0 2.8-2.2 4.4-2.2 1.5 0 2.2 1.8 3.6 1.8 1.6 0 2.3-4.4 4-4.4 1.6 0 2.1 2.8 4 2.8"/><path d="M4 19h16"/>',
  food: 'M6 4v7M4.5 4v4.5M7.5 4v4.5M6 11v9M16 4v16M16 4c2.2 1.6 3.5 3.9 3.5 6.5H16',
  heart: '<path d="M12 20s-7.5-4.5-7.5-9.4A4.1 4.1 0 0 1 8.6 6.5c1.5 0 2.7.7 3.4 1.8.7-1.1 1.9-1.8 3.4-1.8a4.1 4.1 0 0 1 4.1 4.1C19.5 15.5 12 20 12 20Z"/>',
  home: '<path d="m3.8 10.8 8.2-6.7 8.2 6.7v8.7a1 1 0 0 1-1 1h-4.4v-6.1H9.2v6.1H4.8a1 1 0 0 1-1-1Z"/>',
  location: '<path d="M19 10.2c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10.2" r="2.3"/>',
  message: '<path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9l-5 3v-3.2a2 2 0 0 1-2-2v-7.8a2 2 0 0 1 2-2Z"/>',
  notification: '<path d="M6 17.5h12l-1.2-1.8V11a4.8 4.8 0 0 0-9.6 0v4.7Z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/>',
  nutrition: '<path d="M12 20c-3.8-2.3-6.3-5.2-6.3-9.1 0-2.5 1.7-4.3 4-4.3 1.1 0 2.1.5 2.8 1.4.7-.9 1.7-1.4 2.8-1.4 2.3 0 4 1.8 4 4.3 0 3.9-2.5 6.8-6.3 9.1Z"/><path d="M12 8V4M9.5 5.5 12 4l2.5 1.5"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="m10 8.5 5 3.5-5 3.5Z" fill="currentColor" stroke="none"/>',
  playTriangle: '<path d="m6 4.5 14 7.5-14 7.5Z" fill="currentColor" stroke="none"/>',
  plus: 'M12 5v14M5 12h14',
  profile: '<circle cx="12" cy="8" r="3.4"/><path d="M5.2 20c.6-3.2 2.8-5.1 6.8-5.1s6.2 1.9 6.8 5.1"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.2 4.2"/>',
  settings: '<circle cx="12" cy="12" r="3.5"/><path d="m19 13.2 1.1 1-.9 2.2-1.5-.1a7.7 7.7 0 0 1-1.4 1.4l.1 1.5-2.2.9-1-1.1a7.8 7.8 0 0 1-2 0l-1 1.1-2.2-.9.1-1.5A7.7 7.7 0 0 1 6.7 16l-1.5.1-.9-2.2 1.1-1a7.8 7.8 0 0 1 0-2l-1.1-1 .9-2.2 1.5.1A7.7 7.7 0 0 1 8.1 6.4L8 4.9l2.2-.9 1 1.1a7.8 7.8 0 0 1 2 0l1-1.1 2.2.9-.1 1.5a7.7 7.7 0 0 1 1.4 1.4l1.5-.1.9 2.2-1.1 1a7.8 7.8 0 0 1 0 2Z"/>',
  star: 'm12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8Z',
  target: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M8 4h8v5.2c0 3.1-1.7 5.3-4 5.3s-4-2.2-4-5.3Z"/><path d="M8 6H5v2.2c0 2.1 1.4 3.5 3.2 3.7M16 6h3v2.2c0 2.1-1.4 3.5-3.2 3.7M12 14.5V19M8.5 20h7"/>',
  verified: '<path d="m12 3.8 2.1 1.4 2.5-.1 1.1 2.2 2.2 1.1-.1 2.5 1.4 2.1-1.4 2.1.1 2.5-2.2 1.1-1.1 2.2-2.5-.1-2.1 1.4-2.1-1.4-2.5.1-1.1-2.2-2.2-1.1.1-2.5L3.8 13l1.4-2.1-.1-2.5 2.2-1.1 1.1-2.2 2.5.1Z"/><path d="m8.2 12.1 2.4 2.4 5.2-5.2"/>',
  video: '<rect x="3.5" y="6" width="13" height="12" rx="2"/><path d="m16.5 10 4-2.3v8.6l-4-2.3Z"/>',
  edit: '<path d="m5 16.8-.7 3.1 3.1-.7L18 8.6l-2.4-2.4Z"/><path d="m14.4 7.8 2.4 2.4M19.5 5.5l-1-1a1.4 1.4 0 0 0-2 0l-.9.9 2.4 2.4.9-.9a1.4 1.4 0 0 0 0-2Z"/>',
  chevronLeft: 'm15 4-8 8 8 8',
  chevronRight: 'm9 4 8 8-8 8',
  // extension, matching the 24x24 / 1.8 stroke language of the set above
  aiMascot: '<rect x="5.5" y="7" width="13" height="11" rx="4"/><path d="M12 7V4.2M9.5 3.6h5"/><circle cx="9.4" cy="12.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.6" cy="12.3" r="1.1" fill="currentColor" stroke="none"/><path d="M9.5 15.3h5"/><path d="M3.8 10v3.5M20.2 10v3.5"/>',

  // -- Extensions below: training-location + equipment pictograms. None
  // of these concepts exist in the approved 44-icon set (it was built for
  // the marketplace app's screens, not gym-equipment selection), so they
  // are new glyphs drawn in the same 24x24 / 1.8px-stroke / round-cap
  // language rather than pulled from a different icon library.
  sportsClub: '<path d="M4 20V10l8-5 8 5v10"/><path d="M4 20h16M9 20v-6h6v6"/>',
  outdoor: '<path d="M12 3v6M8 9h8l3 8H5l3-8Z"/><path d="M9.5 15.5h5M4.5 21h15"/>',
  sportsField: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M12 6v12M3.5 12h17M8 8.2v3.6M16 12.2v3.6"/>',
  multiLocation: '<path d="M19 10.2c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10.2" r="2.3"/><path d="M4 4.5c-.9.5-1.5 1-1.5 1.6M20 4.5c.9.5 1.5 1 1.5 1.6"/>',
  barbell: '<path d="M2.5 12h2.5M19 12h2.5M6 8.5v7M9 10v4M15 10v4M18 8.5v7M9 12h6"/>',
  bench: '<rect x="4" y="10" width="16" height="3.4" rx="1"/><path d="M6 13.4V19M18 13.4V19M4 10l-1.5-2.2M20 10l1.5-2.2"/>',
  squatRack: '<path d="M5 3.5v17M19 3.5v17M5 9h4M15 9h4M9 9h6"/>',
  pullUpBar: '<path d="M4 6h16M8 6v4.5c0 1-.8 1.8-1.8 1.8M16 6v4.5c0 1 .8 1.8 1.8 1.8"/><circle cx="12" cy="17" r="3.4"/>',
  cableMachine: '<path d="M5 3.5v17M19 3.5v7"/><circle cx="19" cy="12.7" r="2"/><path d="M19 14.7v2.3l-4.5 3"/>',
  kettlebell: '<path d="M9.5 8.2a2.5 2.5 0 0 1 5 0"/><path d="M7 14.5c0-3.3 2.2-5.3 5-5.3s5 2 5 5.3-2.2 5.3-5 5.3-5-2-5-5.3Z"/>',
  resistanceBand: '<path d="M4 12c2-4 5-6 8-6s6 2 8 6c-2 4-5 6-8 6s-6-2-8-6Z"/><circle cx="12" cy="12" r="2.2"/>',
  trx: '<path d="M9 3.5h6M10.5 3.5v6.5c0 2-1.5 2.8-1.5 5v5.5M13.5 3.5v6.5c0 2 1.5 2.8 1.5 5v5.5"/>',
  treadmill: '<path d="M3.5 17.5h13l3-2.5H8l2-8"/><circle cx="16" cy="8" r="1.6"/><path d="M13 13h6.5"/>',
  bike: '<circle cx="6.5" cy="16.5" r="3.3"/><circle cx="17.5" cy="16.5" r="3.3"/><path d="M6.5 16.5 10 8h3l4.5 8.5M10 8l2.5 4.5h-6"/>',
  rowingMachine: '<path d="M3 18h18M6 18l3-8h6l3 8"/><circle cx="9" cy="8" r="1.6"/><path d="M9 9.6v3.2h4"/>',
  medicineBall: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
  plyoBox: '<path d="M4 9.5 12 5l8 4.5v9L12 23l-8-4.5Z"/><path d="M4 9.5 12 14l8-4.5M12 14v9"/>',
  otherEquipment: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',

  // -- AI Coach chat screen extensions, same 24x24 / 1.8px-stroke language
  send: '<path d="M4 12l16-8-6 16-2.5-6.5L4 12Z" fill="currentColor" stroke="none"/>',
  checkPlain: 'm5 12.5 4.3 4.3L19.5 7.3',
  sliders: '<path d="M6 4v6M6 14v6M12 4v3M12 11v9M18 4v11M18 19v1"/><circle cx="6" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="9" r="2" fill="currentColor" stroke="none"/><circle cx="18" cy="17" r="2" fill="currentColor" stroke="none"/>',
  dotsVertical: '<circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none"/>',
} as const;

export type IconName = keyof typeof ICONS;

function pathsFor(name: IconName) {
  const raw = ICONS[name];
  if (raw.startsWith('<')) return raw;
  return raw
    .split('|')
    .map((d) => `<path d="${d}"/>`)
    .join('');
}

export function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 1.8,
  filled = false,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Fills closed shapes solid (used for active bottom-nav icons). */
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      fillOpacity={filled ? 0.18 : 1}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: pathsFor(name) }}
    />
  );
}
