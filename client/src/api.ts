import type { BuildingLevels, BuildingType, CivilizationDef, BuildingDef, ResourceMap } from '../../shared/rules';

let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;
export function syncClock(serverTime: number | undefined) {
  if (typeof serverTime === 'number') serverOffset = serverTime - Date.now();
}

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
      headers: { 'Content-Type': 'application/json', 'X-KU': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão com o servidor.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Erro inesperado.');
  syncClock(data.serverTime ?? data.state?.serverTime);
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
  civilization: string;
  cityId: number;
  allianceId: number | null;
  allianceRank: number | null;
}

export interface Me {
  userId: number;
  username: string;
  governor: Governor | null;
  serverTime: number;
}

export interface Kingdom {
  id: number;
  name: string;
  width: number;
  height: number;
  seed: number;
  status: string;
  population: number;
  capacity: number;
}

export interface Meta {
  rulesVersion: number;
  civilizations: CivilizationDef[];
  buildings: BuildingDef[];
  kingdoms: Kingdom[];
}

export interface CityState {
  cityId: number;
  x: number;
  y: number;
  civilization: string;
  power: number;
  serverTime: number;
  levels: BuildingLevels;
  resources: ResourceMap;
  resourcesAt: number;
  ratesPerHour: ResourceMap;
  capacity: number;
  queue: null | { id: number; building: BuildingType; toLevel: number; startedAt: number; endsAt: number };
}

export interface MapCity {
  cityId: number;
  governorId: number;
  name: string;
  civilization: string;
  power: number;
  x: number;
  y: number;
  hallLevel: number;
  allianceTag: string | null;
  allianceId: number | null;
}

export interface ChatChannel {
  id: number;
  type: 'global' | 'kingdom' | 'alliance';
  name: string;
  unread: number;
  lastRead: number;
}

export interface ChatMessage {
  id: number;
  channelId: number;
  body: string;
  attachments: { kind: 'coords'; kingdomId: number; x: number; y: number }[];
  createdAt: number;
  author: { governorId: number; name: string; kingdomId: number; allianceTag: string | null; civilization: string };
}

export const newIdempotencyKey = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, '');
