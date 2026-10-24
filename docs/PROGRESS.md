# PROGRESSO REAL — KINGDOMS UNBOUND

**Última atualização:** 2026-10-24.

## Entrega de código — Fase A iniciada

Branch: `work/phase-a-core`. Base remota: `b1c7e70a220f869c59f8168f3f35296952393d34`. Veja o PR desta branch para SHA final.

Implementado: Node 24 + SQLite transacional, migração, login/cadastro/logout, cookies de sessão, governador/cidade/reino, duas civilizações com bônus econômicos, cinco edifícios com níveis/custos/requisitos, produção e timers offline, ledger/idempotência, mapa público por reino, candidatura/aprovação/recusa/cargos/saída de aliança, chats persistentes global/reino/aliança e snapshots SSE autenticados. Interface HTML/Canvas mobile e PWA mínima incluídas. Fluxo principal validado posteriormente em Chromium mobile no CI; instalação PWA não testada.

**Verificado:** `npm run check` e `npm test` passaram: 11 testes, 0 falhas. Quatro contas no teste principal (A/B mesmo reino, C não membro, D outro reino); duas sessões SSE simultâneas; teste adicional com duas contas e restart de processo usando relógio real. Ledger conciliado com saldos. Evidências em [TEST_REPORT](TEST_REPORT.md) e [logs](evidence/phase-a-integration.txt).

**Atualização de validação:** o bloqueio local de Chromium foi contornado no GitHub Actions. O teste `tests/browser.mjs` passou com dois contextos independentes, viewport mobile 390×844, construção/reload, aliança/aprovação, chat sem reload, botões de câmera e reconexão. [CI bem-sucedido](https://github.com/ZAnt214/KINGDOMS-UNBOUND/actions/runs/40088529990), SHA `ab41cc5683cc595229d0fe91b42dcc7096be72bd`. Screenshot do mapa inspecionado, sem overflow horizontal, em `docs/evidence/phase-a-mobile.png`. Sem Safari físico, WebKit, teclado iOS, FPS/memória ou deploy. Dockerfile não validado.

**Fase A não concluída:** faltam polimento e validação Safari, coordenadas clicáveis no chat, não lidas persistentes, convites/transferência/dissolução, moderação, interest management/deltas, operação/backup e escolhas de infraestrutura. Arquitetura candidata PostgreSQL/TypeScript/WebSocket ainda não implementada; desvios justificados no [ADR](ADR_001_PHASE_A.md). B–E não iniciadas.

Próximo marco: validar WebKit/Safari e publicar ambiente de teste persistente após definir host; ampliar A antes de combate/marchas. Não apresentar esta alpha como MMO pronto para produção.

---

## Estado inicial (preservado como histórico)

**Pré-produção e documentação.** O repositório recém-criado recebeu o README, o prompt mestre e especificações estruturadas. Não há afirmação de jogo construído, servidor ativo, assets finalizados, infraestrutura provisionada ou testes executados.

## Concluído

- [x] Nome adotado: KINGDOMS UNBOUND.
- [x] Repositório oficial identificado: ZAnt214/KINGDOMS-UNBOUND.
- [x] Objetivo de referência funcional do gênero definido.
- [x] Escopo de cidade, economia, mundo, combate, alianças, chats, governo e KvK documentado.
- [x] Prompt para Work e plano de implementação organizados.
- [x] Critérios iniciais de qualidade e teste preparados.

## Em aberto

- [ ] Auditoria aprofundada e referenciada dos detalhes vigentes de Rise of Kingdoms.
- [ ] Escolha final de stack e arquitetura por ADR.
- [ ] Código do jogo e renderização.
- [ ] Banco e migrações.
- [ ] Backend autoritativo.
- [ ] Login/governador/cidade.
- [ ] Economia real e temporizadores.
- [ ] Reinos e mapa compartilhado.
- [ ] Alianças e chat real.
- [ ] Dois usuários em teste E2E.
- [ ] Infraestrutura/deploy.
- [ ] Fases B, C, D, E.

## Próxima ação objetiva

Abrir o repositório no ChatGPT Work, ler docs/WORK_MASTER_PROMPT.md e iniciar a **Fase A** pelo fluxo de duas contas, cidades e mundo persistente. Não abrir o esforço criando apenas telas decorativas.

## Protocolo de atualizações

Ao fim de cada entrega, registrar:
1. Código/PR/SHA e funcionalidades;
2. ambiente em que executou;
3. testes e evidências;
4. bloqueios e limitações;
5. próximo marco;
6. decisão arquitetural alterada.

Não substituir resultado observado por previsão.

