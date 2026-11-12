/**
 * Logística (Fase C): ferrovias automáticas entre construções e conexões entre aliados.
 *
 * Nada aqui é guardado no banco: a rede é derivada das construções concluídas (posição, nível,
 * região) com uma regra determinística. Cliente e servidor rodam esta mesma função, então o
 * trilho que aparece no mapa é exatamente o que dá bônus na produção calculada pelo servidor.
 */
import { distanceKm, REGION_BY_ID } from '../world/regions';
import type { StructureType } from './economy';

export const LOGISTICS = {
  /** Distância máxima (km) de um trecho de ferrovia. */
  rangeKm: 300,
  /** Bônus de produção por trecho ligado à construção. */
  linkBonus: 0.04,
  /** Bônus extra por nível acima de 1 do lado mais fraco do trecho (qualidade da conexão). */
  qualityBonus: 0.01,
  /** Teto do bônus da própria rede por construção. */
  maxBonus: 0.15,
  /** Conexão com aliado: +5% para as duas pontas (uma vez por construção, fora do teto). */
  allyBonus: 0.05,
  /** Quem procura conexão com aliado e com o quê ela pode se ligar. */
  allyFrom: ['factory'] as StructureType[],
  allyTo: ['city', 'port'] as StructureType[],
  /** Depósito ou porto ligado à rede guarda 50% a mais. */
  storageBonus: 0.5,
};

export interface LogisticsNode {
  id: number;
  nation: number;
  type: StructureType;
  /** Só construções com nível ≥ 1 entram na rede. */
  level: number;
  region: string;
  at: [number, number];
}

export interface Link {
  a: number;
  b: number;
  km: number;
  /** Conexão compartilhada entre aliados (nações diferentes). */
  ally: boolean;
  /** Nível do lado mais fraco. */
  quality: number;
}

/** Trecho possível: dentro do alcance e em regiões iguais ou vizinhas (a ferrovia não cruza o mar). */
export function linkable(a: LogisticsNode, b: LogisticsNode): number | null {
  if (a.region !== b.region && !(REGION_BY_ID[a.region]?.neighbors ?? []).includes(b.region)) return null;
  const km = distanceKm(a.at, b.at);
  return km <= LOGISTICS.rangeKm ? km : null;
}

const byKey = (x: { km: number; a: number; b: number }, y: { km: number; a: number; b: number }) => x.km - y.km || x.a - y.a || x.b - y.b;

/**
 * Ferrovias de cada nação: a menor árvore que liga as construções alcançáveis (Kruskal),
 * para usar o mínimo de trilhos e não poluir o mapa. Empates resolvidos pelos ids.
 */
export function railNetwork(nodes: LogisticsNode[]): Link[] {
  const live = nodes.filter((n) => n.level >= 1);
  const byNation = new Map<number, LogisticsNode[]>();
  for (const n of live) {
    const list = byNation.get(n.nation) ?? [];
    list.push(n);
    byNation.set(n.nation, list);
  }
  const out: Link[] = [];
  for (const list of byNation.values()) {
    list.sort((x, y) => x.id - y.id);
    const edges: { a: number; b: number; km: number; qa: number; qb: number }[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const km = linkable(list[i], list[j]);
        if (km !== null) edges.push({ a: list[i].id, b: list[j].id, km, qa: list[i].level, qb: list[j].level });
      }
    }
    edges.sort(byKey);
    const parent = new Map<number, number>(list.map((n) => [n.id, n.id]));
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      while (parent.get(x) !== r) {
        const next = parent.get(x)!;
        parent.set(x, r);
        x = next;
      }
      return r;
    };
    for (const e of edges) {
      const ra = find(e.a);
      const rb = find(e.b);
      if (ra === rb) continue;
      parent.set(ra, rb);
      out.push({ a: e.a, b: e.b, km: e.km, ally: false, quality: Math.min(e.qa, e.qb) });
    }
  }
  return out;
}

/**
 * Conexões entre aliados: cada fábrica concluída se liga à cidade ou porto aliado (de outra nação
 * da mesma aliança) mais próximo dentro do alcance. `allianceOf` devolve null para quem não tem aliança.
 */
export function allyLinks(nodes: LogisticsNode[], allianceOf: (nation: number) => number | null): Link[] {
  const live = nodes.filter((n) => n.level >= 1).sort((x, y) => x.id - y.id);
  const out: Link[] = [];
  for (const f of live) {
    if (!LOGISTICS.allyFrom.includes(f.type)) continue;
    const alliance = allianceOf(f.nation);
    if (alliance === null) continue;
    let best: { node: LogisticsNode; km: number } | null = null;
    for (const t of live) {
      if (t.nation === f.nation || !LOGISTICS.allyTo.includes(t.type) || allianceOf(t.nation) !== alliance) continue;
      const km = linkable(f, t);
      if (km === null) continue;
      if (!best || km < best.km || (km === best.km && t.id < best.node.id)) best = { node: t, km };
    }
    if (best) out.push({ a: f.id, b: best.node.id, km: best.km, ally: true, quality: Math.min(f.level, best.node.level) });
  }
  return out;
}

export interface Logistics {
  links: Link[];
  /** Bônus de produção de cada construção (0,04 = +4%). */
  bonus: Map<number, number>;
  /** Construções ligadas a pelo menos um trecho. */
  connected: Set<number>;
}

/** Rede completa (próprias + aliadas) e bônus por construção. */
export function logistics(nodes: LogisticsNode[], allianceOf: (nation: number) => number | null = () => null): Logistics {
  const links = [...railNetwork(nodes), ...allyLinks(nodes, allianceOf)];
  const own = new Map<number, number>();
  const ally = new Set<number>();
  const connected = new Set<number>();
  for (const l of links) {
    for (const id of [l.a, l.b]) {
      connected.add(id);
      if (l.ally) ally.add(id);
      else own.set(id, (own.get(id) ?? 0) + LOGISTICS.linkBonus + LOGISTICS.qualityBonus * (l.quality - 1));
    }
  }
  const bonus = new Map<number, number>();
  for (const id of connected) bonus.set(id, Math.min(LOGISTICS.maxBonus, own.get(id) ?? 0) + (ally.has(id) ? LOGISTICS.allyBonus : 0));
  return { links, bonus, connected };
}

/** Trechos que surgiriam se uma construção nova ficasse em `at` (prévia ao escolher o ponto). */
export function previewLinks(own: LogisticsNode[], candidate: Omit<LogisticsNode, 'id'>): [number, number][] {
  const fake: LogisticsNode = { ...candidate, id: Number.MAX_SAFE_INTEGER, level: Math.max(1, candidate.level) };
  const before = new Set(railNetwork(own).map((l) => `${l.a}:${l.b}`));
  const after = railNetwork([...own, fake]);
  const byId = new Map(own.map((n) => [n.id, n]));
  const out: [number, number][] = [];
  for (const l of after) {
    if (before.has(`${l.a}:${l.b}`)) continue;
    const other = l.a === fake.id ? byId.get(l.b) : l.b === fake.id ? byId.get(l.a) : null;
    if (other) out.push(other.at);
  }
  return out;
}
