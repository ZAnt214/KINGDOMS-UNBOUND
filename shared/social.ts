// Regras de alianças e chat (servidor). Sem interface na Fase B: voltam com a diplomacia (Fase F)
// e com a comunicação entre membros do modo Equipe.

export const ALLIANCE_RANKS = [1, 2, 3, 4, 5] as const;
export const ALLIANCE_MAX_MEMBERS = 100;
export const ALLIANCE_RANK_LABELS: Record<number, string> = {
  1: 'R1 · Recruta',
  2: 'R2 · Membro',
  3: 'R3 · Veterano',
  4: 'R4 · Oficial',
  5: 'R5 · Líder',
};

/** Matriz de permissões da aliança (Fase A). Verificada SEMPRE no servidor. */
export const ALLIANCE_PERMISSIONS = {
  readChat: 1,
  writeChat: 1,
  reviewApplications: 4,
  kick: 4,
  setRank: 5,
  transferLeadership: 5,
} as const;
export type AlliancePermission = keyof typeof ALLIANCE_PERMISSIONS;

export function hasAlliancePermission(rank: number, perm: AlliancePermission): boolean {
  return rank >= ALLIANCE_PERMISSIONS[perm];
}

export const CHAT_MAX_LENGTH = 500;
export const CHAT_RATE = { messages: 5, perSeconds: 10 };

/** Extrai referências de coordenadas como "X:12 Y:40" ou "12,40" com prefixo. */
export function extractCoordinates(body: string, width: number, height: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /\bX\s*[:=]?\s*(\d{1,4})\s*[,;]?\s*Y\s*[:=]?\s*(\d{1,4})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) && out.length < 5) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x < width && y < height) out.push({ x, y });
  }
  return out;
}
