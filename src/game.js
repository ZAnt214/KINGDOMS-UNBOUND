import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { BUILDINGS, CIVILIZATIONS, CAPACITY, RULES_VERSION, PERMISSIONS, upgrade } from './rules.js';
export class Fault extends Error { constructor(status, message) { super(message); this.status = status; } }
export function ensure(test, message, status = 400) { if (!test) throw new Fault(status, message); }
export function fields(data, allowed) { ensure(data && typeof data === 'object' && !Array.isArray(data), 'Objeto inválido.'); ensure(Object.keys(data).every(k => allowed.includes(k)), 'Campo não permitido.'); }
export function label(value, min, max) { ensure(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !/[\x00-\x1f]/.test(value), `Use entre ${min} e ${max} caracteres.`); return value.trim(); }
export class Game {
  constructor(path, clock = Date.now) {
    this.db = new DatabaseSync(path); this.clock = clock;
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec(readFileSync(new URL('../migrations/001_core.sql', import.meta.url), 'utf8'));
  }
  one(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  governor(id) { const g = this.one('SELECT * FROM governors WHERE id=?', id); ensure(g, 'Governador não encontrado.', 401); return g; }
  member(id) { return this.one('SELECT * FROM members WHERE owner=?', id); }
  balance(id, resource, delta, reason, command = null) {
    this.run('UPDATE balances SET amount=amount+? WHERE owner=? AND resource=?', delta, id, resource);
    this.run('INSERT INTO ledger(owner,resource,delta,reason,command,at) VALUES(?,?,?,?,?,?)', id, resource, delta, reason, command, this.clock());
  }
  register({login, name, kingdom, civilization}, password, salt) {
    return this.transaction(() => {
      ensure(this.one('SELECT id FROM kingdoms WHERE id=?', kingdom), 'Reino inválido.');
      ensure(Object.hasOwn(CIVILIZATIONS, civilization), 'Civilização inválida.');
      ensure(!this.one('SELECT id FROM users WHERE login=?', login) && !this.one('SELECT id FROM governors WHERE name=?', name), 'Login ou governador já utilizado.', 409);
      const count = this.one('SELECT count(*) AS n FROM cities WHERE kingdom=?', kingdom).n;
      ensure(count < 400, 'Reino cheio nesta versão.', 409);
      const id = randomUUID();
      this.run('INSERT INTO users VALUES(?,?,?,?)', id, login, password, salt);
      this.run('INSERT INTO governors VALUES(?,?,?,?)', id, name, kingdom, civilization);
      this.run('INSERT INTO cities VALUES(?,?,?,?,?)', id, kingdom, 5 + (count % 20) * 5, 5 + Math.floor(count / 20) * 5, this.clock());
      for (const resource of ['food','wood','stone','gold']) {
        this.run('INSERT INTO balances VALUES(?,?,0)', id, resource);
        this.balance(id, resource, 1000, 'initial_grant');
      }
      for (const kind of Object.keys(BUILDINGS)) this.run('INSERT INTO buildings VALUES(?,?,?)', id, kind, kind === 'hall' ? 1 : 0);
      return id;
    });
  }
  produce(id, until) {
    const city = this.one('SELECT * FROM cities WHERE owner=?', id);
    const steps = Math.floor((until - city.last_production) / 1000);
    if (steps <= 0) return;
    const g = this.governor(id);
    for (const b of this.all('SELECT * FROM buildings WHERE owner=?', id)) {
      const resource = BUILDINGS[b.kind].resource;
      if (!resource || !b.level) continue;
      // Integer units per second. Bonuses are integral and actually affect income.
      const rate = b.level * (CIVILIZATIONS[g.civilization].bonus === resource ? 6 : 5);
      const current = this.one('SELECT amount FROM balances WHERE owner=? AND resource=?', id, resource).amount;
      const delta = Math.min(CAPACITY - current, steps * rate);
      if (delta) this.balance(id, resource, delta, 'production');
    }
    this.run('UPDATE cities SET last_production=? WHERE owner=?', city.last_production + steps * 1000, id);
  }
  settle(id) {
    const now = this.clock(); const queue = this.one("SELECT * FROM queues WHERE owner=? AND status='active'", id);
    if (queue && queue.ends <= now) {
      this.produce(id, queue.ends);
      this.run('UPDATE buildings SET level=? WHERE owner=? AND kind=?', queue.target, id, queue.kind);
      this.run("UPDATE queues SET status='done' WHERE id=?", queue.id);
    }
    this.produce(id, now);
  }
  tick() { this.transaction(() => { for (const g of this.all('SELECT id FROM governors')) this.settle(g.id); }); }
  canRead(id, channel) {
    const g = this.governor(id); const m = this.member(id);
    return channel === 'global' || channel === `kingdom:${g.kingdom}` || !!(m && channel === `alliance:${m.alliance}`);
  }
  history(id, channel, before = Number.MAX_SAFE_INTEGER) {
    ensure(this.canRead(id, channel), 'Canal restrito.', 403);
    ensure(Number.isSafeInteger(before) && before > 0, 'Cursor inválido.');
    return this.all('SELECT m.*,g.name,g.kingdom FROM messages m JOIN governors g ON g.id=m.author WHERE channel=? AND m.id<? ORDER BY m.id DESC LIMIT 30', channel, before).reverse();
  }
  snapshot(id) {
    return this.transaction(() => {
      this.settle(id); const g = this.governor(id); const member = this.member(id);
      const channels = ['global',`kingdom:${g.kingdom}`, ...(member ? [`alliance:${member.alliance}`] : [])];
      return {
        serverTime: this.clock(), revision: this.one('SELECT coalesce(max(id),0) AS n FROM audit').n,
        governor: g, city: this.one('SELECT * FROM cities WHERE owner=?', id),
        resources: Object.fromEntries(this.all('SELECT resource,amount FROM balances WHERE owner=?', id).map(r => [r.resource, r.amount])),
        buildings: this.all('SELECT * FROM buildings WHERE owner=?', id).map(b => ({...b, ...BUILDINGS[b.kind], cost: upgrade(b.kind,b.level)})),
        queue: this.one("SELECT * FROM queues WHERE owner=? AND status='active'", id) ?? null,
        // Phase A visibility rule: cities in your realm are public; balances/buildings remain private.
        cities: this.all('SELECT c.owner,c.x,c.y,g.name,g.civilization,b.level FROM cities c JOIN governors g ON g.id=c.owner JOIN buildings b ON b.owner=c.owner AND b.kind=\'hall\' WHERE c.kingdom=?', g.kingdom),
        alliances: this.all('SELECT a.*,count(m.owner) AS population FROM alliances a LEFT JOIN members m ON m.alliance=a.id WHERE a.kingdom=? GROUP BY a.id', g.kingdom),
        membership: member ?? null,
        members: member ? this.all('SELECT m.owner,m.rank,g.name FROM members m JOIN governors g ON g.id=m.owner WHERE alliance=?', member.alliance) : [],
        applications: member && PERMISSIONS.approve.includes(member.rank) ? this.all('SELECT a.owner,g.name FROM applications a JOIN governors g ON g.id=a.owner WHERE alliance=?', member.alliance) : [],
        pending: this.all('SELECT alliance FROM applications WHERE owner=?',id).map(r=>r.alliance),
        channels, messages: Object.fromEntries(channels.map(c => [c, this.history(id,c)])),
      };
    });
  }
  command(id, key, action, data) {
    ensure(typeof key === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(key), 'Chave de comando obrigatória.');
    const fingerprint = createHash('sha256').update(JSON.stringify({action,data})).digest('hex');
    return this.transaction(() => {
      const old = this.one('SELECT * FROM commands WHERE owner=? AND key=?', id,key);
      if (old) { ensure(old.fingerprint === fingerprint, 'Chave já usada por outra ação.',409); return JSON.parse(old.result); }
      this.settle(id); const g = this.governor(id); const m = this.member(id); let result = {ok:true};
      if (action === 'build') {
        fields(data,['kind']); ensure(Object.hasOwn(BUILDINGS,data.kind), 'Edifício inválido.');
        const b = this.one('SELECT * FROM buildings WHERE owner=? AND kind=?',id,data.kind);
        const hall = this.one("SELECT level FROM buildings WHERE owner=? AND kind='hall'",id).level;
        ensure(b.level < 5, 'Nível máximo desta versão.');
        ensure(data.kind === 'hall' || b.level < hall, 'Melhore a prefeitura primeiro.');
        ensure(!this.one("SELECT id FROM queues WHERE owner=? AND status='active'",id), 'Já existe uma obra em andamento.',409);
        const cost = upgrade(data.kind,b.level);
        for (const resource of ['wood','stone']) {
          ensure(this.one('SELECT amount FROM balances WHERE owner=? AND resource=?',id,resource).amount >= cost[resource], 'Recursos insuficientes.',409);
          this.balance(id,resource,-cost[resource],'building',key);
        }
        const queueId = randomUUID();
        this.run("INSERT INTO queues VALUES(?,?,?,?,?,?, 'active', ?)",queueId,id,data.kind,b.level+1,this.clock(),this.clock()+cost.seconds*1000,RULES_VERSION);
        result = {ok:true,queueId};
      } else if (action === 'alliance.create') {
        fields(data,['name','tag']); ensure(!m,'Você já participa de uma aliança.',409);
        const name = label(data.name,3,32), tag=label(data.tag,2,5).toUpperCase();
        ensure(/^[A-Z0-9]+$/.test(tag),'Sigla: apenas letras e números.');
        ensure(!this.one('SELECT id FROM alliances WHERE kingdom=? AND (name=? OR tag=?)',g.kingdom,name,tag),'Nome ou sigla já utilizados.',409);
        const aid = randomUUID(); this.run('INSERT INTO alliances VALUES(?,?,?,?)',aid,g.kingdom,name,tag);
        this.run('INSERT INTO members VALUES(?,?,5)',id,aid); this.run('DELETE FROM applications WHERE owner=?',id); result={ok:true,alliance:aid};
      } else if (action === 'alliance.apply') {
        fields(data,['alliance']); ensure(!m,'Você já participa de uma aliança.',409);
        ensure(typeof data.alliance === 'string' && this.one('SELECT id FROM alliances WHERE id=? AND kingdom=?',data.alliance,g.kingdom),'Aliança indisponível.',404);
        this.run('INSERT OR IGNORE INTO applications VALUES(?,?)',id,data.alliance);
      } else if (action === 'alliance.approve' || action === 'alliance.reject') {
        fields(data,['owner']); ensure(m && PERMISSIONS.approve.includes(m.rank),'Apenas oficiais ou líder.',403);
        ensure(typeof data.owner === 'string' && this.one('SELECT owner FROM applications WHERE owner=? AND alliance=?',data.owner,m.alliance),'Candidatura inexistente.',404);
        if (action.endsWith('approve')) {
          ensure(!this.member(data.owner),'Jogador já tem aliança.',409);
          ensure(this.governor(data.owner).kingdom === g.kingdom,'Reino incompatível.',403);
          this.run('INSERT INTO members VALUES(?,?,1)',data.owner,m.alliance); this.run('DELETE FROM applications WHERE owner=?',data.owner);
        } else this.run('DELETE FROM applications WHERE owner=? AND alliance=?',data.owner,m.alliance);
      } else if (action === 'alliance.rank') {
        fields(data,['owner','rank']); ensure(m && PERMISSIONS.promote.includes(m.rank),'Apenas o líder.',403);
        ensure(Number.isInteger(data.rank) && data.rank>=1 && data.rank<=4,'Cargo permitido: R1 a R4.');
        ensure(typeof data.owner === 'string' && data.owner !== id && this.member(data.owner)?.alliance === m.alliance,'Membro inválido.');
        this.run('UPDATE members SET rank=? WHERE owner=?',data.rank,data.owner);
      } else if (action === 'alliance.leave') {
        fields(data,[]); ensure(m,'Você não pertence a uma aliança.');
        ensure(m.rank !== 5,'O líder não pode sair nesta versão.'); this.run('DELETE FROM members WHERE owner=?',id);
      } else if (action === 'chat') {
        fields(data,['channel','body']); ensure(this.canRead(id,data.channel),'Canal restrito.',403);
        const body = label(data.body,1,500);
        ensure(this.one('SELECT count(*) AS n FROM messages WHERE author=? AND at>?',id,this.clock()-10000).n < 6,'Aguarde antes de enviar mais mensagens.',429);
        const r = this.run('INSERT INTO messages(channel,author,body,at) VALUES(?,?,?,?)',data.channel,id,body,this.clock()); result={ok:true,messageId:Number(r.lastInsertRowid)};
      } else throw new Fault(404,'Comando inexistente.');
      this.run('INSERT INTO audit(actor,action,payload,at) VALUES(?,?,?,?)',id,action,JSON.stringify(data),this.clock());
      this.run('INSERT INTO commands VALUES(?,?,?,?)',id,key,fingerprint,JSON.stringify(result)); return result;
    });
  }
  close() { this.db.close(); }
}
