import { describe, expect, it } from 'vitest';
import { computeEconomy } from '../../shared/play/economy.js';
import { allyLinks, linkable, LOGISTICS, logistics, type LogisticsNode, previewLinks, railNetwork } from '../../shared/play/logistics.js';
import { distanceKm } from '../../shared/world/regions.js';

// Regiões reais: Goiás (BRA-1294) faz fronteira com Minas Gerais (BRA-601), não com o Rio Grande do Sul.
const GO = 'BRA-1294';
const MG = 'BRA-601';
const node = (id: number, at: [number, number], o: Partial<LogisticsNode> = {}): LogisticsNode => ({ id, nation: 1, type: 'city', level: 1, region: GO, at, ...o });

describe('ferrovias', () => {
  it('liga construções próximas na mesma região ou em regiões vizinhas, nunca além do alcance', () => {
    const a = node(1, [-49.0, -15.7]);
    expect(linkable(a, node(2, [-48.5, -15.7]))).not.toBeNull();
    expect(linkable(a, node(3, [-47.5, -17.0], { region: MG }))).not.toBeNull();
    // Mesma distância, mas a região não é vizinha: o trilho não cruza o país inteiro.
    expect(linkable(a, node(4, [-48.5, -15.7], { region: 'ABW-5150' }))).toBeNull();
    const far: [number, number] = [-49.0 + 4, -15.7];
    expect(distanceKm(a.at, far) > LOGISTICS.rangeKm).toBe(true);
    expect(linkable(a, node(5, far))).toBeNull();
  });

  it('usa a menor árvore: três construções em linha têm dois trechos, não três', () => {
    const links = railNetwork([node(1, [-49.6, -15.7]), node(2, [-49.0, -15.7]), node(3, [-48.4, -15.7])]);
    expect(links.length).toBe(2);
    expect(links.some((l) => (l.a === 1 && l.b === 3) || (l.a === 3 && l.b === 1))).toBe(false);
  });

  it('ignora obras não concluídas e nunca liga nações diferentes por ferrovia própria', () => {
    expect(railNetwork([node(1, [-49.0, -15.7]), node(2, [-48.7, -15.7], { level: 0 })]).length).toBe(0);
    expect(railNetwork([node(1, [-49.0, -15.7]), node(2, [-48.7, -15.7], { nation: 2 })]).length).toBe(0);
  });

  it('bônus por trecho cresce com a qualidade e tem teto', () => {
    const base = logistics([node(1, [-49.0, -15.7]), node(2, [-48.7, -15.7])]);
    expect(base.bonus.get(1)).toBeCloseTo(LOGISTICS.linkBonus, 6);
    const strong = logistics([node(1, [-49.0, -15.7], { level: 5 }), node(2, [-48.7, -15.7], { level: 4 })]);
    expect(strong.bonus.get(1)).toBeCloseTo(LOGISTICS.linkBonus + 3 * LOGISTICS.qualityBonus, 6);
    // Um centro com muitas ligações (estrela) não passa do teto.
    const hub = node(1, [-49.0, -15.7], { level: 5 });
    const spokes = [0, 1, 2, 3, 4, 5].map((i) => node(10 + i, [-49.0 + 0.6 * Math.cos(i), -15.7 + 0.6 * Math.sin(i)], { level: 5 }));
    expect(logistics([hub, ...spokes]).bonus.get(1)! <= LOGISTICS.maxBonus + 1e-9).toBe(true);
  });

  it('a prévia mostra só os trechos que a nova construção criaria', () => {
    const own = [node(1, [-49.6, -15.7]), node(2, [-49.0, -15.7])];
    const ends = previewLinks(own, { nation: 1, type: 'factory', level: 0, region: GO, at: [-48.4, -15.7] });
    expect(ends).toEqual([[-49.0, -15.7]]);
    expect(previewLinks(own, { nation: 1, type: 'factory', level: 0, region: GO, at: [-40, -15.7] })).toEqual([]);
  });
});

describe('conexões entre aliados', () => {
  const ally = (n: number) => (n === 1 || n === 2 ? 7 : null);

  it('fábrica se liga à cidade ou porto aliado mais próximo, +5% para as duas pontas', () => {
    const factory = node(1, [-49.0, -15.7], { type: 'factory' });
    const city = node(2, [-48.6, -15.7], { nation: 2, type: 'city' });
    const farCity = node(3, [-48.0, -15.7], { nation: 2, type: 'city' });
    const links = allyLinks([factory, city, farCity], ally);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ a: 1, b: 2, ally: true });
    const net = logistics([factory, city, farCity], ally);
    expect(net.bonus.get(1)).toBeCloseTo(LOGISTICS.allyBonus, 6);
    expect(net.bonus.get(2)! >= LOGISTICS.allyBonus).toBe(true);
  });

  it('sem aliança, de outro tipo ou da própria nação não há conexão compartilhada', () => {
    const factory = node(1, [-49.0, -15.7], { type: 'factory' });
    expect(allyLinks([factory, node(2, [-48.6, -15.7], { nation: 3, type: 'city' })], ally)).toHaveLength(0);
    expect(allyLinks([factory, node(2, [-48.6, -15.7], { nation: 2, type: 'refinery' })], ally)).toHaveLength(0);
    expect(allyLinks([factory, node(2, [-48.6, -15.7], { nation: 1, type: 'city' })], ally)).toHaveLength(0);
  });
});

describe('economia com logística', () => {
  const capitalRegion = GO;
  const city = (id: number, at: [number, number]) => ({ id, type: 'city' as const, level: 1, region: GO, at });

  it('duas cidades ligadas produzem 4% a mais cada; separadas, não', () => {
    const apart = computeEconomy({ regions: [GO], capitalRegion, structures: [{ type: 'city', level: 1, region: GO }, { type: 'city', level: 1, region: GO }] });
    const linked = computeEconomy({ regions: [GO], capitalRegion, structures: [city(1, [-49.0, -15.7]), city(2, [-48.7, -15.7])] });
    const built = apart.rates.money - apart.territory.money;
    expect(linked.rates.money - linked.territory.money).toBeCloseTo(built * (1 + LOGISTICS.linkBonus), 3);
    expect(linked.logistics).toMatchObject({ links: 1, allyLinks: 0, connected: 2 });
    expect(linked.logistics.averageBonus).toBeCloseTo(LOGISTICS.linkBonus, 6);
  });

  it('depósito ligado guarda 50% a mais', () => {
    const depot = { id: 2, type: 'depot' as const, level: 1, region: GO, at: [-48.7, -15.7] as [number, number] };
    const alone = computeEconomy({ regions: [GO], capitalRegion, structures: [{ ...depot }] });
    const linked = computeEconomy({ regions: [GO], capitalRegion, structures: [city(1, [-49.0, -15.7]), depot] });
    expect(linked.capacity - alone.capacity).toBe(3000 * LOGISTICS.storageBonus);
  });

  it('conexão com aliado entra na produção de quem tem a fábrica', () => {
    const factory = { id: 1, type: 'factory' as const, level: 1, region: GO, at: [-49.0, -15.7] as [number, number] };
    const without = computeEconomy({ regions: [GO], capitalRegion, structures: [factory] });
    const withAlly = computeEconomy({
      regions: [GO],
      capitalRegion,
      structures: [factory],
      allied: [{ id: 9, nation: 2, type: 'city', level: 1, region: GO, at: [-48.6, -15.7] }],
    });
    expect(withAlly.rates.materials - withAlly.territory.materials).toBeCloseTo((without.rates.materials - without.territory.materials) * (1 + LOGISTICS.allyBonus), 3);
    expect(withAlly.logistics.allyLinks).toBe(1);
  });
});
