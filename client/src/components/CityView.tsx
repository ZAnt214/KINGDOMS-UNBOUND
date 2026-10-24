import { useEffect, useRef } from 'react';
import { BUILDING_TYPES, BUILDINGS, type BuildingType, type CivilizationDef } from '../../../shared/rules';
import type { CityState } from '../api';
import { Camera, fitCanvas } from '../camera';
import { cityBuilding, diamond, isoBox, pyramidRoof, scaffolding, shade, tree } from '../draw';
import { CITIZENS, citizenFrame, drawCitizen, roleLabel } from '../livingCitizens';

const TW = 64;
const TH = 32;
const GRID = 14;
const iso = (tx: number, ty: number) => ({ x: ((tx - ty) * TW) / 2, y: ((tx + ty) * TH) / 2 });

export const CITY_SLOTS: Record<BuildingType, { tx: number; ty: number; size: number }> = {
  town_hall: { tx: 7, ty: 7, size: 1.45 },
  warehouse: { tx: 3, ty: 3, size: 1 },
  farm: { tx: 7.8, ty: 2.6, size: 1.05 },
  quarry: { tx: 2.6, ty: 7.8, size: 1 },
  sawmill: { tx: 6.6, ty: 11.6, size: 1 },
  gold_mine: { tx: 11.2, ty: 11.2, size: 1 },
};

// Decoração determinística em volta da muralha.
const TREES: { tx: number; ty: number; s: number }[] = [];
for (let i = 0; i < 70; i++) {
  const a = (i * 137.5 * Math.PI) / 180;
  const r = GRID / 2 + 1.2 + ((i * 7) % 5) * 0.6;
  TREES.push({ tx: GRID / 2 + Math.cos(a) * r, ty: GRID / 2 + Math.sin(a) * r, s: 0.8 + ((i * 13) % 7) / 14 });
}

interface Props {
  state: CityState;
  civ: CivilizationDef;
  selected: BuildingType | null;
  onSelect: (b: BuildingType | null) => void;
  now: () => number;
}

export function CityView({ state, civ, selected, onSelect, now }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ state, civ, selected, onSelect, now });
  props.current = { state, civ, selected, onSelect, now };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = 0;
    const center = iso(GRID / 2, GRID / 2);
    let selectedCitizenId: string | null = null;

    const hitTest = (sx: number, sy: number): BuildingType | null => {
      const w = cam.toWorld(sx, sy);
      let best: BuildingType | null = null;
      let bestD = Infinity;
      for (const b of BUILDING_TYPES) {
        const slot = CITY_SLOTS[b];
        const p = iso(slot.tx, slot.ty);
        const dx = (w.x - p.x) / (TW * slot.size);
        const dy = (w.y - (p.y - TH * 0.9 * slot.size)) / (TH * 2.2 * slot.size);
        const d = dx * dx + dy * dy;
        if (d < 0.45 && d < bestD) {
          best = b;
          bestD = d;
        }
      }
      return best;
    };

    // Personagens são clicáveis, sem roubar a seleção dos edifícios ao redor.
    const selectAt = (sx: number, sy: number) => {
      const w = cam.toWorld(sx, sy);
      const now = performance.now();
      const nearest = CITIZENS.map((npc) => {
        const f = citizenFrame(npc, now);
        const p = iso(f.tx, f.ty);
        const d = Math.hypot((w.x - p.x) / 19, (w.y - (p.y - 22)) / 28);
        return { npc, d };
      }).sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < 1) {
        selectedCitizenId = nearest.npc.id;
        props.current.onSelect(null);
      } else {
        selectedCitizenId = null;
        props.current.onSelect(hitTest(sx, sy));
      }
    };
    const cam = new Camera(
      canvas,
      0.45,
      2.2,
      () => {},
      selectAt,
    );
    cam.centerOn(center.x, center.y - 20);
    cam.zoom = Math.min(1.1, Math.max(0.5, canvas.clientWidth / (GRID * TW * 0.95)));

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || t - last < 33) return; // ~30 fps para poupar bateria
      last = t;
      const { state, civ, selected } = props.current;
      const dpr = fitCanvas(canvas);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#30512b');
      sky.addColorStop(1, '#22391f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (W / 2 - cam.x * cam.zoom), dpr * (H / 2 - cam.y * cam.zoom));

      // Gramado externo + terreno da cidade
      const ground = new Path2D();
      for (let ty = -4; ty < GRID + 4; ty++)
        for (let tx = -4; tx < GRID + 4; tx++) {
          const p = iso(tx + 0.5, ty + 0.5);
          diamond(ground, p.x, p.y, TW / 2 + 0.5, TH / 2 + 0.5);
        }
      ctx.fillStyle = '#5f8f3e';
      ctx.fill(ground);
      const inner = new Path2D();
      const alt = new Path2D();
      for (let ty = 0; ty < GRID; ty++)
        for (let tx = 0; tx < GRID; tx++) {
          const p = iso(tx + 0.5, ty + 0.5);
          diamond((tx + ty) % 2 ? alt : inner, p.x, p.y, TW / 2 + 0.5, TH / 2 + 0.5);
        }
      ctx.fillStyle = '#79a650';
      ctx.fill(inner);
      ctx.fillStyle = '#74a04c';
      ctx.fill(alt);

      // Estradas da prefeitura para cada edifício
      const hall = iso(CITY_SLOTS.town_hall.tx, CITY_SLOTS.town_hall.ty);
      ctx.strokeStyle = '#c7ad7a';
      ctx.lineCap = 'round';
      ctx.lineWidth = 14;
      for (const b of BUILDING_TYPES) {
        if (b === 'town_hall') continue;
        const p = iso(CITY_SLOTS[b].tx, CITY_SLOTS[b].ty);
        ctx.beginPath();
        ctx.moveTo(hall.x, hall.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      const gate = iso(GRID, GRID / 2);
      ctx.beginPath();
      ctx.moveTo(hall.x, hall.y);
      ctx.lineTo(gate.x, gate.y);
      ctx.stroke();
      ctx.fillStyle = '#d5bd8a';
      ctx.beginPath();
      diamond(ctx, hall.x, hall.y, TW * 1.4, TH * 1.4);
      ctx.fill();

      // Muralha (costas primeiro para profundidade correta)
      const wallColor = '#b0a48c';
      const wallSeg = (tx: number, ty: number) => {
        const p = iso(tx, ty);
        isoBox(ctx, p.x, p.y, TW * 0.26, TH * 0.26, 16, wallColor);
      };
      for (let i = 0; i <= GRID; i += 0.5) wallSeg(i, 0);
      for (let i = 0.5; i <= GRID; i += 0.5) wallSeg(0, i);

      // Árvores de trás e edifícios em ordem de profundidade
      type Item = { depth: number; draw: () => void };
      const items: Item[] = [];
      for (const tr of TREES) {
        const p = iso(tr.tx, tr.ty);
        items.push({ depth: tr.tx + tr.ty, draw: () => tree(ctx, p.x, p.y, 34 * tr.s, '#3f7a3a') });
      }
      for (const b of BUILDING_TYPES) {
        const slot = CITY_SLOTS[b];
        const p = iso(slot.tx, slot.ty);
        const level = state.levels[b];
        const building = state.queue?.building === b;
        items.push({
          depth: slot.tx + slot.ty,
          draw: () => {
            if (selected === b) {
              ctx.strokeStyle = '#ffe28a';
              ctx.lineWidth = 3;
              ctx.beginPath();
              diamond(ctx, p.x, p.y, TW * 1.05 * slot.size, TH * 1.05 * slot.size);
              ctx.stroke();
            }
            cityBuilding(ctx, b, p.x, p.y, TW * 0.82 * slot.size, level, civ.color, civ.accent, t);
            if (building) scaffolding(ctx, p.x, p.y - 4, TW * 0.7 * slot.size, t);
          },
        });
      }
      // Oito moradores originais com movimento, trabalho e patrulha.
      // Eles são decoração animada local — a simulação econômica/militar
      // continua exclusivamente autoritativa no servidor.
      for (const npc of CITIZENS) {
        const f = citizenFrame(npc, t);
        const p = iso(f.tx, f.ty);
        items.push({
          depth: f.tx + f.ty + 0.12,
          draw: () => drawCitizen(ctx, f, p.x, p.y, selectedCitizenId === npc.id),
        });
      }
      // Torres dos cantos
      for (const [tx, ty] of [
        [0, 0],
        [GRID, 0],
        [0, GRID],
        [GRID, GRID],
      ] as const) {
        const p = iso(tx, ty);
        items.push({
          depth: tx + ty + 0.1,
          draw: () => {
            isoBox(ctx, p.x, p.y, 14, 7, 34, shade(wallColor, 0.05));
            pyramidRoof(ctx, p.x, p.y - 34, 16, 8, 18, civ.color);
          },
        });
      }
      items.sort((a, b) => a.depth - b.depth);
      for (const it of items) it.draw();
      for (let i = 0; i <= GRID; i += 0.5) if (Math.abs(i - GRID / 2) > 0.8) wallSeg(GRID, i);
      for (let i = 0; i < GRID; i += 0.5) wallSeg(i, GRID);

      // Rótulos em espaço de tela (nítidos em qualquer zoom)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center';
      ctx.font = '600 11px system-ui, sans-serif';
      for (const b of BUILDING_TYPES) {
        const slot = CITY_SLOTS[b];
        const p = iso(slot.tx, slot.ty);
        const s = cam.toScreen(p.x, p.y + TH * 0.9 * slot.size);
        const level = state.levels[b];
        const label = level === 0 ? `${BUILDINGS[b].name} · construir` : `${BUILDINGS[b].name} · Nv ${level}`;
        const w = ctx.measureText(label).width + 14;
        ctx.fillStyle = selected === b ? 'rgba(242,193,78,0.95)' : 'rgba(27,20,16,0.78)';
        ctx.beginPath();
        ctx.roundRect(s.x - w / 2, s.y, w, 18, 9);
        ctx.fill();
        ctx.fillStyle = selected === b ? '#1b1410' : '#f6ead0';
        ctx.fillText(label, s.x, s.y + 13);
        if (state.queue?.building === b) {
          const q = state.queue;
          const frac = Math.min(1, Math.max(0, (props.current.now() - q.startedAt) / (q.endsAt - q.startedAt)));
          ctx.fillStyle = 'rgba(27,20,16,0.85)';
          ctx.fillRect(s.x - 30, s.y + 21, 60, 6);
          ctx.fillStyle = '#7ed36f';
          ctx.fillRect(s.x - 29, s.y + 22, 58 * frac, 4);
        }
      }
      // Apenas o NPC selecionado recebe nome e atividade: não poluir o mapa.
      const active = selectedCitizenId ? CITIZENS.find((n) => n.id === selectedCitizenId) : null;
      if (active) {
        const f = citizenFrame(active, t);
        const p = iso(f.tx, f.ty);
        const s = cam.toScreen(p.x, p.y - 58);
        const label = f.name + ' · ' + (f.moving ? 'Caminhando' : roleLabel[f.role]);
        ctx.font = '600 12px system-ui, sans-serif';
        const w = ctx.measureText(label).width + 26;
        ctx.fillStyle = 'rgba(35,28,23,0.94)';
        ctx.strokeStyle = '#cba65e';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.roundRect(s.x - w / 2, s.y - 8, w, 28, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f4e4bd';
        ctx.textAlign = 'center';
        ctx.fillText(label, s.x, s.y + 10);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      cam.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} className="stage" aria-label="Cidade (toque em um edifício)" />;
}
