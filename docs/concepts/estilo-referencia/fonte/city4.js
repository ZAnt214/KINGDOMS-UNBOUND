// Cidade fiel às referências: pedra clara em blocos grandes, cúpulas azuis foscas, estandartes azuis com ouro,
// muralha com passadiço pêssego e pilares arredondados, produção em fileiras, tropas grandes.
import * as R from './rok.js';
import * as TX from './texd.js';
import { win, door, barrels, box, horse } from './city2.js';
const { THREE, M } = R;
const G = () => new THREE.Group();

// ---------- materiais da referência ----------
const tm = (t, bs, o = {}) => R.M('#ffffff', { map: t.map, bumpMap: t.bump, bumpScale: bs, ...o });
export const RM = {
  stone: () => tm(TX.masonry('#d4c2a4', 150, 64), 2.4, { roughness: 0.9 }),
  stoneD: () => tm(TX.masonry('#b4a288', 120, 56), 2.4, { roughness: 0.92 }),
  wallStone: () => tm(TX.masonry('#c9c4ba', 170, 80), 2.6, { roughness: 0.9 }),
  peach: () => tm(TX.plaster('#e6a57a'), 0.8, { roughness: 0.85 }),
  peachL: () => tm(TX.plaster('#efbd94'), 0.8, { roughness: 0.85 }),
  dome: () => { const t = TX.rooftiles('#4f78a0'); const m = t.map.clone(), b = t.bump.clone(); for (const x of [m, b]) { x.repeat.set(10, 4); x.needsUpdate = true; } return R.M('#ffffff', { map: m, bumpMap: b, bumpScale: 0.6, roughness: 0.55 }); },
  blue: () => M('#2c5285', { roughness: 0.75 }),
  gold: () => M('#e2b24a', { metalness: 0.55, roughness: 0.38 }),
  wood: () => tm(TX.planks('#9a6a3e'), 1.6, { roughness: 0.85 }),
  woodD: () => tm(TX.planks('#6e4a2a'), 1.6, { roughness: 0.85 }),
  roofWood: () => tm(TX.planks('#a8683e'), 1.6, { roughness: 0.8 }),
  pave: () => tm(TX.masonry('#c8bea9', 110, 110), 1.2, { roughness: 0.95 }),
  rockBlue: () => M('#7d8da3', { flatShading: true, roughness: 0.8 }),
  dirt: () => M('#9a7e58', { roughness: 1 }),
  dark: () => M('#1e1914', { roughness: 0.9 }),
};
// UV com escala maior para blocos visíveis
const rb = (w, h, d, r = 0.22) => R.rbox(w, h, d, r * 4, 7);

function blk(g, w, h, d, mat, x, y, z, ry = 0) {
  const m = R.mesh(rb(w, h, d), mat, x, y + h / 2, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}
/** Plinto escalonado de pedra (como os lotes das referências). */
function plinth(g, w, d, steps = 2) {
  for (let i = 0; i < steps; i++) blk(g, w - i * 0.8, 0.45, d - i * 0.8, RM.stoneD(), 0, i * 0.45, 0);
  { const r = R.rng(Math.round(w * 7 + d)); const pts = []; for (let i = 0; i < 5; i++) { const side = Math.floor(r() * 4), t = (r() - 0.5) * 0.8; pts.push(side < 2 ? [t * w, (side ? 1 : -1) * (d / 2 + 0.5)] : [(side === 2 ? 1 : -1) * (w / 2 + 0.5), t * d]); } bushes(g, pts, 1.1); }
  return steps * 0.45;
}
/** Estandarte vertical azul com borda dourada. */
let bTex = null;
function bannerTex() {
  if (bTex) return bTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 160;
  const t = c.getContext('2d');
  t.fillStyle = '#e2b24a'; t.fillRect(0, 0, 64, 160);
  t.fillStyle = '#2a4f86'; t.fillRect(5, 6, 54, 148);
  t.fillStyle = 'rgba(255,255,255,0.08)'; t.fillRect(5, 6, 18, 148);
  // emblema: sol de oito raios (Coroa de Auren)
  t.fillStyle = '#e2b24a'; t.save(); t.translate(32, 58);
  for (let i = 0; i < 8; i++) { t.rotate(Math.PI / 4); t.beginPath(); t.moveTo(-4, 0); t.lineTo(0, -20); t.lineTo(4, 0); t.fill(); }
  t.beginPath(); t.arc(0, 0, 9, 0, 7); t.fill(); t.fillStyle = '#2a4f86'; t.beginPath(); t.arc(0, 0, 5, 0, 7); t.fill(); t.restore();
  bTex = new THREE.CanvasTexture(c); bTex.colorSpace = THREE.SRGBColorSpace;
  return bTex;
}
function banner(g, x, y, z, ry = 0, w = 1.3, h = 3.2) {
  const geo = new THREE.PlaneGeometry(w, h, 1, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setZ(i, Math.sin((yy / h) * 3) * 0.05); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, R.painted(new THREE.MeshStandardMaterial({ map: bannerTex(), roughness: 0.8, side: THREE.DoubleSide })));
  m.position.set(x, y - h / 2, z);
  m.rotation.y = ry;
  m.castShadow = true;
  g.add(m);
  const rod = R.mesh(new THREE.CylinderGeometry(0.06, 0.06, w + 0.4, 6), RM.gold(), x, y + 0.05, z);
  rod.rotation.z = Math.PI / 2; rod.rotation.y = ry;
  g.add(rod);
}
/** Cúpula azul fosca com aro e pináculo. */
function dome(g, r, x, y, z, finial = true) {
  R.cylinder(g, r * 1.06, 0.35, RM.stone(), x, y - 0.35, z, 32);
  const geo = new THREE.SphereGeometry(r, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(1, 1.05, 1);
  // UV para as telhas acompanharem a curvatura
  g.add(R.mesh(geo, RM.dome(), x, y, z));
  if (finial) {
    g.add(R.mesh(new THREE.SphereGeometry(r * 0.12, 12, 8), RM.gold(), x, y + r * 1.05 + r * 0.06, z));
    g.add(R.mesh(new THREE.ConeGeometry(r * 0.05, r * 0.4, 8), RM.gold(), x, y + r * 1.05 + r * 0.3, z));
  }
}
/** Torreta redonda com cupulinha azul. */
function turret(g, x, z, r, h, y0 = 0, cap = 'dome') {
  R.cylinder(g, r * 1.12, 0.6, RM.stoneD(), x, y0, z, 20);
  R.cylinder(g, r, h, RM.stone(), x, y0 + 0.6, z, 20);
  R.cylinder(g, r * 1.12, 0.35, RM.stone(), x, y0 + h + 0.6, z, 20);
  if (cap === 'dome') dome(g, r * 0.95, x, y0 + h + 1.0, z);
  else if (cap === 'crown') R.merlonsRingAt(g, x, z, r * 1.02, y0 + h + 0.95, RM.stone(), Math.round(r * 6), 0.5, 0.6);
}
function bushes(g, pts, s = 1) {
  const geo = new THREE.IcosahedronGeometry(0.5, 2);
  const m = new THREE.InstancedMesh(geo, M('#ffffff', { roughness: 0.95 }), pts.length * 3);
  const o = new THREE.Object3D(); const c = new THREE.Color(); let k = 0;
  for (const [x, z] of pts) for (let i = 0; i < 3; i++) {
    o.position.set(x + Math.cos(i * 2.1) * 0.4 * s, 0.3 * s, z + Math.sin(i * 2.1) * 0.4 * s);
    o.scale.setScalar(s * (0.8 + (i % 2) * 0.35)); o.updateMatrix(); m.setMatrixAt(k, o.matrix);
    m.setColorAt(k, c.set(['#5f8f34', '#6f9c3a', '#557f30'][(k + i) % 3])); k++;
  }
  m.castShadow = true; m.receiveShadow = true; g.add(m);
}
function archWin(g, x, y, z, ry, w = 0.9, h = 1.6) {
  const p = G();
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 2 });
  p.add(R.mesh(geo, RM.dark(), 0, 0, 0));
  p.position.set(x, y, z); p.rotation.y = ry; g.add(p);
}

// ---------- muralha da referência ----------
export function walls(half) {
  const g = G();
  const H = 7.2, T = 5.2;
  const seg = (x, z, len, rot) => {
    const s = G();
    blk(s, len, H, T, RM.wallStone(), 0, 0, 0);
    // passadiço pêssego rebaixado entre os parapeitos
    blk(s, len, 0.3, T - 1.6, RM.peach(), 0, H - 0.05, 0);
    for (const sd of [-1, 1]) {
      blk(s, len, 1.5, 0.8, RM.wallStone(), 0, H, sd * (T / 2 - 0.4));
      // pilares arredondados (pêssego) a cada 4 m
      for (let k = -len / 2 + 2; k < len / 2 - 1; k += 4) {
        R.cylinder(s, 0.55, 2.6, RM.peachL(), k, H - 0.4, sd * (T / 2 - 0.1), 16);
        s.add(R.mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), RM.peachL(), k, H + 2.2, sd * (T / 2 - 0.1)));
      }
    }
    // estandartes nos dois lados
    for (let k = -len / 2 + 6; k < len / 2 - 3; k += 12) for (const sd of [-1, 1]) banner(s, k, H - 0.5, sd * (T / 2 + 0.06), sd > 0 ? 0 : Math.PI, 1.4, 3.6);
    // degrau de base
    blk(s, len, 0.6, T + 0.8, RM.stoneD(), 0, 0, 0);
    s.position.set(x, 0, z); s.rotation.y = rot; g.add(s);
  };
  const L = half * 2;
  seg(0, -half, L, 0);
  seg(-half, 0, L, Math.PI / 2);
  seg(half, 0, L, -Math.PI / 2);
  seg(-half / 2 - 5, half, L / 2 - 10, 0);
  seg(half / 2 + 5, half, L / 2 - 10, 0);
  // bastiões quadrados nos cantos
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
    blk(g, 8.5, H + 1.6, 8.5, RM.wallStone(), x, 0, z);
    blk(g, 7, 0.3, 7, RM.peach(), x, H + 1.55, z);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      R.cylinder(g, 0.75, 3, RM.peachL(), x + px * 3.6, H + 0.8, z + pz * 3.6, 16);
      g.add(R.mesh(new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), RM.peachL(), x + px * 3.6, H + 3.8, z + pz * 3.6));
    }
  }
  // portão: dois bastiões e arco
  const gate = G();
  for (const x of [-5.5, 5.5]) {
    blk(gate, 5, H + 3, 7, RM.wallStone(), x, 0, 0);
    blk(gate, 4, 0.3, 6, RM.peach(), x, H + 2.95, 0);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      R.cylinder(gate, 0.6, 2.6, RM.peachL(), x + px * 2, H + 2.4, pz * 3, 14);
      gate.add(R.mesh(new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), RM.peachL(), x + px * 2, H + 5, pz * 3));
    }
    banner(gate, x, H + 1.8, 3.56, 0, 1.8, 5);
  }
  blk(gate, 6, H + 1, 6, RM.wallStone(), 0, 0, 0);
  archWin(gate, 0, 0, 3.0, 0, 3.6, 5.2);
  gate.position.set(0, 0, half);
  g.add(gate);
  return g;
}

// ---------- castelo (prefeitura) ----------
export function cityHall() {
  const g = G();
  const y0 = plinth(g, 30, 30, 3);
  // pátio pavimentado
  blk(g, 27, 0.08, 27, RM.pave(), 0, y0, 0);
  // corpo principal em dois volumes
  blk(g, 16, 8, 14, RM.stone(), -1, y0, -2);
  blk(g, 17, 0.6, 15, RM.stoneD(), -1, y0 + 8, -2);
  blk(g, 12, 4, 11, RM.stone(), -1, y0 + 8.6, -2);
  // faixas azuis
  for (const yy of [y0 + 6.6, y0 + 11.6]) blk(g, yy > y0 + 9 ? 12.3 : 16.3, 0.7, yy > y0 + 9 ? 11.3 : 14.3, RM.blue(), -1, yy, -2);
  // grande cúpula azul
  R.cylinder(g, 5.2, 2.2, RM.stone(), -1, y0 + 12.6, -2, 40);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; archWin(g, -1 + Math.cos(a) * 5.15, y0 + 12.9, -2 + Math.sin(a) * 5.15, -a + Math.PI / 2, 0.7, 1.4); }
  dome(g, 5.4, -1, y0 + 15.2, -2);
  // portal monumental com arco profundo
  blk(g, 8, 11, 3.4, RM.stone(), -1, y0, 6.4);
  blk(g, 8.6, 0.7, 3.8, RM.stoneD(), -1, y0 + 11, 6.4);
  archWin(g, -1, y0, 8.12, 0, 4.2, 8);
  for (const sx of [-1, 1]) banner(g, -1 + sx * 3.1, y0 + 10.4, 8.15, 0, 1.3, 5.2);
  // escadaria
  for (let i = 0; i < 5; i++) blk(g, 6, Math.max(0.3, y0 - 0.27 * i), 1, RM.stoneD(), -1, 0, 9.4 + i * 0.9);
  // minaretes nos cantos com cupulinhas
  for (const [x, z] of [[-9.5, -9.5], [7.5, -9.5], [-9.5, 5.5], [7.5, 5.5]]) turret(g, x, z, 1.5, 14, y0, 'dome');
  // janelas em arco nas fachadas
  for (const xx of [-6, -1, 4]) archWin(g, xx, y0 + 2.2, -9.02, Math.PI, 1.2, 2.8);
  for (const zz of [-7, -2, 3]) { archWin(g, 7.02, y0 + 2.2, zz, Math.PI / 2, 1.2, 2.8); archWin(g, -9.02, y0 + 2.2, zz, -Math.PI / 2, 1.2, 2.8); }
  for (const zz of [-6, 2]) banner(g, 7.06, y0 + 7.8, zz, Math.PI / 2, 1.3, 4);
  // ala lateral mais baixa com ameias
  blk(g, 7, 6, 8, RM.stone(), 10.5, y0, 3);
  for (let k = 7.6; k <= 13.6; k += 1.5) for (const z of [-0.6, 6.6]) blk(g, 0.8, 0.9, 0.8, RM.stone(), k, y0 + 6, z);
  blk(g, 7.4, 0.5, 8.4, RM.stoneD(), 10.5, y0 + 5.6, 3);
  archWin(g, 14.02, y0, 3, Math.PI / 2, 1.8, 3);
  bushes(g, [[-12, 11], [-8, 12], [6, 12], [11, 9], [-13, -6], [12, -12]], 1.4);
  return { g, anchor: [-1, 30, -2] };
}

// ---------- casa de cúpula (fileira de moradias) ----------
export function domeHouse(v = 0) {
  const g = G();
  const y0 = plinth(g, 10, 9, 1);
  blk(g, 8, 4.6, 6.6, RM.stone(), 0, y0, 0);
  blk(g, 8.4, 0.5, 7, RM.stoneD(), 0, y0 + 4.6, 0);
  // painel azul com emblema na fachada
  blk(g, 2.6, 2.6, 0.3, RM.blue(), -1.6, y0 + 1.4, 3.35);
  g.add(R.mesh(new THREE.TorusGeometry(0.6, 0.14, 8, 20, Math.PI * 1.4), RM.gold(), -1.6, y0 + 2.7, 3.55));
  archWin(g, 1.8, y0, 3.32, 0, 1.4, 2.6);
  archWin(g, 4.02, y0 + 1.2, 0, Math.PI / 2, 0.9, 1.8);
  // ameias laterais e cúpula
  for (const [x, z] of [[-4, -3.3], [4, -3.3], [-4, 3.3], [4, 3.3]]) blk(g, 0.9, 1.2, 0.9, RM.stone(), x, y0 + 5.1, z);
  R.cylinder(g, 2.3, 1, RM.stone(), 0.4, y0 + 5.1, -0.6, 28);
  dome(g, 2.4, 0.4, y0 + 6.1, -0.6);
  // banco e vaso
  blk(g, 2, 0.5, 0.7, RM.wood(), 2.4, y0, 4.4);
  bushes(g, [[-4.6, 4.2], [4.6, -3.8]], 0.9);
  return { g, anchor: [0, 12, 0] };
}

// ---------- pesquisa / academia ----------
export function research() {
  const g = G();
  const y0 = plinth(g, 15, 13, 2);
  blk(g, 12, 5.5, 9, RM.stone(), 0, y0, -0.5);
  blk(g, 12.6, 0.6, 9.6, RM.stoneD(), 0, y0 + 5.5, -0.5);
  blk(g, 8, 2.5, 6, RM.stone(), 0, y0 + 6.1, -1);
  // pórtico com três arcos
  for (const x of [-3.4, 0, 3.4]) archWin(g, x, y0, 4.02, 0, 2.2, 3.6);
  blk(g, 10, 1.4, 0.4, RM.stoneD(), 0, y0 + 4.2, 4.1);
  for (const x of [-4.4, 4.4]) banner(g, x, y0 + 5.3, 4.06, 0, 1.2, 3.4);
  blk(g, 5, 0.9, 0.3, RM.blue(), 0, y0 + 4.45, 4.3);
  turret(g, -6.6, -4.6, 1.2, 7, y0, 'dome');
  for (let i = 0; i < 3; i++) blk(g, 6 - i, 0.3, 1, RM.stoneD(), 0, y0 - 0.3 * (i + 1), 5.4 + i * 0.9);
  bushes(g, [[-6, 5.4], [6, 5.4]], 1);
  return { g, anchor: [0, 13, 0] };
}
export function academy() {
  const g = G();
  const y0 = plinth(g, 13, 13, 2);
  R.cylinder(g, 5, 4.5, RM.stone(), 0, y0, 0, 40);
  R.cylinder(g, 5.3, 0.5, RM.stoneD(), 0, y0 + 4.5, 0, 40);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; archWin(g, Math.cos(a) * 4.95, y0 + 1.2, Math.sin(a) * 4.95, -a + Math.PI / 2, 1.1, 2.4); }
  R.cylinder(g, 4, 1.4, RM.stone(), 0, y0 + 5, 0, 36);
  // cúpula clara de pedra
  const dg = new THREE.SphereGeometry(4.1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(R.mesh(dg, tm(TX.masonry('#e4dccb', 90, 40), 1.4), 0, y0 + 6.4, 0));
  g.add(R.mesh(new THREE.SphereGeometry(0.4, 12, 8), RM.gold(), 0, y0 + 10.6, 0));
  turret(g, 4.8, 4.2, 1.1, 6, y0, 'dome');
  return { g, anchor: [0, 14, 0] };
}

// ---------- quartel com tropas ----------
export function barracks() {
  const g = G();
  const y0 = plinth(g, 16, 16, 1);
  blk(g, 15, 0.08, 15, RM.pave(), 0, y0, 0);
  blk(g, 14, 5, 4, RM.stone(), 0, y0, -5.5);
  blk(g, 14.4, 0.6, 4.4, RM.stoneD(), 0, y0 + 5, -5.5);
  for (let k = -6.6; k <= 6.6; k += 1.65) blk(g, 0.9, 1.1, 0.9, RM.stone(), k, y0 + 5.6, -3.7);
  archWin(g, 0, y0, -3.48, 0, 2.6, 3.6);
  for (const x of [-4.5, 4.5]) banner(g, x, y0 + 4.8, -3.45, 0, 1.3, 3.4);
  turret(g, -6.8, -5.5, 1.8, 7, y0, 'crown');
  turret(g, 6.8, -5.5, 1.8, 7, y0, 'crown');
  // muro baixo e portãozinho
  blk(g, 15, 1.4, 0.8, RM.stone(), 0, y0, 7.2);
  blk(g, 0.8, 1.4, 13, RM.stone(), -7.2, y0, 0.8);
  blk(g, 0.8, 1.4, 13, RM.stone(), 7.2, y0, 0.8);
  // tropas grandes em formação
  const pts = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) pts.push({ x: -4.8 + j * 2.4, z: -0.8 + i * 2.4, y: y0, ry: 0.3 });
  g.add(R.troops(pts, { body: '#2a4f86', scale: 1.9 }));
  return { g, anchor: [0, 13, 0] };
}
export function archery() {
  const g = G();
  const y0 = plinth(g, 15, 11, 1);
  blk(g, 14, 0.08, 10, M('#a9b866'), 0, y0, 0);
  // galeria de madeira com toldo azul
  blk(g, 12, 0.3, 2.6, RM.wood(), 0, y0 + 2.8, -3.6);
  for (let i = 0; i < 6; i++) R.cylinder(g, 0.16, 2.8, RM.woodD(), -5.5 + i * 2.2, y0, -2.5, 8);
  const aw = R.mesh(new THREE.BoxGeometry(12.6, 0.15, 3), RM.blue(), 0, y0 + 3.6, -3.4);
  aw.rotation.x = 0.25; g.add(aw);
  // alvos
  const tc = document.createElement('canvas'); tc.width = tc.height = 128; const t = tc.getContext('2d');
  for (const [r, c] of [[64, '#efe4c8'], [50, '#2a4f86'], [36, '#efe4c8'], [22, '#2a4f86'], [10, '#e2b24a']]) { t.fillStyle = c; t.beginPath(); t.arc(64, 64, r, 0, 7); t.fill(); }
  const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace;
  const face = R.painted(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  for (let i = 0; i < 4; i++) { const d = R.mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 28), [M('#c9a86a'), face, face], -4.5 + i * 3, y0 + 1.4, 3.8); d.rotation.x = Math.PI / 2; g.add(d); blk(g, 0.25, 1.2, 0.25, RM.woodD(), -4.5 + i * 3, y0, 4.1); }
  const pts = []; for (let i = 0; i < 5; i++) pts.push({ x: -5 + i * 2.5, z: -0.8, y: y0, ry: Math.PI });
  g.add(R.troops(pts, { body: '#2a4f86', shield: false, scale: 1.8 }));
  return { g, anchor: [0, 10, 0] };
}
export function stable() {
  const g = G();
  const y0 = plinth(g, 14, 12, 1);
  blk(g, 13, 0.08, 11, M('#b39a6c'), 0, y0, 0);
  blk(g, 11, 4, 4, RM.stone(), 0, y0, -3.6);
  const rf = R.mesh(new THREE.CylinderGeometry(2.8, 2.8, 11.6, 3), RM.roofWood(), 0, y0 + 4.9, -3.6);
  rf.rotation.z = Math.PI / 2; rf.scale.set(1, 1, 0.6); g.add(rf);
  for (let i = 0; i < 3; i++) archWin(g, -3.4 + i * 3.4, y0, -1.58, 0, 1.8, 2.6);
  for (let x = -6; x <= 6; x += 1.5) blk(g, 0.22, 1.3, 0.22, RM.woodD(), x, y0, 5.2);
  blk(g, 12.2, 0.18, 0.16, RM.wood(), 0, y0 + 1.0, 5.2);
  ['#8a5a32', '#4e3220', '#d8c4a0'].forEach((c, i) => { const h = G(); horse(h, 0, 0, 0, c); h.scale.setScalar(1.5); h.position.set(-3.5 + i * 3.6, y0, 1.6 + (i % 2)); h.rotation.y = 0.5 - i * 0.4; g.add(h); });
  return { g, anchor: [0, 10, 0] };
}
export function siege() {
  const g = G();
  const y0 = plinth(g, 14, 12, 1);
  blk(g, 10, 4.5, 4, RM.stone(), -1.5, y0, -3.6);
  blk(g, 10.4, 0.5, 4.4, RM.stoneD(), -1.5, y0 + 4.5, -3.6);
  for (let k = -6; k <= 3; k += 1.5) blk(g, 0.8, 0.9, 0.8, RM.stone(), k, y0 + 5, -1.7);
  turret(g, 4.6, -4, 1.6, 7.5, y0, 'dome');
  archWin(g, -1.5, y0, -1.58, 0, 2.6, 3);
  // catapulta grande
  const c = G();
  blk(c, 3.4, 0.5, 2.2, RM.wood(), 0, 0.6, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) { const w = R.mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 16), RM.woodD(), s * 1.3, 0.55, t * 1.15); w.rotation.x = Math.PI / 2; c.add(w); }
  for (const s of [-1, 1]) { const u = R.mesh(rb(0.3, 2.4, 0.3), RM.wood(), 0.2, 2.1, s * 0.75); u.rotation.z = -0.2; c.add(u); }
  const arm = R.mesh(rb(0.25, 4, 0.25), RM.wood(), 0.7, 2.8, 0); arm.rotation.z = -0.95; c.add(arm);
  c.position.set(-1, y0, 2.6); c.rotation.y = 0.5; c.scale.setScalar(1.3); g.add(c);
  barrels(g, 4.5, 3, 3);
  for (let i = 0; i < 4; i++) g.add(R.mesh(new THREE.SphereGeometry(0.4, 10, 8), R.ROCK('#9a9a92'), 3 + (i % 2) * 0.8, y0 + 0.4, 0 + Math.floor(i / 2) * 0.8));
  return { g, anchor: [0, 11, 0] };
}

// ---------- produção em fileiras ----------
export function farm() {
  const g = G();
  blk(g, 9, 0.5, 8, RM.stoneD(), 0, 0, 0);
  blk(g, 8, 0.12, 7, RM.dirt(), 0, 0.5, 0);
  const stalk = R.mergeGeometries([0, 1, 2, 3].map((k) => new THREE.ConeGeometry(0.22, 2.0 + (k % 2) * 0.4, 5).translate(Math.cos(k * 1.6) * 0.18, 1.0, Math.sin(k * 1.6) * 0.18).rotateZ((k - 1.5) * 0.12).toNonIndexed()));
  const pts = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) pts.push([-3.2 + j * 1.3, -2.6 + i * 1.3]);
  const im = new THREE.InstancedMesh(stalk, M('#ffffff', { roughness: 0.85 }), pts.length);
  const cob = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.16, 0.42, 2, 8), M('#e8c040'), pts.length);
  const o = new THREE.Object3D(); const c = new THREE.Color();
  pts.forEach(([x, z], i) => { o.position.set(x, 0.6, z); o.rotation.set(0, i, 0); o.scale.setScalar(1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, c.set(['#4f9a32', '#5aa838', '#468a2c'][i % 3])); o.position.set(x + 0.2, 1.9, z); o.rotation.set(0.3, 0, 0.4); o.updateMatrix(); cob.setMatrixAt(i, o.matrix); });
  im.castShadow = true; g.add(im, cob);
  // cerca de madeira
  for (let x = -4.2; x <= 4.2; x += 1.4) { blk(g, 0.18, 0.9, 0.18, RM.woodD(), x, 0.5, 3.8); blk(g, 0.18, 0.9, 0.18, RM.woodD(), x, 0.5, -3.8); }
  blk(g, 8.6, 0.12, 0.12, RM.wood(), 0, 1.1, 3.8);
  // espantalho azul
  blk(g, 0.14, 2.6, 0.14, RM.woodD(), 3.4, 0.5, -3.2);
  blk(g, 1.4, 0.8, 0.4, RM.blue(), 3.4, 2.1, -3.2);
  g.add(R.mesh(new THREE.SphereGeometry(0.3, 10, 8), M('#d8c48a'), 3.4, 3.4, -3.2));
  g.add(R.villagers([{ x: -3.8, z: 3.0, y: 0.5 }]));
  return { g, anchor: [0, 6, 0] };
}
export function lumber() {
  const g = G();
  blk(g, 9, 0.4, 8, RM.stoneD(), 0, 0, 0);
  // casinha de madeira com faixa azul
  blk(g, 4.2, 3.6, 3.6, RM.stone(), -1.4, 0.4, -1.6);
  blk(g, 4.5, 0.5, 3.9, RM.blue(), -1.4, 3.6, -1.6);
  const rf = R.mesh(new THREE.ConeGeometry(3.3, 1.8, 4), RM.roofWood(), -1.4, 4.9, -1.6); rf.rotation.y = Math.PI / 4; g.add(rf);
  // pilha de toras e cavalete de serra
  const log = new THREE.CylinderGeometry(0.42, 0.42, 4.2, 12).rotateZ(Math.PI / 2);
  const pts = []; for (let l = 0; l < 3; l++) for (let i = 0; i < 3 - l; i++) pts.push([0, 0.82 + l * 0.72, 1.6 + i * 0.86 + l * 0.43]);
  const im = new THREE.InstancedMesh(log, M('#a8743e'), pts.length);
  const end = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.4, 4.22, 12).rotateZ(Math.PI / 2), M('#e8c08a'), pts.length);
  const o = new THREE.Object3D(); pts.forEach(([x, y, z], i) => { o.position.set(x + 1.5, y, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); end.setMatrixAt(i, o.matrix); });
  im.castShadow = true; g.add(end, im);
  for (const s of [-1, 1]) { const b = R.mesh(rb(0.2, 2.4, 0.2), RM.woodD(), 2.8 + s * 0.9, 1.5, -2.2); b.rotation.z = s * 0.4; g.add(b); }
  const lg = R.mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.4, 12), M('#a8743e'), 2.8, 2.0, -2.2); lg.rotation.x = Math.PI / 2; g.add(lg);
  g.add(R.villagers([{ x: 2.6, z: -0.6, y: 0.4 }, { x: -3.4, z: 2.2, y: 0.4 }]));
  return { g, anchor: [0, 7, 0] };
}
export function quarry() {
  const g = G();
  blk(g, 9, 0.4, 8, RM.stoneD(), 0, 0, 0);
  const r = R.rng(9); const rocks = [];
  for (let i = 0; i < 9; i++) { const s = new THREE.DodecahedronGeometry(1.0 + r() * 1.0, 1); s.scale(1.2, 0.75, 1); s.translate(-2 + (i % 3) * 1.7 + r() * 0.6, 0.9 + Math.floor(i / 3) * 0.5, -2 + Math.floor(i / 3) * 1.4); rocks.push(s.toNonIndexed()); }
  g.add(R.mesh(R.mergeGeometries(rocks), RM.rockBlue()));
  for (let i = 0; i < 3; i++) blk(g, 1.1, 0.9, 1.1, RM.stone(), 2.6 + (i % 2) * 1.3, 0.4 + (i > 1 ? 0.9 : 0), 2.4);
  // guindaste de madeira
  blk(g, 0.3, 4.6, 0.3, RM.woodD(), -3.6, 0.4, 2.8);
  const arm = R.mesh(rb(3.6, 0.25, 0.25), RM.wood(), -2.2, 4.8, 2.8); arm.rotation.z = -0.25; g.add(arm);
  const ws = [{ x: 0.6, z: 1.4, y: 0.4 }, { x: -1.6, z: 2.2, y: 0.4 }];
  g.add(R.villagers(ws));
  return { g, anchor: [0, 7, 0] };
}
export function goldMine() {
  const g = G();
  blk(g, 10, 0.4, 9, RM.stoneD(), 0, 0, 0);
  const r = R.rng(5); const rocks = [];
  for (let i = 0; i < 8; i++) { const s = new THREE.DodecahedronGeometry(1.4 + r() * 1.1, 1); s.scale(1.2, 0.85, 1); s.translate(-3 + i * 0.9, 1.2 + (i > 2 && i < 6 ? 0.8 : 0), -2.6 + r() * 0.6); rocks.push(s.toNonIndexed()); }
  g.add(R.mesh(R.mergeGeometries(rocks), RM.rockBlue()));
  blk(g, 2.8, 2.6, 0.8, RM.dark(), 0, 0.4, -0.9);
  for (const s of [-1, 1]) blk(g, 0.35, 2.8, 0.4, RM.woodD(), s * 1.5, 0.4, -0.5);
  blk(g, 3.4, 0.4, 0.5, RM.wood(), 0, 3.2, -0.5);
  blk(g, 1.6, 0.9, 1.8, RM.wood(), 1.8, 0.4, 2.2);
  const nug = []; for (let i = 0; i < 18; i++) { const s = new THREE.OctahedronGeometry(0.3, 0); s.translate(1.8 + (r() - 0.5) * 1.3, 1.4 + r() * 0.3, 2.2 + (r() - 0.5) * 1.4); nug.push(s); }
  for (let i = 0; i < 14; i++) { const s = new THREE.OctahedronGeometry(0.34, 0); s.translate(-2.4 + (r() - 0.5) * 2, 0.6 + r() * 0.3, 2.4 + (r() - 0.5) * 1.6); nug.push(s); }
  g.add(R.mesh(R.mergeGeometries(nug), RM.gold()));
  g.add(R.villagers([{ x: -0.5, z: 1.8, y: 0.4 }]));
  return { g, anchor: [0, 8, 0] };
}

// ---------- mercado, taverna, hospital, obelisco, tenda ----------
export function market() {
  const g = G();
  blk(g, 15, 0.4, 11, RM.pave(), 0, 0, 0);
  const cols = [['#2a4f86', '#efe4c8'], ['#4f8a5a', '#efe4c8'], ['#c8763a', '#efe4c8'], ['#2a4f86', '#e2b24a']];
  for (let i = 0; i < 5; i++) {
    const x = -5 + (i % 3) * 5, z = -2.5 + Math.floor(i / 3) * 5;
    const [a, b] = cols[i % 4];
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const t = c.getContext('2d');
    for (let k = 0; k < 8; k++) { t.fillStyle = k % 2 ? a : b; t.fillRect(k * 8, 0, 8, 8); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const aw = R.mesh(new THREE.CylinderGeometry(2.1, 2.1, 3.6, 3), R.painted(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })), x, 2.9, z);
    aw.rotation.z = Math.PI / 2; aw.scale.set(1, 1, 0.5); g.add(aw);
    blk(g, 3.2, 1, 1.6, RM.wood(), x, 0.4, z + 0.3);
    for (let k = 0; k < 5; k++) g.add(R.mesh(new THREE.SphereGeometry(0.28, 10, 8), M(['#d23a2a', '#e8c040', '#6db844', '#e88a2a', '#a05ac8'][k]), x - 1.2 + k * 0.6, 1.6, z + 0.3));
    for (const [dx, dz] of [[-1.5, -0.6], [1.5, -0.6], [-1.5, 1.2], [1.5, 1.2]]) R.cylinder(g, 0.08, 2.6, RM.woodD(), x + dx, 0.4, z + dz, 6);
  }
  for (let i = 0; i < 6; i++) { const b = R.mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 12), RM.wood(), 5.5 + (i % 2) * 0.9, 0.85, 3 + Math.floor(i / 2) * 0.9); g.add(b); }
  const pts = []; for (let i = 0; i < 8; i++) pts.push({ x: -6 + i * 1.6, z: 0.6 + ((i * 3) % 4) * 0.4, y: 0.4 });
  g.add(R.villagers(pts));
  return { g, anchor: [0, 7, 0] };
}
export function tavern() {
  const g = G();
  const y0 = plinth(g, 11, 10, 1);
  blk(g, 8, 4, 6, RM.stone(), 0, y0, 0);
  blk(g, 8.4, 0.4, 6.4, RM.blue(), 0, y0 + 4, 0);
  blk(g, 7, 2.4, 5, RM.wood(), 0, y0 + 4.4, 0);
  const rf = R.mesh(new THREE.CylinderGeometry(3.2, 3.2, 8, 3), RM.roofWood(), 0, y0 + 7.6, 0); rf.rotation.z = Math.PI / 2; rf.scale.set(1, 1, 0.55); g.add(rf);
  archWin(g, -1.5, y0, 3.02, 0, 1.6, 2.6);
  archWin(g, 2, y0 + 1.2, 3.02, 0, 1.0, 1.6);
  for (let i = 0; i < 2; i++) { blk(g, 2, 0.2, 1, RM.wood(), -2 + i * 4, y0 + 0.8, 4.4); for (const s of [-1, 1]) blk(g, 1.8, 0.15, 0.35, RM.wood(), -2 + i * 4, y0 + 0.45, 4.4 + s * 0.85); }
  barrels(g, 4.5, 2, 3);
  return { g, anchor: [0, 12, 0] };
}
export function hospital() {
  const g = G();
  const y0 = plinth(g, 12, 10, 1);
  const tent = R.mesh(new THREE.CylinderGeometry(0.3, 4.4, 4, 6), M('#e8ddc4', { roughness: 0.9 }), 0, y0 + 2, 0); g.add(tent);
  g.add(R.mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.5, 6), RM.blue(), 0, y0 + 0.25, 0));
  blk(g, 1.6, 2, 0.2, RM.dark(), 0, y0, 3.8);
  for (let i = 0; i < 3; i++) blk(g, 2, 0.5, 0.9, M('#efe4c8'), -4 + i * 0.1, y0, -3 + i * 1.2);
  return { g, anchor: [0, 9, 0] };
}
export function obelisk() {
  const g = G();
  const y0 = plinth(g, 7, 7, 2);
  blk(g, 3.4, 1.4, 3.4, RM.stone(), 0, y0, 0);
  const ob = R.mesh(new THREE.CylinderGeometry(0.75, 1.3, 12, 4), tm(TX.masonry('#c9c2b4', 90, 50), 1.6), 0, y0 + 7.4, 0); ob.rotation.y = Math.PI / 4; g.add(ob);
  const tip = R.mesh(new THREE.ConeGeometry(0.8, 1.6, 4), RM.gold(), 0, y0 + 14.2, 0); tip.rotation.y = Math.PI / 4; g.add(tip);
  return { g, anchor: [0, 18, 0] };
}
export function tent() {
  const g = G();
  const tc = M('#e2d6bc', { roughness: 0.9 });
  const t = R.mesh(new THREE.CylinderGeometry(3.4, 3.4, 9, 3, 1), tc, 0, 2.4, 0); t.rotation.z = Math.PI / 2; t.scale.set(1, 1, 0.75); g.add(t);
  for (const x of [-4.6, 4.6]) { const f = R.mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.6, 6), RM.woodD(), x, 2.3, 0); g.add(f); }
  banner(g, 0, 4.3, 2.65, 0, 1.2, 2.2);
  return { g, anchor: [0, 8, 0] };
}
