import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from '../src/server.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(path,clock) {const app=createServer({dbPath:path,clock});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return {...app,url:`http://127.0.0.1:${app.server.address().port}`};}
class Client {
  constructor(app){this.app=app;this.cookie='';}
  async request(path,data,key,expected=200,extra={}){const res=await fetch(this.app.url+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{cookie:this.cookie,...(data===undefined?{}:{'content-type':'application/json'}),...(key?{'idempotency-key':key}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});const body=await res.json();assert.equal(res.status,expected,JSON.stringify(body));if(res.headers.get('set-cookie'))this.cookie=res.headers.get('set-cookie').split(';')[0];return body;}
  register(login,kingdom=1,civilization='aurianos'){return this.request('register',{login,password:'test-password-2026',name:login,kingdom,civilization});}
  state(){return this.request('state');}
  cmd(action,data={},key=randomUUID(),status=200){return this.request('command',{action,data},key,status);}
  async stream(){const controller=new AbortController();const res=await fetch(this.app.url+'/api/events',{headers:{cookie:this.cookie},signal:controller.signal});assert.equal(res.status,200);const snapshots=[];let buffer='';const read=(async()=>{try{for await(const chunk of res.body){buffer+=new TextDecoder().decode(chunk);let end;while((end=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=packet.split('\n').find(l=>l.startsWith('data: '));if(line)snapshots.push(JSON.parse(line.slice(6)));}}}catch(e){if(e.name!=='AbortError')throw e;}})();return {snapshots,stop:async()=>{controller.abort();await read;},wait:async predicate=>{for(let n=0;n<100;n++){const match=snapshots.find(predicate);if(match)return match;await delay(20);}assert.fail('SSE update not received');}};}
}
test('Fase A: independent accounts, durable economy, live social and adversarial ACL',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kingdoms-'));let now=Date.now();const path=join(dir,'world.sqlite');let app=await start(path,()=>now);const a=new Client(app),b=new Client(app),c=new Client(app),d=new Client(app);let streamA,streamB;
  try{
    await t.test('A-01/02/03: independent authenticated governors, civilizations and cities',async()=>{
      await a.register('GovernadorA');await b.register('GovernadorB',1,'silvanos');await c.register('VisitanteC');await d.register('OutroReino',2);
      const sa=await a.state(),sb=await b.state();assert.notEqual(a.cookie,b.cookie);assert.notEqual(sa.governor.id,sb.governor.id);assert.notDeepEqual(sa.city,sb.city);assert.equal(sa.governor.kingdom,sb.governor.kingdom);assert.equal(sa.resources.wood,1000);assert.equal(sb.resources.wood,1000);assert.equal((await d.state()).cities.length,1);
      await new Client(app).request('state',undefined,null,401);
      await a.request('login',{login:'GovernadorA',password:'incorrect-pass'},null,401);
    });
    await t.test('A-07/08: live authenticated streams and realm privacy',async()=>{
      streamA=await a.stream();streamB=await b.stream();const sa=await streamA.wait(s=>s.cities.length===3);assert.ok(sa.cities.every(c=>!('resources'in c)&&!('last_production'in c)));
      await streamB.wait(s=>s.governor.name==='GovernadorB');
    });
    await t.test('A-04/05/06/20: atomic build, concurrent retry, server clock, offline production',async()=>{
      const id=randomUUID();const [r1,r2]=await Promise.all([a.cmd('build',{kind:'farm'},id),a.cmd('build',{kind:'farm'},id)]);assert.equal(r1.queueId,r2.queueId);
      const s=await a.state();assert.equal(s.resources.wood,920);assert.equal(s.resources.stone,970);assert.equal((await b.state()).resources.wood,1000);
      await a.cmd('build',{kind:'farm',ends:0,wood:100000},randomUUID(),400);await a.cmd('build',{kind:'hall'},id,409);await a.cmd('build',{kind:'mine'},randomUUID(),409);
      assert.equal((await a.state()).queue.id,s.queue.id);assert.equal((await a.state()).buildings.find(b=>b.kind==='farm').level,0);
      now+=20000;const settled=await a.state();assert.equal(settled.queue,null);assert.equal(settled.buildings.find(b=>b.kind==='farm').level,1);assert.equal(settled.resources.food,1030);
      await a.cmd('build',{kind:'farm'},randomUUID(),400); // hall prerequisite
      await b.cmd('build',{kind:'lumber'});now+=20000;assert.equal((await b.state()).resources.wood,980); // 1000-50 + 5s*6
    });
    let aid;
    await t.test('A-09/10: application, approval, rank permission and live membership',async()=>{
      aid=(await a.cmd('alliance.create',{name:'Aurora Unida',tag:'AUR'})).alliance;
      await d.cmd('alliance.apply',{alliance:aid},randomUUID(),404);
      await b.cmd('alliance.apply',{alliance:aid});const pending=await streamA.wait(s=>s.applications.length===1);
      await b.cmd('alliance.approve',{owner:pending.applications[0].owner},randomUUID(),403);
      await a.cmd('alliance.approve',{owner:pending.applications[0].owner});
      await streamB.wait(s=>s.members.length===2);assert.equal((await b.state()).membership.rank,1);
      await b.cmd('alliance.rank',{owner:(await a.state()).governor.id,rank:5},randomUUID(),403);
      await a.cmd('alliance.rank',{owner:(await b.state()).governor.id,rank:4});assert.equal((await b.state()).membership.rank,4);
    });
    await t.test('A-11/12/13: realm, alliance and cross-realm global messages delivered without reload',async()=>{
      for(const channel of ['kingdom:1',`alliance:${aid}`,'global']){
        const body=`Mensagem real ${channel}`;await b.cmd('chat',{channel,body});await streamA.wait(s=>s.messages[channel]?.some(m=>m.body===body));
      }
      assert.ok((await d.state()).messages.global.some(m=>m.body==='Mensagem real global'));
      await d.request('messages?channel=kingdom:1',undefined,null,403);
      await c.request(`messages?channel=alliance:${aid}`,undefined,null,403);
      await c.cmd('chat',{channel:`alliance:${aid}`,body:'intrusão'},randomUUID(),403);
    });
    await t.test('A-14/15/16: pagination, flood limit, private revocation on existing stream',async()=>{
      for(let i=0;i<35;i++){now+=11000;await a.cmd('chat',{channel:'kingdom:1',body:`Histórico ${i}`});}
      const page=await a.request('messages?channel=kingdom:1');assert.equal(page.messages.length,30);
      const previous=await a.request(`messages?channel=kingdom:1&before=${page.messages[0].id}`);assert.ok(previous.messages.length>0);assert.ok(previous.messages.every(m=>m.id<page.messages[0].id));
      for(let i=0;i<5;i++)await a.cmd('chat',{channel:'global',body:`flood ${i}`});await a.cmd('chat',{channel:'global',body:'excess'},randomUUID(),429);
      await b.cmd('alliance.leave');await streamB.wait(s=>s.membership===null&&s.pending.length===0&&s.revision>10);assert.ok(!(await b.state()).channels.includes(`alliance:${aid}`));
      await b.request(`messages?channel=alliance:${aid}`,undefined,null,403);await b.cmd('chat',{channel:`alliance:${aid}`,body:'revogado'},randomUUID(),403);
      const count=streamB.snapshots.length;now+=11000;await a.cmd('chat',{channel:`alliance:${aid}`,body:'segredo posterior'});await delay(60);assert.ok(streamB.snapshots.slice(count).every(s=>!s.messages[`alliance:${aid}`]));
    });
    await t.test('security: origin, unknown fields, cursor and session invalidation',async()=>{
      await a.request('command',{action:'build',data:{kind:'hall'}},randomUUID(),403,{origin:'https://attacker.invalid'});
      await a.request('messages?channel=global&before=NaN',undefined,null,400);
      await a.cmd('unknown',{},randomUUID(),404);
      const cookie=c.cookie;await c.request('logout',{});c.cookie=cookie;await c.request('state',undefined,null,401);
    });
    await t.test('economic boundaries: capacity, insufficient balance rolls back, unique identity',async()=>{
      const duplicate=new Client(app);await duplicate.request('register',{login:'GovernadorA',password:'test-password-2026',name:'Duplicate',kingdom:1,civilization:'aurianos'},null,409);
      now+=4000000;const sa=await a.state();assert.equal(sa.resources.food,10000);assert.equal((await b.state()).resources.wood,10000);
      const cid=app.game.one('SELECT id FROM governors WHERE name=?','VisitanteC').id;
      app.game.transaction(()=>{app.game.balance(cid,'stone',-1000,'test_fixture');});
      const cookie=c.cookie;await c.request('login',{login:'VisitanteC',password:'test-password-2026'});assert.notEqual(c.cookie,cookie);
      const before=await c.state();await c.cmd('build',{kind:'hall'},randomUUID(),409);const after=await c.state();assert.deepEqual(after.resources,before.resources);assert.equal(after.queue,null);
      assert.equal(app.game.one("SELECT count(*) AS n FROM ledger WHERE owner=? AND reason='building'",cid).n,0);
    });
    await t.test('durability: server restart, persisted session, queue and ledger invariants',async()=>{
      const before=await a.state();await a.cmd('build',{kind:'hall'});await streamA.stop();await streamB.stop();streamA=streamB=null;await app.close();now+=70000;
      app=await start(path,()=>now);for(const client of [a,b,c,d])client.app=app;
      const after=await a.state();assert.equal(after.governor.id,before.governor.id);assert.equal(after.buildings.find(b=>b.kind==='hall').level,2);assert.equal(after.queue,null);assert.equal(after.membership.alliance,aid);
      assert.ok(after.messages[`alliance:${aid}`].some(m=>m.body==='segredo posterior'));
      for(const row of app.game.all('SELECT owner,resource,amount FROM balances')){const sum=app.game.one('SELECT sum(delta) AS n FROM ledger WHERE owner=? AND resource=?',row.owner,row.resource).n;assert.equal(sum,row.amount);assert.ok(row.amount>=0&&row.amount<=10000);}
      await a.request('logout',{});await a.request('login',{login:'GovernadorA',password:'test-password-2026'});assert.equal((await a.state()).governor.id,before.governor.id);
      streamA=await a.stream();await streamA.wait(s=>s.buildings.some(b=>b.kind==='hall'&&b.level===2));
    });
  }finally{await streamA?.stop();await streamB?.stop();await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('Real process restart: wall-clock construction completes while both clients are offline',async()=>{
  const {spawn}=await import('node:child_process');
  const dir=mkdtempSync(join(tmpdir(),'kingdoms-process-'));const path=join(dir,'world.sqlite');let child;
  async function launch(){child=spawn(process.execPath,['src/server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'0',HOST:'127.0.0.1',DB_PATH:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});const url=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server start timeout')),5000);child.stdout.on('data',data=>{const port=/listening on (\d+)/.exec(data.toString())?.[1];if(port){clearTimeout(timeout);resolve(`http://127.0.0.1:${port}`);}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited ${code}`));});});return {url};}
  async function stop(){if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;}}
  try{
    const app=await launch(),a=new Client(app),b=new Client(app);await a.register('RealClockA');await b.register('RealClockB');await a.cmd('build',{kind:'farm'});const before=await a.state();assert.equal(before.buildings.find(b=>b.kind==='farm').level,0);await stop();
    // No process, socket, simulated clock, or browser is advancing the job during this interval.
    await delay(Math.max(0,before.queue.ends-Date.now())+1100);
    const restarted=await launch();a.app=b.app=restarted;const after=await a.state();assert.equal(after.governor.id,before.governor.id);assert.equal(after.queue,null);assert.equal(after.buildings.find(b=>b.kind==='farm').level,1);assert.equal(after.resources.wood,before.resources.wood);assert.equal((await b.state()).resources.wood,1000);
  }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
