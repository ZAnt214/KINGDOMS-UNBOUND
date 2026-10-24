// E2E com dois jogadores reais em contextos de navegador isolados (cookies separados),
// emulando iPhone 13 (WebKit não está disponível neste ambiente; Chromium com touch).
// Uso: BASE_URL=http://localhost:3000 node tests/e2e/two-players.cjs
const path = require('node:path');
const fs = require('node:fs');
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.env.SHOTS_DIR || path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signup(page, user) {
  await page.goto(BASE);
  await page.click('[data-testid=mode-register]');
  await page.fill('[data-testid=username]', user);
  await page.fill('[data-testid=password]', 'senha-segura-1');
  await page.click('[data-testid=auth-submit]');
  await page.fill('[data-testid=governor-name]', user.slice(0, 16));
  await page.click('[data-testid=kingdom-1]');
  await page.click('[data-testid=governor-submit]');
  await page.waitForSelector('[data-testid=gov-name]');
  await page.waitForSelector('[data-testid=net-status]:has-text("●")');
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ ...devices['iPhone 13'] });
  const ctxB = await browser.newContext({ ...devices['iPhone 13'] });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const errors = [];
  for (const [n, p] of [
    ['A', A],
    ['B', B],
  ])
    p.on('pageerror', (e) => errors.push(`${n}: ${e.message}`));

  const tag = Date.now().toString(36).slice(-4);
  const ua = `alfa${tag}`;
  const ub = `beta${tag}`;
  try {
    await signup(A, ua);
    await signup(B, ub);
    check('A-01', 'duas contas e sessões independentes', (await A.textContent('[data-testid=gov-name]')) !== (await B.textContent('[data-testid=gov-name]')));

    // Construção persistente
    const box = await A.locator('canvas').boundingBox();
    await A.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 10);
    await A.waitForSelector('[data-testid=building-sheet]');
    const sheetTitle = await A.textContent('[data-testid=building-sheet] h2');
    await A.click('[data-testid=upgrade-btn]');
    await A.waitForSelector('[data-testid=queue-chip]');
    await A.screenshot({ path: path.join(OUT, '01-cidade-obra.png') });
    await A.reload();
    await A.waitForSelector('[data-testid=gov-name]');
    const chip = await A.waitForSelector('[data-testid=queue-chip]', { timeout: 5000 }).catch(() => null);
    check('A-05', `obra (${sheetTitle}) permanece após reload`, Boolean(chip));

    // Mapa compartilhado
    await B.click('[data-testid=tab-world]');
    await B.waitForTimeout(800);
    const mapCities = await B.evaluate(async () => (await (await fetch('/api/map/cities?x0=0&y0=0&x1=119&y1=119')).json()).cities.map((c) => c.name));
    check('A-07', 'cidade de A visível no mapa de B', mapCities.includes(ua.slice(0, 16)), mapCities.join(', '));
    await B.screenshot({ path: path.join(OUT, '02-mapa.png') });

    // Aliança: A cria, B solicita, A aprova (sem recarregar)
    await A.click('[data-testid=tab-alliance]');
    await A.click('[data-testid=alliance-create]');
    await A.fill('[data-testid=alliance-name]', `Ordem ${tag}`);
    await A.fill('[data-testid=alliance-tag]', tag.slice(0, 4).replace(/[^a-z0-9]/gi, 'X').toUpperCase());
    await A.click('[data-testid=alliance-create-submit]');
    await A.waitForSelector('[data-testid=alliance-detail]');

    await B.click('[data-testid=tab-alliance]');
    await B.locator('[data-testid=alliance-row]', { hasText: `Ordem ${tag}` }).click();
    await B.click('[data-testid=apply-btn]');
    const appRow = await A.waitForSelector('[data-testid=application-row]', { timeout: 5000 }).catch(() => null);
    check('A-09', 'candidatura de B chega ao líder em tempo real', Boolean(appRow));
    await A.screenshot({ path: path.join(OUT, '03-candidatura.png') });
    await A.locator('[data-testid=application-row] button', { hasText: 'Aprovar' }).click();
    await B.waitForSelector('[data-testid=leave-btn]', { timeout: 5000 });
    const membersB = await B.locator('[data-testid=member-row]').count();
    check('A-10', 'B vira membro e vê a lista sem recarregar', membersB === 2, `${membersB} membros`);
    await B.screenshot({ path: path.join(OUT, '04-alianca.png') });

    // Chat da aliança e do reino
    await A.click('[data-testid=tab-chat]');
    await A.click('[data-testid=chan-alliance]');
    await B.click('[data-testid=tab-chat]');
    await B.click('[data-testid=chan-alliance]');
    await B.fill('[data-testid=chat-input]', 'Oficiais, reunião em X:30 Y:44');
    await B.click('[data-testid=chat-send]');
    const gotA = await A.waitForSelector('[data-testid=chat-msg]:has-text("reunião")', { timeout: 5000 }).catch(() => null);
    check('A-12', 'mensagem de aliança B→A instantânea', Boolean(gotA));
    await A.screenshot({ path: path.join(OUT, '05-chat-alianca.png') });

    await A.click('[data-testid=chan-kingdom]');
    await A.fill('[data-testid=chat-input]', `Olá reino, sou ${ua}`);
    await A.click('[data-testid=chat-send]');
    await B.waitForTimeout(300);
    const badge = await B.locator('[data-testid=chan-kingdom] .badge').count();
    await B.click('[data-testid=chan-kingdom]');
    const gotB = await B.waitForSelector(`[data-testid=chat-msg]:has-text("sou ${ua}")`, { timeout: 5000 }).catch(() => null);
    check('A-11', 'mensagem do reino A→B instantânea (com contador de não lidas)', Boolean(gotB) && badge === 1, `badge=${badge}`);

    // Link de coordenada centraliza o mapa
    await B.click('[data-testid=chan-alliance]');
    await B.click('[data-testid=coord-link]');
    await B.waitForTimeout(500);
    const center = await B.textContent('[data-testid=map-center]');
    check('coords', 'link de coordenada no chat centraliza o mapa', center.trim() === 'X:30 Y:44', center);

    // Reconexão: A fica offline, B fala, A volta e recupera
    await ctxA.setOffline(true);
    await A.evaluate(() => window.dispatchEvent(new Event('offline')));
    await B.click('[data-testid=tab-chat]');
    await B.click('[data-testid=chan-alliance]');
    await B.fill('[data-testid=chat-input]', 'mensagem enquanto você estava fora');
    await B.click('[data-testid=chat-send]');
    await A.waitForTimeout(1500);
    await ctxA.setOffline(false);
    await A.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await A.waitForSelector('[data-testid=net-status]:has-text("●")', { timeout: 20000 });
    await A.click('[data-testid=chan-alliance]').catch(() => {});
    const recovered = await A.waitForSelector('[data-testid=chat-msg]:has-text("enquanto você estava fora")', { timeout: 8000 }).catch(() => null);
    check('A-17', 'reconexão recupera mensagens perdidas (emulado)', Boolean(recovered));

    // Saída da aliança revoga canal
    await B.click('[data-testid=tab-chat]'); // fecha chat
    await B.click('[data-testid=tab-alliance]');
    B.once('dialog', (d) => d.accept());
    await B.click('[data-testid=leave-btn]');
    await B.waitForSelector('[data-testid=alliance-list]', { timeout: 5000 });
    const chans = await B.evaluate(async () => (await (await fetch('/api/chat/channels')).json()).channels.map((c) => c.type));
    check('A-16', 'saída da aliança remove o canal da aliança', !chans.includes('alliance'), chans.join(','));

    // Teclado: input do chat com font-size >= 16px (evita zoom no Safari)
    await B.click('[data-testid=tab-chat]');
    const fs16 = await B.$eval('[data-testid=chat-input]', (el) => parseFloat(getComputedStyle(el).fontSize));
    check('A-18', 'input do chat ≥16px (sem zoom automático no iOS) — validação parcial, sem device físico', fs16 >= 16, `${fs16}px`);
    await B.screenshot({ path: path.join(OUT, '06-chat-reino.png') });
  } catch (e) {
    check('run', 'execução do roteiro', false, String(e && e.message));
    await A.screenshot({ path: path.join(OUT, 'erro-A.png') }).catch(() => {});
    await B.screenshot({ path: path.join(OUT, 'erro-B.png') }).catch(() => {});
  }
  check('js', 'sem erros de JavaScript nas páginas', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  process.exit(failed.length ? 1 : 0);
})();
