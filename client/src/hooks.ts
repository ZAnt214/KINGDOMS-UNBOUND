import { useEffect, useState } from 'react';

/** Re-renderiza periodicamente para contadores; não altera estado do jogo. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}
