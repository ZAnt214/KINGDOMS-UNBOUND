import type { WorldSeat } from '../../shared/play/types';
import type { GameMode } from '../../shared/play/rules';

let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;
export function syncClock(serverTime: number | undefined) {
  if (typeof serverTime === 'number') serverOffset = serverTime - Date.now();
}

/** Mundo das próximas requisições (cabeçalho X-KU-World). null = campanha. */
let currentWorld: number | null = null;
export const setWorld = (id: number | null) => {
  currentWorld = id;
};
export const getWorld = () => currentWorld;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-KU': '1', ...(currentWorld ? { 'X-KU-World': String(currentWorld) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão com o servidor.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Erro inesperado.');
  syncClock(data.serverTime);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
};

export interface Governor {
  id: number;
  name: string;
  kingdomId: number;
  mode: GameMode;
  allianceId: number | null;
  allianceRank: number | null;
}

export interface Me {
  userId: number;
  username: string;
  governor: Governor | null;
  worlds: WorldSeat[];
  serverTime: number;
}

export interface Meta {
  modes: Record<GameMode, boolean>;
  worlds: { id: number; name: string; status: string; mode: GameMode; population: number; capacity: number }[];
}
