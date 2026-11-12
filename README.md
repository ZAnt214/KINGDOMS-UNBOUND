# KINGDOMS UNBOUND

**Estratégia multiplayer contemporânea num mapa-múndi real.** O jogador escolhe uma capital, funda uma nação, vê o território ganhar a sua cor região por região, ergue cidades, fábricas e portos, e disputa o mundo com outras nações.

> Status atual: **Fases A e B implementadas, Partida Rápida com bots ativa** (fundar nação, expandir por regiões, economia e construções no mapa). Estado real em [docs/PROGRESS.md](docs/PROGRESS.md); regras e fórmulas em [docs/PLAY_RULES.md](docs/PLAY_RULES.md); visão oficial em [docs/VISION.md](docs/VISION.md).

## Rodar localmente

Requisitos: Node.js 22+ e PostgreSQL 16.

```bash
npm ci
createdb ku                       # ou ajuste DATABASE_URL (ver .env.example)
npm run build && npm start        # http://localhost:3000
```

Desenvolvimento com recarga: `npm run dev:server` e, em outro terminal, `npm run dev:client` (http://localhost:5173).

Qualidade:

```bash
npm run typecheck
npm test                          # unitários + integração contra Postgres real (TEST_DATABASE_URL, padrão ku_test)
npm run test:visual:play          # passeio com dois navegadores (BASE_URL); ver o cabeçalho do script
```

Deploy: [Vercel](docs/DEPLOY_VERCEL.md) ou [Railway](docs/DEPLOY_RAILWAY.md).

## Estrutura do código

- `shared/world/` — países e 1.589 regiões reais (Natural Earth) com vizinhança terrestre, litoral e 279 pontos de partida, gerados por `tools/build-regions.mjs`.
- `shared/play/` — regras versionadas, usadas pelo servidor (autoridade) e pelo cliente (exibição): território (`rules.ts`), economia e construções (`economy.ts`), partida rápida (`match.ts`), bandeiras (`flags.ts`) e o contrato da API (`types.ts`).
- `server/src/` — Express + WebSocket e migrações. Serviços: `nation` (fundação, identidade), `territory` (ocupações), `economy` (saldo, produção, obras), `match` (partida rápida, bots, vitória), além de `alliance` e `chat` (sem interface por enquanto).
- `client/src/worldmap/engine/` — motor do mapa em Canvas 2D, independente da interface: regiões, territórios, preenchimento progressivo, bandeiras, construções, arena e efeitos.
- `client/src/play/` — telas, HUD, cartões, folhas e áudio sintetizado (Web Audio).
- `tests/unit/`, `tests/integration/` — Vitest; a integração usa Postgres real e vários jogadores com WebSocket. `tests/e2e/play-visual.cjs` — passeio no navegador.

## Princípios

- **Servidor é a fonte da verdade:** território, saldo, obras, ocupações, partidas. O cliente envia só intenções.
- **Nada simulado como se fosse real:** o que não existe aparece bloqueado com o motivo; servidores falsos de teste são identificados como tal.
- **O mapa é o protagonista:** HUD mínimo, painéis só quando há contexto, cada ação com resposta visual e sonora.
- **Recursos originais:** geometria e bandeiras de países de fontes abertas (Natural Earth, flag-icons), o resto feito em código. Sem imagens geradas por IA.

Decisões registradas em `docs/adr/`.
