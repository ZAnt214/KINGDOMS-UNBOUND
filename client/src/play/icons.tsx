import type { ReactNode, SVGProps } from 'react';

// Ícones próprios do jogo: traço de 1,8 em grade de 24, cantos arredondados.
const Icon = ({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    {children}
  </svg>
);

export const IcExpand = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
    <path d="M9.5 5.5 12 3l2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
  </Icon>
);
export const IcCapital = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 21V4" />
    <path d="M6 5h11l-2.5 3.5L17 12H6" fill="currentColor" fillOpacity="0.25" />
    <path d="M3.5 21h5" />
  </Icon>
);
export const IcBuild = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 21h18M5 21V10l4-3v14M9 21V4l6 4v13M15 21v-9l4 2v7" />
    <path d="M11.5 11h1M11.5 14h1M11.5 17h1" />
  </Icon>
);
/** Exército: escudo com divisa. */
export const IcArmy = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z" />
    <path d="M8.5 10.5 12 13l3.5-2.5M8.5 14.5 12 17l3.5-2.5" />
  </Icon>
);
export const IcRanking = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 20V11h4v9M10 20V5h4v15M16 20v-6h4v6" />
    <path d="M3 20h18" />
  </Icon>
);
/** Diplomacia: dois anéis entrelaçados (o selo da aliança). */
export const IcPact = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="12" r="5.2" />
    <circle cx="15" cy="12" r="5.2" />
  </Icon>
);
export const IcGear = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" />
  </Icon>
);
export const IcClose = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const IcLock = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);
export const IcSound = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" fill="currentColor" fillOpacity="0.2" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </Icon>
);
export const IcMute = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" fill="currentColor" fillOpacity="0.2" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </Icon>
);
export const IcPlus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IcMinus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);
export const IcGlobe = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
  </Icon>
);
export const IcClock = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const IcBolt = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9z" fill="currentColor" fillOpacity="0.2" />
  </Icon>
);
export const IcTeam = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="8" cy="9" r="3" />
    <circle cx="17" cy="10" r="2.4" />
    <path d="M2.5 19c.6-3 2.7-4.5 5.5-4.5s4.900 1.500 5.500 4.500M15 15c2.800 0 4.800 1.200 5.500 4" />
  </Icon>
);
export const IcBack = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
export const IcTarget = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Icon>
);
export const IcUpload = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 16V5M7.500 9.500 12 5l4.500 4.500M5 19h14" />
  </Icon>
);

/** Emblema do jogo: globo recortado por uma frente de avanço. */
export function Emblem({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="ku-emblem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cd4ff" />
          <stop offset="1" stopColor="#1d6bff" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="27" fill="none" stroke="url(#ku-emblem)" strokeWidth="3" />
      <path d="M5 32h54M32 5c9 8 9 46 0 54M32 5c-9 8-9 46 0 54" fill="none" stroke="url(#ku-emblem)" strokeWidth="1.6" opacity="0.55" />
      <path d="M14 46 30 18l8 14 6-8 8 22z" fill="#ffc53d" stroke="#0a1f47" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
