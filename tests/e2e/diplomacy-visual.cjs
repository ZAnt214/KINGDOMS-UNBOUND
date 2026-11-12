#!/usr/bin/env node
/**
 * Passeio automatizado da Fase F (diplomacia), com capturas: pedido recebido e recusado, pedido
 * aceito com a cerimônia e o arco de aliança no mapa, território aliado, envio de recursos, ajuda
 * a um aliado atacado e quebra com penalidade.
 *
 *   MOCK_WAR=1 MOCK_DIPLO=1 no servidor falso (tests/e2e/fixtures/play-mock-server.ts): ao fundar,
 *   ele cria uma nação rival vizinha (que já pediu aliança) e uma terceira nação forte, que responde
 *   pela regra dos bots. Só prova a interface; regras e persistência são provadas em
 *   tests/integration/diplomacy.test.ts com o servidor real.
 *
 * Variáveis: BASE_URL, PLAYWRIGHT_MODULE, OUT, W/H.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.OUT || 'tests/e2e/screenshots/diplomacy';
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const project = (page, lon, lat) => page.evaluate(([a, b]) => window.__kuMap.project(a, b), [lon, lat]);
async function clickMap(page, lon, lat) {
  const [x, y] = await project(page, lon, lat);
  await page.mouse.click(x, y);
}
const stateOf = (page) => page.evaluate(async () => (await fetch('/api/play/state')).json());
const text = async (page, sel) => (await page.locator(sel).count() ? page.locator(sel).first().innerText() : '');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: W < 700, isMobile: W < 700 });
  const A = await ctx.newPage();
  A.on('pageerror', (e) => errors.push(e.message));
  await A.goto(BASE);
  await A.waitForSelector('[data-testid=play-root][data-map=ready]', { timeout: 30000 });
  await A.click('[data-testid=start]');
  await A.waitForSelector('[data-testid=mode-select]');
  await A.click('[data-testid=mode-campaign]');
  await A.waitForSelector('[data-testid=identity-screen]');
  await A.fill('[data-testid=nation-name]', `Aurora ${Date.now() % 1000}`);
  await A.click('[data-testid=color-crimson]');
  await A.click('[data-testid=identity-done]');
  await A.waitForSelector('[data-testid=map-stage][data-phase=select]');
  await A.waitForTimeout(1200);
  await clickMap(A, -47.916, -15.783);
  await A.waitForSelector('[data-testid=point-card]');
  await A.click('[data-testid=confirm-location]');
  await A.waitForSelector('[data-testid=map-stage][data-phase=play]', { timeout: 15000 });
  await A.waitForTimeout(4500);

  const s0 = await stateOf(A);
  const rival = s0.nations.find((n) => n.name === 'Rival (teste)');
  const friend = s0.nations.find((n) => n.name === 'Aliado (teste)');
  check('cenário: rival vizinho e uma terceira nação', !!rival && !!friend);

  // ---------- pedido recebido ----------
  await A.waitForSelector('[data-testid=pact-prompt]', { timeout: 8000 }).catch(() => {});
  await A.screenshot({ path: `${OUT}/01-pedido-recebido.png` });
  check('pedido do rival aparece sobre o mapa com Aceitar e Recusar', /Rival \(teste\) pede aliança/.test(await text(A, '[data-testid=pact-prompt]')));
  check('dock mostra o pedido pendente', (await text(A, '[data-testid=dock-diplomacy]')).includes('1'));
  await A.click('[data-testid=prompt-decline]');
  await A.waitForTimeout(600);
  check('recusado, o cartão some', (await A.locator('[data-testid=pact-prompt]').count()) === 0);

  // ---------- pedir aliança pelo painel ----------
  await A.click('[data-testid=dock-diplomacy]');
  await A.waitForSelector('[data-testid=diplomacy-sheet]');
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/02-painel.png` });
  check('painel lista as outras nações com Pedir aliança', (await A.locator('[data-testid=pact-world] li').count()) >= 2);
  await A.click(`[data-testid=pact-ask-${friend.id}]`);
  await A.waitForSelector('[data-testid=pact-ceremony]', { timeout: 8000 }).then(
    () => check('aceito: cerimônia da aliança', true),
    () => check('aceito: cerimônia da aliança', false),
  );
  await A.waitForTimeout(1300);
  await A.screenshot({ path: `${OUT}/03-cerimonia.png` });
  await A.waitForSelector('[data-testid=pact-ceremony]', { state: 'detached', timeout: 6000 }).catch(() => {});
  await A.waitForTimeout(200);
  await A.screenshot({ path: `${OUT}/04-arco-no-mapa.png` });
  const pacts = await A.evaluate(() => window.__kuMap.pacts());
  check('arco de aliança desenhado no mapa', pacts.length === 1 && !pacts[0].broken);
  const s1 = await stateOf(A);
  check('as duas nações ficam na mesma aliança', s1.nations.find((n) => n.id === s1.me).alliance !== null && s1.nations.find((n) => n.id === s1.me).alliance === s1.nations.find((n) => n.id === friend.id).alliance);
  check('nome da aliança no estado', /e Aliado \(teste\)/.test(s1.diplomacy.allianceName ?? ''));

  // ---------- território aliado e envio de recursos ----------
  const friendRegion = s1.control.find(([, o]) => o === friend.id)[0];
  const fc = await A.evaluate((id) => window.__kuMap.regionCenter(id), friendRegion);
  await clickMap(A, fc[0], fc[1]);
  await A.waitForSelector('[data-testid=ally-actions]', { timeout: 8000 }).then(
    () => check('cartão do território aliado com Enviar recursos', true),
    () => check('cartão do território aliado com Enviar recursos', false),
  );
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/05-territorio-aliado.png` });
  await A.click('[data-testid=ally-gift]');
  await A.waitForSelector('[data-testid=gift-sheet]');
  await A.focus('[data-testid=gift-money]');
  for (let i = 0; i < 10; i++) await A.keyboard.press('ArrowRight');
  await A.waitForTimeout(200);
  await A.screenshot({ path: `${OUT}/06-enviar.png` });
  const before = (await stateOf(A)).economy.amounts.money;
  await A.click('[data-testid=gift-send]');
  await A.waitForFunction(() => /Recursos enviados/.test(document.body.textContent ?? ''), null, { timeout: 6000 }).then(
    () => check('envio confirmado com aviso', true),
    () => check('envio confirmado com aviso', false),
  );
  check('dinheiro sai do saldo', (await stateOf(A)).economy.amounts.money < before);
  await A.keyboard.press('Escape');
  if (await A.locator('[data-testid=region-card] .ku-card-close').count()) await A.click('[data-testid=region-card] .ku-card-close');
  await A.waitForTimeout(300);

  // ---------- ajuda a aliado atacado ----------
  const atk = await A.evaluate(
    async ([attacker, region]) => (await fetch('/api/__mock/attack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attacker, region }) })).status,
    [rival.id, friendRegion],
  );
  check('cenário: rival ataca o aliado', atk === 200);
  await A.waitForSelector('[data-testid=op-ally-defend]', { timeout: 8000 }).then(
    () => check('aviso dourado: aliado sob ataque', true),
    () => check('aviso dourado: aliado sob ataque', false),
  );
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/07-aliado-sob-ataque.png` });
  await A.click('[data-testid=op-ally-defend]');
  await A.waitForSelector('[data-testid=operation-sheet]');
  check('folha oferece ajudar a defender', /Ajudar a defender/.test(await text(A, '[data-testid=reinforce-go]')));
  await A.click('[data-testid=reinforce-25]');
  await A.click('[data-testid=reinforce-go]');
  await A.waitForSelector('[data-testid=operation-allies]', { timeout: 6000 }).then(
    () => check('suas tropas aparecem na defesa do aliado', true),
    () => check('suas tropas aparecem na defesa do aliado', false),
  );
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/08-ajuda-enviada.png` });
  const op = (await stateOf(A)).operations.find((o) => o.region === friendRegion);
  check('o servidor registra a ajuda (lado e tropas)', !!op && op.mine?.side === 'defender' && op.allies.some((a) => a.side === 'defender'));
  await A.keyboard.press('Escape');

  // ---------- quebra ----------
  await A.click('[data-testid=dock-diplomacy]');
  await A.waitForSelector('[data-testid=diplomacy-sheet]');
  await A.click('[data-testid=pact-break]');
  await A.waitForSelector('[data-testid=pact-break-confirm]');
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/09-confirmar-quebra.png` });
  check('antes de romper: penalidade de tropas, recursos e 30 min', /tropas/.test(await text(A, '[data-testid=pact-break-confirm]')) && /30 minutos/.test(await text(A, '[data-testid=pact-break-confirm]')));
  const troopsBefore = (await stateOf(A)).military.army.infantry;
  await A.click('[data-testid=pact-break-go]');
  await A.waitForSelector('[data-testid=pact-broken]', { timeout: 6000 }).then(
    () => check('quebra animada', true),
    () => check('quebra animada', false),
  );
  await A.waitForTimeout(900);
  await A.screenshot({ path: `${OUT}/10-quebra.png` });
  const s2 = await stateOf(A);
  check('penalidade aplicada pelo servidor (10% das tropas)', s2.military.army.infantry === troopsBefore - Math.floor(troopsBefore * 0.1));
  check('bloqueio de 30 min contra o ex-aliado', s2.diplomacy.blocks.some((b) => b.nationId === friend.id));
  check('aliança desfeita', s2.nations.find((n) => n.id === s2.me).alliance === null);

  check('sem erros de JavaScript na página', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificações passaram`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
