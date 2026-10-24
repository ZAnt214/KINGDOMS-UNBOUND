import { useEffect, useRef } from 'react';
import { CIVILIZATION_BY_ID } from '../../../shared/rules';
import { type Biome, BIOME_COLORS, biomeAt } from '../../../shared/terrain';
import type { Kingdom, MapCity } from '../api';
import { Camera, fitCanvas } from '../camera';
import { diamond, mapCastle, mountain, tree } from '../draw';

const TW = 64;
const TH = 32;
const iso = (tx: number, ty: number) => ({ x: ((tx - ty) * TW) / 2, y: ((tx + ty) * TH) / 2 });
const fromIso = (wx: number, wy: number) => ({ tx: (wx / (TW / 2) + wy / (TH / 2)) / 2, ty: (wy / (TH / 2) - wx / (TW / 2)) / 2 });

const BIOMES: Biome[] = ['deep_water', 'water', 'sand', 'grass', 'forest', 'hills', 'mountain'];

export interface MapFocus {
  x: number;
  y: number;
  nonce: number;
}

interface Props {
  kingdom: Kingdom;
  cities: MapCity[];
  myCityId: number;
  myAllianceId: number | null;
  selectedCityId: number | null;
  focus: MapFocus;
  onSelectCity: (c: MapCity | null, tile: { x: number; y: number; biome: Biome }) => void;
  onCenter: (x: number, y: number) => void;
}

export function WorldMap(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const camRef = useRef<Camera | null>(null);
  const dirty = useRef(true);
  dirty.current = true;

  useEffect(() => {
    const { kingdom } = live.current;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const grid = new Uint8Array(kingdom.width * kingdom.height);
    for (let y = 0; y < kingdom.height; y++)
      for (let x = 0; x < kingdom.width; x++)
        grid[y * kingdom.width + x] = BIOMES.indexOf(biomeAt(x, y, kingdom.seed, kingdom.width, kingdom.height));
    const biome = (x: number, y: number) => BIOMES[grid[y * kingdom.width + x]];

    const cam = new Camera(
      canvas,
      0.12,
      2,
      () => (dirty.current = true),
      (sx, sy) => {
        const w = cam.toWorld(sx, sy);
        // Tocar perto da base de um castelo seleciona a cidade (tolerante a toques imprecisos).
        const t = fromIso(w.x, w.y + TH * 0.4);
        let best: MapCity | null = null;
        let bestD = 1.6;
        for (const c of live.current.cities) {
          const d = Math.hypot(c.x + 0.5 - t.tx, c.y + 0.5 - t.ty);
          if (d < bestD) {
            best = c;
            bestD = d;
          }
        }
        const tx = Math.max(0, Math.min(kingdom.width - 1, Math.floor(fromIso(w.x, w.y).tx)));
        const ty = Math.max(0, Math.min(kingdom.height - 1, Math.floor(fromIso(w.x, w.y).ty)));
        live.current.onSelectCity(best, { x: tx, y: ty, biome: biome(tx, ty) });
        dirty.current = true;
      },
    );
    camRef.current = cam;
    cam.zoom = 0.9;
    const f = live.current.focus;
    const p0 = iso(f.x + 0.5, f.y + 0.5);
    cam.centerOn(p0.x, p0.y);

    let raf = 0;
    let lastAnim = 0;
    let lastCenter = '';
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      const animate = t - lastAnim > 120;
      if (!dirty.current && !animate) return;
      dirty.current = false;
      if (animate) lastAnim = t;
      const { cities, myCityId, myAllianceId, selectedCityId } = live.current;
      const dpr = fitCanvas(canvas);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BIOME_COLORS.deep_water;
      ctx.fillRect(0, 0, W, H);
      const z = cam.zoom;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));

      // Culling: apenas tiles na área visível.
      const corners = [cam.toWorld(0, 0), cam.toWorld(W, 0), cam.toWorld(0, H), cam.toWorld(W, H)].map((c) => fromIso(c.x, c.y));
      const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.tx))) - 1);
      const maxX = Math.min(kingdom.width - 1, Math.ceil(Math.max(...corners.map((c) => c.tx))) + 1);
      const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.ty))) - 1);
      const maxY = Math.min(kingdom.height - 1, Math.ceil(Math.max(...corners.map((c) => c.ty))) + 1);

      const paths = BIOMES.map(() => new Path2D());
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const p = iso(x + 0.5, y + 0.5);
          diamond(paths[grid[y * kingdom.width + x]], p.x, p.y, TW / 2 + 0.6, TH / 2 + 0.6);
        }
      BIOMES.forEach((b, i) => {
        ctx.fillStyle = BIOME_COLORS[b];
        ctx.fill(paths[i]);
      });

      // Grade sutil quando aproximado
      if (z > 0.7) {
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.lineWidth = 1 / z;
        const gridPath = new Path2D();
        for (let y = minY; y <= maxY; y++)
          for (let x = minX; x <= maxX; x++) {
            const p = iso(x + 0.5, y + 0.5);
            diamond(gridPath, p.x, p.y, TW / 2, TH / 2);
          }
        ctx.stroke(gridPath);
      }

      // Decorações e cidades em ordem de profundidade (LOD por zoom)
      const byTile = new Map<number, MapCity>();
      for (const c of cities) byTile.set(c.y * kingdom.width + c.x, c);
      for (let d = minX + minY; d <= maxX + maxY; d++) {
        for (let x = Math.max(minX, d - maxY); x <= Math.min(maxX, d - minY); x++) {
          const y = d - x;
          const p = iso(x + 0.5, y + 0.5);
          const city = byTile.get(y * kingdom.width + x);
          if (city) {
            const civ = CIVILIZATION_BY_ID[city.civilization];
            if (city.cityId === selectedCityId || city.cityId === myCityId) {
              ctx.strokeStyle = city.cityId === selectedCityId ? '#ffe28a' : 'rgba(255,226,138,0.55)';
              ctx.lineWidth = 3 / Math.max(0.5, z);
              ctx.beginPath();
              diamond(ctx, p.x, p.y, TW * 1.1, TH * 1.1);
              ctx.stroke();
            }
            mapCastle(ctx, p.x, p.y, TW * 0.55, civ?.color ?? '#777', civ?.accent ?? '#fff', city.hallLevel, t);
            continue;
          }
          if (z < 0.3) continue;
          const b = biome(x, y);
          const h = (x * 73856093) ^ (y * 19349663);
          if (b === 'forest') {
            tree(ctx, p.x - 10, p.y + 2, 22, '#2f6b35');
            if (h & 1) tree(ctx, p.x + 9, p.y - 2, 18, '#376f37');
          } else if (b === 'mountain' && (h & 3) !== 0) {
            mountain(ctx, p.x, p.y + 6, 34);
          } else if (b === 'hills' && (h & 7) === 0) {
            mountain(ctx, p.x, p.y + 4, 18);
          }
        }
      }

      // Rótulos em espaço de tela
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (z >= 0.35) {
        ctx.textAlign = 'center';
        ctx.font = '600 11px system-ui, sans-serif';
        for (const c of cities) {
          if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY) continue;
          const p = iso(c.x + 0.5, c.y + 0.5);
          const s = cam.toScreen(p.x, p.y + TH * 0.55);
          const label = `${c.allianceTag ? `[${c.allianceTag}] ` : ''}${c.name}`;
          const w = ctx.measureText(label).width + 12;
          const ally = myAllianceId !== null && c.allianceId === myAllianceId;
          ctx.fillStyle = c.cityId === myCityId ? 'rgba(242,193,78,0.95)' : ally ? 'rgba(60,120,200,0.9)' : 'rgba(27,20,16,0.78)';
          ctx.beginPath();
          ctx.roundRect(s.x - w / 2, s.y, w, 17, 8);
          ctx.fill();
          ctx.fillStyle = c.cityId === myCityId ? '#1b1410' : '#fff';
          ctx.fillText(label, s.x, s.y + 12.5);
        }
      }

      const center = fromIso(cam.x, cam.y);
      const key = `${Math.floor(center.tx)},${Math.floor(center.ty)}`;
      if (key !== lastCenter) {
        lastCenter = key;
        live.current.onCenter(Math.floor(center.tx), Math.floor(center.ty));
      }
    };
    raf = requestAnimationFrame(draw);
    const onResize = () => (dirty.current = true);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      cam.destroy();
      camRef.current = null;
    };
  }, [props.kingdom.id]);

  // Centralizar quando o foco muda (links de coordenadas, "minha cidade").
  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    const p = iso(props.focus.x + 0.5, props.focus.y + 0.5);
    cam.centerOn(p.x, p.y);
    if (cam.zoom < 0.6) cam.zoom = 0.9;
    dirty.current = true;
  }, [props.focus.nonce]);

  return <canvas ref={canvasRef} className="stage" aria-label="Mapa do reino" />;
}
