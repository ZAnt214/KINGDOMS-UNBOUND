// Ícones originais do HUD (SVG inline, sem emojis nem fontes de ícones de terceiros).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 22, props: P) => ({ width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': true, ...props });

export const IconFood = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M16 29V9" stroke="#8a6a1e" strokeWidth="2.2" strokeLinecap="round" />
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <ellipse cx="12.6" cy={10 + i * 4.6} rx="3.6" ry="2" transform={`rotate(-38 12.6 ${10 + i * 4.6})`} fill="#f2c14e" stroke="#a57a1c" strokeWidth="0.8" />
        <ellipse cx="19.4" cy={10 + i * 4.6} rx="3.6" ry="2" transform={`rotate(38 19.4 ${10 + i * 4.6})`} fill="#e6b43f" stroke="#a57a1c" strokeWidth="0.8" />
      </g>
    ))}
    <ellipse cx="16" cy="6.5" rx="2" ry="3.4" fill="#f6cf62" stroke="#a57a1c" strokeWidth="0.8" />
  </svg>
);

export const IconWood = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="15" width="22" height="9" rx="4.5" fill="#8a5a33" transform="rotate(-18 14 19)" />
    <ellipse cx="25" cy="15.4" rx="4" ry="4.6" fill="#d9a865" stroke="#8a5a33" strokeWidth="1.2" />
    <circle cx="25" cy="15.4" r="1.8" fill="none" stroke="#a87a44" strokeWidth="1" />
    <rect x="6" y="6" width="20" height="8" rx="4" fill="#9a6a3d" transform="rotate(14 16 10)" />
    <ellipse cx="6.4" cy="7.6" rx="3.4" ry="4" fill="#e3b778" stroke="#8a5a33" strokeWidth="1.1" />
  </svg>
);

export const IconStone = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 25 L7 13 L15 8 L24 11 L28 22 L20 27 Z" fill="#a9a398" stroke="#5f5a52" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M15 8 L24 11 L28 22 L18 18 Z" fill="#8a8479" />
    <path d="M7 13 L15 8 L18 18 L10 19 Z" fill="#c7c2b8" />
    <path d="M12 21 l3 -1 M21 15 l2 2" stroke="#5f5a52" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

export const IconGold = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <ellipse cx="13" cy="21" rx="9" ry="4.4" fill="#b7861f" />
    <rect x="4" y="15" width="18" height="6" fill="#d9a630" />
    <ellipse cx="13" cy="15" rx="9" ry="4.4" fill="#f6cf62" stroke="#b7861f" strokeWidth="1" />
    <ellipse cx="20" cy="13" rx="8" ry="4" fill="#b7861f" />
    <rect x="12" y="8" width="16" height="5" fill="#d9a630" />
    <ellipse cx="20" cy="8" rx="8" ry="4" fill="#ffe08a" stroke="#b7861f" strokeWidth="1" />
    <path d="M17 7.5 h6" stroke="#b7861f" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const IconPower = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 5 L22 21 M26 5 L10 21" stroke="#e8e2d2" strokeWidth="3" strokeLinecap="round" />
    <path d="M18 24 L24 18 M8 18 L14 24" stroke="#d9ad48" strokeWidth="3" strokeLinecap="round" />
    <circle cx="25" cy="26" r="2.4" fill="#d9ad48" />
    <circle cx="7" cy="26" r="2.4" fill="#d9ad48" />
  </svg>
);

export const IconCastle = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 28 V12 h3 v3 h3 v-3 h3 v4 h6 v-4 h3 v3 h3 v-3 h3 V28 Z" fill="currentColor" opacity="0.92" />
    <path d="M13 28 v-6 a3 3 0 0 1 6 0 v6 Z" fill="#1b1410" opacity="0.65" />
    <path d="M16 4 v8" stroke="currentColor" strokeWidth="1.8" />
    <path d="M16 4 l6 2 l-6 2 Z" fill="currentColor" />
  </svg>
);

export const IconMap = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 8 L11 5 L21 8 L29 5 V24 L21 27 L11 24 L3 27 Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M11 5 V24 M21 8 V27" stroke="currentColor" strokeWidth="1.6" opacity="0.7" />
    <path d="M14 15 l3 3 m0 -3 l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconShield = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M16 3 L27 7 V15 C27 22 22 26.5 16 29 C10 26.5 5 22 5 15 V7 Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M16 8 V24 M9 14 H23" stroke="currentColor" strokeWidth="1.8" opacity="0.8" />
  </svg>
);

export const IconChat = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5 7 h22 a2 2 0 0 1 2 2 v12 a2 2 0 0 1 -2 2 H14 l-6 5 v-5 H5 a2 2 0 0 1 -2 -2 V9 a2 2 0 0 1 2 -2 Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M9 13 h14 M9 17 h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
  </svg>
);

export const IconHammer = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M14 13 L26 25" stroke="#c9a46a" strokeWidth="3.4" strokeLinecap="round" />
    <path d="M6 9 L13 4 L20 11 L13 16 Z" fill="#c7ccd2" stroke="#6c7076" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

export const IconExit = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M13 5 H6 V27 H13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M12 16 H27 M21 10 L27 16 L21 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M8 8 L24 24 M24 8 L8 24" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

export const IconClock = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path d="M16 9 V16 L21 19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const IconPin = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M16 29 C10 21 7 17 7 12 a9 9 0 0 1 18 0 c0 5 -3 9 -9 17 Z" fill="currentColor" />
    <circle cx="16" cy="12" r="3.4" fill="#1b1410" />
  </svg>
);

export const RESOURCE_ICON = { food: IconFood, wood: IconWood, stone: IconStone, gold: IconGold } as const;
