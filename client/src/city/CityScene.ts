// Cena da cidade em PixiJS (WebGL). Arte vetorial original (SVG) é rasterizada em
// texturas uma vez; a cena ordena sprites por profundidade isométrica, anima
// moradores/fumaça/nuvens e trata seleção. Estado de jogo vem sempre do servidor.

import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { BUILDING_TYPES, BUILDINGS, type BuildingLevels, type BuildingType, type CivilizationDef } from '../../../shared/rules';
import { CITY_GRID, COTTAGES, cityTier, plotFor, plotSize, buildingStage, visiblePlots, WALL_HALF } from '../../../shared/cityLayout';
import { Camera } from '../camera';
import { farmSvg, goldMineSvg, quarrySvg, sawmillSvg, soldierSvg, villagerSvg, warehouseSvg } from './art/buildings';
import { bushSvg, fenceSvg, haySvg, oakSvg, pineSvg, rocksSvg } from './art/nature';
import { gardenSvg, barrelsSvg, cartSvg, cottageSvg, dummySvg, lampSvg, plotSvg, stallSvg, targetSvg, tentSvg, trebuchetSvg, weaponRackSvg, wellSvg } from './art/props';
import { hallFx, type Palette, paletteFor, townHallSvg } from './art/townHall';
import { gatehouseSvg, WALL_H, wallFx, wallSegmentSvg, wallTowerSvg } from './art/walls';
import { CHUNK, CHUNK_RES, type GroundSpec, P, paintChunk, WORLD_BOUNDS } from './ground';
import { iso, rng, Svg } from './svg';
import { illustratedBuilding, illustratedEnvironment, type EnvironmentArt } from './illustrated';

const HALF = CITY_GRID / 2;

interface Tex {
  texture: Texture;
  ox: number;
  oy: number;
  w: number;
  h: number;
  res: number;
  alpha: Uint8ClampedArray | null;
  cw: number;
}

const texCache = new Map<string, Promise<Tex>>();

function raster(key: string, build: () => Svg, res = 1.5): Promise<Tex> {
  const hit = texCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const { svg, ox, oy, w, h } = build().toString();
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * res);
    c.height = Math.ceil(h * res);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let alpha: Uint8ClampedArray | null = null;
    try {
      alpha = ctx.getImageData(0, 0, c.width, c.height).data;
    } catch {
      alpha = null; // canvas contaminado: cai no teste por retângulo
    }
    return { texture: Texture.from(c), ox, oy, w, h, res, alpha, cw: c.width };
  })();
  texCache.set(key, p);
  return p;
}

function spriteOf(t: Tex, wx: number, wy: number): Sprite {
  const s = new Sprite(t.texture);
  s.anchor.set(t.ox / t.w, t.oy / t.h);
  s.scale.set(1 / t.res);
  s.position.set(wx, wy);
  return s;
}

/** Testa se um ponto de mundo atinge um pixel opaco do sprite. */
function hitSprite(s: Sprite, t: Tex, wx: number, wy: number): boolean {
  const lx = (wx - s.x) * t.res + t.ox * t.res;
  const ly = (wy - s.y) * t.res + t.oy * t.res;
  if (lx < 0 || ly < 0 || lx >= t.w * t.res || ly >= t.h * t.res) return false;
  if (!t.alpha) return true;
  const i = (Math.floor(ly) * t.cw + Math.floor(lx)) * 4 + 3;
  return t.alpha[i] > 40;
}

export interface SceneInput {
  levels: BuildingLevels;
  civ: CivilizationDef;
  queue: { building: BuildingType; startedAt: number; endsAt: number } | null;
  selected: BuildingType | null;
  upgradable: BuildingType[];
  now: () => number;
}

interface Walker {
  sprite: Sprite;
  /** Altura em px (guardas no passadiço da muralha). */
  z?: number;
  /** Membros de tropa marcham sem pausas aleatórias. */
  drill?: boolean;
  path: [number, number][];
  seg: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  pause: number;
}

interface Puff {
  g: Sprite;
  life: number;
  vx: number;
}

const NAMES: Record<BuildingType, string> = Object.fromEntries(BUILDING_TYPES.map((b) => [b, BUILDINGS[b].name])) as Record<BuildingType, string>;

export class CityScene {
  app = new Application();
  private world = new Container();
  private groundLayer = new Container();
  private objects = new Container();
  private fx = new Container();
  private ui = new Container();
  private cam!: Camera;
  private tier = 0;
  private buildingSprites = new Map<BuildingType, { sprite: Sprite; tex: Tex; key: string }>();
  private construction: Container | null = null;
  private constructionFor: string | null = null;
  private selection = new Graphics();
  private label = new Container();
  private labelText!: Text;
  private labelBg = new Graphics();
  private arrows = new Map<BuildingType, Sprite>();
  private arrowTex: Tex | null = null;
  private walkers: Walker[] = [];
  private puffs: Puff[] = [];
  private chimneys: [number, number, number][] = [];
  private fires: [number, number, number][] = [];
  private flames: { g: Sprite; life: number; max: number }[] = [];
  private puffTex!: Texture;
  private clouds: Sprite[] = [];
  private birds: Graphics | null = null;
  private birdT = 0;
  private input: SceneInput;
  private roads: [number, number][][] = [];
  private destroyed = false;
  private building = false;
  private pendingRebuild = false;
  private time = 0;
  private focus: { x: number; y: number } | null = null;
  private lastSelected: BuildingType | null = null;
  onSelect: (b: BuildingType | null) => void = () => {};
  onReady: () => void = () => {};

  constructor(input: SceneInput) {
    this.input = input;
  }

  async init(host: HTMLElement) {
    await this.app.init({
      resizeTo: host,
      antialias: true,
      backgroundColor: 0x1f2b1b,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: 'webgl',
    });
    if (this.destroyed) return;
    const canvas = this.app.canvas;
    canvas.className = 'stage';
    canvas.setAttribute('aria-label', 'Cidade (toque em um edifício)');
    canvas.setAttribute('data-testid', 'city-canvas');
    host.appendChild(canvas);
    this.app.stage.eventMode = 'none';
    this.objects.sortableChildren = true;
    // a seleção fica no chão (sob os edifícios); rótulo e indicadores acima de tudo
    this.world.addChild(this.groundLayer, this.selection, this.objects, this.fx, this.ui);
    this.ui.addChild(this.label);
    this.label.addChild(this.labelBg);
    this.labelText = new Text({
      text: '',
      style: { fontFamily: 'Cinzel, Georgia, serif', fontSize: 30, fontWeight: '700', fill: 0xfff3d0, align: 'center' },
      resolution: 2,
    });
    this.labelText.anchor.set(0.5, 0.5);
    this.label.addChild(this.labelText);
    this.label.visible = false;
    this.app.stage.addChild(this.world);
    this.puffTex = this.softCircle();

    this.cam = new Camera(canvas, 0.1, 1.15, () => this.applyCamera(), (sx, sy) => this.tap(sx, sy));
    canvas.addEventListener('pointerdown', () => (this.focus = null));
    const w = host.clientWidth;
    this.cam.zoom = Math.min(0.58, Math.max(0.3, Math.min(w / 2200, host.clientHeight / 1250)));
    const hall = plotFor('town_hall');
    const [hx, hy] = P(hall.dx, hall.dy);
    this.cam.centerOn(hx + 40, hy + 30);

    await this.rebuild();
    this.app.renderer.on('resize', this.onResize);
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    this.onReady();
  }

  zoomBy(factor: number) {
    this.focus = null;
    this.cam?.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, factor);
  }

  overview() {
    if (!this.cam) return;
    this.focus = null;
    const radius = WALL_HALF[(this.tier || 1) as 1 | 2 | 3];
    this.cam.zoom = Math.max(this.cam.minZoom, Math.min(.65,
      this.app.screen.width / (radius * 280), this.app.screen.height / (radius * 156 + 320)));
    this.cam.centerOn(0, -60);
  }

  update(input: SceneInput) {
    this.input = input;
    if (!this.app.renderer) return;
    if (input.selected && input.selected !== this.lastSelected) this.focusBuilding(input.selected);
    this.lastSelected = input.selected;
    void this.rebuild();
  }

  private onResize = () => { if (this.cam) this.applyCamera(); };

  destroy() {
    this.destroyed = true;
    this.cam?.destroy();
    this.app.renderer?.off('resize', this.onResize);
    try {
      this.app.destroy({ removeView: true }, { children: true });
    } catch {
      /* ignorado ao desmontar durante a inicialização */
    }
  }

  // ---- construção da cena ----

  private palette(): Palette {
    const civ = this.input.civ;
    return paletteFor(civ.color, civ.accent);
  }

  private async rebuild() {
    if (this.building) {
      this.pendingRebuild = true;
      return;
    }
    this.building = true;
    try {
      const tier = cityTier(this.input.levels.town_hall);
      if (tier !== this.tier) {
        this.tier = tier;
        await this.buildEnvironment(tier);
      }
      await this.buildBuildings();
      await this.buildConstruction();
      await this.buildIndicators();
    } finally {
      this.building = false;
    }
    if (this.pendingRebuild && !this.destroyed) {
      this.pendingRebuild = false;
      await this.rebuild();
    }
  }

  private groundSpec(R: number): GroundSpec {
    const plaza = { dx: 3.7, dy: -0.5, r: 1.7 };
    this.roads = [
      [[HALF+1,0],[R,0],[3.7,0]],
      [[3.7,-7.5],[3.7,0],[3.7,7.5]],
      [[3.7,-3.5],[-3.4,-3.5],[-3.4,-6]],
      [[3.7,3.5],[-3.4,3.5],[-3.4,-3.5]],
      [[-3.4,0],[-5,0]],
      [[3.7,5.8],[2.8,5.8]],
    ];
    return {
      wallHalf: R,
      roads: this.roads,
      plaza,
      // Clear grass at the wall foot keeps the city readable at phone scale.
      fields: [
        { dx: R + 5, dy: 6.5, w: 4.5, d: 3.2, crop: 0 },
        { dx: R + 9.5, dy: 7, w: 3.5, d: 3, crop: 2 },
        { dx: -3, dy: R + 5, w: 3.4, d: 4.2, crop: 3 },
        { dx: 4.5, dy: R + 5, w: 3.6, d: 4, crop: 1 },
        { dx: 4.5, dy: -R - 5, w: 3.6, d: 4, crop: 2 },
      ],
      pond: { dx: -R - 5.5, dy: R - 1.5, r: 2.4 },
    };
  }

  private async buildEnvironment(tier: 1 | 2 | 3) {
    const R = WALL_HALF[tier];
    const spec = this.groundSpec(R);
    const pal = this.palette();
    // terreno
    this.groundLayer.removeChildren().forEach((c) => c.destroy({ texture: true, textureSource: true }));
    const W = WORLD_BOUNDS;
    for (let y = Math.floor(W.y0 / CHUNK) * CHUNK; y < W.y1; y += CHUNK) {
      for (let x = Math.floor(W.x0 / CHUNK) * CHUNK; x < W.x1; x += CHUNK) {
        const canvas = paintChunk(spec, x, y);
        const s = new Sprite(Texture.from(canvas));
        s.position.set(x, y);
        s.scale.set(1 / CHUNK_RES);
        this.groundLayer.addChild(s);
      }
      await new Promise((r) => setTimeout(r, 0)); // não travar a interface
    }
    // objetos estáticos
    for (const c of this.objects.removeChildren()) c.destroy();
    this.buildingSprites.clear();
    for (const arrow of this.arrows.values()) arrow.destroy();
    this.arrows.clear();
    this.construction = null;
    this.constructionFor = null;
    this.chimneys = [];
    this.fires = wallFx(R);
    const add = async (key: string, build: () => Svg, dx: number, dy: number, res = 1.25, depthBias = 0, scale = 1, flip = false) => {
      const t = await raster(key, build, res);
      if (this.destroyed) return;
      const [wx, wy] = P(dx, dy);
      const s = spriteOf(t, wx, wy);
      if (scale !== 1 || flip) s.scale.set(((flip ? -1 : 1) * scale) / t.res, scale / t.res);
      s.zIndex = (dx + dy) * 100 + depthBias;
      this.objects.addChild(s);
      return s;
    };
    const addArt = async (kind: EnvironmentArt, dx: number, dy: number, scale = 1, flip = false) => {
      let tex: Tex;
      try { tex = await illustratedEnvironment(kind); }
      catch { // A missing image never blocks the game or its original art fallback.
        const fallback = kind.startsWith('cottage') ? () => cottageSvg(0, pal.roof)
          : kind === 'pine' ? () => pineSvg(0) : kind === 'bush' ? () => bushSvg(0)
          : () => oakSvg(0, 1, kind === 'autumn');
        tex = await raster(`fallback-${kind}`, fallback);
      }
      if (this.destroyed) return;
      const [x, y] = P(dx, dy);
      const sprite = spriteOf(tex, x, y);
      sprite.scale.set((flip ? -1 : 1) * scale / tex.res, scale / tex.res);
      sprite.zIndex = (dx + dy) * 100;
      this.objects.addChild(sprite);
    };
    const stone = pal.stone;
    // muralhas
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 2 * R; i++) {
      const a = -R + 0.5 + i;
      jobs.push(add('wxf', () => wallSegmentSvg('x', 'far', stone), a, -R, 1.25));
      jobs.push(add('wyf', () => wallSegmentSvg('y', 'far', stone), -R, a, 1.25));
      jobs.push(add('wxn', () => wallSegmentSvg('x', 'near', stone), a, R, 1.25));
      if (Math.abs(a) > 1.6) jobs.push(add('wyn', () => wallSegmentSvg('y', 'near', stone), R, a, 1.25));
    }
    for (const [cx, cy] of [
      [-R, -R],
      [R, -R],
      [-R, R],
      [R, R],
    ]) {
      jobs.push(add(`tc${pal.roof}`, () => wallTowerSvg('corner', stone, pal.roof, pal.banner, pal.accent), cx, cy, 1.4, 5));
    }
    for (let k = -R + 6; k <= R - 6; k += 6) {
      if (Math.abs(k) < 3) continue;
      const mid = () => wallTowerSvg('mid', stone, pal.roof, pal.banner, pal.accent);
      for (const [tx, ty] of [
        [k, -R],
        [-R, k],
        [k, R],
        [R, k],
      ] as const) {
        jobs.push(add('tm', mid, tx, ty, 1.4, 5));
        this.fires.push([tx, ty, 158]);
      }
    }
    jobs.push(add(`gate${pal.roof}`, () => gatehouseSvg(stone, pal.roof, pal.banner, pal.accent), R, 0, 1.5, 5));

    // casas, praça e adereços
    for (const c of COTTAGES.filter((c) => c.tier <= tier)) {
      jobs.push(addArt(c.variant === 1 ? 'cottageBlue' : 'cottageClay', c.dx, c.dy));
      if (c.variant !== 2) this.chimneys.push([c.dx - (c.variant === 1 ? 0.375 : 0.31) + 0.09, c.dy - 0.01, 96]);
    }
    for (const [x,y] of [[-.5,-4.8],[1,-7.7],[5.8,5.1],[-5.8,5.9]]) jobs.push(add('garden', gardenSvg, x,y,1.4));
    jobs.push(add('well', wellSvg, 4.6, -1.9, 1.5));
    jobs.push(add('stallR', () => stallSvg('#6a2a22'), 5.4, 0.9, 1.5));
    jobs.push(add(`stall${pal.banner}`, () => stallSvg(pal.banner), 5.6, -1.5, 1.5));
    // acampamento militar diante do portão
    const camp: [string, () => Svg, number, number][] = [
      [`tent${pal.banner}`, () => tentSvg(pal.banner), R + 4.2, -4.2],
      [`tent${pal.banner}`, () => tentSvg(pal.banner), R + 5.6, -5.4],
      [`tent${pal.banner}`, () => tentSvg(pal.banner), R + 4.0, -6.6],
      [`tent${pal.banner}`, () => tentSvg(pal.banner), R + 7.0, -4.0],
      [`tent${pal.banner}`, () => tentSvg(pal.banner), R + 6.8, -7.0],
      ['treb', trebuchetSvg, R + 3.4, -2.7],
      [`rack${pal.banner}`, () => weaponRackSvg(pal.banner), R + 5.4, -3.0],
      ['dummy', dummySvg, R + 6.6, -2.6],
      ['dummy', dummySvg, R + 7.4, -2.9],
      ['target', targetSvg, R + 8.4, -5.0],
      ['target', targetSvg, R + 8.6, -6.2],
    ];
    for (const [key, build, dx, dy] of camp) jobs.push(add(key, build, dx, dy, 1.5));
    this.fires.push([R + 5.2, -4.6, 18]);
    jobs.push(add('barrels', barrelsSvg, -3.0, -3.0, 1.5));
    jobs.push(add('cart', cartSvg, R + 1.6, 1.2, 1.5));
    for (const [dx, dy] of [
      [R - 1.4, 1.1],
      [R - 1.4, -1.1],
      [6.8, 1.0],
      [6.8, -0.9],
      [2.4, 1.3],
    ]) {
      jobs.push(add('lamp', lampSvg, dx, dy, 1.6));
    }
    jobs.push(add('hay', haySvg, R + 3.2, 4.6, 1.4));
    jobs.push(add('hay', haySvg, R + 3.6, 5.2, 1.4));
    for (let i = 0; i < 5; i++) {
      jobs.push(add('fx', () => fenceSvg('x'), R + 2.5 + i, 4.6, 1.4));
      jobs.push(add('fy', () => fenceSvg('y'), R + 2.3, 5.0 + i * 0.9, 1.4));
    }
    for (const plot of visiblePlots(this.input.levels).filter((p) => p.building === null)) {
      jobs.push(add(`plot${plot.size[0]}`, () => plotSvg(plot.size[0]), plot.dx, plot.dy, 1.2, -500));
    }

    // vegetação, distribuída evitando estradas, lotes, muralhas, campos e lago
    const r = rng(7 + tier);
    const blocked = (dx: number, dy: number, margin: number) => {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      // muralha + fosso
      if (dx > R - 1.4 && dx < R + 2.4 + margin && Math.abs(dy) < R + 2.4) return true;
      if (Math.abs(m - R) < 2.3 + margin) return true;
      if (dx > R + 2.5 && dx < R + 9.5 && dy < -1.8 && dy > -8) return true;
      if (dx > R - 2 && Math.abs(dy) < 2.2) return true;
      for (const p of visiblePlots(this.input.levels)) {
        const h = p.size[2] / 2 + 0.6 + margin;
        if (Math.abs(dx - p.dx) < h && Math.abs(dy - p.dy) < h) return true;
      }
      for (const c of COTTAGES) if (c.tier <= tier && Math.hypot(dx - c.dx, dy - c.dy) < 1.4 + margin) return true;
      for (const road of this.roads) {
        for (let i = 0; i < road.length - 1; i++) {
          if (distToSeg(dx, dy, road[i], road[i + 1]) < 1.1 + margin) return true;
        }
      }
      if (Math.hypot(dx - 3.7, dy + 0.5) < 2.6) return true;
      for (const f of spec.fields) if (Math.abs(dx - f.dx) < f.w / 2 + 0.5 && Math.abs(dy - f.dy) < f.d / 2 + 0.5) return true;
      if (Math.hypot(dx - spec.pond.dx, dy - spec.pond.dy) < spec.pond.r + 0.8) return true;
      if (dx > R + 2 && dx < R + 4 && dy > 4 && dy < 9.6) return true;
      return false;
    };
    const trees: [number, number, number][] = [];
    for (let i = 0; i < 1400 && trees.length < 330; i++) {
      const dx = (r() * 2 - 1) * (HALF - 0.6);
      const dy = (r() * 2 - 1) * (HALF - 0.6);
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      const inside = m < R - 1;
      // floresta densa nas bordas, bosques esparsos no prado, árvores de sombra na cidade
      const density = inside ? 0.16 : m > HALF - 6 ? 0.95 : m > R + 6 ? 0.35 : 0.12;
      if (r() > density) continue;
      if (blocked(dx, dy, inside ? 0.3 : 0)) continue;
      if (trees.some(([x, y]) => Math.hypot(x - dx, y - dy) < 0.75)) continue;
      trees.push([dx, dy, r()]);
    }
    for (const [dx, dy, v] of trees) {
      const pine = Math.max(Math.abs(dx), Math.abs(dy)) > HALF - 7 ? v < 0.65 : v < 0.25;
      const variant = Math.floor(v * 4);
      const scale = 0.9 + ((v * 37) % 1) * 0.35;
      const flip = (v * 113) % 1 > 0.5;
      if (pine) jobs.push(addArt('pine', dx, dy, scale, flip));
      else {
        const autumn = (v * 71) % 1 > 0.9;
        jobs.push(addArt(autumn ? 'autumn' : 'oak', dx, dy, scale, flip));
      }
    }
    for (let i = 0; i < 380; i++) {
      const dx = (r() * 2 - 1) * (HALF - 1);
      const dy = (r() * 2 - 1) * (HALF - 1);
      if (blocked(dx, dy, 0)) continue;
      if (trees.some(([x, y]) => Math.hypot(x - dx, y - dy) < 0.6)) continue;
      const k = r();
      if (k < 0.55) jobs.push(addArt('bush', dx, dy, 0.9 + k * 0.5, k > 0.3));
      else if (k < 0.75) jobs.push(add(`rock${Math.floor(k * 6)}`, () => rocksSvg(Math.floor(k * 6)), dx, dy, 1.4));
    }
    await Promise.all(jobs);

    // nuvens (sombras que passam) e moradores
    this.setupAmbient(R);
  }

  private async buildBuildings() {
    const pal = this.palette();
    for (const b of BUILDING_TYPES) {
      const level = this.input.levels[b];
      const stage = buildingStage(level);
      const plot = plotFor(b);
      const key =
        stage === 0
          ? `empty${b}`
          : b === 'town_hall'
            ? `th${stage}-${Math.min(level, 10)}-${pal.roof}`
            : `${b}${stage}-${pal.roof}`;
      const cur = this.buildingSprites.get(b);
      if (cur?.key === key) continue;
      const build = (): Svg => {
        const st = Math.max(1, stage) as 1 | 2 | 3;
        if (stage === 0) return plotSvg(plot.size[0]);
        switch (b) {
          case 'town_hall':
            return townHallSvg(st, level, pal);
          case 'warehouse':
            return warehouseSvg(st, pal);
          case 'farm':
            return farmSvg(st, pal);
          case 'sawmill':
            return sawmillSvg(st, pal);
          case 'quarry':
            return quarrySvg(st, pal);
          case 'gold_mine':
            return goldMineSvg(st, pal);
        }
      };
      let tex: Tex;
      let usesIllustration = false;
      if (stage > 0) {
        try { tex = await illustratedBuilding(b, stage as 1 | 2 | 3, this.input.civ.color); usesIllustration = true; }
        catch { tex = await raster(key, build, b === 'town_hall' ? 1.8 : 1.5); }
      } else tex = await raster(key, build, 1.5);
      if (this.destroyed) return;
      const [wx, wy] = P(plot.dx, plot.dy);
      const sprite = spriteOf(tex, wx, wy);
      sprite.zIndex = (plot.dx + plot.dy) * 100;
      if (cur) cur.sprite.destroy();
      this.objects.addChild(sprite);
      this.buildingSprites.set(b, { sprite, tex, key });
      if (b === 'town_hall') {
        this.chimneys = this.chimneys.filter((c) => c[2] < 150);
        this.fires = this.fires.filter((f) => !(f as [number, number, number] & { hall?: boolean }).hall);
        if (stage > 0 && !usesIllustration) {
          const fx = hallFx(stage as 1 | 2 | 3);
          for (const [x, y, z] of fx.smoke) this.chimneys.push([plot.dx + x, plot.dy + y, z]);
          for (const [x, y, z] of fx.fires) this.fires.push(Object.assign([plot.dx + x, plot.dy + y, z] as [number, number, number], { hall: true }));
        }
      }
    }
  }

  private async buildConstruction() {
    const q = this.input.queue;
    const key = q ? `${q.building}:${q.startedAt}` : null;
    if (key === this.constructionFor) return;
    if (this.construction) {
      this.construction.destroy({ children: true });
      this.construction = null;
    }
    this.constructionFor = key;
    if (!q) return;
    const plot = plotFor(q.building);
    const size = plotSize(plot, this.input.levels[q.building]) * 0.9;
    const tex = await raster(`scaf${size.toFixed(1)}`, () => scaffoldSvg(size), 1.4);
    const c = new Container();
    const [wx, wy] = P(plot.dx, plot.dy);
    c.addChild(spriteOf(tex, wx, wy));
    // trabalhadores martelando
    const worker = await raster('v-work', () => villagerSvg('#5b4a3a', true, 'none'), 2);
    for (const [ox, oy] of [
      [size / 2 + 0.3, 0.2],
      [0.3, size / 2 + 0.35],
    ]) {
      const [vx, vy] = P(plot.dx + ox, plot.dy + oy);
      const v = spriteOf(worker, vx, vy);
      v.label = 'worker';
      c.addChild(v);
    }
    // barra de progresso
    const bar = new Container();
    bar.label = 'bar';
    const top = this.buildingSprites.get(q.building);
    const by = top ? top.sprite.y - top.tex.oy + 10 : wy - 200;
    bar.position.set(wx, by);
    const bg = new Graphics().roundRect(-110, -18, 220, 36, 18).fill({ color: 0x1b1410, alpha: 0.85 }).stroke({ color: 0xd9ad48, width: 3 });
    const fill = new Graphics();
    fill.label = 'fill';
    const text = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 22, fontWeight: '700', fill: 0xfff3d0 }, resolution: 2 });
    text.anchor.set(0.5);
    text.label = 'text';
    bar.addChild(bg, fill, text);
    c.addChild(bar);
    c.zIndex = (plot.dx + plot.dy) * 100 + 1;
    this.objects.addChild(c);
    this.construction = c;
  }

  private async buildIndicators() {
    if (!this.arrowTex) this.arrowTex = await raster('arrow', arrowSvg, 2);
    for (const b of BUILDING_TYPES) {
      const show = this.input.upgradable.includes(b) && this.input.queue?.building !== b;
      let s = this.arrows.get(b);
      if (!show) {
        if (s) s.visible = false;
        continue;
      }
      const bs = this.buildingSprites.get(b);
      if (!bs) continue;
      if (!s) {
        s = spriteOf(this.arrowTex, 0, 0);
        s.scale.set(0.9 / this.arrowTex.res);
        this.ui.addChild(s);
        this.arrows.set(b, s);
      }
      s.visible = true;
      s.position.set(bs.sprite.x + 30, bs.sprite.y - bs.tex.oy + 40);
      (s as Sprite & { baseY?: number }).baseY = s.y;
    }
  }

  private setupAmbient(R: number) {
    for (const c of this.clouds) c.destroy();
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(this.cloudTex());
      s.anchor.set(0.5);
      s.alpha = 0.09;
      s.tint = 0x050805;
      s.scale.set(3 + i * 0.6, 1.6 + i * 0.3);
      s.position.set(WORLD_BOUNDS.x0 + ((i * 1700) % (WORLD_BOUNDS.x1 - WORLD_BOUNDS.x0)), -900 + i * 520);
      this.fx.addChild(s);
      this.clouds.push(s);
    }
    for (const w of this.walkers) w.sprite.destroy();
    this.walkers = [];
    const pal = this.palette();
    const peasants: [string, boolean, 'none' | 'sack' | 'basket'][] = [
      ['#5b4a3a', false, 'sack'],
      ['#4a4f3a', true, 'basket'],
      ['#3e4a52', false, 'none'],
      ['#6a4a3a', true, 'none'],
    ];
    const r = rng(99 + R);
    const peasantN = 4 + this.tier * 2;
    void (async () => {
      const ptex = await Promise.all(peasants.map(([c, h, k]) => raster(`v${c}${h}${k}`, () => villagerSvg(c, h, k), 2)));
      const stex = await Promise.all((['spear', 'shield', 'bow'] as const).map((w) => raster(`sol${pal.banner}${w}`, () => soldierSvg(pal.banner, w), 2)));
      if (this.destroyed) return;
      const spawn = (tex: Tex, w: Omit<Walker, 'sprite'>) => {
        const sprite = spriteOf(tex, 0, 0);
        this.objects.addChild(sprite);
        this.walkers.push({ sprite, ...w });
      };
      for (let i = 0; i < peasantN; i++) {
        const path = this.roads[Math.floor(r() * this.roads.length)];
        spawn(ptex[i % ptex.length], { path, seg: Math.floor(r() * (path.length - 1)), t: r(), dir: r() > 0.5 ? 1 : -1, speed: 0.5 + r() * 0.3, phase: r() * 10, pause: 0 });
      }
      // tropas marchando em coluna pela avenida principal
      const squads = 1 + this.tier;
      for (let q = 0; q < squads; q++) {
        const path = this.roads[q % 2 === 0 ? 0 : 1 + (q % (this.roads.length - 1))];
        const t0 = r();
        const dir = q % 2 ? -1 : 1;
        for (let i = 0; i < 4; i++) {
          spawn(stex[i % 2], { path, seg: 0, t: Math.max(0, Math.min(1, t0 - i * 0.07 * dir)), dir, speed: 0.62, phase: i * 1.7, pause: 0, drill: true });
        }
      }
      // sentinelas no passadiço das muralhas
      const posts: [number, number, number, number][] = [];
      for (let k = -R + 2.5; k <= R - 2.5; k += 4.5) {
        posts.push([k, -R, k + 1.6, -R], [-R, k, -R, k + 1.6], [k, R, k + 1.6, R]);
        if (Math.abs(k) > 3) posts.push([R, k, R, k + 1.4]);
      }
      for (const [x0, y0, x1, y1] of posts) {
        spawn(stex[r() > 0.5 ? 0 : 2], { path: [[x0, y0], [x1, y1]], seg: 0, t: r(), dir: r() > 0.5 ? 1 : -1, speed: 0.22, phase: r() * 10, pause: r() * 3, z: WALL_H });
      }
    })();
  }

  private softCircle(): Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(235,232,225,0.9)');
    g.addColorStop(1, 'rgba(235,232,225,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return Texture.from(c);
  }

  private cloudTex(): Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const x = 60 + r() * 136;
      const y = 80 + r() * 96;
      const rad = 40 + r() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    return Texture.from(c);
  }

  // ---- interação ----

  private applyCamera() {
    const cam = this.cam;
    const lim = WALL_HALF[(this.tier || 1) as 1 | 2 | 3] + 6;
    const [bx] = P(lim, -lim);
    const [, by] = P(lim, lim);
    cam.x = Math.max(-bx, Math.min(bx, cam.x));
    cam.y = Math.max(-by * 0.9, Math.min(by * 0.9, cam.y));
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    this.world.scale.set(cam.zoom);
    this.world.position.set(W / 2 - cam.x * cam.zoom, H / 2 - cam.y * cam.zoom);
  }

  private tap(sx: number, sy: number) {
    const w = this.cam.toWorld(sx, sy);
    let best: BuildingType | null = null;
    let bestZ = -Infinity;
    for (const [b, { sprite, tex }] of this.buildingSprites) {
      if (sprite.zIndex > bestZ && hitSprite(sprite, tex, w.x, w.y)) {
        best = b;
        bestZ = sprite.zIndex;
      }
    }
    this.onSelect(best);
  }

  /** Desliza a câmera para deixar o edifício acima do painel de detalhes. */
  private focusBuilding(b: BuildingType) {
    const bs = this.buildingSprites.get(b);
    if (!bs) return;
    const H = this.app.screen.height;
    const cx = bs.sprite.x;
    const cy = bs.sprite.y - bs.tex.oy * 0.35;
    this.focus = { x: cx, y: cy + (H * 0.1) / this.cam.zoom };
  }

  /** Projeção do topo de um edifício em coordenadas de tela (para painéis DOM). */
  screenAnchor(b: BuildingType) {
    const bs = this.buildingSprites.get(b);
    if (!bs) return null;
    return this.cam.toScreen(bs.sprite.x, bs.sprite.y - bs.tex.oy);
  }

  // ---- animação ----

  private tick(dt: number) {
    if (document.hidden) return;
    const s = dt / 1000;
    this.time += s;
    if (this.focus) {
      const k = 1 - Math.pow(0.0015, s);
      this.cam.x += (this.focus.x - this.cam.x) * k;
      this.cam.y += (this.focus.y - this.cam.y) * k;
      if (Math.hypot(this.focus.x - this.cam.x, this.focus.y - this.cam.y) < 1) this.focus = null;
      this.applyCamera();
    }
    // moradores
    for (const w of this.walkers) {
      if (w.pause > 0) {
        w.pause -= s;
        continue;
      }
      const a = w.path[w.seg];
      const b = w.path[w.seg + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      w.t += (w.dir * w.speed * s) / len;
      if (w.t > 1 || w.t < 0) {
        w.seg += w.dir;
        w.t = w.dir > 0 ? 0 : 1;
        if (w.seg < 0 || w.seg >= w.path.length - 1) {
          w.dir = (w.dir * -1) as 1 | -1;
          w.seg = Math.max(0, Math.min(w.path.length - 2, w.seg));
          w.t = w.dir > 0 ? 0 : 1;
          w.pause = w.drill ? 0.4 : 1 + Math.random() * 3;
          if (!w.drill && w.z === undefined && Math.random() < 0.5) w.path = this.roads[Math.floor(Math.random() * this.roads.length)];
          w.seg = Math.max(0, Math.min(w.path.length - 2, w.seg));
        }
        continue;
      }
      const dx = a[0] + (b[0] - a[0]) * w.t;
      const dy = a[1] + (b[1] - a[1]) * w.t;
      const off = w.z !== undefined ? 0 : w.drill ? 0.12 * Math.sin(w.phase) : Math.sin(w.phase) * 0.18;
      const [px, py] = P(dx + off, dy - off);
      const bob = Math.abs(Math.sin(this.time * (w.drill ? 10 : 9) + w.phase)) * 2.2;
      w.sprite.position.set(px, py - bob - (w.z ?? 0));
      const goingRight = (b[0] - a[0] - (b[1] - a[1])) * w.dir > 0;
      w.sprite.scale.x = (goingRight ? 1 : -1) * Math.abs(w.sprite.scale.y);
      w.sprite.zIndex = (dx + dy) * 100 + (w.z !== undefined ? 8 : 2);
    }
    // fumaça das chaminés
    if (Math.random() < s * 3.5 * Math.max(1, this.chimneys.length / 3)) {
      const c = this.chimneys[Math.floor(Math.random() * this.chimneys.length)];
      if (c) {
        const [x, y] = iso(c[0], c[1], c[2]);
        const g = new Sprite(this.puffTex);
        g.anchor.set(0.5);
        g.position.set(x, y);
        g.scale.set(0.25);
        g.alpha = 0.55;
        this.fx.addChild(g);
        this.puffs.push({ g, life: 0, vx: 6 + Math.random() * 6 });
      }
    }
    this.puffs = this.puffs.filter((p) => {
      p.life += s;
      p.g.y -= 18 * s;
      p.g.x += p.vx * s;
      p.g.scale.set(0.25 + p.life * 0.35);
      p.g.alpha = Math.max(0, 0.55 - p.life * 0.16);
      if (p.life > 3.4) {
        p.g.destroy();
        return false;
      }
      return true;
    });
    // chamas dos braseiros (partículas aditivas)
    for (const f of this.fires) {
      if (Math.random() > s * 9) continue;
      const [x, y] = iso(f[0], f[1], f[2]);
      const g = new Sprite(this.puffTex);
      g.anchor.set(0.5);
      g.blendMode = 'add';
      g.tint = Math.random() > 0.5 ? 0xff8a2a : 0xffc04a;
      g.position.set(x + (Math.random() - 0.5) * 8, y);
      g.scale.set(0.16 + Math.random() * 0.08);
      this.fx.addChild(g);
      this.flames.push({ g, life: 0, max: 0.45 + Math.random() * 0.35 });
    }
    this.flames = this.flames.filter((p) => {
      p.life += s;
      const k = p.life / p.max;
      p.g.y -= 46 * s;
      p.g.x += Math.sin(this.time * 12 + p.g.y) * 0.3;
      p.g.scale.set(Math.max(0.02, (0.2 - k * 0.16) * (1 + Math.sin(this.time * 30) * 0.05)));
      p.g.alpha = Math.max(0, 1 - k);
      if (k >= 1) {
        p.g.destroy();
        return false;
      }
      return true;
    });
    // sombras de nuvens
    for (const c of this.clouds) {
      c.x += 14 * s;
      c.y += 3 * s;
      if (c.x > WORLD_BOUNDS.x1 + 600) {
        c.x = WORLD_BOUNDS.x0 - 600;
        c.y = -1000 + Math.random() * 2000;
      }
    }
    // pássaros
    this.birdT -= s;
    if (this.birdT <= 0) {
      this.birdT = 14 + Math.random() * 12;
      this.birds?.destroy();
      const g = new Graphics();
      for (let i = 0; i < 5; i++) {
        const x = (i % 2) * 22 + i * 14;
        const y = Math.abs(i - 2) * 12;
        g.moveTo(x - 8, y - 4).quadraticCurveTo(x - 3, y - 7, x, y).quadraticCurveTo(x + 3, y - 7, x + 8, y - 4);
      }
      g.stroke({ color: 0x2b2b2b, width: 2.4, alpha: 0.8 });
      g.position.set(WORLD_BOUNDS.x0 * 0.6, -600 + Math.random() * 600);
      this.fx.addChild(g);
      this.birds = g;
    }
    if (this.birds) {
      this.birds.x += 120 * s;
      this.birds.y += 10 * s + Math.sin(this.time * 2) * 0.4;
      this.birds.scale.y = 0.85 + Math.sin(this.time * 10) * 0.15;
    }
    // obra em andamento
    if (this.construction && this.input.queue) {
      const q = this.input.queue;
      const frac = Math.min(1, Math.max(0, (this.input.now() - q.startedAt) / (q.endsAt - q.startedAt)));
      const bar = this.construction.getChildByLabel('bar') as Container | null;
      if (bar) {
        const fill = bar.getChildByLabel('fill') as Graphics;
        fill.clear().roundRect(-104, -12, 208 * frac, 24, 12).fill({ color: 0x7ed36f });
        const text = bar.getChildByLabel('text') as Text;
        const left = Math.max(0, Math.ceil((q.endsAt - this.input.now()) / 1000));
        const m = Math.floor(left / 60);
        text.text = `${NAMES[q.building]} · ${m ? `${m}m ` : ''}${left % 60}s`;
        bar.scale.set(Math.min(2.2, 0.7 / this.cam.zoom));
      }
      for (const ch of this.construction.children) {
        if (ch.label === 'worker') ch.scale.y = (1 / 2) * (1 - Math.abs(Math.sin(this.time * 6 + ch.x)) * 0.08);
      }
    }
    // seleção
    const sel = this.input.selected;
    this.selection.clear();
    this.label.visible = false;
    if (sel) {
      const plot = plotFor(sel);
      const h = plotSize(plot, this.input.levels[sel]) / 2 + 0.25;
      const pts = [P(plot.dx - h, plot.dy - h), P(plot.dx + h, plot.dy - h), P(plot.dx + h, plot.dy + h), P(plot.dx - h, plot.dy + h)];
      const pulse = 0.55 + Math.sin(this.time * 4) * 0.25;
      for (const [w, a] of [
        [16, 0.18 * pulse],
        [8, 0.35 * pulse],
        [3.5, 0.95],
      ] as const) {
        this.selection.poly(pts.flat()).stroke({ color: 0xffd36b, width: w, alpha: a, join: 'round' });
      }
      const bs = this.buildingSprites.get(sel);
      if (bs) {
        const level = this.input.levels[sel];
        this.labelText.text = `${NAMES[sel]}  ·  ${level ? `Nv ${level}` : 'construir'}`;
        const w = this.labelText.width + 48;
        this.labelBg.clear().roundRect(-w / 2, -26, w, 52, 26).fill({ color: 0x1b1410, alpha: 0.88 }).stroke({ color: 0xd9ad48, width: 3 });
        this.label.visible = true;
        const k = Math.min(1.8, 0.4 / this.cam.zoom);
        this.label.scale.set(k);
        this.label.position.set(bs.sprite.x, bs.sprite.y - bs.tex.oy - 34 * k + (this.input.queue?.building === sel ? -48 * k : 0));
      }
    }
    // indicadores de melhoria disponível
    for (const [b, a] of this.arrows) {
      const base = (a as Sprite & { baseY?: number }).baseY ?? a.y;
      a.alpha = b === sel ? 0 : 1;
      if (a.visible) a.y = base + Math.sin(this.time * 3) * 6;
    }
  }
}

function distToSeg(px: number, py: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t));
}

/** Andaimes de madeira cobrindo a obra. */
function scaffoldSvg(size: number): Svg {
  const s = new Svg('scaf');
  const h = size / 2;
  const H = 120 + size * 20;
  const pole = (x: number, y: number) => {
    const [a, b] = iso(x, y, 0);
    s.line([a, b], [a, b - H], '#8a6240', 3.2);
  };
  for (const t of [-1, -0.33, 0.33, 1]) {
    pole(t * h, h);
    pole(h, t * h);
  }
  for (let z = 30; z < H; z += 34) {
    s.line(iso(-h, h, z), iso(h, h, z), '#a07a4a', 4.2);
    s.line(iso(h, h, z), iso(h, -h, z), '#7a5232', 4.2);
  }
  s.line(iso(-h, h, 20), iso(h, h, H - 10), '#7a5232', 2.4, 'opacity="0.8"');
  s.line(iso(h, h, 20), iso(h, -h, H - 10), '#6b4a2c', 2.4, 'opacity="0.8"');
  // lona
  const tarp = [iso(h * 0.2, h, 40), iso(h, h, 40), iso(h, h, 100), iso(h * 0.2, h, 100)];
  s.poly(tarp, '#d8cdb0', 'opacity="0.85"');
  const [cx, cy] = iso(h, -h * 0.2, H);
  s.line([cx, cy], [cx - 40, cy - 20], '#5b3b22', 4);
  s.line([cx - 38, cy - 20], [cx - 38, cy + 30], '#c9b48a', 1.2);
  s.raw(`<rect x="${cx - 46}" y="${cy + 30}" width="16" height="10" fill="#cfc6b4"/>`);
  s.extend(cx - 50, cy - 24);
  return s;
}

function arrowSvg(): Svg {
  const s = new Svg('arrow');
  // medalhão de ferro com aro dourado e divisa verde
  s.ellipse(0, 2, 27, 27, '#0b0a08', 'opacity="0.45"');
  s.ellipse(0, -2, 25, 25, s.linear('arrR', [[0, '#f0d27a'], [1, '#8a6420']]));
  s.ellipse(0, -2, 20, 20, s.linear('arrB', [[0, '#3a3530'], [1, '#15120f']]));
  s.path('M0 -16 L13 -1 L6 -1 L6 11 L-6 11 L-6 -1 L-13 -1 Z', s.linear('arrG', [[0, '#a8e08a'], [1, '#4e9a3e']]), 'stroke="#10200c" stroke-width="1.2"');
  return s;
}

