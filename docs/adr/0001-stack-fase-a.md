# ADR 0001 — Stack e hospedagem da Fase A

**Data:** 2026-10-24 · **Status:** aceito

## Contexto

A Fase A exige servidor autoritativo com conexões WebSocket persistentes, relógio confiável para obras offline, PostgreSQL transacional e cliente PWA mobile-first (iPhone/Safari). A arquitetura proposta (`docs/ARCHITECTURE.md`) proíbe hospedar o servidor de tempo real em função serverless.

## Decisão

- **Servidor:** Node.js 22 + TypeScript, Express (REST validado com zod) e `ws` (WebSocket) no mesmo processo de longa duração. Bundle com esbuild.
- **Banco:** PostgreSQL 16 via `pg`. Migrações SQL versionadas em `server/src/migrate.ts`, aplicadas na inicialização sob advisory lock.
- **Cliente:** React 19 + Vite, UI em HTML/CSS, cidade e mapa isométricos em **Canvas 2D** com arte procedural original. PixiJS/WebGL fica adiado: o volume da Fase A (mapa 120×120, dezenas de cidades) roda com culling e batching de `Path2D` sem custo de dependência. Reavaliar na Fase B (marchas animadas) com medição.
- **Auth:** usuário + senha (bcrypt), sessão opaca em cookie `HttpOnly; SameSite=Lax; Secure` (produção), token guardado como SHA-256. CSRF: cabeçalho obrigatório `X-KU: 1` em mutações.
- **Tempo real:** um processo, salas derivadas do estado persistido (reino, aliança, governador). Reconexão do cliente recarrega snapshots autoritativos.
- **Hospedagem:** Railway (serviço Docker de longa duração + plugin PostgreSQL). `railway.json` com healthcheck em `/healthz` e **1 réplica**.

## Consequências

- Escala horizontal exige pub/sub (Redis) para o hub e rate limits compartilhados. Até lá, `numReplicas` deve permanecer 1.
- Rate limit e presença ficam em memória e reiniciam com o processo (aceitável na Fase A).
- Obras e produção não dependem de processo vivo: são derivadas de timestamps no banco e materializadas por worker (1 s) ou na próxima leitura.

## Atualização 2026-10-24 — Vercel e múltiplas instâncias

O hub de tempo real passou a publicar eventos via Postgres `LISTEN/NOTIFY` (conexão direta, sem pooler). Isso permite rodar como Vercel Function (várias instâncias) e com mais de uma réplica no Railway, sem Redis. Payloads acima de ~7,9 KB viram um evento `resync` e o cliente recarrega os snapshots. Ver `docs/DEPLOY_VERCEL.md`.
