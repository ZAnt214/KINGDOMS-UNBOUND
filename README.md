# KINGDOMS UNBOUND

**MMO persistente de estratégia, civilizações, cidades, alianças e guerras territoriais.**

> Status atual: **Fase A implementada e testada** (contas, governador, civilizações, reinos, cidade com obras por relógio de servidor, economia com ledger, mapa compartilhado em tempo real, alianças R1–R5 e chats global/reino/aliança). Fases B–E ainda não existem. Ver [Progresso](docs/PROGRESS.md) e [Relatório de testes](docs/TEST_REPORT.md).

## Visão

KINGDOMS UNBOUND será um jogo de estratégia para navegador e PWA mobile, com prioridade para iPhone/Safari. Cada jogador administra uma cidade, desenvolve sua civilização, recruta comandantes, movimenta exércitos num mapa compartilhado, integra uma aliança e compete pelo controle político/militar do reino.

A referência principal de experiência é **Rise of Kingdoms**. Queremos profundidade similar nas *mecânicas de gênero*, com código, textos, identidade visual, mapas, recursos gráficos e personagens **originais**, sem copiar materiais protegidos de terceiros.

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
npm test                          # integração contra Postgres real (TEST_DATABASE_URL, padrão ku_test)
npm run test:e2e                  # dois navegadores reais contra BASE_URL (servidor rodando)
```

Deploy: [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md). Decisões de stack: [ADR 0001](docs/adr/0001-stack-fase-a.md).

## Estrutura do código

- `shared/` — regras versionadas (civilizações, edifícios, custos, produção, RBAC) e terreno determinístico; usadas pelo servidor (autoridade) e pelo cliente (exibição).
- `server/src/` — Express + WebSocket, migrações, serviços `city` (obras, ledger, idempotência, worker), `alliance` (RBAC, auditoria) e `chat` (ACL, rate limit, coordenadas).
- `client/src/` — PWA React; cidade e mapa isométricos em Canvas 2D com arte procedural original; HUD mobile com safe-area.
- `tests/integration/` — Vitest com quatro jogadores reais em dois reinos; `tests/e2e/` — Playwright com dois contextos de navegador.

## Documentação e entrada para o Work

- [Prompt mestre para o ChatGPT Work](docs/WORK_MASTER_PROMPT.md) — briefing completo, escopo, fases, testes e entregáveis.
- [Game Design](docs/GAME_DESIGN.md) — loop de jogo, progressão, cidade, economia e civilizações.
- [Sistemas de multiplayer e mundo](docs/WORLD_MAP.md) — reinos, mapa, exploração, marchas e sincronização.
- [Alianças e política](docs/ALLIANCE_SYSTEM.md) — clãs, cargos, territórios, diplomacia, governo e chat.
- [Combate](docs/COMBAT_DESIGN.md) — tropas, comandantes, confrontos, hospitais e relatórios.
- [Arquitetura técnica](docs/ARCHITECTURE.md) — cliente, simulação autoritativa, tempo real, PWA e segurança.
- [Modelo de dados](docs/DATABASE.md) — entidades, isolamento por reino e consistência.
- [Plano de implementação](docs/IMPLEMENTATION_PLAN.md) — marcos executáveis e definição de pronto.
- [Matriz de sistemas](docs/SYSTEMS.md) — inventário, integrações e cobertura.
- [Testes e validação](docs/TEST_REPORT.md) — cenários e estado de verificação.
- [Progresso](docs/PROGRESS.md) — status verdadeiro, decisões e próximos passos.
- [Referências de pesquisa](docs/RESEARCH_REFERENCES.md) — fontes e protocolo de verificação de mecânicas.
- [UX e direção de arte](docs/UX_ART_DIRECTION.md) — visual original de jogo e experiência mobile/Safari.

## Primeira meta jogável

1. Dois jogadores com contas e cidades independentes;
2. ingresso no **mesmo reino persistente**;
3. mapa sincronizado mostrando cidades conforme regras de descoberta;
4. construção com recursos, tempo de servidor e persistência;
5. criação, convite/solicitação e ingresso em aliança;
6. chat do reino, da aliança e global, com mensagens realmente transmitidas;
7. recarregar, sair e voltar sem perder progresso.

Depois: tecnologia, unidades, comandantes, marchas, coleta, combate, territórios, política e guerras entre reinos.

## Princípios que não negociamos

- **Nunca simular funcionalidade como se fosse real.** Mock deve ser identificado.
- **Servidor é fonte da verdade:** recursos, relógio, progresso, movimentação, combate e permissões.
- **Testar com duas sessões reais** antes de alegar multiplayer.
- **Foco no iPhone:** interface mobile-first com toque, zoom, safe-area, suspensão e reconexão.
- **Arquitetura modular** e dados versionados, prontos para recursos originais futuros.
- **Segurança e comunidade:** acesso de canais, antiabuso, moderação, auditoria.
- **Nenhuma promessa de escala** sem teste de carga.

## Como iniciar no Work

Abra este repositório `ZAnt214/KINGDOMS-UNBOUND`, leia `docs/WORK_MASTER_PROMPT.md` e as especificações relacionadas, examine o código existente e inicie a **Fase A** sem trocar a documentação por telas decorativas. Registre o que realmente foi construído e testado em `docs/PROGRESS.md` e `docs/TEST_REPORT.md`.

## Referências de pesquisa

- https://rok.lilith.com/ — referência oficial de produto.
- https://play.google.com/store/apps/details?id=com.lilithgame.roc.gp — apresentação pública do jogo.
- https://riseofkingdoms.fandom.com/wiki/Rise_of_Kingdoms_Wiki — enciclopédia da comunidade; verificar precisão e atualidade.

**Nota:** sistemas, números e regras citados em referências externas devem ser conferidos antes de serem tratados como fatos atuais. Esta documentação é a especificação **do nosso projeto**.
