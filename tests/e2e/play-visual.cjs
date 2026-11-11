#!/usr/bin/env node
/**
 * Passeio automatizado pelo ciclo da Fase A com DOIS navegadores independentes, com capturas.
 *
 *   BASE_URL=http://127.0.0.1:4173 node tests/e2e/play-visual.cjs
 *
 * Contra o servidor real (BASE_URL de um deploy ou `npm start`) é um teste de ponta a ponta.
 * Contra tests/e2e/fixtures/play-mock-server.ts só prova a interface: o servidor é falso.
 * Variáveis: PLAYWRIGHT_MODULE (caminho do playwright), OUT (pasta das capturas), W/H (viewport),
 * SKIP_WAIT=1 (não espera a ocupação terminar; use contra o servidor real, onde ela leva o tempo do jogo).
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.OUT || 'tests/e2e/screenshots/play';
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function open(browser, errors) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: W < 700, isMobile: W < 700 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForSelector('[data-testid=play-root][data-map=ready]', { timeout: 30000 });
  return page;
}
const project = (page, lon, lat) => page.evaluate(([a, b]) => window.__kuMap.project(a, b), [lon, lat]);
async function clickMap(page, lon, lat) {
  const [x, y] = await project(page, lon, lat);
  await page.mouse.click(x, y);
}
async function enter(page, name, color, flag) {
  await page.click('[data-testid=start]');
  await page.waitForSelector('[data-testid=mode-select]');
  await page.click('[data-testid=mode-campaign]');
  await page.waitForSelector('[data-testid=identity-screen]');
  await page.fill('[data-testid=nation-name]', name);
  await page.click(`[data-testid=color-${color}]`);
  await page.click(`[data-testid=flag-${flag}]`);
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const errors = [];
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  const A = await open(browser, errors);
  await A.waitForTimeout(700);
  await A.screenshot({ path: `${OUT}/01-inicio.png` });
  check('tela inicial com o nome do jogo e o botão de começar', (await A.locator('[data-testid=start]').innerText()).includes('COMEÇAR'));

  await A.click('[data-testid=start]');
  await A.waitForSelector('[data-testid=mode-select]');
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/02-modos.png` });
  check('modo Equipe ainda bloqueado; Partida rápida disponível', (await A.locator('[data-testid=mode-team]').isDisabled()) && !(await A.locator('[data-testid=mode-quick]').isDisabled()));
  await A.click('[data-testid=mode-campaign]');
  await A.waitForSelector('[data-testid=identity-screen]');
  check('sem nome não dá para continuar', await A.locator('[data-testid=identity-done]').isDisabled());
  await A.fill('[data-testid=nation-name]', `Aurora ${suffix}`);
  await A.click('[data-testid=color-crimson]');
  await A.click('[data-testid=flag-vanguarda]');
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/03-identidade.png` });
  await A.click('[data-testid=identity-done]');
  await A.waitForSelector('[data-testid=map-stage][data-phase=select]');
  await A.waitForTimeout(900);
  await A.screenshot({ path: `${OUT}/04-escolha.png` });

  await clickMap(A, -47.916, -15.783); // Brasília
  await A.waitForSelector('[data-testid=point-card]');
  await A.waitForTimeout(1400);
  await A.screenshot({ path: `${OUT}/05-ponto.png` });
  check('cartão do ponto mostra capital e área inicial', /Brasília/.test(await A.locator('[data-testid=point-card]').innerText()));

  // Segundo jogador já está olhando o mesmo mundo antes da fundação.
  const B = await open(browser, errors);
  await enter(B, `Boreal ${suffix}`, 'blue', 'boreal');
  await B.click('[data-testid=identity-done]');
  await B.waitForSelector('[data-testid=map-stage][data-phase=select]');

  await A.click('[data-testid=confirm-location]');
  await A.waitForSelector('[data-testid=map-stage][data-phase=play]', { timeout: 15000 });
  await A.waitForTimeout(1500);
  await A.screenshot({ path: `${OUT}/06-fundacao.png` });
  await A.waitForTimeout(3200);
  await A.screenshot({ path: `${OUT}/07-nacao.png` });
  check('HUD mostra 1 região depois da fundação', /^1\s/.test((await A.locator('[data-testid=stat-regions]').innerText()).trim()));

  await B.waitForFunction(() => /1/.test(document.querySelector('[data-testid=stat-nations]')?.textContent ?? ''), null, { timeout: 8000 }).then(
    () => check('o outro jogador vê a nova nação sem recarregar', true),
    () => check('o outro jogador vê a nova nação sem recarregar', false),
  );
  // B tenta o mesmo ponto: agora pertence a A.
  await clickMap(B, -47.916, -15.783);
  await B.waitForTimeout(600);
  check('ponto já tomado não abre o cartão de fundação', (await B.locator('[data-testid=point-card]').count()) === 0);
  await clickMap(B, -58.4, -34.6); // Buenos Aires
  await B.waitForSelector('[data-testid=point-card]');
  await B.click('[data-testid=confirm-location]');
  await B.waitForSelector('[data-testid=map-stage][data-phase=play]', { timeout: 15000 });
  await B.waitForTimeout(3500);
  await B.screenshot({ path: `${OUT}/08-segundo-jogador.png` });

  await clickMap(A, -44.5, -18.5); // Minas Gerais
  await A.waitForSelector('[data-testid=region-card]');
  await A.waitForTimeout(600);
  await A.screenshot({ path: `${OUT}/09-regiao.png` });
  await A.click('[data-testid=occupy]');
  await A.waitForSelector('[data-testid=occupation]', { timeout: 8000 });
  await A.waitForTimeout(2500);
  await A.screenshot({ path: `${OUT}/10-ocupando.png` });
  check('ocupação em andamento aparece com progresso', /%/.test(await A.locator('[data-testid=occupation]').innerText()));

  if (!process.env.SKIP_WAIT) {
    await A.waitForSelector('[data-testid=occupation]', { state: 'detached', timeout: 120000 });
    await A.waitForTimeout(600);
    await A.screenshot({ path: `${OUT}/11-conquista.png` });
    check('HUD mostra 2 regiões depois da conquista', /^2\s/.test((await A.locator('[data-testid=stat-regions]').innerText()).trim()));
    await A.reload();
    await A.waitForSelector('[data-testid=play-root][data-map=ready]');
    await A.click('[data-testid=start]');
    await A.waitForSelector('[data-testid=mode-select]');
    await A.click('[data-testid=mode-campaign]');
    await A.waitForSelector('[data-testid=map-stage][data-phase=play]', { timeout: 15000 });
    check('recarregar a página mantém a nação e as 2 regiões', /^2\s/.test((await A.locator('[data-testid=stat-regions]').innerText()).trim()));
    await A.waitForTimeout(1500);
    await A.click('[data-testid=dock-expand]');
    await A.waitForTimeout(1300);
    await A.screenshot({ path: `${OUT}/12-alvos.png` });
  }

  // ---------- Fase B: economia e construções ----------
  check('recursos aparecem no topo depois da fundação', (await A.locator('[data-testid=resources]').count()) === 1);
  await A.click('[data-testid=dock-build]');
  await A.waitForSelector('[data-testid=build-bar]');
  await A.click('[data-testid=build-city]');
  await A.waitForTimeout(500);
  await A.screenshot({ path: `${OUT}/15-barra-construcao.png` });
  check('barra mostra custo, tempo e produção do tipo escolhido', /\+/.test(await A.locator('[data-testid=build-bar]').innerText()));
  // Toque direto no território: perto de Brasília (dentro de Goiás).
  await clickMap(A, -48.6, -16.4);
  await A.waitForTimeout(900);
  await A.screenshot({ path: `${OUT}/16-obra-no-mapa.png` });
  // Segundo toque, em outro ponto, ainda no modo de construção: ergue um depósito.
  await A.click('[data-testid=build-depot]');
  await clickMap(A, -49.6, -15.2);
  await A.waitForTimeout(600);
  await A.waitForFunction(() => /Cidade concluída/.test(document.body.textContent ?? ''), null, { timeout: 60000 }).then(
    () => check('dois toques, duas construções; a obra termina sozinha e avisa', true),
    () => check('dois toques, duas construções; a obra termina sozinha e avisa', false),
  );
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/17-cidade-pronta.png` });
  const mine = await A.evaluate(() => window.__kuMap.structures().filter((x) => x.own));
  check('as construções ficam no ponto tocado, não no centro da região', mine.some((x) => Math.hypot(x.lon + 48.6, x.lat + 16.4) < 0.5) && mine.some((x) => Math.hypot(x.lon + 49.6, x.lat + 15.2) < 0.5));
  // Fase C: as duas obras ficam prontas e uma ferrovia surge sozinha entre elas.
  await A.waitForFunction(() => /Ferrovia ligou/.test(document.body.textContent ?? ''), null, { timeout: 60000 }).then(
    () => check('ferrovia surge sozinha entre construções próximas e avisa o bônus', true),
    () => check('ferrovia surge sozinha entre construções próximas e avisa o bônus', false),
  );
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/18-ferrovia-surgindo.png` });
  const rails = await A.evaluate(() => window.__kuMap.rails().filter((r) => r.own && !r.ally));
  check('o mapa desenha o trecho entre as duas construções', rails.length >= 1);
  await A.click('[data-testid=build-close]');
  // De perto: o trilho com dormentes entre a cidade e o depósito.
  const [zx, zy] = await project(A, -49.1, -15.8);
  await A.mouse.move(zx, zy);
  for (let i = 0; i < 12; i++) {
    await A.mouse.wheel(0, -350);
    await A.waitForTimeout(120);
  }
  await A.waitForTimeout(1200);
  await A.screenshot({ path: `${OUT}/19-ferrovia.png` });
  await A.click('[data-testid=resources]');
  await A.waitForSelector('[data-testid=economy-sheet]');
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/20-economia.png` });
  check('economia mostra os seis recursos e a energia', (await A.locator('[data-testid=economy-sheet] li').count()) === 7);
  check('economia mostra a rede logística com o trecho e o bônus', /1 trecho de ferrovia.*\+4%/.test(await A.locator('[data-testid=economy-rail]').innerText()));
  await A.keyboard.press('Escape');

  // ---------- Fase D: exército ----------
  await A.click('[data-testid=dock-army]');
  await A.waitForSelector('[data-testid=army-sheet]');
  await A.waitForTimeout(300);
  await A.screenshot({ path: `${OUT}/22-exercito.png` });
  check('exército começa com poder 0 e recrutas', /^0$/.test((await A.locator('[data-testid=army-power] b').innerText()).trim()) && /recrutas/.test(await A.locator('[data-testid=army-recruits]').innerText()));
  await A.click('[data-testid=unit-mechanized]');
  check('unidade bloqueada explica o que falta e oferece construir a base', /base militar/i.test(await A.locator('[data-testid=army-train]').innerText()) && (await A.locator('[data-testid=army-build-required]').count()) === 1);
  await A.click('[data-testid=unit-infantry]');
  await A.click('[data-testid=amount-10]');
  await A.click('[data-testid=army-train-go]');
  await A.waitForSelector('[data-testid=army-queue]');
  await A.screenshot({ path: `${OUT}/23-treinando.png` });
  check('lote de treinamento entra na fila com contagem regressiva', /10 × Infantaria/.test(await A.locator('[data-testid=army-queue]').innerText()));
  await A.waitForFunction(() => /prontas\. Poder militar/.test(document.body.textContent ?? ''), null, { timeout: 60000 }).then(
    () => check('treinamento termina sozinho, avisa e o poder militar sobe', true),
    () => check('treinamento termina sozinho, avisa e o poder militar sobe', false),
  );
  await A.waitForTimeout(500);
  check('poder militar mostrado bate com as tropas treinadas', Number((await A.locator('[data-testid=army-power] b').innerText()).replace(/\D/g, '')) === 11);
  await A.screenshot({ path: `${OUT}/24-tropas-prontas.png` });
  await A.click('[data-testid=army-tab-research]');
  await A.waitForSelector('[data-testid=army-research]');
  await A.waitForTimeout(200);
  await A.screenshot({ path: `${OUT}/25-pesquisa.png` });
  check('pesquisa lista as tecnologias e exige centro tecnológico', (await A.locator('[data-testid=army-research] li').count()) === 12 && /centro tecnológico/.test(await A.locator('[data-testid=army-research]').innerText()));
  await A.keyboard.press('Escape');

  await A.click('[data-testid=dock-ranking]');
  await A.waitForSelector('[data-testid=ranking-sheet]');
  await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/13-ranking.png` });
  check('ranking lista as duas nações', (await A.locator('[data-testid=ranking-sheet] li').count()) >= 2);
  await A.keyboard.press('Escape');
  await A.click('[data-testid=open-settings]');
  await A.waitForSelector('[data-testid=settings-sheet]');
  await A.click('[data-testid=mute]');
  check('som pode ser desligado', (await A.locator('[data-testid=mute]').getAttribute('aria-pressed')) === 'true');
  await A.screenshot({ path: `${OUT}/14-configuracoes.png` });

  // ---------- Partida rápida com bots ----------
  await A.click('[data-testid=switch-mode]');
  await A.waitForSelector('[data-testid=mode-select]');
  await A.click('[data-testid=mode-quick]');
  await A.waitForSelector('[data-testid=identity-screen]', { timeout: 15000 });
  await A.click('[data-testid=identity-done]');
  await A.waitForSelector('[data-testid=map-stage][data-phase=select]');
  await A.waitForTimeout(1500);
  await A.screenshot({ path: `${OUT}/21-rapida-arena.png` });
  const quick = await A.evaluate(async () => {
    const seat = (await (await fetch('/api/me')).json()).worlds.find((w) => w.mode === 'quick' && !w.finished);
    const st = await (await fetch('/api/play/state', { headers: { 'X-KU-World': String(seat.id) } })).json();
    return { arena: st.world.arena, taken: st.control.map((c) => c[0]), bots: st.nations.filter((n) => n.bot).length };
  });
  check('partida rápida começa com 3 nações do servidor', quick.bots === 3);
  const points = JSON.parse(fs.readFileSync(require.resolve('../../shared/world/startpoints.json'), 'utf8'));
  const free = points.find((p) => quick.arena.includes(p.region) && !quick.taken.includes(p.region));
  await clickMap(A, free.at[0], free.at[1]);
  await A.waitForSelector('[data-testid=point-card]');
  await A.click('[data-testid=confirm-location]');
  await A.waitForSelector('[data-testid=match-clock]', { timeout: 15000 });
  check('relógio da partida aparece depois da fundação', true);
  await A.waitForTimeout(8000);
  await A.screenshot({ path: `${OUT}/22-rapida-jogo.png` });
  await A.click('[data-testid=open-settings]');
  await A.click('[data-testid=leave]');
  await A.click('[data-testid=leave-confirm]');
  await A.waitForSelector('[data-testid=match-end]', { timeout: 10000 });
  await A.waitForTimeout(700);
  await A.screenshot({ path: `${OUT}/23-fim-de-partida.png` });
  check('abandonar mostra o fim da partida com a classificação', /DERROTA/.test(await A.locator('[data-testid=match-end]').innerText()));

  const overflow = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('sem rolagem horizontal', !overflow);
  check('sem erros de JavaScript', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificações passaram`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(1);
});
