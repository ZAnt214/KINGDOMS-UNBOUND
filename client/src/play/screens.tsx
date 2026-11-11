import { useRef, useState } from 'react';
import {
  FLAG_COLORS,
  FLAG_EMBLEM_LABELS,
  FLAG_EMBLEMS,
  FLAG_PATTERN_LABELS,
  FLAG_PATTERNS,
  FLAG_PRESETS,
  type FlagSpec,
  flagDataUrl,
} from '../../../shared/play/flags';
import { cleanNationName, type GameMode, MODES_AVAILABLE, NATION_COLORS, nationNameProblem } from '../../../shared/play/rules';
import { audio } from './audio';
import { draftFlagSrc, type IdentityDraft, prepareFlagImage } from './identity';
import { Emblem, IcBack, IcBolt, IcGlobe, IcLock, IcTeam, IcUpload } from './icons';

export function TitleScreen({ busy, error, returning, onStart, onLogin }: { busy: boolean; error: string | null; returning: boolean; onStart: () => void; onLogin: () => void }) {
  return (
    <div className="ku-title" data-testid="title-screen">
      <div className="ku-title-mark">
        <Emblem size={64} />
        <h1>
          <span>Kingdoms</span>
          <span>Unbound</span>
        </h1>
        <p>Escolha um ponto do mundo. Funde sua nação. Faça o mapa mudar de cor.</p>
      </div>
      <div className="ku-title-actions">
        {error && (
          <p className="ku-alert" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="ku-cta" onClick={onStart} disabled={busy} data-testid="start">
          {busy ? 'Entrando…' : returning ? 'CONTINUAR' : 'COMEÇAR A JOGAR'}
        </button>
        <button type="button" className="ku-link" onClick={onLogin} data-testid="title-login">
          Entrar com usuário e senha
        </button>
      </div>
    </div>
  );
}

const MODES: { id: GameMode; name: string; text: string; detail: string; icon: typeof IcGlobe }[] = [
  {
    id: 'campaign',
    name: 'Campanha',
    text: 'Um mundo persistente e compartilhado. Sua nação continua lá quando você sai.',
    detail: 'Progressão longa. A temporada de 10 dias com ranking final ainda será ligada.',
    icon: IcGlobe,
  },
  {
    id: 'quick',
    name: 'Partida rápida',
    text: 'Tudo acelerado: quem ocupar 100% do território disponível primeiro vence.',
    detail: 'Ainda não existe no servidor.',
    icon: IcBolt,
  },
  {
    id: 'team',
    name: 'Equipe',
    text: 'Você entra numa equipe sorteada e conquista o mapa em conjunto.',
    detail: 'Ainda não existe no servidor.',
    icon: IcTeam,
  },
];

export function ModeSelect({ worldName, nations, onPick, onBack }: { worldName: string; nations: number; onPick: (mode: GameMode) => void; onBack: () => void }) {
  return (
    <div className="ku-panel-screen" data-testid="mode-select">
      <header className="ku-screen-head">
        <button type="button" className="ku-icon-btn" onClick={onBack} aria-label="Voltar">
          <IcBack />
        </button>
        <h2>Como você quer jogar?</h2>
      </header>
      <div className="ku-modes">
        {MODES.map((m) => {
          const open = MODES_AVAILABLE[m.id];
          const Ic = m.icon;
          return (
            <button
              type="button"
              key={m.id}
              className={`ku-mode ${open ? '' : 'locked'}`}
              disabled={!open}
              onClick={() => {
                audio.play('confirm');
                onPick(m.id);
              }}
              data-testid={`mode-${m.id}`}
            >
              <span className="ku-mode-icon">
                <Ic width={26} height={26} />
              </span>
              <span className="ku-mode-body">
                <b>{m.name}</b>
                <span>{m.text}</span>
                <small>
                  {!open && <IcLock width={13} height={13} />}
                  {open ? `${worldName}: ${nations} ${nations === 1 ? 'nação fundada' : 'nações fundadas'}. ${m.detail}` : m.detail}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type FlagTab = 'presets' | 'editor' | 'image';

export function IdentityScreen({ draft, onChange, onDone, onBack }: { draft: IdentityDraft; onChange: (d: IdentityDraft) => void; onDone: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<FlagTab>(draft.image ? 'image' : 'presets');
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const name = cleanNationName(draft.name);
  const problem = nationNameProblem(name);
  const setFlag = (flag: FlagSpec) => onChange({ ...draft, flag, image: null });
  const setColorAt = (i: number, hex: string) => {
    const colors = [...draft.flag.colors] as FlagSpec['colors'];
    colors[i] = hex;
    setFlag({ ...draft.flag, colors });
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setImageBusy(true);
    setImageError(null);
    try {
      onChange({ ...draft, image: await prepareFlagImage(f) });
      audio.play('select');
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Não foi possível usar esta imagem.');
      audio.play('deny');
    } finally {
      setImageBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="ku-panel-screen" data-testid="identity-screen">
      <header className="ku-screen-head">
        <button type="button" className="ku-icon-btn" onClick={onBack} aria-label="Voltar">
          <IcBack />
        </button>
        <h2>A identidade da sua nação</h2>
      </header>

      <div className="ku-identity">
        <div className="ku-identity-preview" style={{ ['--nation' as string]: draft.color }}>
          <div className="ku-preview-land" aria-hidden>
            <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
              <path d="M18 70 34 38l30-16 34 8 22-12 36 14 22 30-10 28-36 14-30-8-34 10-30-10z" className="land" />
              <path d="M64 22 98 30l22-12 36 14 22 30-10 28-36 14-30-8-12-34z" className="own" />
              <path d="M98 30 86 64l12 34M86 64l46 8 26-12" className="inner" />
            </svg>
            <img src={draftFlagSrc(draft)} alt="" className="ku-preview-flag" />
          </div>
          <p className="ku-preview-name">{name || 'Sua nação'}</p>
        </div>

        <div className="ku-identity-form">
          <label className="ku-field">
            <span>Nome</span>
            <input
              value={draft.name}
              maxLength={22}
              placeholder="Ex.: República Aurora"
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              onBlur={() => setTouched(true)}
              autoComplete="off"
              data-testid="nation-name"
            />
            {touched && problem && <em>{problem}</em>}
          </label>

          <div className="ku-field">
            <span>Cor do território</span>
            <div className="ku-swatches" role="radiogroup" aria-label="Cor do território">
              {NATION_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  role="radio"
                  aria-checked={draft.color === c.hex}
                  aria-label={c.name}
                  title={c.name}
                  className={draft.color === c.hex ? 'on' : ''}
                  style={{ background: c.hex }}
                  onClick={() => {
                    audio.play('tap');
                    onChange({ ...draft, color: c.hex });
                  }}
                  data-testid={`color-${c.id}`}
                />
              ))}
            </div>
          </div>

          <div className="ku-field">
            <span>Bandeira</span>
            <div className="ku-tabs" role="tablist">
              {(
                [
                  ['presets', 'Modelos'],
                  ['editor', 'Criar'],
                  ['image', 'Imagem'],
                ] as [FlagTab, string][]
              ).map(([id, label]) => (
                <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} data-testid={`flag-tab-${id}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'presets' && (
              <div className="ku-flag-grid">
                {FLAG_PRESETS.map((p) => {
                  const on = !draft.image && JSON.stringify(draft.flag) === JSON.stringify(p.flag);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className={on ? 'on' : ''}
                      aria-label={p.name}
                      title={p.name}
                      onClick={() => {
                        audio.play('tap');
                        setFlag(p.flag);
                      }}
                      data-testid={`flag-${p.id}`}
                    >
                      <img src={flagDataUrl(p.flag)} alt="" />
                    </button>
                  );
                })}
              </div>
            )}

            {tab === 'editor' && (
              <div className="ku-flag-editor">
                <label>
                  <span>Padrão</span>
                  <select value={draft.flag.pattern} onChange={(e) => setFlag({ ...draft.flag, pattern: e.target.value as FlagSpec['pattern'] })} data-testid="flag-pattern">
                    {FLAG_PATTERNS.map((p) => (
                      <option key={p} value={p}>
                        {FLAG_PATTERN_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Emblema</span>
                  <select value={draft.flag.emblem} onChange={(e) => setFlag({ ...draft.flag, emblem: e.target.value as FlagSpec['emblem'] })} data-testid="flag-emblem">
                    {FLAG_EMBLEMS.map((p) => (
                      <option key={p} value={p}>
                        {FLAG_EMBLEM_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                {['Campo', 'Segunda cor', 'Terceira cor e emblema'].map((label, i) => (
                  <div className="ku-color-row" key={label}>
                    <span>{label}</span>
                    <div>
                      {FLAG_COLORS.map((hex) => (
                        <button type="button" key={hex} aria-label={`${label}: ${hex}`} className={draft.flag.colors[i] === hex ? 'on' : ''} style={{ background: hex }} onClick={() => setColorAt(i, hex)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'image' && (
              <div className="ku-flag-image">
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pickFile(e.target.files?.[0])} data-testid="flag-file" />
                <button type="button" className="ku-btn" onClick={() => file.current?.click()} disabled={imageBusy}>
                  <IcUpload width={18} height={18} />
                  {imageBusy ? 'Processando…' : draft.image ? 'Trocar imagem' : 'Escolher da galeria'}
                </button>
                {draft.image && (
                  <button type="button" className="ku-link" onClick={() => onChange({ ...draft, image: null })}>
                    Voltar para o desenho
                  </button>
                )}
                <p>PNG, JPEG ou WebP de até 8 MB. A imagem é recortada em 3:2 e reduzida para 120×80 antes do envio; o servidor confere formato e tamanho.</p>
                {imageError && (
                  <p className="ku-alert" role="alert">
                    {imageError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="ku-screen-foot">
        <button
          type="button"
          className="ku-cta"
          disabled={!!problem}
          onClick={() => {
            audio.play('confirm');
            onChange({ ...draft, name });
            onDone();
          }}
          data-testid="identity-done"
        >
          ESCOLHER LOCALIZAÇÃO
        </button>
        {problem && !touched && <p className="ku-hint">Dê um nome à nação para continuar.</p>}
      </footer>
    </div>
  );
}
