# Deploy na Vercel

O servidor do jogo roda como **Vercel Function** (servidor HTTP Node.js em `server.ts`, com WebSocket) e o cliente é servido pela CDN a partir de `public/` (gerado por `npm run build:client`). Configuração em `vercel.json`.

## Produção atual

- URL: https://kingdoms-unbound.vercel.app (função em `gru1`, São Paulo).
- Banco: Supabase, projeto `onlyyou`, **schema `kingdoms`** e usuário dedicado `kingdoms_app` (search_path fixo no schema; sem acesso às tabelas do projeto hospedeiro).
- `DATABASE_URL`: pooler Supavisor em modo transação (porta 6543). `DATABASE_URL_UNPOOLED`: pooler em modo sessão (porta 5432), para migrações e LISTEN/NOTIFY. Ambas são variáveis *sensitive* na Vercel.
- E2E de dois jogadores contra a URL pública: 12/12 (2026-10-24).

## Passos (Neon/Marketplace, alternativa)

1. Projeto Vercel ligado ao repositório `zant214/kingdoms-unbound` (framework **Node.js**).
2. **Banco:** no projeto, **Storage → Create Database → Neon (Postgres)** e conecte ao projeto. A integração define `DATABASE_URL` (com pooler) e `DATABASE_URL_UNPOOLED` (direta). O servidor usa a direta para migrações e para o barramento de eventos (`LISTEN/NOTIFY`).
3. Variável `NODE_ENV=production` (cookie `Secure`).
4. Faça um redeploy após conectar o banco. Na primeira requisição as migrações e os reinos iniciais são criados.
5. Teste `https://<projeto>.vercel.app/healthz` → `{"ok":true}`.

## Como o tempo real funciona com várias instâncias

Cada conexão WebSocket fica numa instância de função. Todos os eventos (chat, mapa, aliança, obras) são publicados com `pg_notify` e cada instância os recebe via `LISTEN` e entrega aos seus conectados. Mudanças de aliança propagam a nova ACL a todas as instâncias. Teste: `tests/integration/multi-instance.test.ts`.

## Limitações na Vercel

- Conexões WebSocket têm duração máxima da função; o cliente reconecta sozinho e recarrega snapshots.
- O worker de obras roda dentro das instâncias ativas. Sem ninguém conectado, as obras são concluídas na próxima leitura (o resultado é o mesmo, calculado pelo timestamp do servidor).
- Rate limits são por instância (em memória).
