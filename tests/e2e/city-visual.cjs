/** Visual regression harness. API/WebSocket fixtures ONLY in Playwright, never shipped.
 * Run with a Vite server at VISUAL_URL, and playwright installed.
 * Does not certify persistence/multiplayer. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const args = ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}), args});
  const out = process.env.VISUAL_OUTPUT || 'docs/evidence/city-v5';
  fs.mkdirSync(out, {recursive:true});
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  const imageAssets = new Set();
  page.on('response', r => { if (r.request().resourceType() === 'image' && r.ok() && /(?:buildings|environment).*\.webp/.test(r.url())) imageAssets.add(r.url()); });
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  let city, upgradeCalls=0;
  const now=Date.now();
  const civ={id:'auren',name:'Coroa de Auren',color:'#2f6fb3',accent:'#f2c14e',production:{food:.15},buildSpeed:0};
  const kingdom={id:1,name:'Reino de Auren',width:128,height:128,seed:42,status:'open',population:1,capacity:100};
  const setLevel=(level)=>city={cityId:1,x:40,y:50,civilization:'auren',power:3210,serverTime:now,levels:{town_hall:level,farm:level,sawmill:level,quarry:level,gold_mine:level,warehouse:level},resources:{food:40000,wood:40000,stone:40000,gold:40000},resourcesAt:now,ratesPerHour:{food:180,wood:150,stone:120,gold:60},capacity:100000,queue:null};
  setLevel(5);
  await page.routeWebSocket('**/ws', ws=>ws.onMessage(m=>{if(m.includes('ping'))ws.send(JSON.stringify({type:'pong',serverTime:Date.now()}));}));
  await page.route('**/api/**',async route=>{
    const u=new URL(route.request().url()); let data;
    if(u.pathname==='/api/meta')data={rulesVersion:1,civilizations:[civ],buildings:[],kingdoms:[kingdom]};
    else if(u.pathname==='/api/me')data={userId:1,username:'visual_fixture',governor:{id:1,name:'Teste visual',kingdomId:1,civilization:'auren',cityId:1,allianceId:null,allianceRank:null},serverTime:now};
    else if(u.pathname==='/api/city')data=city;
    else if(u.pathname==='/api/map/cities')data={cities:[]};
    else if(u.pathname==='/api/chat/channels')data={channels:[]};
    else if(u.pathname==='/api/city/upgrade'){
      const body=route.request().postDataJSON();assert.equal(typeof body.idempotencyKey,'string');
      upgradeCalls++;city={...city,queue:{id:1,building:body.building,toLevel:city.levels[body.building]+1,startedAt:now,endsAt:now+600000}};data={state:city};
    } else throw Error('Unexpected API request: '+u.pathname);
    await route.fulfill({json:data});
  });
  await page.goto(process.env.VISUAL_URL || 'http://127.0.0.1:5173');
  await page.locator('[data-mode="webgl"]').waitFor({timeout:60000});
  assert.equal(imageAssets.size, 2, 'both transparent atlases loaded');
  await page.screenshot({quality:85,path:path.join(out,'desktop.jpg')});
  // Select the central palace by its visible body, including pixel-alpha hit testing.
  await page.mouse.click(720,450);
  await page.getByTestId('building-sheet').waitFor();
  assert.match(await page.getByTestId('building-sheet').innerText(),/Prefeitura/);
  await page.getByTestId('upgrade-btn').click();
  await page.getByTestId('queue-chip').waitFor();
  assert.equal(upgradeCalls,1);
  await page.screenshot({quality:85,path:path.join(out,'construction.jpg')});
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'Aproximar cidade'}).click();
  await page.getByRole('button',{name:'Afastar cidade'}).click();
  await page.getByRole('button',{name:'Ver cidade inteira'}).click();
  for(const size of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);
    await page.getByRole('button',{name:'Ver cidade inteira'}).click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const name of ['Aproximar cidade','Afastar cidade','Ver cidade inteira']) {
      const box=await page.getByRole('button',{name}).boundingBox();
      assert.ok(box.width>=44&&box.height>=44);
      assert.ok(box.x>=0&&box.x+box.width<=size.width);
    }
    await page.screenshot({quality:85,path:path.join(out,`${size.width>size.height?'landscape':'portrait'}.jpg`)});
  }
  // Rebuild for both other tiers; catches detached sprites/indicators after expansion.
  await page.setViewportSize({width:1440,height:960});
  for(const level of [1,8]) {
    setLevel(level); await page.reload();
    await page.locator('[data-mode="webgl"]').waitFor({timeout:60000});
    await page.getByRole('button',{name:'Ver cidade inteira'}).click();
    await page.waitForTimeout(200);
    await page.screenshot({quality:85,path:path.join(out,`tier-${level}.jpg`)});
  }
  // Simulate a failed image download. Vector fallback must remain selectable.
  await page.route('**/*.webp*', route => route.request().resourceType() === 'image' ? route.abort() : route.continue());
  setLevel(5);
  await page.reload();
  await page.locator('[data-mode="webgl"]').waitFor({timeout:60000});
  await page.mouse.click(720,450);
  await page.getByTestId('building-sheet').waitFor();
  assert.match(await page.getByTestId('building-sheet').innerText(),/Prefeitura/);
  await page.screenshot({quality:85,path:path.join(out,'image-fallback.jpg')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',scope:'visual UI fixtures; not a multiplayer test',checks:['WebGL rendering','palace selection','upgrade intent and queue','zoom controls','portrait and landscape bounds','44px touch targets','three city tiers','both illustrated atlases loaded','selection after image-download failure','no page errors']},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
