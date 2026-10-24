// Kit "estratégia 3D estilizada": formas robustas com cantos arredondados, cores vivas e texturas pintadas.
import * as THREE from 'three';
import { RoundedBoxGeometry } from './node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from './node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, noise2, fbm } from './kit.js';
import * as TX from './texd.js';
export { THREE, rng, noise2, fbm };

export const PAL = {
  sand: '#e3cfa4',
  sandD: '#c9b083',
  stone: '#b9b2a2',
  stoneD: '#8f887a',
  blue: '#2f6fb3',
  blueD: '#1f4f8a',
  gold: '#f2c14e',
  wood: '#8a5a32',
  woodD: '#5e3c22',
  terra: '#c0643a',
  white: '#f4ecdc',
};

// ---------- texturas pintadas ----------
const cache = new Map();
function cv(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function shadeHex(c, k) {
  const col = new THREE.Color(c);
  col.offsetHSL(0, 0, k);
  return '#' + col.getHexString();
}
export function blocks(base, bw = 64, bh = 32) {
  const key = 'b' + base + bw;
  if (!cache.has(key))
    cache.set(
      key,
      cv(256, 256, (g) => {
        const r = rng(base.length * 13 + bw);
        g.fillStyle = shadeHex(base, -0.12);
        g.fillRect(0, 0, 256, 256);
        for (let y = 0, row = 0; y < 256; y += bh, row++) {
          for (let x = row % 2 ? -bw / 2 : 0; x < 256; x += bw) {
            g.fillStyle = shadeHex(base, (r() - 0.5) * 0.06);
            g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
            g.fillStyle = 'rgba(255,255,255,0.18)';
            g.fillRect(x + 2, y + 2, bw - 4, 3);
            g.fillStyle = 'rgba(0,0,0,0.08)';
            g.fillRect(x + 2, y + bh - 6, bw - 4, 4);
          }
        }
      }),
    );
  return cache.get(key);
}
export function tilesTex(base) {
  const key = 't' + base;
  if (!cache.has(key))
    cache.set(
      key,
      cv(128, 128, (g) => {
        g.fillStyle = shadeHex(base, -0.15);
        g.fillRect(0, 0, 128, 128);
        for (let y = 0, row = 0; y < 128; y += 16, row++)
          for (let x = row % 2 ? -8 : 0; x < 128; x += 16) {
            g.fillStyle = shadeHex(base, ((x * 7 + y * 3) % 5) * 0.012);
            g.beginPath();
            g.moveTo(x + 1, y);
            g.lineTo(x + 15, y);
            g.lineTo(x + 15, y + 9);
            g.quadraticCurveTo(x + 8, y + 18, x + 1, y + 9);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.22)';
            g.fillRect(x + 3, y + 1, 3, 8);
          }
      }),
    );
  return cache.get(key);
}
export function planksTex(base) {
  const key = 'p' + base;
  if (!cache.has(key))
    cache.set(
      key,
      cv(128, 128, (g) => {
        for (let x = 0; x < 128; x += 16) {
          g.fillStyle = shadeHex(base, ((x / 16) % 3) * 0.03 - 0.03);
          g.fillRect(x, 0, 15, 128);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x + 15, 0, 1, 128);
        }
      }),
    );
  return cache.get(key);
}

// ---------- materiais ----------
const mcache = new Map();
export function M(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mcache.has(key)) mcache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...opts }));
  return mcache.get(key);
}
const TM = (t, bs, o = {}) => M('#ffffff', { map: t.map, bumpMap: t.bump, bumpScale: bs, ...o });
export const MAT = {
  sand: () => TM(TX.masonry(PAL.sand), 3.2, { roughness: 0.92 }),
  stone: () => TM(TX.masonry(PAL.stone, 70, 40), 3.2, { roughness: 0.95 }),
  roofBlue: () => TM(TX.rooftiles(PAL.blue), 2.6, { roughness: 0.45 }),
  roofTerra: () => TM(TX.rooftiles(PAL.terra), 2.6, { roughness: 0.6 }),
  wood: () => TM(TX.planks(PAL.wood), 2.2, { roughness: 0.85 }),
  cobble: () => TM(TX.cobbles('#c9c0ae'), 2.5, { roughness: 0.95 }),
  gold: () => M(PAL.gold, { metalness: 0.65, roughness: 0.32 }),
  blue: () => M(PAL.blue, { roughness: 0.6 }),
  dark: () => M('#2a2018', { roughness: 0.9 }),
  white: () => M(PAL.white),
};

/** Rocha com relevo: cor por vértice + bump de pedra (triplanar simplificado pelas UVs da geometria). */
export function ROCK(color) {
  const t = TX.cobbles(color);
  return new THREE.MeshStandardMaterial({ color, bumpMap: t.bump, bumpScale: 4, roughness: 0.95, flatShading: true });
}
// ---------- geometria ----------
export function rbox(w, h, d, r = 0.25, uvScale = 6) {
  const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(r * 0.22, 0.08, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
  // UV em coordenadas de mundo para as texturas repetirem
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    if (ay > 0.6) uv.setXY(i, p.getX(i) / uvScale, p.getZ(i) / uvScale);
    else if (ax > 0.6) uv.setXY(i, p.getZ(i) / uvScale, p.getY(i) / uvScale);
    else uv.setXY(i, p.getX(i) / uvScale, p.getY(i) / uvScale);
  }
  return g;
}
export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function block(g, w, h, d, mat, x, y, z, r = 0.25) {
  const m = mesh(rbox(w, h, d, r), mat, x, y + h / 2, z);
  g.add(m);
  return m;
}
export function dome(g, r, x, y, z, mat, finial = true) {
  const geo = new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(mesh(geo, mat, x, y, z));
  const rim = mesh(new THREE.TorusGeometry(r * 1.0, r * 0.07, 8, 32), MAT.gold(), x, y + 0.02, z);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  if (finial) {
    g.add(mesh(new THREE.SphereGeometry(r * 0.12, 12, 8), MAT.gold(), x, y + r + r * 0.08, z));
    g.add(mesh(new THREE.ConeGeometry(r * 0.06, r * 0.5, 8), MAT.gold(), x, y + r + r * 0.4, z));
  }
}
export function cylinder(g, r, h, mat, x, y, z, seg = 24) {
  const m = mesh(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y + h / 2, z);
  g.add(m);
  return m;
}
export function cone(g, r, h, mat, x, y, z, seg = 24) {
  g.add(mesh(new THREE.ConeGeometry(r, h, seg), mat, x, y + h / 2, z));
}
/** Ameias arredondadas ao redor de um retângulo. */
export function merlonsRect(g, w, d, y, mat, step = 1.4, size = 0.8, h = 0.9) {
  const geos = [];
  const put = (x, z) => {
    const b = rbox(size, h, size, 0.18);
    b.translate(x, y + h / 2, z);
    geos.push(b);
  };
  for (let x = -w / 2 + size / 2; x <= w / 2 - size / 2 + 0.01; x += step) {
    put(x, -d / 2 + size / 2);
    put(x, d / 2 - size / 2);
  }
  for (let z = -d / 2 + size / 2 + step; z <= d / 2 - size / 2 - step + 0.01; z += step) {
    put(-w / 2 + size / 2, z);
    put(w / 2 - size / 2, z);
  }
  const m = mesh(mergeGeometries(geos), mat);
  g.add(m);
}
export function merlonsRing(g, r, y, mat, n = 12, size = 0.7, h = 0.8) {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = rbox(size, h, size * 0.8, 0.16);
    b.rotateY(-a);
    b.translate(Math.cos(a) * r, y + h / 2, Math.sin(a) * r);
    geos.push(b);
  }
  g.add(mesh(mergeGeometries(geos), mat));
}
/** Torre redonda com ameias e cúpula/cone. */
export function tower(g, r, h, x, z, opts = {}) {
  const { top = 'dome', mat = MAT.sand(), roof = MAT.roofBlue() } = opts;
  cylinder(g, r * 1.08, 0.8, MAT.stone(), x, 0, z);
  cylinder(g, r, h, mat, x, 0, z);
  cylinder(g, r * 1.15, 0.6, mat, x, h, z);
  const band = mesh(new THREE.TorusGeometry(r * 1.0, 0.12, 6, 24), MAT.blue(), x, h - 1.0, z);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  merlonsRing(g, r * 1.05, h + 0.6, mat, Math.max(8, Math.round(r * 5)));
  if (top === 'dome') {
    cylinder(g, r * 0.7, 1.2, mat, x, h + 0.6, z);
    dome(g, r * 0.72, x, h + 1.8, z, roof);
  } else if (top === 'cone') cone(g, r * 1.2, r * 2.2, roof, x, h + 0.6, z);
  // janelas em arco
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 4 + i * 0.6;
    const wdw = mesh(rbox(0.5, 1.0, 0.3, 0.12), MAT.dark(), x + Math.cos(a) * r, h * 0.55, z + Math.sin(a) * r);
    wdw.rotation.y = -a + Math.PI / 2;
    g.add(wdw);
  }
}
/** Arco de porta escuro com moldura azul. */
export function portal(g, w, h, x, y, z, rotY = 0) {
  const p = new THREE.Group();
  p.add(mesh(rbox(w + 0.6, h + 0.5, 0.5, 0.2), MAT.blue(), 0, h / 2, 0));
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  s.lineTo(w / 2, 0);
  const hole = mesh(new THREE.ShapeGeometry(s), M('#1a140e'), 0, 0, 0.27);
  p.add(hole);
  p.position.set(x, y, z);
  p.rotation.y = rotY;
  g.add(p);
}
/** Estandarte pendurado (pano azul com emblema dourado). */
let bannerTex = null;
export function banner(g, x, y, z, rotY = 0, h = 3, color = PAL.blue) {
  if (!bannerTex)
    bannerTex = cv(64, 128, (c) => {
      c.fillStyle = color;
      c.fillRect(0, 0, 64, 128);
      c.fillStyle = PAL.gold;
      c.fillRect(0, 0, 64, 8);
      c.fillRect(6, 8, 4, 110);
      c.fillRect(54, 8, 4, 110);
      c.beginPath();
      c.moveTo(32, 30);
      c.lineTo(44, 44);
      c.lineTo(32, 70);
      c.lineTo(20, 44);
      c.closePath();
      c.fill();
      c.fillStyle = color;
      c.beginPath();
      c.arc(32, 46, 5, 0, 7);
      c.fill();
    });
  const geo = new THREE.PlaneGeometry(1.4, h, 1, 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -h / 2 + 0.01 && Math.abs(p.getX(i)) < 0.01) p.setY(i, p.getY(i) + 0.5);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.8 }));
  m.position.set(x, y - h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  g.add(m);
}
export function flagPole(g, x, y, z, h = 4) {
  cylinder(g, 0.08, h, MAT.dark(), x, y, z, 6);
  const f = mesh(new THREE.PlaneGeometry(1.8, 1.1, 6, 1), new THREE.MeshStandardMaterial({ color: PAL.blue, side: THREE.DoubleSide }), x + 0.9, y + h - 0.6, z);
  const p = f.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2.5) * 0.15);
  f.geometry.computeVertexNormals();
  g.add(f);
}

// ---------- pessoas e tropas (instanciadas) ----------
export function troops(points, opts = {}) {
  const { body = PAL.blue, skin = '#e2b48c', helmet = '#9aa0a8', shield = true, spear = true, scale = 1 } = opts;
  const g = new THREE.Group();
  const parts = [
    [new THREE.CapsuleGeometry(0.28, 0.55, 3, 8), body, 0.62],
    [new THREE.SphereGeometry(0.22, 10, 8), skin, 1.25],
    [new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), helmet, 1.3],
  ];
  if (shield) parts.push([new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12).rotateZ(Math.PI / 2).translate(0.32, 0, 0), PAL.gold, 0.7]);
  if (spear) parts.push([new THREE.CylinderGeometry(0.03, 0.03, 2.0, 5).translate(-0.3, 0, 0), '#6a4a2a', 1.1]);
  const o = new THREE.Object3D();
  for (const [geo, color, y] of parts) {
    const im = new THREE.InstancedMesh(geo, M(color, color === PAL.gold ? { metalness: 0.5, roughness: 0.4 } : {}), points.length);
    points.forEach((p, i) => {
      o.position.set(p.x, (p.y || 0) + y * scale, p.z);
      o.rotation.set(0, p.ry ?? 0, 0);
      o.scale.setScalar(scale);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.castShadow = true;
    g.add(im);
  }
  return g;
}
export function villagers(points) {
  const colors = ['#c9a86a', '#7a5a3a', '#e8dcc4', '#6a8a4a', '#a05a3a'];
  const g = new THREE.Group();
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.26, 0.5, 3, 8), M('#ffffff'), points.length);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), M('#e2b48c'), points.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  points.forEach((p, i) => {
    o.position.set(p.x, (p.y || 0) + 0.6, p.z);
    o.updateMatrix();
    body.setMatrixAt(i, o.matrix);
    body.setColorAt(i, c.set(colors[i % colors.length]));
    o.position.y += 0.62;
    o.updateMatrix();
    head.setMatrixAt(i, o.matrix);
  });
  body.castShadow = head.castShadow = true;
  g.add(body, head);
  return g;
}

// ---------- árvores estilizadas ----------
export function trees(points) {
  const g = new THREE.Group();
  const blob = [];
  const clusters = [[0, 0, 0, 0.8]];
  { const rc = rng(77); for (let i = 0; i < 18; i++) { const u = rc() * Math.PI * 2, v = Math.acos(2 * rc() - 1) * 0.75; clusters.push([Math.sin(v) * Math.cos(u) * 0.78, Math.cos(v) * 0.62 - 0.1, Math.sin(v) * Math.sin(u) * 0.78, 0.34 + rc() * 0.2]); } }
  for (const [x, y, z, r] of clusters) {
    const s = new THREE.IcosahedronGeometry(r, 2);
    s.deleteAttribute('uv');
    const p = s.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + noise2(p.getX(i) * 3 + x * 9, p.getY(i) * 3 + p.getZ(i) * 2) * 0.14 + noise2(p.getX(i) * 11 + z * 5, p.getZ(i) * 11 + p.getY(i) * 7) * 0.07;
      p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k * 0.92 + y, p.getZ(i) * k + z);
    }
    blob.push(s);
  }
  const leaf = mergeVertices(mergeGeometries(blob));
  leaf.computeVertexNormals();
  TX.leafNoiseColor(leaf, '#d6d6d6');
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 8).translate(0, 0.8, 0);
  const palmT = new THREE.CylinderGeometry(0.16, 0.24, 5, 8).translate(0, 2.5, 0);
  const frond = mergeGeometries(
    [...Array(8).keys()].map((i) => {
      const f = new THREE.ConeGeometry(0.45, 3.2, 4);
      f.scale(1, 1, 0.25);
      f.translate(0, 1.6, 0);
      f.rotateZ(1.25);
      f.rotateY((i / 8) * Math.PI * 2);
      return f.toNonIndexed();
    }),
  );
  const pine = mergeGeometries([0, 1, 2, 3].map((i) => new THREE.ConeGeometry(1.2 - i * 0.24, 1.3, 10).translate(0, 1.2 + i * 0.7, 0).toNonIndexed()));
  const kinds = { oak: [], palm: [], pine: [] };
  points.forEach((p) => kinds[p.kind || 'oak'].push(p));
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  const greens = ['#5fa83a', '#4f9a34', '#6db844', '#58a23c'];
  const add = (geo, mat, list, f, colorize) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      f(o, p);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      if (colorize) im.setColorAt(i, c.set(greens[Math.floor(Math.abs(Math.sin(p.x * 3.7 + p.z)) * 4) % 4]));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  };
  const leafM = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9 });
  add(trunk, M('#7a5232'), kinds.oak, (o, p) => {
    o.position.set(p.x, 0, p.z);
    o.scale.setScalar(p.s);
    o.rotation.set(0, p.x, 0);
  });
  add(leaf, leafM, kinds.oak, (o, p) => {
    o.position.set(p.x, 2.6 * p.s, p.z);
    o.scale.set(1.8 * p.s, 1.6 * p.s, 1.8 * p.s);
  }, true);
  add(palmT, M('#9a7a4a'), kinds.palm, (o, p) => {
    o.position.set(p.x, 0, p.z);
    o.scale.setScalar(p.s);
    o.rotation.set(0.08, p.x, 0.05);
  });
  add(frond, M('#4f9a34', { side: THREE.DoubleSide }), kinds.palm, (o, p) => {
    o.position.set(p.x + 0.2 * p.s, 4.9 * p.s, p.z);
    o.scale.setScalar(p.s);
    o.rotation.set(0, p.z, 0);
  });
  add(trunk, M('#6a4a2a'), kinds.pine, (o, p) => {
    o.position.set(p.x, 0, p.z);
    o.scale.setScalar(p.s);
  });
  add(pine, M('#3f8a3a'), kinds.pine, (o, p) => {
    o.position.set(p.x, 0, p.z);
    o.scale.set(p.s * 1.3, p.s * 1.5, p.s * 1.3);
  });
  return g;
}
export { mergeGeometries };
