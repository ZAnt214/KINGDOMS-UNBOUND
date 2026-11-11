/** Harness visual do centro de comando. Fixtures de API/WebSocket existem SÓ aqui, no Playwright;
 * nada disto é enviado ao jogador. O estado do mundo da fixture é montado a partir de
 * shared/world/scenario.json, o mesmo arquivo que o servidor usa para semear cada reino.
 * Rode com o cliente servido em VISUAL_URL (ex.: `npm run dev:client`).
 * Não certifica persistência nem multiplayer — isso é papel dos testes de integração. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..');
const scenario = JSON.parse(fs.readFileSync(path.join(root, 'shared/world/scenario.json'), 'utf8'));
const countries = JSON.parse(fs.readFileSync(path.join(root, 'shared/world/countries.json'), 'utf8'));

function worldFixture() {
  const blocOf = {};
  const blocs = scenario.blocs.map((b, i) => {
    for (const c of b.countries) blocOf[c] = i + 1;
    return { id: i + 1, key: b.key, name: b.name, color: b.color, territories: b.countries.length, members: 0 };
  });
  return {
    serverTime: Date.now(),
    myBlocId: null,
    blocs,
    territories: countries.map((c) => ({ code: c.code, blocId: blocOf[c.code] ?? null, version: 1 })),
    wars: [],
    systems: { armies: false, wars: false, diplomacy: false, espionage: false },
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const out = process.env.VISUAL_OUTPUT || 'docs/evidence/command-v1';
  fs.mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: Number(process.env.VISUAL_SCALE || 1) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

  const now = Date.now();
  let world = worldFixture();
  let enlistCalls = 0;
  const civ = { id: 'auren', name: 'Coroa de Auren', color: '#2f6fb3', accent: '#f2c14e', production: { food: 0.15 }, buildSpeed: 0 };
  const kingdom = { id: 1, name: 'Reino 1 · Valdoria', width: 120, height: 120, seed: 1013, status: 'open', population: 2, capacity: 100 };
  const city = { cityId: 1, x: 40, y: 50, civilization: 'auren', power: 3210, serverTime: now, levels: { town_hall: 5, farm: 5, sawmill: 5, quarry: 5, gold_mine: 5, warehouse: 5 }, resources: { food: 48320, wood: 31250, stone: 27480, gold: 12450 }, resourcesAt: now, ratesPerHour: { food: 180, wood: 150, stone: 120, gold: 60 }, capacity: 100000, queue: null };
  const cities = [
    { cityId: 1, governorId: 1, name: 'Teste visual', civilization: 'auren', power: 3210, x: 40, y: 50, hallLevel: 5, allianceTag: null, allianceId: null },
    { cityId: 2, governorId: 2, name: 'Vizinho', civilization: 'auren', power: 2100, x: 60, y: 44, hallLevel: 4, allianceTag: 'ORD', allianceId: 1 },
  ];
  await page.routeWebSocket('**/ws', (ws) => ws.onMessage((m) => m.includes('ping') && ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }))));
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    let data;
    if (u.pathname === '/api/meta') data = { rulesVersion: 1, civilizations: [civ], buildings: [], kingdoms: [kingdom] };
    else if (u.pathname === '/api/me') data = { userId: 1, username: 'visual_fixture', governor: { id: 1, name: 'Teste visual', kingdomId: 1, civilization: 'auren', cityId: 1, allianceId: null, allianceRank: null }, serverTime: now };
    else if (u.pathname === '/api/city') data = city;
    else if (u.pathname === '/api/map/cities') data = { cities };
    else if (u.pathname === '/api/chat/channels') data = { channels: [] };
    else if (u.pathname === '/api/alliances') data = { alliances: [] };
    else if (u.pathname === '/api/alliance/applications') data = { applications: [] };
    else if (u.pathname === '/api/world') data = world;
    else if (u.pathname === '/api/world/enlist') {
      const { blocId } = route.request().postDataJSON();
      assert.equal(route.request().headers()['x-ku'], '1');
      enlistCalls++;
      world = { ...world, myBlocId: blocId, blocs: world.blocs.map((b) => (b.id === blocId ? { ...b, members: 1 } : b)) };
      data = world;
    } else throw Error('Requisição de API inesperada: ' + u.pathname);
    await route.fulfill({ json: data });
  });

  // `?login=1`: fluxo de login manual, que abre na cidade (sem ele o jogo abre direto no comando).
  await page.goto((process.env.VISUAL_URL || 'http://127.0.0.1:5173') + '/?login=1');
  await page.getByTestId('tab-command').click();
  await page.locator('[data-testid=world-map][data-state=ready]').waitFor({ timeout: 30000 });
  await page.getByTestId('cc-legend').waitFor();
  await page.waitForTimeout(400);
  const shot = (name) => page.screenshot({ type: 'jpeg', quality: 88, path: path.join(out, name) });

  // Legenda reflete o estado recebido do servidor.
  const legend = await page.getByTestId('cc-legend').innerText();
  for (const b of scenario.blocs) assert.match(legend, new RegExp(b.name));
  assert.equal(await page.getByTestId('cc-res-gold').innerText().then((t) => t.replace(/\D/g, '')), '12450');

  // Seleção por país real: o Brasil fica onde a projeção diz que fica.
  const brazil = countries.find((c) => c.code === 'BRA');
  const at = async (lon, lat) => page.evaluate(([lo, la]) => window.__kuMap.project(lo, la), [lon, lat]);
  const [bx, by] = await at(brazil.labelAt[0], brazil.labelAt[1]);
  await page.mouse.click(bx, by);
  assert.equal(await page.getByTestId('cc-territory-name').innerText(), 'Brasil');
  assert.match(await page.getByTestId('cc-territory').innerText(), /Liga Global/);
  await page.waitForTimeout(250);
  await shot('desktop.jpg');

  // O painel troca com a seleção.
  const [rx, ry] = await at(100, 62);
  await page.mouse.click(rx, ry);
  assert.equal(await page.getByTestId('cc-territory-name').innerText(), 'Rússia');
  assert.match(await page.getByTestId('cc-territory').innerText(), /Pacto Oriental/);

  // Detalhes: ações bloqueadas explicam o motivo e não disparam nada.
  await page.getByTestId('cc-details').click();
  const details = page.getByTestId('cc-sheet-territory');
  await details.waitFor();
  assert.equal(await page.getByTestId('cc-action-attack').isDisabled(), true);
  assert.match(await details.innerText(), /Aliste-se em um bloco primeiro/);
  await shot('details.jpg');
  await page.keyboard.press('Escape');
  await details.waitFor({ state: 'detached' });

  // Zoom e arraste mantêm o país sob o cursor.
  await page.mouse.move(bx, by);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(200);
  const zoom = await page.evaluate(() => window.__kuMap.zoom);
  assert.ok(zoom > 2, 'a roda do mouse aproxima');
  await page.mouse.click(bx, by);
  assert.equal(await page.getByTestId('cc-territory-name').innerText(), 'Brasil', 'o ponto sob o cursor não se move no zoom');
  await page.mouse.move(bx, by);
  await page.mouse.down();
  await page.mouse.move(bx + 160, by + 60, { steps: 6 });
  await page.mouse.up();
  await page.mouse.click(bx + 160, by + 60);
  assert.equal(await page.getByTestId('cc-territory-name').innerText(), 'Brasil', 'o arraste leva o país junto');
  await page.waitForTimeout(250);
  await shot('zoom.jpg');
  await page.getByRole('button', { name: 'Ver o mundo inteiro' }).click();
  await page.waitForTimeout(600);

  // Alistamento: única escrita desta tela; passa pelo servidor.
  await page.getByTestId('cc-enlist-open').click();
  await page.getByTestId('cc-enlist-liga').click();
  await page.getByTestId('cc-enlist-confirm').click();
  await page.getByTestId('cc-sheet-enlist').waitFor({ state: 'detached' });
  assert.equal(enlistCalls, 1);
  await page.getByTestId('cc-details').click();
  assert.match(await page.getByTestId('cc-sheet-territory').innerText(), /ainda não existe no servidor/);
  await page.keyboard.press('Escape');

  // Navegação, módulos e botões da barra: todos respondem.
  for (const key of ['wars', 'ranking', 'missions', 'shop']) {
    await page.getByTestId(`cc-nav-${key}`).click();
    await page.getByTestId(`cc-sheet-${key}`).waitFor();
    await page.keyboard.press('Escape');
  }
  for (const key of ['army', 'air', 'navy', 'research', 'build']) {
    await page.getByTestId(`cc-module-${key}`).click();
    await page.getByTestId('cc-sheet-module').waitFor();
    if (key === 'army') await shot('module.jpg');
    if (key !== 'build') await page.keyboard.press('Escape');
  }
  await page.getByTestId('cc-open-city').click();
  await page.getByTestId('command-center').waitFor({ state: 'detached' });
  await page.getByTestId('tab-command').click();
  await page.getByTestId('cc-nav-alliances').click();
  await page.getByTestId('command-center').waitFor({ state: 'detached' });
  await page.getByTestId('tab-command').click();
  await page.locator('[data-testid=world-map][data-state=ready]').waitFor();
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.getByTestId('cc-sheet-settings').waitFor();
  await page.keyboard.press('Escape');

  // Telas menores: sem rolagem horizontal, alvos de toque de 44 px, mapa ainda visível.
  for (const size of [{ width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const key of ['army', 'build']) {
      const box = await page.getByTestId(`cc-module-${key}`).boundingBox();
      assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= size.width + 0.5, `módulo ${key} em ${size.width}x${size.height}`);
    }
    await shot(`${size.width}x${size.height}.jpg`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const [mx, my] = await at(brazil.labelAt[0], brazil.labelAt[1]);
  await page.touchscreen?.tap?.(mx, my).catch(() => page.mouse.click(mx, my));
  await page.mouse.click(mx, my);
  assert.equal(await page.getByTestId('cc-territory-name').innerText(), 'Brasil');
  await shot('mobile-selected.jpg');

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log('centro de comando: todas as verificações passaram');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
