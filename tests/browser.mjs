// Optional real-browser acceptance test. Requires Playwright and downloaded Chromium.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../src/server.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const dir=mkdtempSync(join(tmpdir(),'kingdoms-ui-'));const app=createServer({dbPath:join(dir,'test.sqlite')});
let browser;
try{
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.server.address().port}`;
 browser=await chromium.launch({headless:true});
 const options={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
 const ca=await browser.newContext(options),cb=await browser.newContext(options);const a=await ca.newPage(),b=await cb.newPage();const errors=[];
 for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
 async function register(page,name){await page.goto(url);await page.locator('[name=login]').fill(name);await page.locator('[name=password]').fill('browser-test-password');await page.locator('[name=name]').first().fill(name);await page.locator('#enter').click();await page.locator('#game').waitFor({state:'visible'});}
 await register(a,'BrowserA');await register(b,'BrowserB');
 await a.locator('#buildings .building').filter({hasText:'Fazenda'}).getByRole('button',{name:'Construir',exact:true}).click();await a.locator('#queue').filter({hasText:'Fazenda'}).waitFor();await a.reload();await a.locator('#queue').filter({hasText:'Fazenda'}).waitFor();
 await a.locator('[data-tab=alliance]').click();await a.locator('#createAlliance [name=name]').fill('Aliança Browser');await a.locator('#createAlliance [name=tag]').fill('WEB');await a.locator('#createAlliance button').click();
 await b.locator('[data-tab=alliance]').click();await b.getByRole('button',{name:'Solicitar entrada',exact:true}).click();await a.getByRole('button',{name:'Aprovar',exact:true}).click();await b.locator('#allianceState').filter({hasText:'BrowserA'}).waitFor();
 for(const page of [a,b]){await page.locator('[data-tab=chat]').click();const values=await page.locator('#channel option').evaluateAll(opts=>opts.map(o=>o.value));await page.locator('#channel').selectOption(values.find(v=>v.startsWith('alliance:')));}
 await b.locator('#message').fill('Mensagem entre navegadores independentes');await b.locator('#chat button').click();await a.locator('#messages').getByText('Mensagem entre navegadores independentes',{exact:true}).waitFor();
 assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await a.locator('[data-tab=map]').click();await a.locator('#cities').getByText(/BrowserB/).waitFor();await a.locator('#plus').click();await a.locator('#minus').click();await a.locator('#center').click();
 await cb.setOffline(true);await cb.setOffline(false);await b.reload();await b.locator('#game').waitFor({state:'visible'});
 mkdirSync('artifacts',{recursive:true});await a.screenshot({path:'artifacts/phase-a-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: two browser contexts, build/reload, alliance, live chat, viewport, reconnect. Not physical Safari.');
}finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
