# TEST REPORT

## Execução 2026-10-24 — branch `claude/fase-a-railway`

**Ambiente:** container Linux, Node.js 22.22, PostgreSQL 16.15, Chromium (Playwright) emulando iPhone 13 (390×844, touch, DPR 3). Safari/WebKit e device físico **não disponíveis**.

**Comandos:** `npm run typecheck` · `npm test` (24/24 PASS) · `npm run build` · `node dist/server.js` + `npm run test:e2e` (12/12 PASS).

| ID | Teste | Resultado | Evidência |
|---|---|---|---|
| A-01 | duas contas e sessões independentes | PASS | integração "A-01/A-02"; E2E A-01 |
| A-02 | ambos no mesmo reino | PASS | integração "A-01/A-02" |
| A-03 | cidades e recursos isolados por governador | PASS | integração "A-03" |
| A-04 | saldo debitado apenas uma vez | PASS | 5 envios paralelos da mesma chave → 1 obra, 3 linhas de custo no ledger, saldo = soma do ledger |
| A-05 | construção permanece após reload | PASS | E2E A-05 (recarrega a página e a fila continua) |
| A-06 | construção termina pelo relógio do servidor offline | PASS | worker conclui obra vencida; obra vencida com servidor **parado** conclui após reinício sem duplicar nível |
| A-07 | cidades aparecem no mesmo mapa | PASS* | integração "A-07" + E2E. *Sem névoa de guerra: todas as cidades do reino são visíveis (regra da Fase A). |
| A-08 | mudanças chegam sem reload | PASS | B recebe `map.city` quando a obra de A conclui; reino 2 não recebe |
| A-09 | criação, candidatura e aprovação em aliança | PASS | integração "A4" + E2E A-09/A-10 |
| A-10 | lista de membros sincroniza e RBAC | PASS | R1/R3 não aprovam; R4 aprova e expulsa R1 mas não R5; só R5 altera cargos |
| A-11 | chat de reino A↔B | PASS | integração + E2E (com contador de não lidas) |
| A-12 | chat de aliança só para membros | PASS | integração + E2E |
| A-13 | chat global cruza reinos | PASS | reino 1 ↔ reino 2 |
| A-14 | histórico persiste, pagina e recebe novos eventos | PASS | paginação `before`, não lidas e marcação de leitura |
| A-15 | terceiro não membro bloqueado | PASS | 403 em leitura/escrita; não recebe via WebSocket |
| A-16 | saída de aliança revoga acesso | PASS | REST 403 e sem entrega WS logo após sair; dissolução auditada |
| A-17 | reconexão recupera estado | PASS (emulado) | E2E: contexto offline, mensagem enviada nesse intervalo aparece após reconectar. Não testado com suspensão real do Safari. |
| A-18 | teclado virtual não quebra chat | PARCIAL | input com 16 px (evita zoom do iOS) e ajuste por `visualViewport`; sem device físico |
| A-19 | pinça/arraste e botões | PARCIAL | toque/clique e arraste exercitados no E2E; pinça implementada (Pointer Events) mas não validada em device |
| A-20 | comandos repetidos não duplicam | PASS | idempotência do upgrade (ver A-04) |

**Segurança testada:** sem sessão → 401; mutação sem cabeçalho anti-CSRF → 403; senha errada → 401; custo/duração enviados pelo cliente ignorados; edifício inexistente → 400; requisito de nível validado; recursos insuficientes não criam obra; nome duplicado de governador/aliança → 409; acesso a aliança e cidade de outro reino → 404; rate limit do chat → 429.

**Não executado:** Safari/WebKit, iPhone físico, PWA instalada, deploy em produção, carga/concorrência em escala, FPS/memória medidos.

## Execução 2026-10-24 — produção (Vercel + Supabase)

**Alvo:** https://kingdoms-unbound.vercel.app (função `gru1`, Supabase sa-east-1). **Comando:** `BASE_URL=… E2E_PROXY=… node tests/e2e/two-players.cjs`.
**Resultado:** 12/12 PASS (A-01, A-05, A-07, A-09, A-10, A-11, A-12, coordenadas, A-17 emulado, A-16, A-18 parcial, sem erros JS). Também `npm test`: 27/27 (inclui 3 testes multi-instância).

## Execução 2026-10-24 — reformulação visual da cidade (v2)

**Ambiente:** Node 22, PostgreSQL 16, Chromium/Playwright emulando iPhone 13 com WebGL por software (SwiftShader). Sem Safari/WebKit nem device físico.

| Verificação | Resultado | Evidência |
|---|---|---|
| `npm run typecheck` | PASS | — |
| `npm test` (integração + unitários de layout) | 36/36 PASS | inclui 9 testes novos de `shared/cityLayout.ts`, que acharam e corrigiram 2 lotes/casas encostados na muralha |
| E2E dois jogadores (`tests/e2e/two-players.cjs`) contra o build novo | 12/12 PASS | seleção da prefeitura por toque na cena WebGL, obra, alianças, chat, reconexão |
| Cena WebGL inicializa e renderiza | PASS | `docs/evidence/visual-v2/01…06`; pronta em ~1,8 s no Chromium sem GPU |
| Estágios visuais 1/2/3 e crescimento das muralhas | PASS (visual) | `01-estagio1`, `03-estagio2`, `04-estagio3`, `06-estagio3-panorama` (níveis ajustados no banco **local** de desenvolvimento para captura) |
| Obra com andaimes, trabalhadores e contagem | PASS (visual) | `02-obra-em-andamento` |
| Zoom (aproximação/panorama) | PASS (visual) | `05`, `06` |
| Fallback sem WebGL (`--disable-webgl`) | PASS | `07-fallback-sem-webgl`: cai no Canvas 2D e o jogo segue funcional |
| Comparativo antes/depois | — | `comparativo.jpg` |

**Não executado:** FPS e memória em iPhone real, Safari/WebKit e PWA instalada.

## Execução 2026-10-24 — revisão visual v3 (épico/militar)

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | 36/36 PASS |
| E2E dois jogadores contra o build v3 | 12/12 PASS |
| Cena WebGL pronta (Chromium sem GPU) | ~1,5 s |
| Fallback sem WebGL | PASS (Canvas 2D) |
| Evidências | `docs/evidence/visual-v3/01…07`, `comparativo-v2-v3.jpg` (níveis dos estágios 2/3 ajustados no banco **local**) |

## Testes da Fase B+

**Estado:** NÃO EXECUTADO (funcionalidades inexistentes).

## Como manter este arquivo

Para cada execução registrar: data, branch/SHA, ambiente e versões, passos, resultado observado, evidências, status PASS/FAIL/BLOCKED. Uma checklist escrita **não** é evidência de execução.

## Cidade v4 — 2026-10-24

- `npm run typecheck`: PASS.
- `npx vitest run tests/unit`: PASS, 9 testes de ocupação e limites urbanos.
- `npm run build`: PASS, cliente Vite e servidor esbuild.
- `tests/e2e/city-visual.cjs`: PASS em Chromium headless com SwiftShader. Usa fixtures explicitamente locais ao Playwright, sem adicionar modo demo ao jogo.
- Verificados: renderização WebGL, clique no corpo da prefeitura, painel correto, envio de intenção de melhoria com chave de idempotência, fila retornada pela fixture, zoom e visão geral, limites de viewport e alvos de 44px em 390×844 e 844×390, screenshots dos três estágios e ausência de erros JavaScript.
- `npm test`: NÃO passou localmente: PostgreSQL ausente (`ECONNREFUSED localhost:5432`). 9 unitários passaram; 27 testes de integração não executaram. Não considerar a revisão como nova certificação de multiplayer.
- Sem teste Safari/WebKit nem aparelho físico. Sem benchmark de FPS/memória. Fallback Canvas conserva arte antiga.

Reprodução visual: instalar Playwright no ambiente de QA, iniciar `npm run dev:client -- --host 127.0.0.1`, executar `node tests/e2e/city-visual.cjs`. Variáveis opcionais: `VISUAL_URL`, `VISUAL_OUTPUT`, `PLAYWRIGHT_MODULE`, `CHROME_PATH`. O runner não faz login nem altera contas reais. Capturas são **fixtures de QA**, identificadas pelo governador “Teste visual”, e não evidência de população ou economia multiplayer.

## Complemento da v4

CI no GitHub com PostgreSQL: **PASS** — https://github.com/ZAnt214/KINGDOMS-UNBOUND/actions/runs/40141533430, commit `f3f61d921bb7a3ed5744722e42de27050d117925`. Passaram typecheck, suíte `npm test` e build. Isso resolve o bloqueio de infraestrutura local relatado acima para aquele commit.

## Cidade v5 — 2026-10-25

TypeScript e build cliente/servidor passaram; 9 testes unitários de layout passaram. As duas folhas WebP preservam alpha, medem 1536×1024 e somam 1.14 MB de download. Cenários visuais usam o mesmo harness Playwright da v4, agora exigindo o carregamento das duas folhas e verificando fallback selecionável após falha de download. Resultados das execuções e capturas em `docs/evidence/city-v5/`.

Não houve teste em Safari físico nem nova sessão multiplayer de navegador; o teste visual intercepta APIs e WebSocket apenas no ambiente de QA. Não extrapolar resultados de SwiftShader para FPS/memória de iPhone.

Resultado local v5: **PASS** no harness Chromium: atlas carregados, seleção da prefeitura, envio de intenção de melhoria, fila, controles de câmera, três estágios, limites nas duas orientações e fallback com imagens bloqueadas. Sem erros JavaScript.
