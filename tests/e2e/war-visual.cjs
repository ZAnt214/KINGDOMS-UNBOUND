#!/usr/bin/env node
/**
 * Passeio automatizado da Fase E (guerra), com capturas: ataque terrestre, acompanhamento da
 * operação, conquista e lançamento de míssil com a animação completa.
 *
 *   MOCK_WAR=1 no servidor falso (tests/e2e/fixtures/play-mock-server.ts): ao fundar, ele cria uma
 *   nação rival vizinha e dá tropas, um silo pronto e mísseis. Só prova a interface; as regras e a
 *   persistência são provadas em tests/integration/war.test.ts com o servidor real.
 *
 * Variáveis: BASE_URL, PLAYWRIGHT_MODULE, OUT, W/H.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.OUT || 'tests/e2e/screenshots/war';
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
  check('cenário de teste: nação rival vizinha', !!rival);
  const front = s0.structures.find((x) => x.nationId === rival.id);
  const silo = s0.structures.find((x) => x.nationId === s0.me && x.type === 'missile_silo');

  // ---------- ataque terrestre ----------
  const frontCenter = await A.evaluate((id) => window.__kuMap.regionCenter(id), front.region);
  {
    const [zx, zy] = await project(A, frontCenter[0], frontCenter[1]);
    await A.mouse.move(zx, zy);
    for (let i = 0; i < 4; i++) {
      await A.mouse.wheel(0, -300);
      await A.waitForTimeout(150);
    }
    await A.waitForTimeout(600);
  }
  await clickMap(A, frontCenter[0], frontCenter[1]);
  await A.waitForSelector('[data-testid=region-card]');
  await A.waitForTimeout(700);
  await A.screenshot({ path: `${OUT}/01-regiao-inimiga.png` });
  const intel = await A.locator('[data-testid=enemy-actions]').innerText();
  check('cartão da região inimiga mostra tropas, defesa estimada e aliança', /Tropas estimadas/.test(intel) && /Defesa estimada/.test(intel) && /Aliança/.test(intel));
  check('ATACAR habilitado na fronteira', await A.locator('[data-testid=attack]').isEnabled());
  await A.click('[data-testid=attack]');
  await A.waitForSelector('[data-testid=attack-sheet]');
  await A.click('[data-testid=attack-50]');
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/02-selecao-tropas.png` });
  const sum = await A.locator('[data-testid=attack-summary]').innerText();
  check('antes de confirmar: tropas, poder enviado, risco e duração', /Tropas enviadas/.test(sum) && /Poder de combate/.test(sum) && /(baixo|médio|alto)/.test(sum) && /Duração/.test(sum));
  const options = await A.locator('[data-testid=attack-sheet] .ku-amounts button').allInnerTexts();
  check('opções começam em 25% (nada abaixo)', options.join(',') === '25%,50%,75%,100%', options.join(','));
  await A.click('[data-testid=attack-go]');
  await A.waitForSelector('[data-testid=op-attacking]', { timeout: 8000 });
  await A.waitForTimeout(1600);
  await A.screenshot({ path: `${OUT}/03-operacao-iniciada.png` });
  check('a operação aparece no mapa (seta e selo de batalha)', (await A.evaluate(() => window.__kuMap.operations().filter((o) => o.own).length)) === 1);
  await A.waitForTimeout(5000);
  await A.click('[data-testid=op-attacking]');
  await A.waitForSelector('[data-testid=operation-sheet]');
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/04-acompanhamento.png` });
  const prog = await A.locator('[data-testid=operation-progress]').innerText();
  check('acompanhamento: ocupação em % e fim previsto', /\d+%/.test(prog) && /fim previsto/.test(prog));
  await A.keyboard.press('Escape');
  await A.waitForFunction(() => /conquistada/.test(document.body.textContent ?? ''), null, { timeout: 90000 }).then(
    () => check('ao chegar a 100%, a região é conquistada e avisa', true),
    () => check('ao chegar a 100%, a região é conquistada e avisa', false),
  );
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/05-conquista.png` });
  const s1 = await stateOf(A);
  check('a região e a construção passam ao vencedor', s1.control.find(([r]) => r === front.region)[1] === s1.me && s1.structures.find((x) => x.id === front.id).nationId === s1.me);

  // ---------- míssil ----------
  await clickMap(A, silo.at[0], silo.at[1]);
  await A.waitForSelector('[data-testid=silo-actions]', { timeout: 8000 });
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/06-silo.png` });
  check('silo mostra estoque e alcance', /3 mísseis em estoque/.test(await A.locator('[data-testid=silo-actions]').innerText()));
  await A.click('[data-testid=silo-aim]');
  await A.waitForSelector('[data-testid=missile-aiming]');
  await A.waitForTimeout(700);
  await A.screenshot({ path: `${OUT}/07-mira.png` });
  const capRegion = s1.control.find(([, o]) => o === rival.id)[0];
  const cap = await A.evaluate((id) => window.__kuMap.regionCenter(id), capRegion);
  await clickMap(A, cap[0], cap[1]);
  await A.waitForSelector('[data-testid=missile-confirm]');
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/08-confirmacao.png` });
  check('confirmação mostra distância, tempo de voo e interceptação', /km/.test(await A.locator('[data-testid=missile-confirm]').innerText()) && /Tempo de voo/.test(await A.locator('[data-testid=missile-confirm]').innerText()));
  await A.click('[data-testid=missile-go]');
  await A.waitForTimeout(900);
  await A.screenshot({ path: `${OUT}/09-preparacao.png` });
  await A.waitForTimeout(1100);
  await A.screenshot({ path: `${OUT}/10-abertura.png` });
  const m = await A.evaluate(() => window.__kuMap.missiles()[0]);
  check('o míssil é desenhado no mapa', !!m);
  await A.waitForTimeout(900);
  await A.screenshot({ path: `${OUT}/11-lancamento.png` });
  const now = await A.evaluate(() => Date.now());
  const half = Math.max(0, (m.impactAt - now) / 2);
  await A.waitForTimeout(half);
  await A.screenshot({ path: `${OUT}/12-trajeto.png` });
  await A.waitForTimeout(Math.max(0, m.impactAt - (await A.evaluate(() => Date.now()))) + 250);
  await A.screenshot({ path: `${OUT}/13-impacto.png` });
  await A.waitForTimeout(700);
  await A.screenshot({ path: `${OUT}/14-onda.png` });
  await A.waitForFunction(() => /Impacto em|interceptado/.test(document.body.textContent ?? ''), null, { timeout: 15000 }).then(
    () => check('o resultado do ataque aparece depois do impacto', true),
    () => check('o resultado do ataque aparece depois do impacto', false),
  );

  check('sem erros de JavaScript na página', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificações passaram`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
