// Bandeiras das nações: padrões e emblemas vetoriais originais, descritos por dados.
// A mesma função gera o SVG para a interface e para o mapa; o servidor valida com `parseFlag`.

export const FLAG_PATTERNS = ['solid', 'horizontal2', 'horizontal3', 'vertical2', 'vertical3', 'band', 'cross', 'saltire', 'chevron', 'diagonal', 'quarters', 'border'] as const;
export type FlagPattern = (typeof FLAG_PATTERNS)[number];

export const FLAG_EMBLEMS = ['none', 'star', 'ring', 'diamond', 'triangle', 'bolt', 'wings', 'compass'] as const;
export type FlagEmblem = (typeof FLAG_EMBLEMS)[number];

export const FLAG_PATTERN_LABELS: Record<FlagPattern, string> = {
  solid: 'Lisa',
  horizontal2: 'Duas faixas',
  horizontal3: 'Três faixas',
  vertical2: 'Duas colunas',
  vertical3: 'Três colunas',
  band: 'Faixa central',
  cross: 'Cruz',
  saltire: 'Aspa',
  chevron: 'Cunha',
  diagonal: 'Diagonal',
  quarters: 'Quartos',
  border: 'Moldura',
};

export const FLAG_EMBLEM_LABELS: Record<FlagEmblem, string> = {
  none: 'Sem emblema',
  star: 'Estrela',
  ring: 'Anel',
  diamond: 'Losango',
  triangle: 'Delta',
  bolt: 'Raio',
  wings: 'Asas',
  compass: 'Rosa dos ventos',
};

/** Cores disponíveis no editor de bandeira. */
export const FLAG_COLORS = [
  '#f4f6fa', '#0e1626', '#8792a6', '#e5484d', '#f76b15', '#f5b800', '#46a758', '#12a594',
  '#0090ff', '#3e63dd', '#8e4ec6', '#e93d82', '#7a1f2b', '#0b5d3b', '#123a7a', '#c8a45a',
] as const;

export interface FlagSpec {
  pattern: FlagPattern;
  /** Campo, segunda cor e terceira cor (o emblema usa a terceira). */
  colors: [string, string, string];
  emblem: FlagEmblem;
}

export const FLAG_W = 60;
export const FLAG_H = 40;

export const FLAG_PRESETS: { id: string; name: string; flag: FlagSpec }[] = [
  { id: 'aurora', name: 'Aurora', flag: { pattern: 'horizontal3', colors: ['#0090ff', '#f4f6fa', '#f5b800'], emblem: 'none' } },
  { id: 'meridiano', name: 'Meridiano', flag: { pattern: 'vertical3', colors: ['#123a7a', '#f4f6fa', '#e5484d'], emblem: 'none' } },
  { id: 'vanguarda', name: 'Vanguarda', flag: { pattern: 'chevron', colors: ['#e5484d', '#0e1626', '#f5b800'], emblem: 'none' } },
  { id: 'atlas', name: 'Atlas', flag: { pattern: 'solid', colors: ['#3e63dd', '#3e63dd', '#f4f6fa'], emblem: 'compass' } },
  { id: 'boreal', name: 'Boreal', flag: { pattern: 'cross', colors: ['#12a594', '#f4f6fa', '#f4f6fa'], emblem: 'none' } },
  { id: 'falcao', name: 'Falcão', flag: { pattern: 'horizontal2', colors: ['#0e1626', '#f76b15', '#f4f6fa'], emblem: 'wings' } },
  { id: 'equinocio', name: 'Equinócio', flag: { pattern: 'band', colors: ['#46a758', '#f5b800', '#0e1626'], emblem: 'star' } },
  { id: 'tormenta', name: 'Tormenta', flag: { pattern: 'diagonal', colors: ['#8e4ec6', '#0e1626', '#f5b800'], emblem: 'bolt' } },
  { id: 'delta', name: 'Delta', flag: { pattern: 'vertical2', colors: ['#f4f6fa', '#e93d82', '#0e1626'], emblem: 'triangle' } },
  { id: 'orbita', name: 'Órbita', flag: { pattern: 'quarters', colors: ['#123a7a', '#0090ff', '#f4f6fa'], emblem: 'ring' } },
  { id: 'bastiao', name: 'Bastião', flag: { pattern: 'border', colors: ['#7a1f2b', '#c8a45a', '#c8a45a'], emblem: 'diamond' } },
  { id: 'litoral', name: 'Litoral', flag: { pattern: 'saltire', colors: ['#0b5d3b', '#f4f6fa', '#f5b800'], emblem: 'none' } },
];

export const DEFAULT_FLAG: FlagSpec = FLAG_PRESETS[0].flag;

const HEX = /^#[0-9a-f]{6}$/;

/** Valida uma bandeira recebida de fora. Devolve a bandeira normalizada ou null. */
export function parseFlag(input: unknown): FlagSpec | null {
  if (!input || typeof input !== 'object') return null;
  const f = input as Partial<FlagSpec>;
  if (!FLAG_PATTERNS.includes(f.pattern as FlagPattern)) return null;
  if (!FLAG_EMBLEMS.includes(f.emblem as FlagEmblem)) return null;
  if (!Array.isArray(f.colors) || f.colors.length !== 3) return null;
  const colors = f.colors.map((c) => (typeof c === 'string' ? c.toLowerCase() : ''));
  if (!colors.every((c) => HEX.test(c))) return null;
  return { pattern: f.pattern as FlagPattern, colors: colors as [string, string, string], emblem: f.emblem as FlagEmblem };
}

function patternSvg(pattern: FlagPattern, [a, b, c]: [string, string, string]): string {
  const W = FLAG_W;
  const H = FLAG_H;
  const field = `<rect width="${W}" height="${H}" fill="${a}"/>`;
  switch (pattern) {
    case 'solid':
      return field;
    case 'horizontal2':
      return `${field}<rect y="${H / 2}" width="${W}" height="${H / 2}" fill="${b}"/>`;
    case 'horizontal3':
      return `${field}<rect y="${H / 3}" width="${W}" height="${H / 3}" fill="${b}"/><rect y="${(2 * H) / 3}" width="${W}" height="${H / 3}" fill="${c}"/>`;
    case 'vertical2':
      return `${field}<rect x="${W / 2}" width="${W / 2}" height="${H}" fill="${b}"/>`;
    case 'vertical3':
      return `${field}<rect x="${W / 3}" width="${W / 3}" height="${H}" fill="${b}"/><rect x="${(2 * W) / 3}" width="${W / 3}" height="${H}" fill="${c}"/>`;
    case 'band':
      return `${field}<rect y="13" width="${W}" height="14" fill="${b}"/>`;
    case 'cross':
      return `${field}<rect x="17" width="8" height="${H}" fill="${b}"/><rect y="16" width="${W}" height="8" fill="${b}"/>`;
    case 'saltire':
      return `${field}<path d="M0 0 L6 0 L60 36 L60 40 L54 40 L0 4 Z M60 0 L60 4 L6 40 L0 40 L0 36 L54 0 Z" fill="${b}"/>`;
    case 'chevron':
      return `${field}<path d="M0 0 L26 20 L0 40 Z" fill="${b}"/>`;
    case 'diagonal':
      return `${field}<path d="M0 40 L60 0 L60 40 Z" fill="${b}"/>`;
    case 'quarters':
      return `${field}<rect x="${W / 2}" width="${W / 2}" height="${H / 2}" fill="${b}"/><rect y="${H / 2}" width="${W / 2}" height="${H / 2}" fill="${b}"/>`;
    case 'border':
      return `<rect width="${W}" height="${H}" fill="${b}"/><rect x="5" y="5" width="${W - 10}" height="${H - 10}" fill="${a}"/>`;
  }
}

/** Emblemas desenhados numa caixa de 20×20 centrada em (0, 0). */
const EMBLEM_PATHS: Record<Exclude<FlagEmblem, 'none'>, string> = {
  star: 'M0 -10 L2.9 -3.1 L9.5 -3.1 L4.2 1.2 L5.9 8.1 L0 4.3 L-5.9 8.1 L-4.2 1.2 L-9.5 -3.1 L-2.9 -3.1 Z',
  ring: 'M0 -9 A9 9 0 1 0 0 9 A9 9 0 1 0 0 -9 Z M0 -5 A5 5 0 1 1 0 5 A5 5 0 1 1 0 -5 Z',
  diamond: 'M0 -10 L8 0 L0 10 L-8 0 Z',
  triangle: 'M0 -9 L9.5 8 L-9.5 8 Z M0 -2.5 L-4 5 L4 5 Z',
  bolt: 'M2.5 -10 L-6 1.5 L-1 1.5 L-2.5 10 L6 -1.5 L1 -1.5 Z',
  wings: 'M0 -4 L3 -1 L11 -6 L8 0 L10.5 0.5 L6.5 3 L7.5 4.5 L2 5 L0 9 L-2 5 L-7.5 4.5 L-6.5 3 L-10.5 0.5 L-8 0 L-11 -6 L-3 -1 Z',
  compass: 'M0 -10 L2.2 -2.2 L10 0 L2.2 2.2 L0 10 L-2.2 2.2 L-10 0 L-2.2 -2.2 Z',
};

/** Onde o emblema fica em cada padrão (centro x, centro y, escala). */
function emblemPlacement(pattern: FlagPattern): [number, number, number] {
  if (pattern === 'chevron') return [9, 20, 0.55];
  if (pattern === 'cross') return [21, 20, 0.0];
  return [FLAG_W / 2, FLAG_H / 2, 1];
}

/** SVG completo da bandeira (60×40). */
export function flagSvg(spec: FlagSpec): string {
  let body = patternSvg(spec.pattern, spec.colors);
  if (spec.emblem !== 'none') {
    const [cx, cy, s] = emblemPlacement(spec.pattern);
    if (s > 0) {
      body += `<path transform="translate(${cx} ${cy}) scale(${s})" d="${EMBLEM_PATHS[spec.emblem]}" fill="${spec.colors[2]}" fill-rule="evenodd" stroke="rgba(0,0,0,0.28)" stroke-width="0.6" stroke-linejoin="round"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FLAG_W} ${FLAG_H}" width="${FLAG_W * 2}" height="${FLAG_H * 2}">${body}</svg>`;
}

export function flagDataUrl(spec: FlagSpec): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(flagSvg(spec))}`;
}

// ---------- imagem enviada pelo jogador ----------

export const FLAG_IMAGE = {
  /** Tamanho máximo do arquivo já reduzido (bytes). */
  maxBytes: 9000,
  /** O cliente reduz a imagem para caber nesta caixa antes de enviar. */
  maxWidth: 120,
  maxHeight: 80,
  types: ['image/png', 'image/jpeg'] as const,
};

export type FlagImageType = (typeof FLAG_IMAGE.types)[number];

/**
 * Confere o conteúdo de uma imagem de bandeira: formato real (assinatura), dimensões e tamanho.
 * Não confia na extensão nem no tipo declarado.
 */
export function inspectFlagImage(bytes: Uint8Array): { ok: true; type: FlagImageType; width: number; height: number } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: 'Imagem vazia.' };
  if (bytes.length > FLAG_IMAGE.maxBytes) return { ok: false, reason: `Imagem grande demais (máximo ${FLAG_IMAGE.maxBytes} bytes após a redução).` };
  let type: FlagImageType | null = null;
  let width = 0;
  let height = 0;
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52) {
    type = 'image/png';
    width = (u16(16) << 16) | u16(18);
    height = (u16(20) << 16) | u16(22);
  } else if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    type = 'image/jpeg';
    // Percorre os segmentos até o SOF, que traz as dimensões.
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      const len = u16(i + 2);
      if (len < 2) break;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        height = u16(i + 5);
        width = u16(i + 7);
        break;
      }
      i += 2 + len;
    }
  }
  if (!type) return { ok: false, reason: 'Formato não aceito. Use PNG ou JPEG.' };
  if (!width || !height) return { ok: false, reason: 'Imagem corrompida.' };
  if (width > FLAG_IMAGE.maxWidth || height > FLAG_IMAGE.maxHeight) {
    return { ok: false, reason: `Dimensões acima de ${FLAG_IMAGE.maxWidth}×${FLAG_IMAGE.maxHeight}.` };
  }
  return { ok: true, type, width, height };
}
