// Arquitetura detalhada: reboco liso com cunhais de pedra, cornijas, janelas emolduradas, beirais e varandas.
import * as R from './rok.js';
import { gableGeo } from './kit.js';
const { THREE, MAT, M, PAL } = R;
const G = () => new THREE.Group();

// ---------- elementos ----------
function box(g, w, h, d, mat, x, y, z, ry = 0) {
  const m = R.mesh(R.rbox(w, h, d, 0.12), mat, x, y + h / 2, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}
/** Pedras de cunhal alternadas nos quatro cantos. */
function quoins(g, w, d, y0, h, mat = MAT.trim()) {
  const geos = [];
  for (let y = y0, k = 0; y < y0 + h - 0.3; y += 0.55, k++) {
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const long = k % 2 === 0;
      const b = R.rbox(long ? 0.9 : 0.55, 0.5, long ? 0.55 : 0.9, 0.08);
      b.translate(sx * (w / 2 - (long ? 0.4 : 0.22)), y + 0.25, sz * (d / 2 - (long ? 0.22 : 0.4)));
      geos.push(b);
    }
  }
  g.add(R.mesh(R.mergeGeometries(geos), mat));
}
function band(g, w, d, y, t = 0.3, mat = MAT.blue(), th = 0.4) {
  box(g, w, t, th, mat, 0, y, d / 2 - th / 2 + 0.05);
  box(g, w, t, th, mat, 0, y, -d / 2 + th / 2 - 0.05);
  box(g, th, t, d, mat, w / 2 - th / 2 + 0.05, y, 0);
  box(g, th, t, d, mat, -w / 2 + th / 2 - 0.05, y, 0);
}
function cornice(g, w, d, y, mat = MAT.trim(), t = 0.35, out = 0.25) {
  box(g, w + out * 2, t, d + out * 2, mat, 0, y, 0);
}
const winGlass = (lit) => M(lit ? '#ffcf7a' : '#2a3442', lit ? { emissive: '#ff9a3a', emissiveIntensity: 1.6 } : { roughness: 0.25, metalness: 0.3 });
/** Janela em arco com moldura, peitoril e venezianas abertas. */
function win(g, x, y, z, ry, w = 0.9, h = 1.4, opts = {}) {
  const { shutters = PAL.blue, lit = false, arch = true } = opts;
  const p = G();
  // moldura de pedra
  box(p, w + 0.36, h + 0.3, 0.16, MAT.trim(), 0, -0.15, 0.02);
  if (arch) {
    const a = R.mesh(new THREE.CylinderGeometry(w / 2 + 0.18, w / 2 + 0.18, 0.16, 16, 1, false, -Math.PI / 2, Math.PI), MAT.trim(), 0, h, 0.02);
    a.rotation.x = Math.PI / 2;
    p.add(a);
  }
  // vidro recuado
  box(p, w, h, 0.1, winGlass(lit), 0, 0, 0.06);
  if (arch) {
    const a2 = R.mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.1, 16, 1, false, -Math.PI / 2, Math.PI), winGlass(lit), 0, h, 0.07);
    a2.rotation.x = Math.PI / 2;
    p.add(a2);
  }
  box(p, w * 0.08, h, 0.12, MAT.wood(), 0, 0, 0.1);
  // peitoril
  box(p, w + 0.6, 0.14, 0.34, MAT.trim(), 0, -0.2, 0.14);
  // venezianas
  if (shutters) {
    for (const s of [-1, 1]) {
      const sh = R.mesh(R.rbox(w * 0.5, h, 0.07, 0.03), M(shutters, { roughness: 0.7 }), s * (w / 2 + w * 0.3), h / 2, 0.22);
      sh.rotation.y = s * 0.5;
      p.add(sh);
    }
  }
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
}
/** Porta de tábuas com moldura em arco e degraus. */
function door(g, x, y, z, ry, w = 1.3, h = 2.2) {
  const p = G();
  box(p, w + 0.5, h + 0.3, 0.2, MAT.trim(), 0, 0, 0);
  const a = R.mesh(new THREE.CylinderGeometry(w / 2 + 0.25, w / 2 + 0.25, 0.2, 16, 1, false, -Math.PI / 2, Math.PI), MAT.trim(), 0, h + 0.3, 0);
  a.rotation.x = Math.PI / 2;
  p.add(a);
  box(p, w, h + 0.2, 0.14, MAT.wood(), 0, 0, 0.1);
  const a2 = R.mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.14, 16, 1, false, -Math.PI / 2, Math.PI), MAT.wood(), 0, h + 0.2, 0.1);
  a2.rotation.x = Math.PI / 2;
  p.add(a2);
  for (const yy of [0.5, 1.6]) box(p, w * 0.95, 0.12, 0.06, M('#3a3634', { metalness: 0.6, roughness: 0.4 }), 0, yy, 0.2);
  box(p, w + 0.9, 0.22, 0.7, MAT.trim(), 0, -0.22, 0.35);
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
}
/** Toldo listrado inclinado. */
function awning(g, x, y, z, ry, w = 2.4, colors = [PAL.blue, '#f4ecdc']) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const t = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    t.fillStyle = colors[i % 2];
    t.fillRect(i * 8, 0, 8, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const p = G();
  const cloth = R.mesh(new THREE.BoxGeometry(w, 0.06, 1.2), R.painted(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })), 0, 0, 0.55);
  cloth.rotation.x = 0.42;
  p.add(cloth);
  // franja ondulada
  for (let i = 0; i < 8; i++) p.add(R.mesh(new THREE.ConeGeometry(w / 16, 0.25, 4), M(colors[i % 2]), -w / 2 + w / 16 + (i * w) / 8, -0.36, 1.08));
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
}
/** Varanda de madeira com guarda-corpo. */
function balcony(g, x, y, z, ry, w = 2.4) {
  const p = G();
  box(p, w, 0.18, 1, MAT.wood(), 0, 0, 0.5);
  for (let i = 0; i <= 6; i++) box(p, 0.08, 0.8, 0.08, MAT.wood(), -w / 2 + (i * w) / 6, 0.18, 0.95);
  box(p, w + 0.1, 0.1, 0.12, MAT.wood(), 0, 0.98, 0.95);
  for (const s of [-1, 1]) {
    const b = R.mesh(R.rbox(0.14, 0.9, 0.14, 0.03), MAT.wood(), s * (w / 2 - 0.2), -0.35, 0.5);
    b.rotation.x = 0.7;
    p.add(b);
  }
  // vasos de flor
  for (let i = 0; i < 3; i++) {
    box(p, 0.35, 0.3, 0.3, M('#b0603a'), -0.7 + i * 0.7, 0.18, 0.6);
    p.add(R.mesh(new THREE.IcosahedronGeometry(0.26, 1), M(i % 2 ? '#e84a6a' : '#5fae3a'), -0.7 + i * 0.7, 0.66, 0.6));
  }
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
}
/** Telhado de duas águas com beiral, cumeeira e pontas de vigas. */
function gable(g, w, d, y, h, mat, axis = 'x') {
  const geo = gableGeo(w, d, h, 0.5);
  const roof = R.mesh(geo, [mat, MAT.plaster()], 0, y, 0);
  if (axis === 'z') roof.rotation.y = Math.PI / 2;
  g.add(roof);
  const ridge = R.mesh(new THREE.CylinderGeometry(0.16, 0.16, (axis === 'x' ? w : d) + 1, 8), M('#5a3020'), 0, y + h + 0.05, 0);
  ridge.rotation.z = Math.PI / 2;
  if (axis === 'z') ridge.rotation.set(Math.PI / 2, 0, 0);
  g.add(ridge);
  // pontas das vigas sob o beiral
  const n = Math.floor((axis === 'x' ? w : d) / 0.9);
  const geos = [];
  for (let i = 0; i <= n; i++) {
    const t = -((axis === 'x' ? w : d) / 2) + (i * (axis === 'x' ? w : d)) / n;
    for (const s of [-1, 1]) {
      const b = R.rbox(0.22, 0.22, 0.6, 0.04);
      if (axis === 'x') b.translate(t, y - 0.15, s * (d / 2 + 0.2));
      else b.translate(s * (w / 2 + 0.2), y - 0.15, t);
      geos.push(b);
    }
  }
  g.add(R.mesh(R.mergeGeometries(geos), MAT.wood()));
}
function chimney(g, x, y, z, h = 2.4) {
  box(g, 0.8, h, 0.8, MAT.sand(), x, y, z);
  box(g, 1.0, 0.25, 1.0, MAT.trim(), x, y + h, z);
}
function barrels(g, x, z, n = 3) {
  for (let i = 0; i < n; i++) {
    const b = R.mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.95, 14), MAT.wood(), x + (i % 2) * 0.8, 0.48 + (i > 1 ? 0.95 : 0), z + (i === 1 ? 0.3 : 0));
    g.add(b);
    for (const yy of [-0.3, 0.3]) {
      const hoop = R.mesh(new THREE.TorusGeometry(0.37, 0.03, 4, 16), M('#3a3634', { metalness: 0.5 }), b.position.x, b.position.y + yy, b.position.z);
      hoop.rotation.x = Math.PI / 2;
      g.add(hoop);
    }
  }
}
function flowerBed(g, x, z, w = 2) {
  box(g, w, 0.35, 0.7, MAT.trim(), x, 0, z);
  for (let i = 0; i < Math.round(w * 3); i++) g.add(R.mesh(new THREE.IcosahedronGeometry(0.2, 1), M(['#e84a6a', '#f2d04e', '#ffffff', '#c87ae8', '#5fae3a'][i % 5]), x - w / 2 + 0.2 + i * 0.33, 0.5, z + ((i % 2) - 0.5) * 0.2));
}
export { win, door, awning, balcony, gable, chimney, barrels, flowerBed, quoins, cornice, box };

// ---------- casas ----------
export function house(v = 0) {
  const g = G();
  const roofs = [MAT.roofTerra(), MAT.roofBlue()];
  if (v % 3 === 2) {
    // casa de cúpula (estilo Auren)
    box(g, 6, 0.5, 6, MAT.stone(), 0, 0, 0);
    box(g, 5, 1.2, 5, MAT.sand(), 0, 0.5, 0);
    box(g, 4.8, 3.2, 4.8, MAT.plasterW(), 0, 1.7, 0);
    quoins(g, 4.8, 4.8, 1.7, 3.2);
    cornice(g, 4.8, 4.8, 4.9, MAT.trim(), 0.3, 0.2);
    band(g, 5.3, 5.3, 5.2, 0.22);
    box(g, 4.9, 0.1, 4.9, MAT.plasterW(), 0, 5.2, 0);
    door(g, 0.8, 0.5, 2.42, 0, 1.1, 2);
    win(g, -1.3, 2.3, 2.42, 0, 0.8, 1.2);
    win(g, 2.42, 2.3, 0, Math.PI / 2, 0.8, 1.2);
    R.cylinder(g, 1.7, 0.9, MAT.plasterW(), 0, 5.4, 0, 24);
    R.dome(g, 1.8, 0, 6.3, 0, null);
    awning(g, 0.8, 3.2, 2.4, 0, 2);
    flowerBed(g, -1.2, 3.3, 1.8);
    return { g, anchor: [0, 10, 0] };
  }
  const roof = roofs[v % 2];
  box(g, 6.4, 0.4, 5.4, MAT.stone(), 0, 0, 0);
  box(g, 5.6, 1.6, 4.6, MAT.sand(), 0, 0.4, 0); // embasamento de pedra
  box(g, 5.4, 2.8, 4.4, MAT.plaster(), 0, 2.0, 0);
  quoins(g, 5.4, 4.4, 2.0, 2.8);
  cornice(g, 5.4, 4.4, 4.8, MAT.wood(), 0.25, 0.15);
  gable(g, 5.6, 4.6, 5.05, 2.6, roof, 'x');
  chimney(g, 1.6, 5.4, -1.0, 3);
  door(g, -1.2, 0.4, 2.32, 0, 1.1, 2);
  win(g, 1.2, 1.0, 2.32, 0, 0.8, 1.0, { arch: false });
  win(g, -1.3, 2.9, 2.22, 0, 0.8, 1.2, { lit: false });
  win(g, 1.3, 2.9, 2.22, 0, 0.8, 1.2);
  win(g, 2.72, 2.9, 0, Math.PI / 2, 0.8, 1.2);
  win(g, 2.82, 1.0, 0, Math.PI / 2, 0.7, 0.9, { arch: false, shutters: null });
  if (v % 4 === 0) balcony(g, 0, 2.3, 2.22, 0, 2.6);
  else awning(g, 1.2, 2.4, 2.32, 0, 2.2, v % 2 ? ['#c0643a', '#f4ecdc'] : [PAL.blue, '#f4ecdc']);
  barrels(g, 2.6, 2.9);
  flowerBed(g, -2.2, 3.1, 1.4);
  return { g, anchor: [0, 10, 0] };
}

// ---------- castelo / prefeitura ----------
export function cityHall() {
  const g = G();
  box(g, 26, 1.4, 26, MAT.stone(), 0, 0, 0);
  for (let i = 0; i < 5; i++) box(g, 9, 0.28, 1.1, MAT.trim(), 0, 0.28 * i, 13.6 - i * 0.55);
  // corpo principal
  box(g, 17, 1.6, 17, MAT.sand(), 0, 1.4, 0);
  box(g, 16.4, 7.4, 16.4, MAT.plasterW(), 0, 3.0, 0);
  quoins(g, 16.4, 16.4, 3.0, 7.4);
  cornice(g, 16.4, 16.4, 10.3, MAT.trim(), 0.45, 0.35);
  band(g, 17.4, 17.4, 10.75, 0.4);
  box(g, 16.8, 0.2, 16.8, M('#c9b48e'), 0, 10.75, 0);
  // parapeito com pequenas ameias
  const geos = [];
  for (let k = -7.8; k <= 7.8; k += 1.2) for (const [x, z] of [
    [k, -8.3],
    [k, 8.3],
    [-8.3, k],
    [8.3, k],
  ]) {
    const b = R.rbox(0.6, 0.8, 0.6, 0.08);
    b.translate(x, 11.55, z);
    geos.push(b);
  }
  g.add(R.mesh(R.mergeGeometries(geos), MAT.plasterW()));
  // arcada frontal (colunas e arcos)
  box(g, 11, 0.5, 3.4, MAT.trim(), 0, 3.0, 9.6);
  for (let i = 0; i < 6; i++) {
    const x = -5 + i * 2;
    R.cylinder(g, 0.32, 4.6, MAT.plasterW(), x, 3.5, 10.8, 16);
    box(g, 0.9, 0.4, 0.9, MAT.trim(), x, 3.5, 10.8);
    box(g, 0.9, 0.4, 0.9, MAT.trim(), x, 7.9, 10.8);
  }
  box(g, 11.4, 1.6, 0.9, MAT.plasterW(), 0, 8.3, 10.8);
  box(g, 11.8, 0.3, 1.2, MAT.trim(), 0, 9.9, 10.8);
  box(g, 11, 0.3, 3.4, MAT.blue(), 0, 9.1, 9.6);
  door(g, 0, 3.5, 8.22, 0, 2.2, 3.2);
  for (const x of [-3.5, 3.5]) win(g, x, 4.6, 8.22, 0, 1.0, 1.8, { lit: false });
  // janelas laterais em dois andares
  for (const s of [-1, 1]) for (const k of [-5, 0, 5]) {
    win(g, s * 8.22, 4.4, k, s * Math.PI / 2, 1.0, 1.8);
    win(g, s * 8.22, 7.6, k, s * Math.PI / 2, 0.9, 1.5);
  }
  for (const k of [-5, 0, 5]) win(g, k, 7.6, 8.22, 0, 0.9, 1.5);
  // tambor e cúpula
  R.cylinder(g, 6.2, 0.6, MAT.trim(), 0, 11.0, 0, 48);
  R.cylinder(g, 5.6, 3.4, MAT.plasterW(), 0, 11.6, 0, 48);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = G();
    win(p, 0, 0.5, 0, 0, 0.8, 1.6, { shutters: null });
    p.position.set(Math.cos(a) * 5.55, 11.6, Math.sin(a) * 5.55);
    p.rotation.y = -a + Math.PI / 2;
    g.add(p);
    R.cylinder(g, 0.22, 3.4, MAT.trim(), Math.cos(a + 0.26) * 5.7, 11.6, Math.sin(a + 0.26) * 5.7, 8);
  }
  R.cylinder(g, 6.0, 0.5, MAT.trim(), 0, 15.0, 0, 48);
  R.dome(g, 5.6, 0, 15.5, 0, null);
  // lanterna no topo
  R.cylinder(g, 0.9, 1.4, MAT.plasterW(), 0, 21.7, 0, 16);
  R.dome(g, 1.0, 0, 23.1, 0, null);
  // quatro minaretes
  for (const [x, z] of [
    [-9.5, -9.5],
    [9.5, -9.5],
    [-9.5, 9.5],
    [9.5, 9.5],
  ]) {
    R.cylinder(g, 1.7, 2, MAT.sand(), x, 1.4, z, 20);
    R.cylinder(g, 1.35, 13, MAT.plasterW(), x, 3.4, z, 20);
    for (const y of [7, 11.5]) R.cylinder(g, 1.5, 0.35, MAT.trim(), x, y, z, 20);
    R.cylinder(g, 1.75, 0.5, MAT.trim(), x, 16.4, z, 20);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      R.cylinder(g, 0.12, 1.6, MAT.plasterW(), x + Math.cos(a) * 1.4, 16.9, z + Math.sin(a) * 1.4, 6);
    }
    R.cylinder(g, 1.6, 0.3, MAT.trim(), x, 18.5, z, 20);
    R.dome(g, 1.4, x, 18.8, z, null);
    const p = G();
    win(p, 0, 0, 0, 0, 0.6, 1.2, { shutters: null });
    p.position.set(x + Math.sign(x) * 0, 9, z + 1.36);
    g.add(p);
  }
  // estandartes e mastros
  R.banner(g, -2.6, 9.6, 11.3, 0, 3.6);
  R.banner(g, 2.6, 9.6, 11.3, 0, 3.6);
  for (const x of [-5, 5]) R.flagPole(g, x, 1.4, 13, 7);
  flowerBed(g, -8, 13.2, 4);
  flowerBed(g, 8, 13.2, 4);
  return { g, anchor: [0, 28, 0] };
}

// ---------- quartel ----------
export function barracks() {
  const g = G();
  box(g, 17, 0.4, 17, MAT.stone(), 0, 0, 0);
  box(g, 14, 0.06, 9.5, M('#b8986a'), 0, 0.4, 2.4);
  box(g, 13.6, 1.4, 5.6, MAT.sand(), 0, 0.4, -5);
  box(g, 13.2, 4.4, 5.2, MAT.plaster(), 0, 1.8, -5);
  const q = G();
  quoins(q, 13.2, 5.2, 1.8, 4.4);
  q.position.z = -5;
  g.add(q);
  const c = G();
  cornice(c, 13.2, 5.2, 6.2, MAT.trim(), 0.35, 0.25);
  band(c, 13.8, 5.8, 6.55, 0.28);
  box(c, 13.2, 0.12, 5.2, M('#c9b48e'), 0, 6.55, 0);
  c.position.z = -5;
  g.add(c);
  const geos = [];
  for (let k = -6.2; k <= 6.2; k += 1.1) {
    const b = R.rbox(0.55, 0.75, 0.55, 0.08);
    b.translate(k, 7.2, -2.55);
    geos.push(b);
    const b2 = R.rbox(0.55, 0.75, 0.55, 0.08);
    b2.translate(k, 7.2, -7.45);
    geos.push(b2);
  }
  g.add(R.mesh(R.mergeGeometries(geos), MAT.plaster()));
  door(g, 0, 0.4, -2.36, 0, 2.2, 2.8);
  for (const x of [-4.4, -2.4, 2.4, 4.4]) win(g, x, 3.4, -2.36, 0, 0.9, 1.5);
  R.banner(g, -1.9, 6.0, -2.25, 0, 3);
  R.banner(g, 1.9, 6.0, -2.25, 0, 3);
  for (const x of [-7.2, 7.2]) {
    R.cylinder(g, 1.9, 1.6, MAT.sand(), x, 0.4, -5, 20);
    R.cylinder(g, 1.6, 8.4, MAT.plaster(), x, 2, -5, 20);
    R.cylinder(g, 1.85, 0.4, MAT.trim(), x, 8.4, -5, 20);
    R.cone(g, 2.1, 4, R.glaze(), x, 8.8, -5);
    R.flagPole(g, x, 12.6, -5, 2.4);
  }
  // muro baixo do pátio com pilares
  for (const [w, d, x, z] of [
    [14.4, 0.7, 0, 7.4],
    [0.7, 9.8, -7.2, 2.6],
    [0.7, 9.8, 7.2, 2.6],
  ]) {
    box(g, w, 1.2, d, MAT.plaster(), x, 0.4, z);
    box(g, w + 0.2, 0.18, d + 0.2, MAT.trim(), x, 1.6, z);
  }
  for (const [x, z] of [
    [-7.2, 7.4],
    [7.2, 7.4],
    [-2.4, 7.4],
    [2.4, 7.4],
  ]) {
    box(g, 0.9, 1.9, 0.9, MAT.sand(), x, 0.4, z);
    R.brazierFx?.(g, x, 2.3, z);
  }
  for (const x of [-5, 5]) {
    box(g, 2.4, 0.2, 0.3, MAT.wood(), x, 1.6, 6.5);
    for (let i = 0; i < 5; i++) R.cylinder(g, 0.04, 2.4, M('#6a4a2a'), x - 1 + i * 0.5, 0.4, 6.6, 5);
  }
  barrels(g, -6, 0.5);
  const pts = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) pts.push({ x: -4.5 + j * 1.5, z: -0.5 + i * 1.5, y: 0.46, ry: 0 });
  g.add(R.troops(pts, { scale: 1.15 }));
  const sg = R.troops([{ x: 0, z: 4.6, y: 0.46, ry: Math.PI }], { body: '#8a2a22', scale: 1.3 });
  g.add(sg);
  return { g, anchor: [0, 14, 0] };
}

// ---------- muralha ----------
export function walls(half) {
  const g = G();
  const H = 7.5;
  const T = 3.4;
  const seg = (x, z, len, rot) => {
    const s = G();
    box(s, len, 2.2, T + 0.8, MAT.sand(), 0, 0, 0); // talude de pedra
    box(s, len, H - 2.2, T, MAT.plaster(), 0, 2.2, 0);
    box(s, len, 0.35, T + 0.5, MAT.trim(), 0, H - 0.1, 0);
    box(s, len - 0.2, 0.08, T - 0.6, M('#a8835a'), 0, H + 0.25, 0); // passadiço
    box(s, len, 0.25, T + 0.55, MAT.blue(), 0, H - 1.1, 0);
    // contrafortes
    for (let k = -len / 2 + 3; k < len / 2 - 1; k += 7) for (const sd of [-1, 1]) box(s, 1.2, H - 1.3, 0.7, MAT.sand(), k, 0, sd * (T / 2 + 0.3));
    // ameias menores, dos dois lados
    const geos = [];
    for (let k = -len / 2 + 0.6; k < len / 2 - 0.4; k += 1.25) for (const sd of [-1, 1]) {
      const b = R.rbox(0.7, 0.95, 0.5, 0.08);
      b.translate(k, H + 0.7, sd * (T / 2 + 0.05));
      geos.push(b);
    }
    s.add(R.mesh(R.mergeGeometries(geos), MAT.plaster()));
    for (let k = -len / 2 + 6.5; k < len / 2 - 4; k += 14) R.banner(s, k, H - 1.3, T / 2 + 0.42, 0, 3.6);
    s.position.set(x, 0, z);
    s.rotation.y = rot;
    g.add(s);
  };
  const L = half * 2;
  seg(0, -half, L, 0);
  seg(-half, 0, L, Math.PI / 2);
  seg(half, 0, L, -Math.PI / 2);
  seg(-half / 2 - 4, half, L / 2 - 8, Math.PI);
  seg(half / 2 + 4, half, L / 2 - 8, Math.PI);
  const tower = (x, z, r, h, top) => {
    R.cylinder(g, r + 0.5, 2.4, MAT.sand(), x, 0, z, 28);
    R.cylinder(g, r, h - 2.4, MAT.sand(), x, 2.4, z, 28);
    R.cylinder(g, r + 0.35, 0.5, MAT.trim(), x, h, z, 28);
    R.cylinder(g, r + 0.25, 0.25, MAT.blue(), x, h - 1.3, z, 28);
    R.merlonsRingAt(g, x, z, r + 0.2, h + 0.5, MAT.sand(), Math.round(r * 5), 0.7, 1);
    if (top === 'dome') {
      R.cylinder(g, r * 0.62, 1.4, MAT.plasterW(), x, h + 0.5, z, 20);
      R.dome(g, r * 0.66, x, h + 1.9, z, null);
    }
    R.flagPole(g, x, h + 0.5 + (top === 'dome' ? r * 0.66 * 1.12 + 1.4 : 0), z, 3.2);
  };
  for (const [x, z] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ]) tower(x, z, 3.3, 12, 'dome');
  for (const t of [-0.5, 0.5]) {
    tower(t * half, -half, 2.4, 10, 'none');
    tower(-half, t * half, 2.4, 10, 'none');
    tower(half, t * half, 2.4, 10, 'none');
  }
  // portão monumental
  const gate = G();
  for (const x of [-5.2, 5.2]) {
    R.cylinder(gate, 3.2, 2.6, MAT.sand(), x, 0, 0, 28);
    R.cylinder(gate, 2.8, 11, MAT.sand(), x, 2.6, 0, 28);
    R.cylinder(gate, 3.1, 0.5, MAT.trim(), x, 13.6, 0, 28);
    R.merlonsRingAt(gate, x, 0, 2.9, 14.1, MAT.sand(), 14, 0.7, 1);
    R.cylinder(gate, 1.9, 1.4, MAT.plasterW(), x, 14.1, 0, 20);
    R.dome(gate, 2.0, x, 15.5, 0, null);
  }
  box(gate, 7.6, 10, 4.4, MAT.plaster(), 0, 0, 0);
  box(gate, 8.2, 0.4, 5, MAT.trim(), 0, 10, 0);
  door(gate, 0, 0, 2.25, 0, 3.4, 4.4);
  win(gate, -2.2, 7, 2.25, 0, 0.7, 1.3, { shutters: null });
  win(gate, 2.2, 7, 2.25, 0, 0.7, 1.3, { shutters: null });
  R.banner(gate, 0, 9.6, 2.5, 0, 2.6);
  gate.position.set(0, 0, half);
  g.add(gate);
  return g;
}

// ---------- demais edifícios no padrão detalhado ----------
function base(g, w, d, h = 0.4) {
  box(g, w, h, d, MAT.stone(), 0, 0, 0);
}
function building(g, w, d, h, x, z, opts = {}) {
  const { roof = MAT.roofTerra(), roofH = 2.6, wall = MAT.plaster(), axis = 'x', wins = 2, plinth = 1.2 } = opts;
  const p = G();
  box(p, w + 0.3, plinth, d + 0.3, MAT.sand(), 0, 0, 0);
  box(p, w, h, d, wall, 0, plinth, 0);
  quoins(p, w, d, plinth, h);
  cornice(p, w, d, plinth + h, MAT.wood(), 0.22, 0.12);
  gable(p, w + 0.2, d + 0.2, plinth + h + 0.22, roofH, roof, axis);
  for (let i = 0; i < wins; i++) {
    const t = -w / 2 + (w / (wins + 1)) * (i + 1);
    win(p, t, plinth + h * 0.35, d / 2 + 0.02, 0, 0.8, 1.1);
  }
  win(p, w / 2 + 0.02, plinth + h * 0.35, 0, Math.PI / 2, 0.8, 1.1);
  p.position.set(x, 0, z);
  g.add(p);
  return p;
}
function horse(g, x, z, ry, col) {
  const h = G();
  const m = M(col, { roughness: 0.7 });
  const body = R.mesh(new THREE.CapsuleGeometry(0.45, 1.3, 4, 10), m, 0, 1.3, 0);
  body.rotation.z = Math.PI / 2;
  h.add(body);
  const neck = R.mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 8), m, 0.85, 1.8, 0);
  neck.rotation.z = -0.7;
  h.add(neck);
  const head = R.mesh(new THREE.CapsuleGeometry(0.18, 0.45, 4, 8), m, 1.25, 2.05, 0);
  head.rotation.z = Math.PI / 2 + 0.5;
  h.add(head);
  h.add(R.mesh(R.rbox(0.12, 0.5, 0.3, 0.04), M('#2a1a10'), 0.75, 2.0, 0));
  for (const [dx, dz] of [[-0.55, -0.22], [0.55, -0.22], [-0.55, 0.22], [0.55, 0.22]]) h.add(R.mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.0, 6), m, dx, 0.5, dz));
  const tail = R.mesh(new THREE.CapsuleGeometry(0.09, 0.6, 3, 6), M('#2a1a10'), -0.95, 1.1, 0);
  tail.rotation.z = -0.4;
  h.add(tail);
  h.add(R.mesh(R.rbox(0.7, 0.12, 0.8, 0.03), M(PAL.blue), 0, 1.75, 0));
  h.position.set(x, 0, z);
  h.rotation.y = ry;
  g.add(h);
}
export function stable() {
  const g = G();
  base(g, 16, 13);
  building(g, 12, 4.6, 3.6, 0, -3.6, { roof: MAT.roofTerra(), roofH: 2.4, wall: MAT.wood(), wins: 0, plinth: 0.8 });
  for (let i = 0; i < 4; i++) door(g, -4.5 + i * 3, 0.8, -1.28, 0, 1.6, 2.2);
  // cercado
  const fence = [];
  for (let x = -7; x <= 7; x += 1.4) { const b = R.rbox(0.2, 1.3, 0.2, 0.04); b.translate(x, 0.65 + 0.4, 5.8); fence.push(b); }
  for (const y of [0.8, 1.35]) { const b = R.rbox(14.2, 0.14, 0.12, 0.03); b.translate(0, y + 0.4, 5.8); fence.push(b); }
  for (const s of [-1, 1]) for (let z = 0; z <= 5.8; z += 1.45) { const b = R.rbox(0.2, 1.3, 0.2, 0.04); b.translate(s * 7, 1.05, z); fence.push(b); }
  g.add(R.mesh(R.mergeGeometries(fence), MAT.wood()));
  box(g, 14, 0.05, 6.6, M('#b8986a'), 0, 0.4, 2.6);
  ['#8a5a32', '#4e3220', '#d8c4a0', '#2e221a'].forEach((c, i) => horse(g, -4.5 + i * 3, 2 + (i % 2) * 1.8, i % 2 ? 0.4 : -0.3, c));
  // cocho e feno
  box(g, 2.4, 0.6, 0.8, MAT.wood(), 4.6, 0.4, 4.6);
  for (let i = 0; i < 3; i++) g.add(R.mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 14).rotateZ(Math.PI / 2), M('#d8b860'), -5.6 + i * 0.1, 0.9 + (i === 2 ? 1 : 0), 4.4 + (i % 2) * 1.1));
  return { g, anchor: [0, 10, 0] };
}
export function archery() {
  const g = G();
  base(g, 16, 13);
  box(g, 14, 0.05, 6.4, M('#9ec05a'), 0, 0.4, 2.2);
  building(g, 9, 4.6, 3.8, -1.8, -3.8, { roof: MAT.roofBlue(), roofH: 2.4, wins: 3 });
  door(g, -1.8, 1.2, -1.48, 0, 1.6, 2.2);
  // torre de vigia
  R.cylinder(g, 1.8, 1.2, MAT.sand(), 5.4, 0.4, -3.8, 20);
  R.cylinder(g, 1.5, 7, MAT.plaster(), 5.4, 1.6, -3.8, 20);
  R.cylinder(g, 1.8, 0.4, MAT.trim(), 5.4, 8.6, -3.8, 20);
  R.merlonsRingAt(g, 5.4, -3.8, 1.6, 9, MAT.plaster(), 8, 0.6, 0.8);
  R.flagPole(g, 5.4, 9, -3.8, 3);
  // alvos de palha
  const tc = document.createElement('canvas'); tc.width = tc.height = 128; const t = tc.getContext('2d');
  for (const [r, c] of [[64, '#e8dcb8'], [52, '#2f6fb3'], [40, '#f4ecdc'], [28, '#d23a2a'], [14, '#f2c14e']]) { t.fillStyle = c; t.beginPath(); t.arc(64, 64, r, 0, 7); t.fill(); }
  for (let i = 0; i < 300; i++) { t.strokeStyle = 'rgba(120,90,40,0.25)'; t.beginPath(); const a = Math.random() * 7, r = Math.random() * 64; t.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); t.lineTo(64 + Math.cos(a) * (r + 6), 64 + Math.sin(a) * (r + 6)); t.stroke(); }
  const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace;
  const face = R.painted(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  for (let i = 0; i < 4; i++) {
    const x = -5.2 + i * 3.4;
    const d = R.mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.35, 28), [M('#c9a86a'), face, face], x, 1.7, 4.9);
    d.rotation.x = Math.PI / 2;
    g.add(d);
    for (const s of [-1, 1]) { const l = R.mesh(R.rbox(0.14, 2, 0.14, 0.03), MAT.wood(), x + s * 0.5, 0.4 + 0.9, 5.2); l.rotation.z = s * 0.25; g.add(l); }
    for (let k = 0; k < 3; k++) { const a = R.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), M('#5a3a22'), x + (k - 1) * 0.3, 1.7 + (k % 2) * 0.25, 4.4); a.rotation.x = Math.PI / 2; g.add(a); }
  }
  const pts = [];
  for (let i = 0; i < 5; i++) pts.push({ x: -5.4 + i * 2.6, z: -0.2, y: 0.42, ry: Math.PI });
  g.add(R.troops(pts, { body: '#3f7f4a', shield: false, scale: 1.15 }));
  return { g, anchor: [0, 12, 0] };
}
export function siege() {
  const g = G();
  base(g, 15, 13);
  building(g, 10, 5, 4.2, -1.5, -3.4, { roof: MAT.roofTerra(), roofH: 2.8, wins: 2 });
  door(g, -1.5, 1.2, -0.88, 0, 2.6, 3.0);
  for (const [x, z, ry] of [[-3.5, 3.4, 0.4], [3.4, 3.6, -0.3]]) {
    const c = G();
    box(c, 3.2, 0.45, 2, MAT.wood(), 0, 0.55, 0);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const w = R.mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 14), MAT.wood(), s * 1.2, 0.5, t * 1.05); w.rotation.x = Math.PI / 2; c.add(w); }
    for (const s of [-1, 1]) { const u = R.mesh(R.rbox(0.25, 2.2, 0.25, 0.05), MAT.wood(), 0.2, 1.9, s * 0.7); u.rotation.z = -0.2; c.add(u); }
    const arm = R.mesh(R.rbox(0.22, 3.6, 0.22, 0.05), MAT.wood(), 0.6, 2.6, 0); arm.rotation.z = -0.9; c.add(arm);
    c.add(R.mesh(new THREE.SphereGeometry(0.35, 10, 8), M('#8a8a86'), -0.8, 1.2, 0));
    c.position.set(x, 0.4, z); c.rotation.y = ry; g.add(c);
  }
  for (let i = 0; i < 5; i++) g.add(R.mesh(new THREE.SphereGeometry(0.32, 10, 8), R.ROCK('#8a8a86'), 5.5 + (i % 3) * 0.6, 0.72 + (i > 2 ? 0.5 : 0), -0.6 + (i % 2) * 0.5));
  barrels(g, -6, 0.2);
  return { g, anchor: [0, 10, 0] };
}
export function tavern() {
  const g = G();
  base(g, 11, 10);
  const p = building(g, 8, 6, 3.4, 0, 0, { roof: MAT.roofTerra(), roofH: 3.4, wins: 2, plinth: 1.2 });
  door(g, 2.2, 1.2, 3.02, 0, 1.3, 2.2);
  balcony(g, -1.4, 3.2, 3.02, 0, 3.2);
  // placa pendurada
  box(g, 1.6, 0.12, 0.12, MAT.wood(), 3.6, 4.2, 3.4);
  box(g, 1.1, 0.8, 0.1, M('#7a2a22'), 3.9, 3.3, 3.6);
  chimney(g, -2.4, 5.8, -1.2, 3.4);
  for (let i = 0; i < 2; i++) {
    box(g, 1.8, 0.12, 0.9, MAT.wood(), -3 + i * 3.4, 0.9, 4.4);
    for (const s of [-1, 1]) box(g, 1.6, 0.1, 0.3, MAT.wood(), -3 + i * 3.4, 0.5, 4.4 + s * 0.8);
  }
  barrels(g, 4, 0.5);
  awning(g, 2.2, 3.4, 3.02, 0, 2.4, ['#7a2a22', '#f4ecdc']);
  return { g, anchor: [0, 12, 0] };
}
export function lumber() {
  const g = G();
  base(g, 12, 10, 0.3);
  building(g, 5, 4, 2.8, -2.4, -2.6, { roof: MAT.roofBlue(), roofH: 2, wall: MAT.wood(), wins: 1, plinth: 0.6 });
  const log = new THREE.CylinderGeometry(0.36, 0.36, 3.6, 12).rotateZ(Math.PI / 2);
  const pts = [];
  for (let l = 0; l < 3; l++) for (let i = 0; i < 4 - l; i++) pts.push([2.6, 0.66 + l * 0.62, 0.8 + i * 0.74 + l * 0.37]);
  for (let l = 0; l < 2; l++) for (let i = 0; i < 3 - l; i++) pts.push([-2.6, 0.66 + l * 0.62, 2.4 + i * 0.74 + l * 0.37]);
  const im = new THREE.InstancedMesh(log, M('#9a6a3a', { roughness: 0.9 }), pts.length);
  const end = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 3.62, 12).rotateZ(Math.PI / 2), M('#e2b882'), pts.length);
  const o = new THREE.Object3D();
  pts.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.rotation.set(0, Math.PI / 2, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); end.setMatrixAt(i, o.matrix); });
  im.castShadow = true; g.add(end, im);
  box(g, 3, 0.9, 1.1, MAT.wood(), 2.2, 0.3, -2.4);
  const saw = R.mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.06, 24), M('#c0c4c8', { metalness: 0.8, roughness: 0.3 }), 2.2, 1.6, -2.4); saw.rotation.x = Math.PI / 2; g.add(saw);
  for (let i = 0; i < 2; i++) g.add(R.mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.5, 12), M('#b88a5a'), -0.6 + i * 0.9, 0.55, 1.4));
  g.add(R.villagers([{ x: 0.6, z: 0.4, y: 0.3 }, { x: 3.6, z: -0.8, y: 0.3 }]));
  return { g, anchor: [0, 7, 0] };
}
export function farm() {
  const g = G();
  box(g, 12.4, 0.35, 10.4, M('#7a5a32'), 0, 0, 0);
  // sulcos
  for (let i = 0; i < 7; i++) box(g, 11.4, 0.18, 0.5, M('#5e4226'), 0, 0.35, -2.8 + i * 1.0);
  const stalk = R.mergeGeometries([0, 1, 2].map((k) => new THREE.ConeGeometry(0.16, 1.5 + k * 0.2, 4).translate(Math.cos(k * 2.1) * 0.15, 0.75 + k * 0.1, Math.sin(k * 2.1) * 0.15).rotateZ((k - 1) * 0.15).toNonIndexed()));
  const pts = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 14; j++) pts.push([-5.4 + j * 0.82, -2.8 + i * 1.0]);
  const im = new THREE.InstancedMesh(stalk, M('#ffffff', { roughness: 0.85 }), pts.length);
  const cob = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.11, 0.3, 2, 6), M('#f2c14e'), pts.length);
  const o = new THREE.Object3D(); const c = new THREE.Color();
  pts.forEach(([x, z], i) => { o.position.set(x, 0.45, z); o.rotation.set(0, i, 0); o.scale.set(1, 0.85 + ((i * 7) % 5) * 0.08, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, c.set(['#5fae3a', '#6cba42', '#53a034', '#7cc24c'][i % 4])); o.position.set(x + 0.18, 1.45, z); o.rotation.set(0.4, 0, 0.3); o.scale.setScalar(1); o.updateMatrix(); cob.setMatrixAt(i, o.matrix); });
  im.castShadow = true; g.add(im, cob);
  // celeiro
  building(g, 3.6, 3, 2.4, 4.2, -4.6, { roof: MAT.roofBlue(), roofH: 1.8, wall: MAT.wood(), wins: 0, plinth: 0.5 });
  // espantalho e cerca baixa
  box(g, 0.12, 2.4, 0.12, MAT.wood(), -3.6, 0.35, 0.5);
  box(g, 1.6, 0.12, 0.12, MAT.wood(), -3.6, 2.1, 0.5);
  g.add(R.mesh(new THREE.SphereGeometry(0.3, 10, 8), M('#d8c48a'), -3.6, 2.9, 0.5));
  g.add(R.mesh(new THREE.ConeGeometry(0.5, 0.4, 10), M('#c9a86a'), -3.6, 3.25, 0.5));
  g.add(R.villagers([{ x: -1.5, z: 1.6, y: 0.35 }, { x: 2.4, z: -0.4, y: 0.35 }]));
  return { g, anchor: [0, 7, 0] };
}
export function academy() {
  const g = G();
  box(g, 15, 0.6, 13, MAT.stone(), 0, 0, 0);
  for (let i = 0; i < 4; i++) box(g, 8, 0.25, 0.9, MAT.trim(), 0, 0.25 * i, 6.9 - i * 0.45);
  box(g, 12, 1.0, 9, MAT.sand(), 0, 0.6, -1);
  box(g, 11.6, 5.4, 8.6, MAT.plasterW(), 0, 1.6, -1);
  quoins(g, 11.6, 8.6, 1.6, 5.4);
  // pórtico de colunas com frontão
  for (let i = 0; i < 6; i++) { const x = -4.5 + i * 1.8; R.cylinder(g, 0.34, 5, MAT.plasterW(), x, 1.6, 4.4, 16); box(g, 0.8, 0.3, 0.8, MAT.trim(), x, 1.6, 4.4); box(g, 0.8, 0.3, 0.8, MAT.trim(), x, 6.3, 4.4); }
  box(g, 11.6, 0.6, 2.6, MAT.trim(), 0, 6.6, 3.6);
  const ped = R.mesh(gableGeo(11.6, 2.6, 1.6, 0.15), [MAT.roofBlue(), MAT.plasterW()], 0, 7.2, 3.6);
  g.add(ped);
  cornice(g, 11.6, 8.6, 7.0, MAT.trim(), 0.4, 0.25);
  door(g, 0, 1.6, 3.32, 0, 1.8, 2.8);
  for (const x of [-3.6, 3.6]) win(g, x, 2.6, 3.32, 0, 0.9, 1.6, { shutters: null });
  for (const k of [-3, 1]) win(g, 5.82, 2.6, k, Math.PI / 2, 0.9, 1.6);
  R.cylinder(g, 3.2, 0.5, MAT.trim(), 0, 7.4, -2, 32);
  R.cylinder(g, 2.8, 1.8, MAT.plasterW(), 0, 7.9, -2, 32);
  R.dome(g, 2.8, 0, 9.7, -2, null);
  // estátua
  box(g, 1.2, 1.2, 1.2, MAT.trim(), -5.6, 0.6, 5.6);
  g.add(R.mesh(new THREE.CapsuleGeometry(0.35, 1.2, 4, 8), M('#b8b4a8'), -5.6, 2.8, 5.6));
  g.add(R.mesh(new THREE.SphereGeometry(0.3, 10, 8), M('#b8b4a8'), -5.6, 3.8, 5.6));
  flowerBed(g, 5, 6.2, 3);
  return { g, anchor: [0, 15, 0] };
}
export function goldMine() {
  const g = G();
  box(g, 11, 0.3, 10, M('#8a7a62'), 0, 0, 0);
  // encosta rochosa em camadas
  const r = R.rng(5);
  const rocks = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.DodecahedronGeometry(1.2 + r() * 1.6, 1);
    const a = r() * Math.PI;
    s.scale(1.2, 0.8 + r() * 0.5, 1);
    s.translate(-4 + i * 0.55 + (r() - 0.5), 0.6 + r() * 1.8 + (i > 4 && i < 11 ? 1.2 : 0), -3.2 + (r() - 0.5) * 1.6);
    rocks.push(s.toNonIndexed());
  }
  g.add(R.mesh(R.mergeGeometries(rocks), R.ROCK('#8e8478')));
  // entrada com escoramento de madeira
  box(g, 3.4, 3.2, 1.2, M('#1a120c'), 0, 0.3, -1.8);
  for (const s of [-1, 1]) box(g, 0.4, 3.2, 0.5, MAT.wood(), s * 1.7, 0.3, -1.2);
  box(g, 4.2, 0.45, 0.6, MAT.wood(), 0, 3.4, -1.2);
  g.add(R.mesh(new THREE.ConeGeometry(0.2, 0.5, 6), M('#f2c14e', { emissive: '#ffb030', emissiveIntensity: 1.2 }), 1.3, 3.0, -0.9));
  // trilhos e vagonete com ouro
  for (const s of [-0.45, 0.45]) box(g, 0.1, 0.08, 5, M('#5a5450', { metalness: 0.6 }), s, 0.3, 1.2);
  for (let i = 0; i < 7; i++) box(g, 1.3, 0.1, 0.25, MAT.wood(), 0, 0.28, -1 + i * 0.75);
  box(g, 1.4, 0.8, 1.6, MAT.wood(), 0, 0.55, 1.8);
  const nug = [];
  for (let i = 0; i < 14; i++) { const s = new THREE.OctahedronGeometry(0.28, 0); s.translate((r() - 0.5) * 1.1, 1.45 + r() * 0.2, 1.8 + (r() - 0.5) * 1.3); nug.push(s); }
  for (let i = 0; i < 16; i++) { const s = new THREE.OctahedronGeometry(0.3, 0); s.translate(3 + (r() - 0.5) * 1.8, 0.45 + r() * 0.4, 1.6 + (r() - 0.5) * 1.8); nug.push(s); }
  g.add(R.mesh(R.mergeGeometries(nug), MAT.gold()));
  barrels(g, -3.6, 2.2, 2);
  g.add(R.villagers([{ x: 1.8, z: 0.4, y: 0.3 }, { x: -2, z: 0.8, y: 0.3 }]));
  return { g, anchor: [0, 8, 0] };
}
