import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Game, Fault, ensure, fields, label } from './game.js';
import { CIVILIZATIONS } from './rules.js';
const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const root = fileURLToPath(new URL('../public/',import.meta.url));
const assets = { '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css'], '/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'], '/sw.js':['sw.js','text/javascript'], '/icon.svg':['icon.svg','image/svg+xml'] };
export function createServer({dbPath='data/kingdoms.sqlite', clock=Date.now, secure=process.env.NODE_ENV==='production', origin=process.env.ORIGIN}={}) {
  mkdirSync(dirname(resolve(dbPath)),{recursive:true}); const game = new Game(dbPath,clock);
  const streams = new Set(), limits = new Map(); let streamSequence=0;
  function limited(key,max,window=60000) {
    const now=Date.now(); let item=limits.get(key);
    if (!item || item.end<=now) { item={n:0,end:now+window}; limits.set(key,item); }
    ensure(++item.n<=max,'Muitas tentativas. Aguarde um minuto.',429);
  }
  function auth(req) {
    const token = /(?:^|;\s*)ku_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    const session = token && game.one('SELECT * FROM sessions WHERE hash=? AND expires>?',hash(token),clock());
    ensure(session,'Entre novamente para continuar.',401); return session;
  }
  function cookie(res,token,clear=false) { res.setHeader('Set-Cookie',`ku_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:604800}${secure?'; Secure':''}`); }
  function session(res,id) { const token=randomBytes(32).toString('hex'); game.run('INSERT INTO sessions VALUES(?,?,?)',hash(token),id,clock()+604800000); cookie(res,token); }
  function send(res,status,body) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); }
  function stream(s) {
    if (!game.one('SELECT hash FROM sessions WHERE hash=? AND expires>?',s.session.hash,clock())) { s.res.end(); streams.delete(s); return; }
    const data=game.snapshot(s.session.user_id);
    if(s.res.writableLength>256000) { s.res.destroy(); streams.delete(s); return; }
    s.res.write(`id: ${++streamSequence}\nevent: snapshot\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function publish() { for(const s of streams) { try { stream(s); } catch(e) { s.res.destroy(); streams.delete(s); console.error('stream_error',e.message); } } }
  const server=http.createServer(async(req,res)=>{
    const requestId=randomBytes(8).toString('hex');
    res.setHeader('X-Request-Id',requestId); res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://localhost'); const path=url.pathname;
      if(req.method==='GET' && assets[path]) { const [file,type]=assets[path]; res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`}); return res.end(readFileSync(resolve(root,file))); }
      if(req.method==='GET' && path==='/api/config') return send(res,200,{civilizations:CIVILIZATIONS,kingdoms:game.all('SELECT * FROM kingdoms'),phase:'A · alpha técnica'});
      if(req.method==='GET' && path==='/health') return send(res,200,{ok:!!game.one('SELECT 1 AS ok').ok});
      let data;
      if(req.method==='POST') {
        limited(`http:${req.socket.remoteAddress}`,180);
        ensure(req.headers['content-type']?.split(';')[0]==='application/json','Envie JSON.',415);
        const expected=origin || `http://${req.headers.host}`;
        ensure(!req.headers.origin || req.headers.origin===expected,'Origem não permitida.',403);
        ensure(!req.headers['sec-fetch-site'] || ['same-origin','none'].includes(req.headers['sec-fetch-site']),'Origem não permitida.',403);
        let bytes=0,parts=[]; for await(const part of req) { bytes+=part.length; ensure(bytes<=8192,'Corpo muito grande.',413); parts.push(part); }
        try { data=JSON.parse(Buffer.concat(parts).toString()); } catch { throw new Fault(400,'JSON inválido.'); }
      }
      if(req.method==='POST' && ['/api/register','/api/login'].includes(path)) {
        limited(`auth:${req.socket.remoteAddress}`,20);
        fields(data,path.endsWith('register')?['login','password','name','kingdom','civilization']:['login','password']);
        const login=label(data.login,3,64).toLowerCase(); ensure(/^[a-z0-9_.@-]+$/.test(login),'Login inválido.');
        ensure(typeof data.password==='string' && data.password.length>=10 && data.password.length<=128,'Senha: 10 a 128 caracteres.');
        let id;
        if(path.endsWith('register')) {
          const name=label(data.name,3,24); ensure(Number.isInteger(data.kingdom),'Reino inválido.'); ensure(typeof data.civilization==='string','Civilização inválida.');
          const salt=randomBytes(16).toString('hex'); const password=(await derive(data.password,salt,64)).toString('hex');
          id=game.register({...data,login,name},password,salt);
        } else {
          const user=game.one('SELECT * FROM users WHERE login=?',login);
          const candidate=await derive(data.password,user?.salt ?? 'missing-user-salt',64);
          ensure(user && timingSafeEqual(candidate,Buffer.from(user.password,'hex')),'Login ou senha incorretos.',401); id=user.id;
        }
        session(res,id); send(res,200,{ok:true}); publish(); return;
      }
      const current=auth(req), id=current.user_id;
      if(req.method==='POST' && path==='/api/logout') {
        fields(data,[]); game.run('DELETE FROM sessions WHERE hash=?',current.hash); cookie(res,'',true); send(res,200,{ok:true}); publish(); return;
      }
      if(req.method==='GET' && path==='/api/state') return send(res,200,game.snapshot(id));
      if(req.method==='GET' && path==='/api/events') {
        ensure([...streams].filter(s=>s.session.user_id===id).length<4,'Muitas conexões.',429);
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'}); res.write('retry: 2500\n\n');
        const s={session:current,res}; streams.add(s); stream(s); req.on('close',()=>streams.delete(s)); return;
      }
      if(req.method==='GET' && path==='/api/messages') return send(res,200,{messages:game.history(id,url.searchParams.get('channel'),url.searchParams.has('before')?Number(url.searchParams.get('before')):Number.MAX_SAFE_INTEGER)});
      if(req.method==='POST' && path==='/api/command') {
        fields(data,['action','data']); limited(`command:${id}`,100);
        const result=game.command(id,req.headers['idempotency-key'],data.action,data.data);
        send(res,200,result); publish(); return;
      }
      throw new Fault(404,'Rota inexistente.');
    } catch(e) {
      const status=e.status ?? 500;
      if(status===500) console.error(JSON.stringify({requestId,error:e.message}));
      if(!res.headersSent) send(res,status,{error:status===500?'Erro interno. Tente novamente.':e.message,requestId}); else res.end();
    }
  });
  server.requestTimeout=15000; server.headersTimeout=10000;
  const ticker=setInterval(()=>{ try { game.tick(); publish(); for(const [k,v] of limits) if(v.end<Date.now()) limits.delete(k); game.run('DELETE FROM sessions WHERE expires<=?',clock()); } catch(e) {console.error('tick_error',e.message);} },2000);
  return {server,game,close:async()=>{clearInterval(ticker);for(const s of streams)s.res.end();streams.clear(); await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});game.close();}};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createServer({dbPath:process.env.DB_PATH ?? 'data/kingdoms.sqlite'});
  app.server.listen(Number(process.env.PORT ?? 3000),process.env.HOST ?? '127.0.0.1',()=>console.log(`KINGDOMS UNBOUND listening on ${app.server.address().port}`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await app.close();process.exit(0);});
}
