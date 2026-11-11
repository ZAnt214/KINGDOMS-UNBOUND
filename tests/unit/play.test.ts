import { describe, expect, it } from 'vitest';
import { DEFAULT_FLAG, FLAG_IMAGE, FLAG_PRESETS, flagSvg, inspectFlagImage, parseFlag } from '../../shared/play/flags.js';
import { EXPANSION, expansionSeconds, MILESTONES, nationLevel, nationNameProblem, nextMilestone, NATION_COLORS } from '../../shared/play/rules.js';
import { COUNTRY_BY_CODE } from '../../shared/world/index.js';
import { borderingRegion, countryOccupation, dominatedCountries, expansionTargets, landmassSize, REGION_BY_ID, REGIONS, REGIONS_BY_COUNTRY, START_POINTS } from '../../shared/world/regions.js';

describe('dados de regiões', () => {
  it('ids únicos, países conhecidos e áreas positivas', () => {
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
    expect(REGIONS.length).toBeGreaterThan(1000);
    for (const r of REGIONS) {
      expect(COUNTRY_BY_CODE[r.country], r.id).toBeTruthy();
      expect(r.area, r.id).toBeGreaterThan(0);
      expect(r.name, r.id).toBeTruthy();
    }
  });

  it('vizinhança é simétrica, sem laços e só entre regiões existentes', () => {
    for (const r of REGIONS) {
      expect(r.neighbors).not.toContain(r.id);
      for (const n of r.neighbors) expect(REGION_BY_ID[n]?.neighbors, `${r.id} -> ${n}`).toContain(r.id);
    }
  });

  it('pontos de partida: ids únicos, região existente e exclusiva', () => {
    expect(new Set(START_POINTS.map((p) => p.id)).size).toBe(START_POINTS.length);
    expect(new Set(START_POINTS.map((p) => p.region)).size).toBe(START_POINTS.length);
    for (const p of START_POINTS) {
      expect(REGION_BY_ID[p.region]?.country, p.id).toBe(p.country);
    }
    expect(START_POINTS.filter((p) => p.kind === 'capital').length).toBeGreaterThan(150);
  });
});

describe('funções territoriais', () => {
  const goias = REGIONS.find((r) => r.country === 'BRA' && r.name === 'Goiás')!;

  it('alvos de expansão são vizinhos neutros', () => {
    const taken = new Set([goias.neighbors[0]]);
    const targets = expansionTargets([goias.id], (id) => !taken.has(id));
    expect(targets.sort()).toEqual(goias.neighbors.slice(1).sort());
    expect(expansionTargets([], () => true)).toEqual([]);
  });

  it('origem da ocupação é determinística e exige fronteira', () => {
    expect(borderingRegion([goias.id], goias.neighbors[0])).toBe(goias.id);
    const far = REGIONS.find((r) => r.country === 'JPN')!;
    expect(borderingRegion([goias.id], far.id)).toBeNull();
    const pair = [goias.id, goias.neighbors[1]].sort();
    const common = REGION_BY_ID[pair[0]].neighbors.find((n) => REGION_BY_ID[pair[1]].neighbors.includes(n));
    if (common) expect(borderingRegion([pair[1], pair[0]], common)).toBe(pair[0]);
  });

  it('domínio de país exige todas as regiões', () => {
    const uru = REGIONS_BY_COUNTRY.URY.map((r) => r.id);
    expect(dominatedCountries(uru)).toEqual(['URY']);
    expect(dominatedCountries(uru.slice(1))).toEqual(uru.length > 1 ? [] : ['URY']);
    expect(countryOccupation('URY', () => true)).toBe(1);
    expect(countryOccupation('URY', () => false)).toBe(0);
    const half = countryOccupation('BRA', (id) => id === goias.id);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.1);
  });

  it('massa terrestre conta regiões alcançáveis', () => {
    expect(landmassSize(goias.id)).toBeGreaterThan(100);
    const island = REGIONS.find((r) => r.neighbors.length === 0)!;
    expect(landmassSize(island.id)).toBe(1);
  });
});

describe('regras de expansão e progressão', () => {
  it('duração cresce com área e com o tamanho da nação, dentro dos limites', () => {
    expect(expansionSeconds(50000, 1)).toBe(20);
    expect(expansionSeconds(1, 1)).toBe(EXPANSION.minSeconds);
    expect(expansionSeconds(200000, 1)).toBe(40);
    expect(expansionSeconds(50000, 11)).toBe(44);
    expect(expansionSeconds(5e6, 500)).toBe(EXPANSION.maxSeconds);
    expect(expansionSeconds(50000, 1, 'quick')).toBeLessThan(expansionSeconds(50000, 1, 'campaign'));
    for (let n = 1; n < 60; n++) expect(expansionSeconds(80000, n + 1)).toBeGreaterThanOrEqual(expansionSeconds(80000, n));
  });

  it('nível e metas derivam do território', () => {
    expect(nationLevel(0).level).toBe(1);
    expect(nationLevel(100).level).toBe(1);
    expect(nationLevel(120).level).toBe(2);
    expect(nationLevel(480).level).toBe(3);
    const l = nationLevel(300);
    expect(l.progress).toBeGreaterThan(0);
    expect(l.progress).toBeLessThan(1);
    expect(nextMilestone(0, 0)?.id).toBe('r1');
    expect(nextMilestone(1, 0)?.id).toBe('r3');
    expect(nextMilestone(6, 0)?.id).toBe('c1');
    expect(nextMilestone(1000, 1000)).toBeNull();
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length);
  });

  it('nomes de nação', () => {
    expect(nationNameProblem('República Aurora')).toBeNull();
    expect(nationNameProblem("Côte d'Or 2")).toBeNull();
    expect(nationNameProblem('ab')).toBeTruthy();
    expect(nationNameProblem('x'.repeat(23))).toBeTruthy();
    expect(nationNameProblem('<b>oi</b>')).toBeTruthy();
    expect(nationNameProblem(' espaço')).toBeTruthy();
  });

  it('cores da paleta são únicas e válidas', () => {
    expect(new Set(NATION_COLORS.map((c) => c.hex)).size).toBe(NATION_COLORS.length);
    for (const c of NATION_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('bandeiras', () => {
  it('valida e normaliza', () => {
    expect(parseFlag(DEFAULT_FLAG)).toEqual(DEFAULT_FLAG);
    expect(parseFlag({ pattern: 'cross', colors: ['#FFFFFF', '#000000', '#ff0000'], emblem: 'star' })?.colors).toEqual(['#ffffff', '#000000', '#ff0000']);
    expect(parseFlag({ pattern: 'cross', colors: ['red', '#000000', '#ff0000'], emblem: 'star' })).toBeNull();
    expect(parseFlag({ pattern: 'nope', colors: ['#ffffff', '#000000', '#ff0000'], emblem: 'star' })).toBeNull();
    expect(parseFlag({ pattern: 'cross', colors: ['#ffffff'], emblem: 'star' })).toBeNull();
    expect(parseFlag('x')).toBeNull();
    expect(parseFlag({ pattern: 'cross', colors: ['#ffffff', '#000000', '#ff0000"/><script>'], emblem: 'star' })).toBeNull();
  });

  it('todo modelo pronto é válido e gera SVG', () => {
    expect(new Set(FLAG_PRESETS.map((p) => p.id)).size).toBe(FLAG_PRESETS.length);
    for (const p of FLAG_PRESETS) {
      expect(parseFlag(p.flag), p.id).toEqual(p.flag);
      expect(flagSvg(p.flag)).toMatch(/^<svg [^>]*viewBox="0 0 60 40"/);
    }
  });

  it('inspeciona o conteúdo real da imagem', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    expect(inspectFlagImage(png)).toEqual({ ok: true, type: 'image/png', width: 1, height: 1 });
    expect(inspectFlagImage(Buffer.from('GIF89a' + 'x'.repeat(40))).ok).toBe(false);
    expect(inspectFlagImage(new Uint8Array(0)).ok).toBe(false);
    const big = Buffer.from(png);
    big.writeUInt32BE(4000, 16);
    expect(inspectFlagImage(big).ok).toBe(false);
    expect(inspectFlagImage(Buffer.concat([png, Buffer.alloc(FLAG_IMAGE.maxBytes)])).ok).toBe(false);
    // JPEG mínimo: SOI + APP0 + SOF0 com 64×40.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x28, 0x00, 0x40, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
    expect(inspectFlagImage(jpeg)).toEqual({ ok: true, type: 'image/jpeg', width: 64, height: 40 });
  });
});
