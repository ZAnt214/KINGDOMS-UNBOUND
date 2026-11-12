import { DEFAULT_FLAG, FLAG_IMAGE, type FlagSpec, flagDataUrl, inspectFlagImage, parseFlag } from '../../../shared/play/flags';
import { NATION_COLOR_BY_HEX, NATION_COLORS } from '../../../shared/play/rules';
import type { NationView } from '../../../shared/play/types';

/** Identidade escolhida antes de fundar a nação. Fica salva no navegador até a fundação. */
export interface IdentityDraft {
  name: string;
  color: string;
  flag: FlagSpec;
  /** Imagem da galeria já reduzida (substitui o desenho). */
  image: { base64: string; type: string } | null;
}

const KEY = 'ku.identity';

export function loadDraft(): IdentityDraft {
  const fallback: IdentityDraft = { name: '', color: NATION_COLORS[7].hex, flag: DEFAULT_FLAG, image: null };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw) return fallback;
    const image = raw.image && typeof raw.image.base64 === 'string' && typeof raw.image.type === 'string' ? { base64: raw.image.base64, type: raw.image.type } : null;
    return {
      name: typeof raw.name === 'string' ? raw.name.slice(0, 22) : '',
      color: NATION_COLOR_BY_HEX[raw.color] ? raw.color : fallback.color,
      flag: parseFlag(raw.flag) ?? DEFAULT_FLAG,
      image,
    };
  } catch {
    return fallback;
  }
}

export function saveDraft(draft: IdentityDraft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* sem armazenamento: o rascunho vale só nesta sessão */
  }
}

export const draftFlagSrc = (d: Pick<IdentityDraft, 'flag' | 'image'>) => (d.image ? `data:${d.image.type};base64,${d.image.base64}` : flagDataUrl(d.flag));

/** Endereço da bandeira de uma nação já fundada. */
export const nationFlagSrc = (n: Pick<NationView, 'id' | 'flag' | 'flagImage'>) => (n.flagImage ? `/api/play/flag/${n.id}?v=${n.flagImage}` : flagDataUrl(n.flag));

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * Prepara uma imagem da galeria: confere tipo e tamanho, recorta em 3:2, reduz para 120×80 e
 * codifica em JPEG até caber no limite. O servidor confere tudo de novo ao receber.
 */
export async function prepareFlagImage(file: File): Promise<{ base64: string; type: string }> {
  if (!ACCEPTED.includes(file.type)) throw new Error('Formato não aceito. Envie PNG, JPEG ou WebP.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Arquivo grande demais (máximo 8 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      el.src = url;
    });
    if (img.naturalWidth < 30 || img.naturalHeight < 20) throw new Error('Imagem pequena demais (mínimo 30×20).');
    const canvas = document.createElement('canvas');
    canvas.width = FLAG_IMAGE.maxWidth;
    canvas.height = FLAG_IMAGE.maxHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Este navegador não consegue processar a imagem.');
    // Recorte central na proporção da bandeira.
    const ratio = canvas.width / canvas.height;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (sw / sh > ratio) sw = sh * ratio;
    else sh = sw / ratio;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.58, 0.44, 0.3]) {
      const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const check = inspectFlagImage(bytes);
      if (check.ok) return { base64, type: check.type };
    }
    throw new Error('Não foi possível reduzir a imagem ao tamanho permitido.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cache = new Map<string, HTMLImageElement>();

/** Imagem de bandeira para o canvas do mapa. Devolve null até carregar e chama `onLoad` quando estiver pronta. */
export function flagCanvasImage(src: string, onLoad: () => void): HTMLImageElement | null {
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = onLoad;
    img.src = src;
    cache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
