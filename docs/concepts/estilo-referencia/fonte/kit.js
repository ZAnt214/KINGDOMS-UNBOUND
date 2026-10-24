// Kit 3D procedural compartilhado pelas direções 3D (cinemático, diorama, pintura).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from './node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';

export { THREE };

// ---------- ruído ----------
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const P = new Uint8Array(512);
{
  const r = rng(1337);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y) => ((h & 1 ? -x : x) + (h & 2 ? -y : y));
export function noise2(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  const u = fade(x);
  const v = fade(y);
  const a = P[X] + Y;
  const b = P[X + 1] + Y;
  const l = (t, a1, b1) => a1 + t * (b1 - a1);
  return l(v, l(u, grad(P[a], x, y), grad(P[b], x - 1, y)), l(u, grad(P[a + 1], x, y - 1), grad(P[b + 1], x - 1, y - 1)));
}
export function fbm(x, y, oct = 5) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

// ---------- texturas procedurais ----------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
const hex = (c) => '#' + new THREE.Color(c).getHexString();
function shadeHex(c, k) {
  const col = new THREE.Color(c);
  col.offsetHSL(0, 0, k);
  return '#' + col.getHexString();
}
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function bumpOf(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const texCache = new Map();
export function stoneMat(base = '#8f8a80', scale = 1, opts = {}) {
  const key = 'st' + base + scale;
  if (!texCache.has(key)) {
    const [c, g] = canvas(512, 512);
    const r = rng(base.length * 31 + 7);
    g.fillStyle = shadeHex(base, -0.22);
    g.fillRect(0, 0, 512, 512);
    let y = 0;
    let row = 0;
    while (y < 512) {
      const h = 34 + r() * 22;
      let x = row % 2 ? -30 : 0;
      while (x < 512) {
        const w = 60 + r() * 70;
        g.fillStyle = shadeHex(base, (r() - 0.5) * 0.12);
        g.fillRect(x + 3, y + 3, w - 6, h - 6);
        g.fillStyle = 'rgba(255,240,220,0.08)';
        g.fillRect(x + 3, y + 3, w - 6, 4);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + 3, y + h - 8, w - 6, 5);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = `rgba(${r() > 0.5 ? '40,50,30' : '30,26,22'},${0.06 + r() * 0.08})`;
          g.beginPath();
          g.arc(x + r() * w, y + r() * h, 3 + r() * 9, 0, 7);
          g.fill();
        }
        x += w;
      }
      y += h;
      row++;
    }
    // manchas de escorrimento
    for (let k = 0; k < 20; k++) {
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, 'rgba(20,18,14,0)');
      gr.addColorStop(1, 'rgba(20,18,14,0.18)');
      g.fillStyle = gr;
      g.fillRect(r() * 512, r() * 200, 6 + r() * 20, 200 + r() * 300);
    }
    texCache.set(key, c);
  }
  const c = texCache.get(key);
  return new THREE.MeshStandardMaterial({ map: tex(c, scale, scale), bumpMap: bumpOf(c), bumpScale: 0.6, roughness: 0.92, ...opts });
}

export function roofMat(base = '#8a3a24', kind = 'tile', opts = {}) {
  const key = 'rf' + base + kind;
  if (!texCache.has(key)) {
    const [c, g] = canvas(256, 256);
    const r = rng(base.length * 17 + (kind === 'tile' ? 1 : 2));
    g.fillStyle = shadeHex(base, -0.25);
    g.fillRect(0, 0, 256, 256);
    const rowH = kind === 'tile' ? 20 : 16;
    for (let y = 0, row = 0; y < 256; y += rowH, row++) {
      const w = kind === 'tile' ? 22 : 30;
      for (let x = row % 2 ? -w / 2 : 0; x < 256; x += w) {
        g.fillStyle = shadeHex(base, (r() - 0.5) * 0.14);
        if (kind === 'tile') {
          g.beginPath();
          g.moveTo(x + 1, y);
          g.lineTo(x + w - 1, y);
          g.lineTo(x + w - 1, y + rowH * 0.6);
          g.quadraticCurveTo(x + w / 2, y + rowH + 4, x + 1, y + rowH * 0.6);
          g.fill();
        } else g.fillRect(x + 1, y + 1, w - 2, rowH - 2);
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(x + 2, y + 1, w - 4, 2);
      }
    }
    for (let k = 0; k < 30; k++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '60,70,40' : '20,16,12'},${0.05 + r() * 0.1})`;
      g.fillRect(r() * 256, r() * 256, 10 + r() * 30, 6 + r() * 12);
    }
    texCache.set(key, c);
  }
  const c = texCache.get(key);
  return new THREE.MeshStandardMaterial({ map: tex(c, 1, 1), bumpMap: bumpOf(c), bumpScale: 0.8, roughness: 0.85, ...opts });
}

export function plasterMat(base = '#d8ccb0', timber = '#3a2a1c', opts = {}) {
  const key = 'pl' + base + timber;
  if (!texCache.has(key)) {
    const [c, g] = canvas(256, 256);
    const r = rng(base.length * 7 + 3);
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 400; k++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '60,50,40'},${r() * 0.06})`;
      g.fillRect(r() * 256, r() * 256, 2 + r() * 8, 2 + r() * 8);
    }
    if (timber) {
      g.fillStyle = timber;
      g.fillRect(0, 0, 256, 12);
      g.fillRect(0, 122, 256, 12);
      g.fillRect(0, 244, 256, 12);
      for (const x of [0, 84, 170]) g.fillRect(x, 0, 12, 256);
      g.lineWidth = 9;
      g.strokeStyle = timber;
      g.beginPath();
      g.moveTo(12, 128);
      g.lineTo(84, 12);
      g.moveTo(182, 128);
      g.lineTo(250, 12);
      g.stroke();
    }
    // sujeira na base
    const gr = g.createLinearGradient(0, 180, 0, 256);
    gr.addColorStop(0, 'rgba(40,30,20,0)');
    gr.addColorStop(1, 'rgba(40,30,20,0.25)');
    g.fillStyle = gr;
    g.fillRect(0, 180, 256, 76);
    texCache.set(key, c);
  }
  return new THREE.MeshStandardMaterial({ map: tex(texCache.get(key)), roughness: 0.95, ...opts });
}

export function woodMat(base = '#5a4028', opts = {}) {
  const key = 'wd' + base;
  if (!texCache.has(key)) {
    const [c, g] = canvas(128, 256);
    const r = rng(9);
    for (let x = 0; x < 128; x += 16) {
      g.fillStyle = shadeHex(base, (r() - 0.5) * 0.12);
      g.fillRect(x, 0, 15, 256);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 15, 0, 1, 256);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + 2 + r() * 10, r() * 256, 1, 20 + r() * 40);
      }
    }
    texCache.set(key, c);
  }
  return new THREE.MeshStandardMaterial({ map: tex(texCache.get(key)), roughness: 0.9, ...opts });
}

// ---------- geometria utilitária ----------
/** Prisma triangular (telhado de duas águas) com cumeeira ao longo de x. */
export function gableGeo(w, d, h, ov = 0.4) {
  const W = w / 2 + ov;
  const D = d / 2 + ov;
  const v = [
    // água frontal (+z)
    -W, 0, D, W, 0, D, W, h, 0, -W, 0, D, W, h, 0, -W, h, 0,
    // água traseira (-z)
    W, 0, -D, -W, 0, -D, -W, h, 0, W, 0, -D, -W, h, 0, W, h, 0,
    // empenas
    -w / 2, 0, -d / 2, -w / 2, 0, d / 2, -w / 2, h * (d / 2 / D), 0,
    w / 2, 0, d / 2, w / 2, 0, -d / 2, w / 2, h * (d / 2 / D), 0,
  ];
  const slope = Math.hypot(D, h);
  const uv = [0, 0, w / 3, 0, w / 3, slope / 3, 0, 0, w / 3, slope / 3, 0, slope / 3, 0, 0, w / 3, 0, w / 3, slope / 3, 0, 0, w / 3, slope / 3, 0, slope / 3, 0, 0, 1, 0, 0.5, 0.5, 0, 0, 1, 0, 0.5, 0.5];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.addGroup(0, 12, 0);
  g.addGroup(12, 6, 1);
  return g;
}

function boxUV(w, h, d, s = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ay > 0.5) uv.setXY(i, x / s, z / s);
    else if (ax > 0.5) uv.setXY(i, z / s, y / s);
    else uv.setXY(i, x / s, y / s);
  }
  return g;
}
export { boxUV };

function shadowAll(o, cast = true, recv = true) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = recv;
    }
  });
  return o;
}
export { shadowAll };

// ---------- janelas (emissivas quando a cena é de entardecer) ----------
const winGeo = new THREE.PlaneGeometry(0.7, 1.0);
export function windowMats(lit) {
  return {
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9a3a, emissiveIntensity: lit ? 2.2 : 0.25, roughness: 0.5 }),
  };
}

// ---------- casa ----------
export function house(opts) {
  const { w = 6, d = 5, h = 5, roof = 3.5, wall, roofM, base, r = Math.random, win, litChance = 0.4, chimney = true } = opts;
  const g = new THREE.Group();
  const wallMesh = new THREE.Mesh(boxUV(w, h + 4, d, 4), wall);
  wallMesh.position.y = (h - 4) / 2;
  g.add(wallMesh);
  if (base) {
    const b = new THREE.Mesh(boxUV(w + 0.2, 5.2, d + 0.2, 3), base);
    b.position.y = -1.9;
    g.add(b);
  }
  const rf = new THREE.Mesh(gableGeo(w, d, roof, 0.45), [roofM, wall]);
  rf.position.y = h;
  g.add(rf);
  if (chimney && r() > 0.3) {
    const c = new THREE.Mesh(boxUV(0.8, roof + 1.6, 0.8), base || wall);
    c.position.set((r() - 0.5) * w * 0.6, h + roof * 0.5 + 0.6, d * 0.18);
    g.add(c);
  }
  if (win) {
    for (const side of [1, -1]) {
      const nx = Math.max(1, Math.floor(w / 2.2));
      for (let i = 0; i < nx; i++) {
        for (const fy of h > 6 ? [1.6, 4.2] : [1.8]) {
          const m = new THREE.Mesh(winGeo, r() < litChance ? win.lit : win.dark);
          m.position.set(-w / 2 + (w / nx) * (i + 0.5), fy, side * (d / 2 + 0.02));
          if (side < 0) m.rotation.y = Math.PI;
          g.add(m);
        }
      }
    }
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2), win.dark);
    dm.position.set(w * 0.2, 1, d / 2 + 0.03);
    g.add(dm);
  }
  return shadowAll(g);
}

// ---------- fortificação ----------
export function merlons(len, thick, y, mat, step = 1.6, mw = 0.9, mh = 1.2) {
  const geos = [];
  for (let x = -len / 2 + step / 2; x < len / 2; x += step) {
    const b = boxUV(mw, mh, thick, 2);
    b.translate(x, y + mh / 2, 0);
    geos.push(b);
  }
  if (!geos.length) return new THREE.Group();
  return new THREE.Mesh(mergeGeometries(geos), mat);
}

export function wallSeg(a, b, h, t, mat, groundY, topMat) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const g = new THREE.Group();
  const yb = Math.min(groundY(a.x, a.z), groundY(b.x, b.z), groundY((a.x + b.x) / 2, (a.z + b.z) / 2)) - 3;
  const yt = Math.max(groundY(a.x, a.z), groundY(b.x, b.z)) + h;
  const body = new THREE.Mesh(boxUV(len + t * 0.4, yt - yb, t, 4), mat);
  body.position.y = (yt + yb) / 2;
  g.add(body);
  // passadiço saliente e ameias dos dois lados
  const walk = new THREE.Mesh(boxUV(len + t * 0.4, 0.6, t + 0.8, 3), topMat || mat);
  walk.position.y = yt - 0.3;
  g.add(walk);
  for (const s of [1, -1]) {
    const m = merlons(len, 0.5, yt, mat);
    m.position.z = s * (t / 2 + 0.15);
    g.add(m);
  }
  g.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  g.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  return shadowAll(g);
}

export function roundTower(r, h, mat, roofM, opts = {}) {
  const { cone = true, coneH = r * 2.4, y0 = -4, banner } = opts;
  const g = new THREE.Group();
  const cyl = new THREE.CylinderGeometry(r, r * 1.08, h - y0, 28, 1);
  scaleUV(cyl, (2 * Math.PI * r) / 4, (h - y0) / 4);
  const body = new THREE.Mesh(cyl, mat);
  body.position.y = (h + y0) / 2;
  g.add(body);
  // parapeito saliente
  const parG = new THREE.CylinderGeometry(r + 0.5, r + 0.3, 1.4, 28, 1, true);
  scaleUV(parG, (2 * Math.PI * r) / 4, 0.4);
  const par = new THREE.Mesh(parG, mat);
  par.position.y = h + 0.7;
  g.add(par);
  const n = Math.max(8, Math.round((2 * Math.PI * (r + 0.4)) / 1.6));
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = boxUV(0.9, 1.2, 0.5, 2);
    b.rotateY(-a);
    b.translate(Math.cos(a) * (r + 0.4), h + 2, Math.sin(a) * (r + 0.4));
    geos.push(b);
  }
  g.add(new THREE.Mesh(mergeGeometries(geos), mat));
  if (cone) {
    const cg = new THREE.ConeGeometry(r + 0.9, coneH, 28, 1);
    scaleUV(cg, 3, 2);
    const c = new THREE.Mesh(cg, roofM);
    c.position.y = h + 1.4 + coneH / 2;
    g.add(c);
  }
  if (banner) {
    const top = h + 1.4 + (cone ? coneH : 1);
    g.add(flag(banner, top));
  }
  return shadowAll(g);
}

export function flag(color, y, size = 1) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * size, 0.06 * size, 3.4 * size, 6), new THREE.MeshStandardMaterial({ color: 0x2a1e14 }));
  pole.position.y = y + 1.7 * size;
  g.add(pole);
  const cloth = new THREE.PlaneGeometry(2.2 * size, 1.3 * size, 8, 2);
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2.2) * 0.18 * size);
  cloth.computeVertexNormals();
  const m = new THREE.Mesh(cloth, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
  m.position.set(1.1 * size, y + 2.7 * size, 0);
  g.add(m);
  return g;
}

function scaleUV(g, sx, sy) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
}
export { scaleUV };

export function keep(w, d, h, mat, roofM, opts = {}) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(boxUV(w, h + 6, d, 4), mat);
  b.position.y = h / 2 - 3;
  g.add(b);
  const band = new THREE.Mesh(boxUV(w + 0.8, 0.8, d + 0.8, 3), mat);
  band.position.y = h + 0.4;
  g.add(band);
  for (const [len, thick, x, z, ry] of [
    [w, 0.5, 0, d / 2 + 0.2, 0],
    [w, 0.5, 0, -d / 2 - 0.2, 0],
    [d, 0.5, w / 2 + 0.2, 0, Math.PI / 2],
    [d, 0.5, -w / 2 - 0.2, 0, Math.PI / 2],
  ]) {
    const m = merlons(len, thick, h + 0.8, mat);
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    g.add(m);
  }
  if (opts.roof) {
    const rf = new THREE.Mesh(gableGeo(w - 1.2, d - 1.2, opts.roof, 0.1), [roofM, mat]);
    rf.position.y = h + 0.8;
    g.add(rf);
  }
  if (opts.win) {
    for (let i = 0; i < Math.floor(w / 3); i++) {
      for (const y of [h * 0.45, h * 0.7]) {
        for (const s of [1, -1]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.6), opts.r() < 0.5 ? opts.win.lit : opts.win.dark);
          m.position.set(-w / 2 + 1.5 + i * 3, y, s * (d / 2 + 0.03));
          if (s < 0) m.rotation.y = Math.PI;
          g.add(m);
        }
      }
    }
  }
  return shadowAll(g);
}

// ---------- vegetação instanciada ----------
export function forest(points, opts = {}) {
  const { flat = false, pine = 0.35, palette = [0x2f4a24, 0x3a5a2a, 0x2a4020, 0x46612e], trunk = 0x4a3220 } = opts;
  const g = new THREE.Group();
  const blobs = [[0, 0, 0, 1], [0.55, -0.2, 0.3, 0.7], [-0.5, -0.15, 0.2, 0.72], [0.1, 0.35, -0.45, 0.68], [-0.2, -0.3, -0.5, 0.6]];
  const leafGeo = mergeGeometries(blobs.map(([bx, by, bz, br], j) => {
    const b = new THREE.IcosahedronGeometry(br, flat ? 1 : 2);
    const lp = b.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const v = new THREE.Vector3(lp.getX(i), lp.getY(i), lp.getZ(i));
      const k = 1 + noise2(v.x * 3.1 + j * 7, v.y * 3.3 + v.z * 2.7) * 0.22;
      lp.setXYZ(i, v.x * k + bx, v.y * k * 0.85 + by, v.z * k + bz);
    }
    b.deleteAttribute('uv');
    return b;
  }));
  const leafGeoM = mergeVertices(leafGeo);
  leafGeoM.computeVertexNormals();
  const pineGeo = mergeGeometries([0, 1, 2, 3, 4].map((i) => {
    const c = new THREE.ConeGeometry(1.3 - i * 0.22, 1.2, 12);
    c.translate(0, 0.9 + i * 0.62, 0);
    return c;
  }));
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: flat });
  const pts = points.map((p, i) => ({ ...p, pine: (p.pine ?? (noise2(p.x * 0.05, p.z * 0.05) + 0.2 > 0.5 - pine)) }));
  const oaks = pts.filter((p) => !p.pine);
  const pines = pts.filter((p) => p.pine);
  const mk = (geo, list, isPine) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const t = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: trunk, roughness: 1 }), list.length);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    list.forEach((p, i) => {
      const s = p.s ?? 1;
      o.position.set(p.x, p.y + (isPine ? 0.2 : 3.4) * s, p.z);
      o.rotation.set(0, p.x * 13.1, 0);
      o.scale.set(s * (isPine ? 1.7 : 2.9), s * (isPine ? 2.9 : 2.5), s * (isPine ? 1.7 : 2.9));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      col.set(palette[Math.floor(Math.abs(Math.sin(p.x * 7.7 + p.z * 3.1)) * palette.length) % palette.length]);
      col.offsetHSL(0, 0, (Math.sin(p.z * 5.3) * 0.5) * 0.06);
      m.setColorAt(i, col);
      o.position.set(p.x, p.y - 0.5, p.z);
      o.scale.set(s * 1.5, s * (isPine ? 1.2 : 2.2), s * 1.5);
      o.updateMatrix();
      t.setMatrixAt(i, o.matrix);
    });
    m.castShadow = t.castShadow = true;
    m.receiveShadow = true;
    g.add(m, t);
  };
  if (oaks.length) mk(flat ? leafGeo : leafGeoM, oaks, false);
  if (pines.length) mk(pineGeo, pines, true);
  return g;
}

/** Pessoas minúsculas (instanciadas) para dar vida às ruas. */
export function crowd(points, colors) {
  const geo = new THREE.CapsuleGeometry(0.2, 0.75, 2, 6);
  geo.translate(0, 0.7, 0);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), points.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  points.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    c.set(colors[i % colors.length]);
    m.setColorAt(i, c);
  });
  m.castShadow = true;
  return m;
}

/** Céu em gradiente com brilho do sol. */
export function sky(top, horizon, sunDir, sunColor, sunSize = 0.995, bottom = null) {
  const geo = new THREE.SphereGeometry(4000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) }, sd: { value: sunDir.clone().normalize() }, sc: { value: new THREE.Color(sunColor) }, ss: { value: sunSize }, bot: { value: new THREE.Color(bottom ?? horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:
      'uniform vec3 bot; uniform vec3 top; uniform vec3 hor; uniform vec3 sd; uniform vec3 sc; uniform float ss; varying vec3 vP; void main(){ float h = clamp(vP.y,0.,1.); vec3 c = mix(hor, top, pow(h,0.3)); float s = max(dot(vP, sd),0.); c += sc*pow(s,24.)*0.45 + sc*smoothstep(ss,1.,s)*2.; if(vP.y<0.) c = mix(hor, bot, pow(clamp(-vP.y*2.2,0.,1.),0.6)); gl_FragColor = vec4(pow(c, vec3(1./2.2)),1.); }',
  });
  return new THREE.Mesh(geo, mat);
}

export function render(scene, camera, W, H, opts = {}) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(W, H);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = opts.exposure ?? 1;
  r.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(r.domElement);
  r.render(scene, camera);
  return r.domElement.toDataURL('image/png');
}

export { hex, shadeHex, mergeGeometries };

export function groundDetail(scale = 60) {
  const [c, g] = canvas(512, 512);
  const r = rng(77);
  g.fillStyle = '#b8b8b8';
  g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 9000; k++) {
    const v = 150 + r() * 105;
    g.fillStyle = `rgb(${v},${v},${v})`;
    const x = r() * 512, y = r() * 512;
    g.fillRect(x, y, 1 + r() * 2, 2 + r() * 4);
  }
  for (let k = 0; k < 60; k++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '90,90,90'},0.08)`;
    g.beginPath(); g.arc(r() * 512, r() * 512, 10 + r() * 40, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(scale, scale);
  t.anisotropy = 8;
  return t;
}
