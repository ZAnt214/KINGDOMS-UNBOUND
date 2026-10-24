// Cidade de referência: muralha quadrada, prefeitura com cúpula, militares, produção e moradias.
import * as R from './rok.js';
const { THREE, MAT, M, PAL } = R;

const G = () => new THREE.Group();

function plinth(g, w, d, h = 0.6) {
  R.block(g, w, h, d, MAT.stone(), 0, 0, 0, 0.2);
}

export function cityHall() {
  const g = G();
  plinth(g, 24, 24, 1.2);
  // escadaria frontal
  for (let i = 0; i < 4; i++) R.block(g, 8, 0.3, 1, MAT.stone(), 0, 0.3 * i, 12.6 - i * 0.6, 0.08);
  R.block(g, 16, 9, 16, MAT.sand(), 0, 1.2, 0, 0.4);
  R.block(g, 16.6, 0.8, 16.6, MAT.blue(), 0, 8.2, 0, 0.2);
  R.merlonsRect(g, 16.6, 16.6, 10.2, MAT.sand());
  R.block(g, 17, 0.4, 17, MAT.sand(), 0, 9.8, 0, 0.15);
  // tambor e grande cúpula
  R.cylinder(g, 5.6, 3, MAT.sand(), 0, 10.2, 0, 40);
  R.cylinder(g, 5.9, 0.5, MAT.blue(), 0, 12.8, 0, 40);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const w = R.mesh(R.rbox(0.8, 1.6, 0.4, 0.15), MAT.dark(), Math.cos(a) * 5.6, 11.8, Math.sin(a) * 5.6);
    w.rotation.y = -a + Math.PI / 2;
    g.add(w);
  }
  R.dome(g, 5.4, 0, 13.3, 0, MAT.roofBlue());
  // portal monumental
  R.block(g, 7, 10, 2, MAT.sand(), 0, 1.2, 8.6, 0.3);
  R.merlonsRect(g, 7, 2, 11.2, MAT.sand(), 1.2, 0.7);
  R.portal(g, 3.4, 6, 0, 1.2, 9.65);
  R.banner(g, -2.6, 10.6, 9.7, 0, 4);
  R.banner(g, 2.6, 10.6, 9.7, 0, 4);
  // torres de canto com cúpulas pequenas
  for (const [x, z] of [
    [-8.5, -8.5],
    [8.5, -8.5],
    [-8.5, 8.5],
    [8.5, 8.5],
  ]) R.tower(g, 1.9, 12, x, z, {});
  // janelas em arco nas fachadas
  for (const s of [-1, 1]) for (const k of [-5, 5]) {
    R.portal(g, 1.2, 2.4, k, 5, 8.05 * s > 0 ? 8.05 : -8.05, s > 0 ? 0 : Math.PI);
    const w = new THREE.Group();
    R.portal(w, 1.2, 2.4, 0, 5, 0, 0);
    w.position.set(s * 8.05, 0, k);
    w.rotation.y = s * Math.PI / 2;
    g.add(w);
  }
  R.flagPole(g, 0, 18.7, 0, 5);
  return { g, anchor: [0, 26, 0] };
}

export function house(v = 0) {
  const g = G();
  plinth(g, 7, 7, 0.4);
  R.block(g, 5.5, 4.2, 5.5, MAT.sand(), 0, 0.4, 0, 0.3);
  R.block(g, 5.9, 0.4, 5.9, MAT.blue(), 0, 3.6, 0, 0.12);
  R.portal(g, 1.4, 2.4, 0.6, 0.4, 2.78);
  R.portal(g, 0.9, 1.4, -1.6, 2, 2.78);
  if (v % 3 === 0) {
    R.cylinder(g, 2.0, 1, MAT.sand(), 0, 4.6, 0);
    R.dome(g, 2.1, 0, 5.6, 0, MAT.roofBlue());
  } else if (v % 3 === 1) {
    R.merlonsRect(g, 5.9, 5.9, 4.6, MAT.sand(), 1.2, 0.6, 0.7);
    R.block(g, 2.4, 1.6, 2.4, MAT.sand(), -1.2, 4.6, -1.2, 0.2);
    R.dome(g, 1.1, -1.2, 6.2, -1.2, MAT.roofBlue(), false);
    // toldo
    const aw = R.mesh(R.rbox(3, 0.15, 1.6, 0.05), M(PAL.blue), 1.2, 3.2, 3.4);
    aw.rotation.x = 0.35;
    g.add(aw);
  } else {
    const roof = R.mesh(new THREE.ConeGeometry(4.2, 2.6, 4), MAT.roofTerra(), 0, 5.9, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
  }
  R.block(g, 0.6, 0.6, 0.6, MAT.wood(), 2.4, 0.4, 3.2, 0.1);
  return { g, anchor: [0, 9, 0] };
}

export function barracks() {
  const g = G();
  plinth(g, 16, 16, 0.4);
  // pátio de treino em terra batida
  R.block(g, 13, 0.08, 9, M('#b89a6a'), 0, 0.4, 2.5, 0.04);
  // edifício principal com ameias
  R.block(g, 13, 6, 5, MAT.sand(), 0, 0.4, -5, 0.3);
  R.block(g, 13.4, 0.5, 5.4, MAT.blue(), 0, 5.6, -5, 0.12);
  R.merlonsRect(g, 13.4, 5.4, 6.4, MAT.sand(), 1.3, 0.75);
  R.portal(g, 2.4, 3.8, 0, 0.4, -2.45);
  R.banner(g, -3.5, 6, -2.4, 0, 3.4);
  R.banner(g, 3.5, 6, -2.4, 0, 3.4);
  R.tower(g, 1.7, 9, -6.5, -5, { top: 'cone', roof: MAT.roofBlue() });
  R.tower(g, 1.7, 9, 6.5, -5, { top: 'cone', roof: MAT.roofBlue() });
  // muro baixo do pátio
  for (const [w, d, x, z] of [
    [13, 0.8, 0, 7.6],
    [0.8, 9, -7.1, 3],
    [0.8, 9, 7.1, 3],
  ]) {
    R.block(g, w, 1.4, d, MAT.sand(), x, 0.4, z, 0.2);
  }
  // cavalete de armas
  for (const x of [-5, 5]) {
    R.block(g, 2.4, 0.2, 0.3, MAT.wood(), x, 1.6, 6.6, 0.05);
    for (let i = 0; i < 5; i++) R.cylinder(g, 0.04, 2.4, M('#6a4a2a'), x - 1 + i * 0.5, 0.4, 6.7, 5);
  }
  const pts = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) pts.push({ x: -4 + j * 1.6, z: 0 + i * 1.5, y: 0.45, ry: 0 });
  g.add(R.troops(pts));
  return { g, anchor: [0, 12, 0] };
}

export function archery() {
  const g = G();
  plinth(g, 15, 13, 0.4);
  R.block(g, 13, 0.08, 7, M('#9ec05a'), 0, 0.4, 1.5, 0.04);
  R.block(g, 9, 4.5, 4, MAT.sand(), -1.5, 0.4, -4.2, 0.3);
  R.block(g, 9.4, 0.4, 4.4, MAT.blue(), -1.5, 4.3, -4.2, 0.1);
  R.merlonsRect(g, 9.4, 4.4, 4.7, MAT.sand(), 1.3, 0.7, 0.8);
  R.tower(g, 1.6, 8, 5.2, -4, { top: 'dome' });
  R.portal(g, 2, 3, -1.5, 0.4, -2.15);
  // alvos
  const tc = document.createElement('canvas');
  tc.width = tc.height = 64;
  const t = tc.getContext('2d');
  for (const [r, c] of [
    [32, '#f2ead8'],
    [26, '#2f6fb3'],
    [19, '#f2ead8'],
    [12, '#d23a2a'],
    [6, '#f2c14e'],
  ]) {
    t.fillStyle = c;
    t.beginPath();
    t.arc(32, 32, r, 0, 7);
    t.fill();
  }
  const tm = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(tc) });
  for (let i = 0; i < 4; i++) {
    const disc = R.mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 24), [M('#c9a86a'), tm, tm], -5 + i * 3.2, 1.6, 4.8);
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
    R.block(g, 0.2, 1.2, 0.2, MAT.wood(), -5 + i * 3.2, 0.4, 5, 0.04);
  }
  const pts = [];
  for (let i = 0; i < 5; i++) pts.push({ x: -5 + i * 2.4, z: -0.4, y: 0.45, ry: Math.PI });
  g.add(R.troops(pts, { body: '#3f7f4a', shield: false }));
  return { g, anchor: [0, 11, 0] };
}

export function stable() {
  const g = G();
  plinth(g, 15, 12, 0.4);
  R.block(g, 12, 4, 4.5, MAT.wood(), 0, 0.4, -3.5, 0.25);
  const roof = R.mesh(new THREE.CylinderGeometry(3.2, 3.2, 12.6, 3, 1), MAT.roofTerra(), 0, 5.4, -3.5);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.x = Math.PI / 6;
  roof.scale.set(1, 1, 0.55);
  g.add(roof);
  for (let i = 0; i < 4; i++) R.portal(g, 1.8, 2.6, -4.5 + i * 3, 0.4, -1.2);
  // cercado com cavalos
  for (let x = -6.5; x <= 6.5; x += 1.3) R.block(g, 0.2, 1.2, 0.2, MAT.wood(), x, 0.4, 5.4, 0.05);
  R.block(g, 13.2, 0.16, 0.16, MAT.wood(), 0, 1.3, 5.4, 0.04);
  for (let i = 0; i < 4; i++) {
    const hx = -4.5 + i * 3;
    const hz = 2 + (i % 2) * 1.2;
    const col = ['#8a5a32', '#5e3c22', '#c9a86a', '#3a2a1e'][i];
    R.block(g, 2, 1, 0.8, M(col), hx, 1.1, hz, 0.35);
    R.block(g, 0.6, 1, 0.5, M(col), hx + 1.1, 1.7, hz, 0.2);
    for (const [dx, dz] of [
      [-0.7, -0.25],
      [0.7, -0.25],
      [-0.7, 0.25],
      [0.7, 0.25],
    ]) R.cylinder(g, 0.1, 1.1, M(col), hx + dx, 0.4, hz + dz, 6);
  }
  return { g, anchor: [0, 10, 0] };
}

export function siege() {
  const g = G();
  plinth(g, 14, 12, 0.4);
  R.block(g, 10, 5, 5, MAT.sand(), -1, 0.4, -3.4, 0.3);
  R.merlonsRect(g, 10.3, 5.3, 5.4, MAT.sand(), 1.3, 0.7);
  R.block(g, 10.3, 0.4, 5.3, MAT.blue(), -1, 5, -3.4, 0.1);
  R.portal(g, 3, 3.6, -1, 0.4, -0.85);
  // catapultas
  for (const [x, z, ry] of [
    [-3, 3, 0.4],
    [3, 3.4, -0.3],
  ]) {
    const c = G();
    R.block(c, 3, 0.5, 2, MAT.wood(), 0, 0.6, 0, 0.1);
    for (const s of [-1, 1]) for (const t of [-1, 1]) R.cylinder(c, 0.35, 0.25, M('#5e3c22'), s * 1.1, 0.3, t * 1.0, 12).rotation.x = Math.PI / 2;
    R.block(c, 0.3, 2, 1.6, MAT.wood(), 0, 1.1, 0, 0.06);
    const arm = R.mesh(R.rbox(0.25, 3.2, 0.25, 0.06), MAT.wood(), 0.4, 2.7, 0);
    arm.rotation.z = -0.8;
    c.add(arm);
    c.position.set(x, 0.4, z);
    c.rotation.y = ry;
    g.add(c);
  }
  return { g, anchor: [0, 10, 0] };
}

export function farm(seed = 0) {
  const g = G();
  R.block(g, 12, 0.3, 10, M('#8a6a3a'), 0, 0, 0, 0.1);
  // fileiras de milho
  const stalk = new THREE.ConeGeometry(0.35, 1.6, 6).translate(0, 0.8, 0);
  const pts = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 12; j++) pts.push([-5 + j * 0.9, -2.6 + i * 1.0]);
  const im = new THREE.InstancedMesh(stalk, M('#5fae3a'), pts.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  pts.forEach(([x, z], i) => {
    o.position.set(x, 0.3, z);
    o.scale.set(1, 0.8 + ((i * 7) % 5) * 0.1, 1);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    im.setColorAt(i, c.set(i % 4 ? '#5fae3a' : '#7fc04a'));
  });
  im.castShadow = true;
  g.add(im);
  const cob = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.12, 0.25, 2, 6), M('#f2c14e'), pts.length / 3);
  pts.filter((_, i) => i % 3 === 0).forEach(([x, z], i) => {
    o.position.set(x + 0.15, 1.2, z);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    cob.setMatrixAt(i, o.matrix);
  });
  g.add(cob);
  // casinha do fazendeiro
  R.block(g, 3.4, 2.8, 3, MAT.sand(), 4, 0.3, -4.4, 0.25);
  const roof = R.mesh(new THREE.ConeGeometry(2.8, 1.6, 4), MAT.roofBlue(), 4, 4, -4.4);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(R.villagers([{ x: -2, z: 1.5, y: 0.3 }, { x: 2.5, z: -0.5, y: 0.3 }]));
  return { g, anchor: [0, 7, 0] };
}

export function lumber() {
  const g = G();
  plinth(g, 11, 10, 0.3);
  R.block(g, 5, 3.6, 4, MAT.wood(), -2, 0.3, -2.6, 0.2);
  const roof = R.mesh(new THREE.ConeGeometry(4, 2, 4), MAT.roofBlue(), -2, 4.9, -2.6);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // pilhas de toras
  const log = new THREE.CylinderGeometry(0.35, 0.35, 3.6, 10).rotateZ(Math.PI / 2);
  const pts = [];
  for (let l = 0; l < 3; l++) for (let i = 0; i < 4 - l; i++) pts.push([2.4, 0.65 + l * 0.6, 1 + i * 0.7 + l * 0.35]);
  for (let l = 0; l < 2; l++) for (let i = 0; i < 3 - l; i++) pts.push([-2.4, 0.65 + l * 0.6, 2.4 + i * 0.7 + l * 0.35]);
  const im = new THREE.InstancedMesh(log, M('#9a6a3a'), pts.length);
  const o = new THREE.Object3D();
  pts.forEach(([x, y, z], i) => {
    o.position.set(x, y, z);
    o.rotation.set(0, Math.PI / 2, 0);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.castShadow = true;
  g.add(im);
  R.block(g, 3, 0.2, 1.2, MAT.wood(), 2, 1.1, -2.2, 0.05);
  R.cylinder(g, 0.7, 0.08, M('#c0c4c8', { metalness: 0.7, roughness: 0.3 }), 2, 1.3, -2.2, 16).rotation.x = Math.PI / 2;
  g.add(R.villagers([{ x: 0.5, z: 0.5, y: 0.3 }, { x: 3.4, z: -0.6, y: 0.3 }]));
  return { g, anchor: [0, 7, 0] };
}

export function quarry() {
  const g = G();
  R.block(g, 11, 0.3, 10, M('#9a948a'), 0, 0, 0, 0.1);
  const rocks = [];
  const r = R.rng(31);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.DodecahedronGeometry(0.8 + r() * 1.4, 0);
    s.translate(-3 + r() * 6, 0.6 + r() * 0.8, -3 + r() * 4);
    rocks.push(s);
  }
  g.add(R.mesh(R.mergeGeometries(rocks), R.ROCK('#a9abae')));
  for (let i = 0; i < 5; i++) R.block(g, 1, 0.8, 1, MAT.stone(), 2 + (i % 3) * 1.1, 0.3, 3 + Math.floor(i / 3) * 1.1, 0.1);
  // guindaste
  R.block(g, 0.3, 5, 0.3, MAT.wood(), -4, 0.3, 3, 0.05);
  const arm = R.mesh(R.rbox(4, 0.25, 0.25, 0.05), MAT.wood(), -2.4, 5.1, 3);
  arm.rotation.z = -0.2;
  g.add(arm);
  g.add(R.villagers([{ x: 0, z: 2.6, y: 0.3 }, { x: 1.5, z: 1, y: 0.3 }, { x: -2, z: 1.5, y: 0.3 }]));
  return { g, anchor: [0, 7, 0] };
}

export function goldMine() {
  const g = G();
  R.block(g, 10, 0.3, 9, M('#8a7a62'), 0, 0, 0, 0.1);
  const rock = R.mesh(new THREE.DodecahedronGeometry(3.4, 2), R.ROCK('#8a7a66'), -1, 1.6, -1.5);
  rock.scale.set(1.3, 0.8, 1);
  g.add(rock);
  R.portal(g, 1.8, 2.4, -1, 0.2, 1.3);
  const nug = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.OctahedronGeometry(0.35, 0);
    s.translate(1.5 + Math.sin(i) * 1.4, 0.6 + (i % 3) * 0.3, 2 + Math.cos(i * 1.7) * 1);
    nug.push(s);
  }
  g.add(R.mesh(R.mergeGeometries(nug), MAT.gold()));
  R.block(g, 1.6, 0.6, 1, MAT.wood(), 2.8, 0.3, 0.5, 0.1);
  return { g, anchor: [0, 7, 0] };
}

export function academy() {
  const g = G();
  plinth(g, 14, 12, 0.6);
  R.block(g, 11, 6, 8, MAT.white(), 0, 0.6, -1, 0.3);
  R.block(g, 11.4, 0.5, 8.4, MAT.blue(), 0, 6.2, -1, 0.12);
  for (let i = 0; i < 6; i++) R.cylinder(g, 0.35, 5.2, MAT.white(), -4.5 + i * 1.8, 0.6, 3.6, 12);
  R.block(g, 11, 0.5, 1.4, MAT.white(), 0, 5.8, 3.6, 0.1);
  R.cylinder(g, 3, 1.4, MAT.white(), 0, 6.7, -1, 32);
  R.dome(g, 3, 0, 8.1, -1, MAT.roofBlue());
  R.tower(g, 1.3, 10, -5, -4.5, { top: 'dome', mat: MAT.white() });
  return { g, anchor: [0, 14, 0] };
}

export function tavern() {
  const g = G();
  plinth(g, 10, 9, 0.4);
  R.block(g, 8, 4, 6, MAT.sand(), 0, 0.4, 0, 0.3);
  R.block(g, 8.4, 3, 6.4, MAT.wood(), 0, 4.4, 0, 0.25);
  const roof = R.mesh(new THREE.CylinderGeometry(3.8, 3.8, 9, 3), MAT.roofTerra(), 0, 8.4, 0);
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.6);
  g.add(roof);
  R.portal(g, 1.6, 2.6, 0, 0.4, 3.05);
  R.block(g, 1.6, 1, 0.12, M('#5e3c22'), 3, 3.6, 3.4, 0.05);
  for (let i = 0; i < 3; i++) R.cylinder(g, 0.5, 0.8, MAT.wood(), -3.2 + i * 1.1, 0.4, 4, 12);
  return { g, anchor: [0, 12, 0] };
}

export function market() {
  const g = G();
  R.block(g, 14, 0.25, 10, MAT.cobble(), 0, 0, 0, 0.1);
  const colors = [
    ['#2f6fb3', '#f4ecdc'],
    ['#d23a2a', '#f4ecdc'],
    ['#3f8a4a', '#f2c14e'],
    ['#f2c14e', '#2f6fb3'],
  ];
  for (let i = 0; i < 6; i++) {
    const x = -5 + (i % 3) * 5;
    const z = -2.5 + Math.floor(i / 3) * 5;
    const [a, b] = colors[i % 4];
    const stc = document.createElement('canvas');
    stc.width = 64;
    stc.height = 8;
    const s = stc.getContext('2d');
    for (let k = 0; k < 8; k++) {
      s.fillStyle = k % 2 ? a : b;
      s.fillRect(k * 8, 0, 8, 8);
    }
    const aw = R.mesh(new THREE.CylinderGeometry(2.1, 2.1, 3.2, 3, 1, false), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(stc) }), x, 2.8, z);
    aw.rotation.z = Math.PI / 2;
    aw.scale.set(1, 1, 0.45);
    g.add(aw);
    R.block(g, 3, 1, 1.6, MAT.wood(), x, 0.25, z + 0.3, 0.1);
    for (let k = 0; k < 4; k++) g.add(R.mesh(new THREE.SphereGeometry(0.22, 8, 6), M(['#d23a2a', '#f2c14e', '#6db844', '#e88a2a'][k]), x - 1 + k * 0.65, 1.45, z + 0.3));
    for (const [dx, dz] of [
      [-1.4, -0.6],
      [1.4, -0.6],
      [-1.4, 1.2],
      [1.4, 1.2],
    ]) R.cylinder(g, 0.08, 2.4, MAT.wood(), x + dx, 0.25, z + dz, 6);
  }
  const pts = [];
  for (let i = 0; i < 14; i++) pts.push({ x: -6 + (i * 1.7) % 12, z: -0.2 + ((i * 3) % 5) * 0.6, y: 0.25 });
  g.add(R.villagers(pts));
  return { g, anchor: [0, 7, 0] };
}

export function obelisk() {
  const g = G();
  R.block(g, 5, 1, 5, MAT.stone(), 0, 0, 0, 0.2);
  R.block(g, 3, 1, 3, MAT.stone(), 0, 1, 0, 0.15);
  const ob = R.mesh(new THREE.CylinderGeometry(0.7, 1.2, 12, 4), MAT.stone(), 0, 8, 0);
  ob.rotation.y = Math.PI / 4;
  g.add(ob);
  const tip = R.mesh(new THREE.ConeGeometry(0.75, 1.4, 4), MAT.gold(), 0, 14.7, 0);
  tip.rotation.y = Math.PI / 4;
  g.add(tip);
  return { g, anchor: [0, 17, 0] };
}

export function tent() {
  const g = G();
  const t = R.mesh(new THREE.ConeGeometry(3.2, 3.6, 8), M('#e8dcc4'), 0, 1.8, 0);
  g.add(t);
  const band = R.mesh(new THREE.CylinderGeometry(3.05, 3.2, 0.5, 8), M(PAL.blue), 0, 0.25, 0);
  g.add(band);
  R.flagPole(g, 0, 3.4, 0, 1.6);
  return { g, anchor: [0, 7, 0] };
}

// ---------- muralha ----------
export function walls(half, opts = {}) {
  const g = G();
  const H = 7;
  const T = 3.2;
  const seg = (x, z, len, rot) => {
    const s = G();
    R.block(s, len, H, T, MAT.sand(), 0, 0, 0, 0.35);
    R.block(s, len, 0.5, T + 0.6, MAT.sand(), 0, H - 0.2, 0, 0.15);
    R.block(s, len, 0.4, T + 0.7, MAT.blue(), 0, H - 1.4, 0, 0.1);
    // ameias dos dois lados
    const geos = [];
    for (let k = -len / 2 + 1; k < len / 2 - 0.5; k += 1.8) {
      for (const side of [-1, 1]) {
        const b = R.rbox(1, 1.1, 0.7, 0.22);
        b.translate(k, H + 0.85, side * (T / 2 + 0.05));
        geos.push(b);
      }
    }
    s.add(R.mesh(R.mergeGeometries(geos), MAT.sand()));
    for (let k = -len / 2 + 6; k < len / 2 - 4; k += 12) R.banner(s, k, H - 1.5, T / 2 + 0.36, 0, 3.4);
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
  for (const [x, z] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ]) {
    R.tower(g, 3.2, 11, x, z, { top: 'none' });
    R.flagPole(g, x, 12.4, z, 4);
  }
  // torres intermediárias
  for (const t of [-0.5, 0.5]) {
    R.tower(g, 2.4, 9.5, t * half, -half, { top: 'none' });
    R.tower(g, 2.4, 9.5, -half, t * half, { top: 'none' });
    R.tower(g, 2.4, 9.5, half, t * half, { top: 'none' });
  }
  // portão principal
  const gate = G();
  for (const x of [-5, 5]) R.tower(gate, 2.8, 12, x, 0, { top: 'dome' });
  R.block(gate, 7.4, 9, 4, MAT.sand(), 0, 0, 0, 0.3);
  R.merlonsRect(gate, 7.4, 4, 9, MAT.sand(), 1.3, 0.8);
  R.portal(gate, 3.6, 5.2, 0, 0, 2.05);
  R.banner(gate, 0, 8.6, 2.3, 0, 2.8);
  gate.position.set(0, 0, half);
  g.add(gate);
  return g;
}

export function fountain() {
  const g = G();
  R.cylinder(g, 4.4, 0.8, MAT.stone(), 0, 0, 0, 32);
  R.cylinder(g, 3.9, 0.12, M('#5ab8d8', { roughness: 0.15, metalness: 0.2, emissive: '#1a5a7a' }), 0, 0.72, 0, 32);
  R.cylinder(g, 0.6, 2.4, MAT.stone(), 0, 0.8, 0, 16);
  R.cylinder(g, 1.8, 0.3, MAT.stone(), 0, 3.0, 0, 24);
  R.cylinder(g, 0.4, 1.4, MAT.white(), 0, 3.3, 0, 12);
  g.add(R.mesh(new THREE.SphereGeometry(0.5, 12, 8), MAT.gold(), 0, 5, 0));
  return { g, anchor: [0, 7, 0] };
}
export function props(seed = 0) {
  const g = G();
  const r = R.rng(seed + 3);
  for (let i = 0; i < 3; i++) R.cylinder(g, 0.45, 1, MAT.wood(), (r() - 0.5) * 3, 0, (r() - 0.5) * 3, 12);
  for (let i = 0; i < 2; i++) R.block(g, 0.9, 0.9, 0.9, MAT.wood(), 1.5 + i, 0, 1.2, 0.08);
  // carroça
  const c = G();
  R.block(c, 2.4, 0.8, 1.4, MAT.wood(), 0, 0.5, 0, 0.1);
  for (const s of [-1, 1]) { const w = R.cylinder(c, 0.5, 0.15, M('#5e3c22'), -0.4, 0.5, s * 0.8, 12); w.rotation.x = Math.PI / 2; w.position.y = 0.5; }
  R.block(c, 1.6, 0.5, 1.0, M('#f2c14e'), 0, 1.3, 0, 0.2);
  c.position.set(-2.4, 0, 1.6);
  c.rotation.y = r() * 3;
  g.add(c);
  // canteiro de flores
  R.block(g, 2.2, 0.4, 0.8, MAT.stone(), 0, 0, -2, 0.1);
  for (let i = 0; i < 5; i++) g.add(R.mesh(new THREE.SphereGeometry(0.28, 8, 6), M(['#e84a6a', '#f2c14e', '#ffffff', '#c84ae8'][i % 4]), -0.8 + i * 0.4, 0.55, -2));
  return { g, anchor: [0, 3, 0] };
}
