/**
 * KINGDOMS UNBOUND — cidadãos medievais animados (ambientação).
 *
 * Arte vetorial original desenhada em Canvas; sem sprites licenciados.
 * Movimentos determinísticos de patrulha/trabalho, com animação a ~30 FPS.
 *
 * IMPORTANTE: estes NPCs são apenas visuais. Não são jogadores, tropas
 * persistidas, trabalhadores econômicos nem entidades do servidor.
 * Integração futura com IA/rotinas autoritativas deve ser explícita.
 */

export type CitizenRole = 'king' | 'knight' | 'spearman' | 'archer' |
  'farmer' | 'blacksmith' | 'merchant' | 'scout';

export interface Citizen {
  id: string;
  name: string;
  role: CitizenRole;
  /** waypoints: x da cidade, y da cidade, segundos de pausa após chegar */
  path: readonly (readonly [number, number, number])[];
  speed: number; // unidades por segundo
  offset: number; // deslocamento inicial da rotina
}
export interface CitizenFrame {
  id: string;
  name: string;
  role: CitizenRole;
  tx: number;
  ty: number;
  facing: number;
  moving: boolean;
  phase: number;
  work: number;
}
export const CITIZENS: readonly Citizen[] = [
  { id: 'arthur', name: 'Rei Aldren', role: 'king', speed: 0.42, offset: 2.3, path: [[6.0,6.0,5], [5.7,6.6,8], [6.5,5.6,6]] },
  { id: 'roderic', name: 'Sir Roderic', role: 'knight', speed: 0.92, offset: 4.1, path: [[5.1,4.5,2], [8.6,4.5,1], [8.5,8.8,3], [5.0,8.5,1]] },
  { id: 'gareth', name: 'Guarda Gareth', role: 'spearman', speed: 0.72, offset: 12.0, path: [[11.4,6.8,4], [10.8,7.4,3], [11.4,6.8,5]] },
  { id: 'elira', name: 'Arqueira Elira', role: 'archer', speed: 0.85, offset: 5.0, path: [[3.5,3.3,4], [5.1,3.1,5], [5.6,4.0,2]] },
  { id: 'bren', name: 'Camponês Bren', role: 'farmer', speed: 0.61, offset: 1.2, path: [[7.7,2.7,6], [8.5,3.4,4], [7.3,3.2,5]] },
  { id: 'toren', name: 'Ferreiro Toren', role: 'blacksmith', speed: 0.55, offset: 14.8, path: [[3.2,8.4,8], [3.9,8.7,4], [3.2,8.4,8]] },
  { id: 'marla', name: 'Mercadora Marla', role: 'merchant', speed: 0.70, offset: 8.3, path: [[8.5,9.3,5], [9.3,8.4,4], [8.4,7.5,3]] },
  { id: 'nox', name: 'Batedor Nox', role: 'scout', speed: 1.08, offset: 8.0, path: [[2.1,5.0,1], [3.0,4.0,3], [4.2,4.4,1], [3.4,6.1,2]] },
];

const length = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

export function citizenFrame(npc: Citizen, elapsedMs: number): CitizenFrame {
  // Um ciclo tem percursos + pausas, com costura perfeita no retorno ao começo.
  const legs = npc.path.map((p, i) => {
    const next = npc.path[(i + 1) % npc.path.length];
    return { a: p, b: next, travel: length(p, next) / npc.speed, rest: next[2] };
  });
  const total = legs.reduce((sum, v) => sum + v.travel + v.rest, 0);
  let cursor = ((elapsedMs / 1000 + npc.offset) % total + total) % total;
  for (const leg of legs) {
    if (cursor < leg.travel) {
      const k = leg.travel <= 0 ? 1 : cursor / leg.travel;
      const dx = leg.b[0] - leg.a[0];
      return { id: npc.id, name: npc.name, role: npc.role,
        tx: leg.a[0] + dx * k, ty: leg.a[1] + (leg.b[1] - leg.a[1]) * k,
        facing: dx >= -0.01 ? 1 : -1, moving: true,
        phase: elapsedMs / 145 + npc.offset, work: 0 };
    }
    cursor -= leg.travel;
    if (cursor < leg.rest) {
      return { id: npc.id, name: npc.name, role: npc.role,
        tx: leg.b[0], ty: leg.b[1], facing: leg.b[0] >= leg.a[0] ? 1 : -1,
        moving: false, phase: elapsedMs / 340 + npc.offset,
        work: elapsedMs / 360 + npc.offset };
    }
    cursor -= leg.rest;
  }
  const p = npc.path[0];
  return { id: npc.id, name: npc.name, role: npc.role,
    tx: p[0], ty: p[1], facing: 1, moving: false, phase: 0, work: 0 };
}

export const roleLabel: Record<CitizenRole, string> = {
  king: 'Governando', knight: 'Patrulha real', spearman: 'Protegendo o portão',
  archer: 'Vigiando muralhas', farmer: 'Cuidando da colheita',
  blacksmith: 'Trabalhando na forja', merchant: 'Negociando',
  scout: 'Explorando arredores',
};

type C = CanvasRenderingContext2D;
const outline = '#27221e';
const stroke = (c: C, color = outline, width = 1.65) => {
  c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
};
const ell = (c: C, x: number, y: number, rx: number, ry: number, fill: string, line = outline) => {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill(); if (line) stroke(c, line);
};
const shape = (c: C, points: readonly (readonly [number, number])[], fill: string, line = outline) => {
  c.beginPath();
  points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y));
  c.closePath(); c.fillStyle = fill; c.fill(); if (line) stroke(c,line);
};
const seg = (c: C, x1: number, y1: number, x2: number, y2: number, color: string, w = 2) => {
  c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.strokeStyle = color;
  c.lineWidth = w; c.lineCap = 'round'; c.stroke();
};
const colors: Record<CitizenRole, { cloth: string; trim: string; hair: string; skin: string }> = {
  king: {cloth:'#a53e37',trim:'#e3bc68',hair:'#5a3825',skin:'#e9b88d'},
  knight:{cloth:'#f0e8d9',trim:'#b43f43',hair:'#514132',skin:'#d7ad85'},
  spearman:{cloth:'#80634a',trim:'#a83d3a',hair:'#583727',skin:'#ddb087'},
  archer:{cloth:'#577450',trim:'#aab07b',hair:'#74442a',skin:'#ddb08e'},
  farmer:{cloth:'#c0a17d',trim:'#736047',hair:'#916337',skin:'#efbb88'},
  blacksmith:{cloth:'#6b4e3d',trim:'#ad8d63',hair:'#3c302a',skin:'#dca77e'},
  merchant:{cloth:'#7a4462',trim:'#c49c58',hair:'#69402c',skin:'#efba8b'},
  scout:{cloth:'#343d37',trim:'#66735e',hair:'#352923',skin:'#d4a580'},
};

function drawHelmet(c:C, role:CitizenRole) {
  if (role === 'knight') {
    ell(c,0,-31,12.4,12.5,'#939ca4');
    shape(c,[[-11,-32],[-8,-42],[5,-44],[12,-36],[12,-28],[-11,-28]],'#c3cbd0');
    shape(c,[[-8,-34],[9,-34],[8,-28],[-8,-28]],'#3a3c41');
    seg(c,-3,-25,3,-25,'#58616b',1.8);
  } else if (role === 'spearman') {
    ell(c,0,-36,12,4.4,'#8d969b');
    shape(c,[[-11,-37],[-8,-44],[-2,-47],[7,-45],[11,-37]],'#b6bfc2');
    seg(c,-11,-36,11,-36,'#565e64',2.4);
  } else if (role === 'farmer') {
    ell(c,0,-43,17,4.3,'#d0a45d');
    shape(c,[[-12,-43],[-8,-51],[7,-51],[12,-43]],'#bc8749');
    seg(c,-10,-44,10,-44,'#e7c57a',2.3);
  } else if (role === 'king') {
    shape(c,[[-12,-42],[-12,-53],[-6,-49],[-2,-57],[3,-49],[9,-55],[12,-43]],
      '#e7ae39');
    for (const x of [-6,3,9]) ell(c,x,-48,1.7,2.2,'#bb3e39','');
  } else if (role === 'archer') {
    shape(c,[[-13,-28],[-12,-42],[-6,-49],[5,-49],[13,-39],[12,-26]],
      '#3c5d3f');
  } else if (role === 'merchant') {
    ell(c,0,-43,15,4,'#983e38');
    shape(c,[[-12,-43],[-9,-51],[6,-54],[12,-45]],'#9d493a');
    seg(c,5,-54,10,-60,'#e9d6a8',2);
  } else if (role === 'scout') {
    shape(c,[[-12,-23],[-14,-39],[-4,-49],[7,-46],[13,-33],[10,-23]],
      '#303634');
  }
}

function drawGear(c:C, role:CitizenRole, work:number, moving:boolean) {
  const v = moving ? Math.sin(work*2)*2 : Math.sin(work)*1.5;
  c.save();
  switch(role) {
    case 'king':
      seg(c,16,-12,16,-42,'#5b3828',3);
      ell(c,16,-45,4.5,6,'#e8b74c'); ell(c,16,-45,1.8,2,'#c45234','');
      break;
    case 'knight':
      shape(c,[[8,-22],[21,-25],[23,-12],[14,-3],[8,-10]],'#e6e1d4');
      shape(c,[[11,-21],[20,-22],[21,-12],[15,-7],[11,-11]],'#a94842');
      seg(c,-16,-19,-17,-49,'#9aa5aa',3.8); seg(c,-17,-49,-21,-59,'#dedfe2',3.6);
      seg(c,-23,-45,-13,-45,'#705242',2);
      break;
    case 'spearman':
      seg(c,-16,-2,-16,-66,'#745334',3.2);
      shape(c,[[-20,-63],[-16,-73],[-12,-63]],'#b1b6bb');
      ell(c,15,-15,9,12,'#9f493c'); ell(c,15,-15,4,5,'#b9bbc1');
      break;
    case 'archer':
      c.beginPath(); c.moveTo(15,-45); c.quadraticCurveTo(28,-28,15,-5);
      c.strokeStyle='#825330'; c.lineWidth=3; c.stroke(); seg(c,15,-45,15,-5,'#d3b88b',1.2);
      for(let i=0;i<3;i++)seg(c,-14+i*3,-31,-17+i*3,-49,'#ddd7c2',1.5);
      break;
    case 'farmer':
      seg(c,-17,-4,-17+v,-50,'#765a38',2.4);
      seg(c,-23+v,-50,-11+v,-50,'#8a8f8b',2.8);
      for(let i=0;i<3;i++)seg(c,-23+i*6+v,-50,-23+i*6+v,-61,'#8a8f8b',2.2);
      break;
    case 'blacksmith': {
      c.save(); c.translate(14,-20);
      c.rotate(moving ? 0 : Math.sin(work*1.8)*0.4-0.15);
      seg(c,0,0,0,-26,'#6c4e30',3.5);
      shape(c,[[-9,-30],[9,-30],[9,-23],[-9,-23]],'#899098');
      c.restore();
      // Big anvil by the smith when working.
      if(!moving) {shape(c,[[21,-6],[34,-6],[31,0],[24,0],[23,5],[19,5],[20,0]],'#555b5f');}
      break;
    }
    case 'merchant':
      ell(c,15,-20,9,12,'#88633f'); seg(c,14,-26,17,-18,'#c5a267',2);
      if(!moving){ell(c,-16,-25,4.6,4.6,'#e0b443'); ell(c,-16,-25,1.8,2.5,'#f5db8d','');}
      break;
    case 'scout':
      seg(c,15,-13,24,-19,'#b7bbbc',3);
      shape(c,[[23,-20],[29,-26],[26,-18]],'#c8c9c9');
      break;
  }
  c.restore();
}

export function drawCitizen(c:C, f:CitizenFrame, wx:number, wy:number, selected=false): void {
  const style=colors[f.role];
  const walk = f.moving ? Math.sin(f.phase) : 0;
  const breathe = Math.sin(f.work*0.6) * 0.65;
  const bob = f.moving ? Math.abs(walk)*2.2 : breathe*0.4;
  c.save(); c.translate(wx,wy);
  // Ground shadow stays fixed while body lifts and steps.
  c.fillStyle='rgba(17,19,15,0.32)';
  c.beginPath(); c.ellipse(0,0,14.8,5.4,0,0,Math.PI*2); c.fill();
  if(selected) {
    c.strokeStyle='#f5d06b'; c.lineWidth=2.3; c.beginPath();
    c.ellipse(0,0,17.8,7.8,0,0,Math.PI*2); c.stroke();
  }
  c.translate(0,-bob); c.scale(f.facing,1);
  // Dark shoes, staggered while walking.
  ell(c,-6+walk*2,-3,5.4,3.9,'#43332d'); ell(c,6-walk*2,-3,5.4,3.9,'#43332d');
  // Cloak / outer garment silhouette.
  if(f.role === 'king' || f.role === 'scout' || f.role === 'archer') {
    shape(c,[[-11,-27],[-16,-6],[0,-5],[16,-6],[11,-27]],
      f.role==='king'?'#85332f':f.role==='archer'?'#344d39':'#28302b');
  }
  ell(c,0,-18+breathe*0.3,12,14,style.cloth);
  // Tunic texture, embroidery and belt.
  shape(c,[[-8,-13],[8,-13],[9,-9],[-9,-9]],'#493a2b');
  ell(c,0,-11,2,2,'#d7b16b','');
  if (f.role==='knight') {
    shape(c,[[-5,-24],[0,-29],[5,-24],[5,-16],[0,-13],[-5,-16]],style.trim,'');
    seg(c,0,-26,0,-17,'#a43b39',2.1);
  }
  if(f.role==='blacksmith') {
    shape(c,[[-8,-22],[8,-22],[9,-6],[-10,-6]],'#8b5e3d');
    seg(c,-7,-25,5,-10,'#b8966f',1.8);
  }
  if(f.role==='merchant') {seg(c,-8,-23,8,-8,'#d7aa62',2);}
  // Arms swing opposite to legs. Head remains readable.
  const swing=walk*3.6;
  ell(c,-12,-19-swing,4.4,8.5,style.cloth);
  ell(c,12,-19+swing,4.4,8.5,style.cloth);
  ell(c,-12,-12-swing,4.6,4.4,style.skin);
  ell(c,12,-12+swing,4.6,4.4,style.skin);
  // Head/face.
  ell(c,0,-34+breathe*0.2,11.8,11.4,style.skin);
  if(f.role !== 'knight' && f.role !== 'scout' && f.role !== 'archer') {
    // Sideburns and tapered cartoon beard, distinct from an untextured circle.
    shape(c,[[-10,-32],[-7,-24],[-2,-20],[5,-21],[9,-27],[10,-32],[5,-29],[0,-31],[-6,-29]],style.hair);
    for(let i=-1;i<=1;i++)seg(c,i*2.3,-26,i*2.3,-24,'#34271f',0.9);
  } else if(f.role==='archer' || f.role==='scout') {
    shape(c,[[-10,-32],[10,-32],[9,-26],[-9,-26]],'#2a2b29');
  }
  // Small eyebrow/eye dots.
  if(f.role!=='knight') {
    seg(c,-7,-36,-3,-36,style.hair,1.7);
    seg(c,3,-36,7,-36,style.hair,1.7);
    ell(c,-5,-33,1.3,1.7,'#201b19','');
    ell(c,5,-33,1.3,1.7,'#201b19','');
  }
  drawHelmet(c,f.role);
  drawGear(c,f.role,f.work,f.moving);
  // Banner pin helps visual identity of royalty / guard units.
  if(f.role==='king' || f.role==='knight') {
    ell(c,0,-17,2.5,2.8,'#efc464','');
  }
  c.restore();
}
