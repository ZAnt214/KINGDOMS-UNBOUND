// Medieval de guerra: fortaleza de pedra, enxaimel, ardósia e telhas, estandartes e acampamento militar.
import * as R from './rok.js';
import { win, door, gable, chimney, barrels, flowerBed, quoins, cornice, box, awning, balcony } from './city2.js';
const { THREE, MAT, M } = R;
const G = () => new THREE.Group();
const CRIMSON = '#8e1c1c';

// ---------- peças ----------
function roundTower(g, x, z, r, h, opts = {}) {
  const { roof = 'cone', y0 = 0, mat = MAT.stone(), flag = true, coneH = r * 2.6, slits = true } = opts;
  R.cylinder(g, r + 0.45, 2.2, MAT.sand(), x, y0, z, 28);
  R.cylinder(g, r, h - 2.2, mat, x, y0 + 2.2, z, 28);
  R.cylinder(g, r + 0.35, 0.45, MAT.trim(), x, y0 + h, z, 28);
  // mata-cães sob o parapeito
  const geos = [];
  const n = Math.round(r * 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = R.rbox(0.35, 0.7, 0.45, 0.04);
    b.rotateY(-a);
    b.translate(x + Math.cos(a) * (r + 0.15), y0 + h - 0.35, z + Math.sin(a) * (r + 0.15));
    geos.push(b);
  }
  g.add(R.mesh(R.mergeGeometries(geos), MAT.trim()));
  R.cylinder(g, r + 0.4, 1.2, mat, x, y0 + h + 0.45, z, 28);
  R.merlonsRingAt(g, x, z, r + 0.35, y0 + h + 1.6, mat, n + 2, 0.6, 0.8);
  if (slits) for (const yy of [0.45, 0.7]) for (const a of [0.6, 1.6]) {
    const s = R.mesh(R.rbox(0.18, 1.0, 0.2, 0.03), M('#17110c'), x + Math.cos(a) * r, y0 + h * yy, z + Math.sin(a) * r);
    s.rotation.y = -a;
    g.add(s);
  }
  let top = y0 + h + 1.6;
  if (roof === 'cone') {
    const c = R.mesh(new THREE.ConeGeometry(r + 0.75, coneH, 28, 1), R.glaze(), x, y0 + h + 1.65 + coneH / 2, z);
    g.add(c);
    top = y0 + h + 1.65 + coneH;
    g.add(R.mesh(new THREE.SphereGeometry(0.16, 10, 8), MAT.gold(), x, top + 0.05, z));
  }
  if (flag) R.flagPole(g, x, top, z, 3.2);
}
function crenelWall(g, len, h, t, x, z, ry, mat = MAT.stone()) {
  const s = G();
  box(s, len, 1.8, t + 0.8, MAT.sand(), 0, 0, 0);
  box(s, len, h - 1.8, t, mat, 0, 1.8, 0);
  box(s, len, 0.3, t + 0.4, MAT.trim(), 0, h - 0.05, 0);
  const geos = [];
  for (let k = -len / 2 + 0.55; k < len / 2 - 0.3; k += 1.2) for (const sd of [-1, 1]) {
    const b = R.rbox(0.7, 0.9, 0.45, 0.06);
    b.translate(k, h + 0.7, sd * (t / 2 - 0.05));
    geos.push(b);
  }
  s.add(R.mesh(R.mergeGeometries(geos), mat));
  box(s, len - 0.2, 0.08, t - 0.5, M('#8a7458'), 0, h + 0.22, 0);
  s.position.set(x, 0, z);
  s.rotation.y = ry;
  g.add(s);
  return s;
}
function pyramidRoof(g, w, d, y, h, mat) {
  const c = R.mesh(new THREE.ConeGeometry(Math.SQRT1_2 * Math.max(w, d) + 0.4, h, 4, 1), mat, 0, y + h / 2, 0);
  c.rotation.y = Math.PI / 4;
  c.scale.z = d / w;
  g.add(c);
  return c;
}
/** Enxaimel: postes, travessas e diagonais escuras sobre o reboco. */
function timber(g, w, d, y0, h, faces = ['f', 'r', 'l', 'b']) {
  const geos = [];
  const beam = (bw, bh, bd, x, y, z, rz = 0, ry = 0) => {
    const b = R.rbox(bw, bh, bd, 0.02);
    b.rotateZ(rz);
    b.rotateY(ry);
    b.translate(x, y, z);
    geos.push(b);
  };
  const face = (L, place) => {
    const n = Math.max(2, Math.round(L / 1.4));
    for (let i = 0; i <= n; i++) place((-L / 2 + (i * L) / n), 'post', n, i);
    place(0, 'rail');
  };
  for (const f of faces) {
    const along = f === 'f' || f === 'b' ? w : d;
    const n = Math.max(2, Math.round(along / 1.4));
    for (let i = 0; i <= n; i++) {
      const t = -along / 2 + (i * along) / n;
      const off = (f === 'f' || f === 'b' ? d : w) / 2 + 0.06;
      const sign = f === 'f' || f === 'r' ? 1 : -1;
      if (f === 'f' || f === 'b') beam(0.2, h, 0.12, t, y0 + h / 2, sign * off);
      else beam(0.12, h, 0.2, sign * off, y0 + h / 2, t);
      if (i < n && i % 2 === 0) {
        const seg = along / n;
        const len = Math.hypot(seg, h * 0.55);
        const ang = Math.atan2(h * 0.55, seg);
        if (f === 'f' || f === 'b') beam(len, 0.14, 0.1, t + seg / 2, y0 + h * 0.36, sign * off, (i / 2) % 2 ? ang : -ang);
        else beam(0.1, 0.14, len, sign * off, y0 + h * 0.36, t + seg / 2, (i / 2) % 2 ? ang : -ang, Math.PI / 2 - Math.PI / 2);
      }
    }
    if (f === 'f' || f === 'b') {
      const sign = f === 'f' ? 1 : -1;
      beam(along + 0.2, 0.2, 0.14, 0, y0 + 0.1, sign * (d / 2 + 0.06));
      beam(along + 0.2, 0.2, 0.14, 0, y0 + h * 0.62, sign * (d / 2 + 0.06));
      beam(along + 0.2, 0.22, 0.14, 0, y0 + h - 0.1, sign * (d / 2 + 0.06));
    } else {
      const sign = f === 'r' ? 1 : -1;
      beam(0.14, 0.2, along + 0.2, sign * (w / 2 + 0.06), y0 + 0.1, 0);
      beam(0.14, 0.2, along + 0.2, sign * (w / 2 + 0.06), y0 + h * 0.62, 0);
      beam(0.14, 0.22, along + 0.2, sign * (w / 2 + 0.06), y0 + h - 0.1, 0);
    }
  }
  g.add(R.mesh(R.mergeGeometries(geos), MAT.timber()));
}

// ---------- casa de enxaimel ----------
export function house(v = 0) {
  const g = G();
  const r = R.rng(v * 13 + 5);
  const w = 4.6 + (v % 3) * 0.6;
  const d = 4.0 + ((v + 1) % 2) * 0.6;
  const tall = v % 4 !== 1;
  const roof = [MAT.roofRed(), MAT.roofSlate(), MAT.roofRed()][v % 3];
  box(g, w + 1.2, 0.3, d + 1.2, MAT.stone(), 0, 0, 0);
  // térreo de pedra
  box(g, w, 2.4, d, MAT.sand(), 0, 0.3, 0);
  quoins(g, w, d, 0.3, 2.4, MAT.trim());
  door(g, -w * 0.22, 0.3, d / 2 + 0.02, 0, 1.0, 1.8);
  win(g, w * 0.24, 1.0, d / 2 + 0.02, 0, 0.75, 0.8, { arch: false, shutters: '#3d5236' });
  win(g, w / 2 + 0.02, 1.0, 0, Math.PI / 2, 0.75, 0.8, { arch: false, shutters: '#3d5236' });
  // andares superiores em balanço (jetty)
  const y1 = 2.7;
  const h1 = tall ? 2.6 : 2.2;
  box(g, w + 0.5, 0.3, d + 0.5, MAT.timber(), 0, y1, 0);
  box(g, w + 0.4, h1, d + 0.4, MAT.plaster(), 0, y1 + 0.3, 0);
  timber(g, w + 0.4, d + 0.4, y1 + 0.3, h1, ['f', 'r']);
  win(g, -w * 0.25, y1 + 1.0, d / 2 + 0.24, 0, 0.7, 0.9, { arch: false, shutters: '#3d5236', lit: r() > 0.7 });
  win(g, w * 0.25, y1 + 1.0, d / 2 + 0.24, 0, 0.7, 0.9, { arch: false, shutters: CRIMSON });
  win(g, w / 2 + 0.24, y1 + 1.0, 0, Math.PI / 2, 0.7, 0.9, { arch: false, shutters: '#3d5236' });
  let top = y1 + 0.3 + h1;
  if (tall && v % 2 === 0) {
    box(g, w + 0.9, 0.3, d + 0.9, MAT.timber(), 0, top, 0);
    box(g, w + 0.8, 2.0, d + 0.8, MAT.plaster(), 0, top + 0.3, 0);
    timber(g, w + 0.8, d + 0.8, top + 0.3, 2.0, ['f', 'r']);
    win(g, 0, top + 0.9, d / 2 + 0.44, 0, 0.7, 0.8, { arch: false, shutters: null, lit: true });
    top += 2.3;
  }
  const W2 = w + (tall && v % 2 === 0 ? 0.8 : 0.4);
  const D2 = d + (tall && v % 2 === 0 ? 0.8 : 0.4);
  gable(g, W2 + 0.1, D2 + 0.1, top, 3.4 + (v % 2) * 0.6, roof, v % 2 ? 'z' : 'x');
  chimney(g, W2 * 0.28, top + 0.8, -D2 * 0.2, 3.4);
  // detalhes de rua
  if (v % 3 === 0) awning(g, w * 0.24, 2.1, d / 2 + 0.02, 0, 1.8, [CRIMSON, '#e8dcc4']);
  if (v % 5 === 2) flowerBed(g, -w * 0.25, d / 2 + 0.9, 1.4);
  barrels(g, w / 2 + 0.6, d / 2 - 0.4, 1 + (v % 3));
  if (v % 4 === 3) { box(g, 1.2, 0.8, 0.9, MAT.wood(), -w / 2 - 0.8, 0, 0.6); box(g, 0.8, 0.6, 0.8, MAT.wood(), -w / 2 - 0.8, 0.8, 0.6); }
  return { g, anchor: [0, 11, 0] };
}

// ---------- fortaleza (castelo do jogador) ----------
export function cityHall() {
  const g = G();
  box(g, 30, 1.6, 30, MAT.sand(), 0, 0, 0);
  for (let i = 0; i < 6; i++) box(g, 8, 0.27, 1.1, MAT.trim(), 0, 0.27 * i, 15.6 - i * 0.5);
  box(g, 26, 0.06, 26, M('#a8916a'), 0, 1.6, 0);
  // muralha interna com quatro torres
  const H = 8;
  crenelWall(g, 22, H, 2.2, 0, -12, 0);
  crenelWall(g, 22, H, 2.2, -12, 0, Math.PI / 2);
  crenelWall(g, 22, H, 2.2, 12, 0, Math.PI / 2);
  for (const sx of [-1, 1]) crenelWall(g, 7.6, H, 2.2, sx * 7.4, 12, 0);
  const inner = G();
  inner.position.y = 1.6;
  g.add(inner);
  for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) roundTower(g, x, z, 2.7, 13, { y0: 1.6 });
  // guarita
  for (const x of [-3.4, 3.4]) roundTower(g, x, 12.6, 2.1, 12, { y0: 1.6, coneH: 4.6 });
  box(g, 5.2, 10, 3.4, MAT.stone(), 0, 1.6, 12.4);
  box(g, 5.6, 0.3, 3.8, MAT.trim(), 0, 11.6, 12.4);
  const gg = G();
  for (let k = -2.2; k <= 2.2; k += 1.1) { const b = R.mesh(R.rbox(0.6, 0.8, 0.5, 0.06), MAT.stone(), k, 12.3, 1.5); gg.add(b); }
  gg.position.z = 12.4;
  g.add(gg);
  door(g, 0, 1.6, 14.12, 0, 2.6, 3.4);
  // grade levadiça
  for (let i = 0; i < 6; i++) box(g, 0.1, 3.6, 0.1, M('#2a2622', { metalness: 0.6, roughness: 0.5 }), -1.1 + i * 0.44, 3.3, 14.25);
  R.banner(g, -2.0, 11.0, 14.15, 0, 3.4);
  R.banner(g, 2.0, 11.0, 14.15, 0, 3.4);
  // torre de menagem
  const kx = 0, kz = -3, kw = 11, kh = 19;
  box(g, kw + 0.8, 2, kw + 0.8, MAT.sand(), kx, 1.6, kz);
  box(g, kw, kh - 2, kw, MAT.stone(), kx, 3.6, kz);
  for (const y of [9, 15]) box(g, kw + 0.4, 0.3, kw + 0.4, MAT.trim(), kx, 1.6 + y, kz);
  const kg = G();
  kg.position.set(kx, 0, kz);
  g.add(kg);
  for (const [s, ry] of [[1, 0], [-1, Math.PI]]) for (const xx of [-3, 0, 3]) {
    win(kg, xx, 11.4, s * (kw / 2 + 0.02), ry, 0.9, 1.7, { shutters: null, lit: xx === 0 });
    win(kg, xx, 17, s * (kw / 2 + 0.02), ry, 0.8, 1.4, { shutters: null });
  }
  for (const zz of [-3, 0, 3]) { win(kg, kw / 2 + 0.02, 11.4, zz, Math.PI / 2, 0.9, 1.7, { shutters: null }); win(kg, kw / 2 + 0.02, 17, zz, Math.PI / 2, 0.8, 1.4, { shutters: null }); }
  door(kg, 0, 3.6, kw / 2 + 0.02, 0, 1.8, 2.8);
  for (let i = 0; i < 6; i++) box(kg, 3, 0.25, 0.8, MAT.trim(), 0, 1.6 + i * 0.33, kw / 2 + 3.2 - i * 0.45);
  // parapeito com mata-cães e ameias
  cornice(kg, kw, kw, 1.6 + kh - 0.4, MAT.trim(), 0.45, 0.45);
  for (const [w, d, x, z] of [[kw + 0.9, 0.5, 0, kw / 2 + 0.2], [kw + 0.9, 0.5, 0, -kw / 2 - 0.2], [0.5, kw + 0.9, kw / 2 + 0.2, 0], [0.5, kw + 0.9, -kw / 2 - 0.2, 0]]) box(kg, w, 1.2, d, MAT.stone(), x, 1.6 + kh, z);
  const mg = [];
  for (let k = -kw / 2; k <= kw / 2; k += 1.2) for (const [x, z] of [[k, kw / 2 + 0.2], [k, -kw / 2 - 0.2], [kw / 2 + 0.2, k], [-kw / 2 - 0.2, k]]) { const b = R.rbox(0.65, 0.9, 0.65, 0.06); b.translate(x, 1.6 + kh + 1.65, z); mg.push(b); }
  kg.add(R.mesh(R.mergeGeometries(mg), MAT.stone()));
  // torreões nos cantos da menagem
  for (const [x, z] of [[-kw / 2, -kw / 2], [kw / 2, -kw / 2], [-kw / 2, kw / 2], [kw / 2, kw / 2]]) roundTower(kg, x, z, 1.5, 6, { y0: 1.6 + kh - 3, coneH: 4.2, slits: false, flag: false });
  // telhado central de ardósia e mastro do estandarte real
  box(kg, 6, 2.4, 6, MAT.stone(), 0, 1.6 + kh, 0);
  const pr = pyramidRoof(kg, 6.8, 6.8, 1.6 + kh + 2.4, 6, MAT.roofSlate());
  R.flagPole(kg, 0, 1.6 + kh + 8.4, 0, 5);
  // salão nobre encostado na muralha
  const hall = G();
  box(hall, 9, 6, 6.4, MAT.stone(), 0, 1.6, 0);
  gable(hall, 9.4, 6.8, 7.6, 4, MAT.roofRed(), 'x');
  for (const xx of [-2.6, 0, 2.6]) win(hall, xx, 3.2, 3.22, 0, 0.9, 2.2, { shutters: null, lit: true });
  chimney(hall, 3, 8.6, -1.6, 3.2);
  hall.position.set(-6, 0, 6.2);
  hall.rotation.y = Math.PI / 2;
  g.add(hall);
  // capela com torre sineira
  const ch = G();
  box(ch, 4, 5, 6, MAT.stone(), 0, 1.6, 0);
  gable(ch, 4.4, 6.4, 6.6, 3, MAT.roofSlate(), 'z');
  box(ch, 2.4, 10, 2.4, MAT.stone(), 0, 1.6, -3.6);
  const sp = R.mesh(new THREE.ConeGeometry(1.9, 5, 4), MAT.roofSlate(), 0, 14.1, -3.6);
  sp.rotation.y = Math.PI / 4;
  ch.add(sp);
  win(ch, 0, 8.4, -2.38, 0, 0.8, 1.4, { shutters: null });
  ch.position.set(7, 0, 6.6);
  g.add(ch);
  // pátio: poço, carroça, braseiros, tropas de guarda
  R.cylinder(g, 1.1, 1, MAT.stone(), -6, 1.6, -9.5, 18);
  barrels(g, 8, -9.5, 3);
  for (const [x, z] of [[-2, 10.4], [2, 10.4]]) { R.cylinder(g, 0.45, 1.3, M('#2a2622', { metalness: 0.5 }), x, 1.6, z, 10); }
  const guards = [];
  for (let i = 0; i < 8; i++) guards.push({ x: -1.6 + (i % 2) * 3.2, z: 4 + Math.floor(i / 2) * 1.6, y: 1.6, ry: 0 });
  g.add(R.troops(guards, { body: '#27467a', scale: 1.1 }));
  // sentinelas no adarve
  const sents = [];
  for (const [x, z] of [[-6, -12], [6, -12], [-12, -4], [12, 4], [-12, 6], [12, -6]]) sents.push({ x, z, y: 1.6 + H + 0.25, ry: Math.atan2(x, z) });
  g.add(R.troops(sents, { scale: 1.05 }));
  return { g, anchor: [0, 34, 0] };
}

// ---------- muralha de pedra ----------
export function walls(half) {
  const g = G();
  const H = 8.5;
  const T = 3.6;
  const seg = (x, z, len, rot) => {
    const s = crenelWall(g, len, H, T, x, z, rot);
    for (let k = -len / 2 + 4; k < len / 2 - 2; k += 8) for (const sd of [-1, 1]) {
      const b = R.mesh(R.rbox(1.2, H - 2.6, 0.8, 0.06), MAT.sand(), k, 1.8 + (H - 2.6) / 2, sd * (T / 2 + 0.35));
      s.add(b);
    }
    for (let k = -len / 2 + 8; k < len / 2 - 4; k += 16) R.banner(s, k, H - 0.6, T / 2 + 0.42, 0, 4.2);
  };
  const L = half * 2;
  seg(0, -half, L, 0);
  seg(-half, 0, L, Math.PI / 2);
  seg(half, 0, L, -Math.PI / 2);
  seg(-half / 2 - 4.5, half, L / 2 - 9, Math.PI);
  seg(half / 2 + 4.5, half, L / 2 - 9, Math.PI);
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) roundTower(g, x, z, 3.6, 13);
  for (const t of [-0.5, 0.5]) {
    roundTower(g, t * half, -half, 2.6, 11, { coneH: 6 });
    roundTower(g, -half, t * half, 2.6, 11, { coneH: 6 });
    roundTower(g, half, t * half, 2.6, 11, { coneH: 6 });
  }
  // portão principal
  const gate = G();
  for (const x of [-5.6, 5.6]) roundTower(gate, x, 0, 3.2, 14, { coneH: 8 });
  box(gate, 8.4, 11, 5, MAT.stone(), 0, 0, 0);
  box(gate, 8.8, 0.35, 5.4, MAT.trim(), 0, 11, 0);
  const mg = [];
  for (let k = -3.8; k <= 3.8; k += 1.25) for (const sd of [-1, 1]) { const b = R.rbox(0.7, 0.9, 0.5, 0.06); b.translate(k, 11.8, sd * 2.4); mg.push(b); }
  gate.add(R.mesh(R.mergeGeometries(mg), MAT.stone()));
  door(gate, 0, 0, 2.52, 0, 3.6, 4.6);
  for (let i = 0; i < 8; i++) box(gate, 0.12, 4.2, 0.12, M('#2a2622', { metalness: 0.6, roughness: 0.5 }), -1.6 + i * 0.46, 1.6, 2.7);
  R.banner(gate, -2.6, 10.4, 2.62, 0, 4);
  R.banner(gate, 2.6, 10.4, 2.62, 0, 4);
  // brasão sobre o portão
  const sh = new THREE.Shape();
  sh.moveTo(-0.9, 0.9); sh.lineTo(0.9, 0.9); sh.lineTo(0.9, -0.1); sh.quadraticCurveTo(0.8, -0.9, 0, -1.3); sh.quadraticCurveTo(-0.8, -0.9, -0.9, -0.1);
  const crest = R.mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 2 }), M('#27467a'), 0, 8.4, 2.5);
  gate.add(crest);
  gate.add(R.mesh(new THREE.TorusGeometry(0.42, 0.1, 6, 16), MAT.gold(), 0, 8.3, 2.85));
  gate.position.set(0, 0, half);
  g.add(gate);
  return g;
}

// ---------- igreja (substitui a academia) ----------
export function academy() {
  const g = G();
  box(g, 15, 0.5, 12, MAT.stone(), 0, 0, 0);
  box(g, 11, 7, 6, MAT.sand(), -1, 0.5, 0);
  gable(g, 11.4, 6.4, 7.5, 4.2, MAT.roofSlate(), 'x');
  for (let i = 0; i < 4; i++) { R.mesh; win(g, -5 + i * 2.6, 2.4, 3.02, 0, 0.8, 2.6, { shutters: null, lit: i === 1 }); }
  for (let i = 0; i < 4; i++) box(g, 0.7, 5.5, 0.9, MAT.trim(), -6 + i * 2.6 + 1.3, 0.5, 3.4);
  // torre sineira com flecha
  box(g, 3.6, 13, 3.6, MAT.sand(), 5.6, 0.5, 0);
  cornice(g, 0, 0, 0);
  const tw = G();
  tw.position.set(5.6, 0, 0);
  g.add(tw);
  for (const [x, z, ry] of [[0, 1.82, 0], [1.82, 0, Math.PI / 2]]) win(tw, x, 10.2, z, ry, 1.0, 1.8, { shutters: null });
  box(tw, 4, 0.35, 4, MAT.trim(), 0, 13.5, 0);
  const sp = R.mesh(new THREE.ConeGeometry(2.8, 8, 4), MAT.roofSlate(), 0, 17.85, 0);
  sp.rotation.y = Math.PI / 4;
  tw.add(sp);
  box(tw, 0.12, 1.6, 0.12, MAT.gold(), 0, 21.8, 0);
  box(tw, 0.9, 0.12, 0.12, MAT.gold(), 0, 22.8, 0);
  door(tw, 0, 0.5, 1.82, 0, 1.4, 2.6);
  // rosácea na fachada
  const ros = R.mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 20), M('#2a3a5a', { emissive: '#3a2a6a', emissiveIntensity: 0.4 }), -6.52, 5.4, 0);
  ros.rotation.z = Math.PI / 2;
  g.add(ros);
  const rf = R.mesh(new THREE.TorusGeometry(1.15, 0.16, 8, 24), MAT.trim(), -6.55, 5.4, 0);
  rf.rotation.y = Math.PI / 2;
  g.add(rf);
  door(g, -6.52, 0.5, 0, -Math.PI / 2, 1.6, 2.8);
  // cemitério / jardim
  for (let i = 0; i < 6; i++) box(g, 0.5, 0.8, 0.18, MAT.trim(), -4 + i * 1.3, 0.5, -4.6);
  return { g, anchor: [0, 24, 0] };
}

// ---------- torre de vigia de madeira (substitui o obelisco) ----------
export function obelisk() {
  const g = G();
  box(g, 5, 0.4, 5, MAT.stone(), 0, 0, 0);
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) box(g, 0.4, 10, 0.4, MAT.wood(), x, 0.4, z);
  for (let y = 2; y < 10; y += 3) for (const s of [-1, 1]) { const b = R.mesh(R.rbox(3.4, 0.18, 0.18, 0.03), MAT.wood(), 0, y, s * 1.4); b.rotation.z = 0.7; g.add(b); const b2 = R.mesh(R.rbox(0.18, 0.18, 3.4, 0.03), MAT.wood(), s * 1.4, y, 0); b2.rotation.x = 0.7; g.add(b2); }
  box(g, 4.2, 0.3, 4.2, MAT.wood(), 0, 10.4, 0);
  box(g, 4.2, 1.1, 0.15, MAT.wood(), 0, 10.7, 2.05);
  box(g, 4.2, 1.1, 0.15, MAT.wood(), 0, 10.7, -2.05);
  box(g, 0.15, 1.1, 4.2, MAT.wood(), 2.05, 10.7, 0);
  box(g, 0.15, 1.1, 4.2, MAT.wood(), -2.05, 10.7, 0);
  pyramidRoof(g, 4.6, 4.6, 12.6, 2.6, MAT.roofRed());
  for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) box(g, 0.2, 2, 0.2, MAT.wood(), x, 10.7, z);
  g.add(R.troops([{ x: 0.6, z: 0.8, y: 10.7, ry: 0.8 }]));
  R.flagPole(g, 0, 15.2, 0, 2.5);
  return { g, anchor: [0, 18, 0] };
}

// ---------- acampamento de guerra ----------
export function warTent(color = CRIMSON) {
  const g = G();
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const t = c.getContext('2d');
  for (let i = 0; i < 8; i++) { t.fillStyle = i % 2 ? color : '#e8dcc4'; t.fillRect(i * 8, 0, 8, 8); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = R.painted(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  g.add(R.mesh(new THREE.CylinderGeometry(2.4, 2.4, 2, 16, 1, true), mat, 0, 1, 0));
  g.add(R.mesh(new THREE.ConeGeometry(2.7, 2.6, 16), M('#e8dcc4'), 0, 3.3, 0));
  g.add(R.mesh(new THREE.TorusGeometry(2.5, 0.1, 6, 24).rotateX(Math.PI / 2), M(color), 0, 2.0, 0));
  box(g, 1.2, 1.7, 0.1, M('#2a1a10'), 0, 0, 2.38);
  R.flagPole(g, 0, 4.6, 0, 1.8);
  return { g, anchor: [0, 7, 0] };
}
export function camp() {
  const g = G();
  const pos = [[0, 0], [6, 1], [12, 0], [3, 6], [9, 7]];
  pos.forEach(([x, z], i) => { const t = warTent(i % 2 ? '#27467a' : CRIMSON); t.g.position.set(x, 0, z); g.add(t.g); });
  // fogueira
  R.cylinder(g, 0.8, 0.25, MAT.stone(), 6, 0, 4, 12);
  for (let i = 0; i < 4; i++) { const l = R.mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6), MAT.wood(), 6, 0.4, 4); l.rotation.set(0.9, i * 1.57, 0); g.add(l); }
  // cavaletes de armas e bonecos de treino
  for (const [x, z] of [[-3, 6], [14, 5]]) {
    box(g, 2.6, 0.2, 0.3, MAT.wood(), x, 1.5, z);
    for (let i = 0; i < 5; i++) R.cylinder(g, 0.04, 2.4, M('#6a4a2a'), x - 1 + i * 0.5, 0, z + 0.1, 5);
  }
  for (let i = 0; i < 3; i++) { box(g, 0.2, 1.8, 0.2, MAT.wood(), -2 + i * 2.2, 0, 11); box(g, 1.2, 0.2, 0.2, MAT.wood(), -2 + i * 2.2, 1.3, 11); g.add(R.mesh(new THREE.SphereGeometry(0.4, 10, 8), M('#c9a86a'), -2 + i * 2.2, 2.1, 11)); }
  const tr = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) tr.push({ x: -2.6 + i * 2.2 + (j % 2) * 0.2, z: 13 + j * 1.2, y: 0, ry: Math.PI });
  g.add(R.troops(tr, { body: CRIMSON, scale: 1.1 }));
  return { g, anchor: [6, 8, 6] };
}
