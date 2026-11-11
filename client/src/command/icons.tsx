// Ícones do centro de comando (SVG inline, traço único; sem emojis).
import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const make = (children: ReactNode, filled = false) =>
  function Icon({ size = 22, ...p }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...p}
      >
        {children}
      </svg>
    );
  };

export const IcGlobe = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18M5 7h14M5 17h14" />
  </>,
);
export const IcSwords = make(<path d="M4 4l11 11M4 4v3.5M4 4h3.5M20 4L9 15M20 4v3.5M20 4h-3.5M13.5 16.5l3 3M6.5 16.5l-3 3M15 14l3 3M9 14l-3 3" />);
export const IcHandshake = make(<path d="M2 9l4-3 4 2 2-1 2 1 4-2 4 3M6 6v9M18 6v9M6 15l4 4 2-1.5L14 19l4-4M10 8l-2.5 3.5 2 1.5 2.5-3 4 4" />);
export const IcTrophy = make(<path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5c0 3 1.2 4.5 3.2 4.8M16 6h3c0 3-1.2 4.5-3.2 4.8M12 13v4M8.5 20h7M10 17h4" />);
export const IcClipboard = make(<path d="M9 4h6v3H9zM9 5.5H6.5v14.5h11V5.5H15M9 11h6M9 14h6M9 17h4" />);
export const IcCrate = make(<path d="M3.5 8L12 4l8.5 4v8L12 20l-8.5-4V8zM3.5 8L12 12l8.5-4M12 12v8M7.5 6l8.5 4" />);
export const IcMail = make(<path d="M3.5 6h17v12h-17zM3.5 6.5L12 13l8.5-6.5" />);
export const IcGear = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
  </>,
);
export const IcPower = make(<path d="M12 3v8M7 6.3a7.5 7.5 0 1010 0" />);
export const IcPlus = make(<path d="M12 5v14M5 12h14" />);
export const IcMinus = make(<path d="M5 12h14" />);
export const IcClose = make(<path d="M6 6l12 12M18 6L6 18" />);
export const IcChevron = make(<path d="M9 5l7 7-7 7" />);
export const IcHome = make(
  <>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="1.2" />
  </>,
);
export const IcLayers = make(<path d="M12 4l9 4.5-9 4.5-9-4.5L12 4zM3 12.5l9 4.5 9-4.5M3 16l9 4.5 9-4.5" />);
export const IcTank = make(<path d="M3 15h18a3 3 0 010 4H3a3 3 0 010-4zM5 15v-3h9l1.5 3M9 12V9h4v3M13 10h8M6.5 17h.01M12 17h.01M17.5 17h.01" />);
export const IcJet = make(<path d="M21 4l-6.5 6.5L4 8l-1.5 1.5 8 4-3 3-3-.5L3 17.5l3.5 1.5L8 22.5 9.5 21 9 18l3-3 4 8 1.5-1.5-2.5-10.5L21.5 4.5z" />);
export const IcShip = make(<path d="M2.5 15h19l-2.5 4.5h-14L2.5 15zM6 15v-3h9l2 3M9 12V8.5h4V12M11 8.5V5M2 21.5c2 1 3 1 5 0s3-1 5 0 3 1 5 0 3-1 5 0" />);
export const IcFlask = make(<path d="M9.5 3h5M10 3v6L4.5 19a1.3 1.3 0 001.2 2h12.6a1.3 1.3 0 001.2-2L14 9V3M7.5 15h9" />);
export const IcHelmet = make(<path d="M3 17h18M5 17v-2a7 7 0 0114 0v2M10 8.3V12M14 8.3V12M2.5 17v2.5h19V17" />);
export const IcShield = make(<path d="M12 3l8 3v6c0 4.5-3.3 7.6-8 9-4.7-1.4-8-4.5-8-9V6l8-3z" />);
export const IcInsignia = make(<path d="M5 9l7-4 7 4M5 14l7-4 7 4M5 19l7-4 7 4" />);
