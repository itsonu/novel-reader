// One icon set, one stroke weight, one grid. Every glyph in the app comes from here —
// no ☰, ◐ or ✕ text characters, which render in whatever font the platform has and
// never line up with anything.
//
// 24px grid, 1.6 stroke, round caps. Decorative by default (aria-hidden); the control
// that holds an icon carries the label.

const P = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  search: 'M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6zM20 20l-4.4-4.4',
  plus: 'M12 5v14M5 12h14',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5M5 4.5v15M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3',
  library: 'M4 20V4h4v16M10 20V6h4v14M15.6 7.2l3.8-1 3.2 13.6-3.8 1zM3 20h18',
  discover: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.6 8.4l-2 5.2-5.2 2 2-5.2z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  system: 'M3.5 5h17v11h-17zM9 20h6M12 16v4',
  type: 'M3 19l5-13 5 13M4.8 14.5h6.4M15 19l3-7.5 3 7.5M15.8 17h4.4',
  bookmark: 'M6.5 3.75h11a.75.75 0 0 1 .75.75v15.4a.4.4 0 0 1-.63.33L12 16.2l-5.62 4.03a.4.4 0 0 1-.63-.33V4.5a.75.75 0 0 1 .75-.75z',
  star: 'M12 4.6l2.3 4.66 5.15.75-3.73 3.63.88 5.13L12 16.35l-4.6 2.42.88-5.13L4.55 10l5.15-.75z',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 7.5l3 3',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 11v6M14 11v6',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 8.5v4.5M12 16.5h.01M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8h.01',
  folder: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.2H19A1.5 1.5 0 0 1 20.5 9.2V17.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z',
  file: 'M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8zM14 3.5V8h4.5M9 13h6M9 16.5h4',
  pen: 'M12 20h8M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  download: 'M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5M5 18h14',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  rows: 'M4 5h16M4 12h16M4 19h16',
  sort: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  keyboard: 'M3 6.5h18v11H3zM6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9',
  command: 'M9 6v12M15 6v12M6 9h12M6 15h12M9 6a3 3 0 1 0-3 3M15 6a3 3 0 1 1 3 3M9 18a3 3 0 1 1-3-3M15 18a3 3 0 1 0 3-3',
  sidebar: 'M3.5 4.5h17v15h-17zM9.5 4.5v15',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  sparkle: 'M12 3l2.1 5.3L19.5 9l-4 3.6 1.1 5.4L12 15.4 7.4 18l1.1-5.4-4-3.6 5.4-.7z',
  gear: 'M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zM12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5',
  bold: 'M7 4.5h6a3.75 3.75 0 0 1 0 7.5H7zM7 12h7a3.75 3.75 0 0 1 0 7.5H7z',
  italic: 'M14.5 4.5H10M14 19.5H9.5M13 4.5l-2 15',
  heading: 'M5 4.5v15M15 4.5v15M5 12h10M19 19.5v-7l-2 1.5',
  quote: 'M5 17.5c0-4 1-7 5-9M14 17.5c0-4 1-7 5-9M5 17.5h4v-4H5zM14 17.5h4v-4h-4z',
  bullets: 'M9.5 6H20M9.5 12H20M9.5 18H20M5 6h.01M5 12h.01M5 18h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  scene: 'M4.5 12h3M6 10.5v3M10.5 12h3M12 10.5v3M16.5 12h3M18 10.5v3'
} satisfies Record<string, string>;

export type IconName = keyof typeof P;

const FILLED = new Set<IconName>(['more']);

export default function Icon({
  name, size = 20, fill = false, strokeWidth = 1.6, className, label
}: {
  name: IconName; size?: number; fill?: boolean; strokeWidth?: number; className?: string;
  /** Only when the icon stands alone with no labelled control around it. */
  label?: string;
}) {
  const dots = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={className}
      fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={dots ? 2.6 : strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}
      focusable="false"
    >
      <path d={P[name]} />
    </svg>
  );
}
