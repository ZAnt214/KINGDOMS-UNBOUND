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

## 2026-11-11 — Centro de comando e mapa-múndi

Ambiente: contêiner sem acesso ao registro npm e sem PostgreSQL. `npm ci`, `npm run typecheck`, `npm test` e `npm run build` **não foram executados**; o resultado abaixo é o que foi possível verificar.

| Verificação | Como | Resultado |
|---|---|---|
| Motor do mapa e `shared/world` | `tsc --strict` (TypeScript 6 global) só nesses arquivos | sem erros |
| Componentes React novos e `Game.tsx` | `tsc` com tipos mínimos de React escritos à mão | sem erros nos arquivos novos; **não substitui** o typecheck com `@types/react` |
| Tela no navegador | cliente real empacotado com esbuild (PixiJS substituído por stub), Chromium headless, `tests/e2e/command-visual.cjs` com API/WebSocket interceptados | todas as verificações de comportamento passaram |
| Erros de console | mesma execução | apenas o aviso "cena WebGL indisponível", causado pelo stub local do PixiJS |
| Servidor (`world.ts`, migração 2, rotas) | — | **não executado**; coberto por `tests/integration/world.test.ts`, que precisa rodar na CI |
| Regressão do que já existia | — | **não executado** (integração e E2E de dois jogadores dependem da CI) |

O harness visual verifica: legenda igual ao estado recebido; clique no Brasil e na Rússia abre o território certo; ações bloqueadas explicam o motivo; zoom mantém o ponto sob o cursor; arraste leva o país junto; alistamento faz uma única chamada com o cabeçalho CSRF; os seis itens laterais, os cinco módulos e os botões da barra respondem; sem rolagem horizontal e com alvos ≥ 44 px em 1024×768, 390×844 e 844×390. Capturas em `docs/evidence/command-v1/`.

O estado do mundo usado no harness é uma fixture montada a partir de `shared/world/scenario.json`; não prova persistência, isolamento por reino nem tempo real — isso é papel de `world.test.ts`.

## 2026-11-11 — Nova visão, Fase A (fundar e expandir) — branch `claude/fase-a-capital-expansao`

### Servidor real — CI do GitHub (Node 22, PostgreSQL 16)

Run 43059823651, commit `32d77b0`: `npm run typecheck` PASS · `npm test` **68/68** PASS · `npm run build` PASS.

Testes novos em `tests/integration/play.test.ts` (servidor real, Postgres real, 5 jogadores em 2 mundos, WebSocket):

| Verificação | Resultado |
|---|---|
| estado exige sessão; mundo começa sem nações e sem controle | PASS |
| nome, cor, bandeira e imagem inválidos são recusados sem criar nada | PASS |
| fundação entrega a região inicial e avisa em tempo real só o mesmo mundo | PASS |
| imagem de bandeira é servida com o tipo certo e só para o mesmo mundo | PASS |
| uma nação por jogador; ponto, nome e cor vizinha exclusivos | PASS |
| mesmo ponto pode ser fundado em outro mundo (isolamento) | PASS |
| duas fundações simultâneas no mesmo ponto: uma vence (200 e 409) | PASS |
| expansão recusa região desconhecida, própria, de outra nação e não vizinha | PASS |
| duração vem do servidor; `seconds`, `endsAt` e `from` enviados pelo cliente são ignorados | PASS |
| uma ocupação por nação e uma por região, com 5 pedidos paralelos | PASS |
| ocupação vencida conclui pelo worker sem nenhuma requisição e avisa o mundo | PASS |
| leitura do estado e novo pedido também concluem; concluir duas vezes não duplica | PASS |

`tests/unit/play.test.ts` (14 testes): integridade das 1.589 regiões e 279 pontos (ids únicos, vizinhança simétrica, região exclusiva por ponto), funções territoriais, fórmula de expansão, nível e metas, validação de bandeiras e de imagens.

Os 54 testes anteriores (Fase A clássica, mundo geopolítico, múltiplas instâncias, layout) continuam passando.

### Interface — navegador automatizado com SERVIDOR FALSO

`tests/e2e/play-visual.cjs`, Chromium headless (SwiftShader), 390×844 e 1280×800, dois navegadores independentes, contra `tests/e2e/fixtures/play-mock-server.ts` com durações divididas por 4. **14/14** verificações: tela inicial, modos bloqueados, nome obrigatório, cartão do ponto, fundação, segundo jogador vê a nação sem recarregar, ponto tomado não abre cartão, ocupação com progresso, conquista, recarregar mantém o estado, ranking, mudo, sem rolagem horizontal, sem erros de JavaScript. Capturas em `docs/evidence/play-a/`.

Este passeio **não** prova persistência, concorrência nem tempo real do servidor de verdade: o servidor falso guarda tudo em memória. Essas garantias vêm da tabela acima.

### Deploy de prévia (Vercel + banco real)

`kingdoms-unbound-qg7pnw5ke-test11-1d8d.vercel.app`: `GET /api/meta` responde 200 com `mode` e `playRulesVersion` (migração 3 aplicada) e `/world/regions.topo.json` é servido. O fluxo completo no navegador contra esse deploy **não foi executado**: o ambiente de desenvolvimento não alcança `*.vercel.app`.

### Não executado

iPhone/Safari físico, PWA instalada, áudio em aparelho real (só a ausência de erros foi verificada), FPS e memória em aparelho, carga com muitos jogadores, passeio de dois navegadores contra o servidor real.

## 2026-11-11 — Medieval removido, Fase B e Partida Rápida — branch `claude/fase-a-capital-expansao`

### Servidor real — CI do GitHub (Node 22, PostgreSQL 16)

Run 43066960419, commit `ed2c3dd`: typecheck PASS · `npm test` **72/72** PASS (7 arquivos) · build PASS.

`tests/integration/economy.test.ts` (servidor real, dois jogadores, WebSocket):

| Verificação | Resultado |
|---|---|
| saldo inicial e produção iguais à fórmula compartilhada; economia é privada | PASS |
| construir desconta o custo do servidor uma vez; custo, nível e prazo enviados pelo cliente são ignorados | PASS |
| outro jogador vê o canteiro de obras em tempo real | PASS |
| recusa sem cobrar: tipo repetido, porto longe do litoral, região alheia, tipo inexistente | PASS |
| limite de 2 obras simultâneas; sem recursos não cria nada | PASS |
| obra vencida conclui pelo worker sem requisição; produção e energia sobem | PASS |
| meia hora offline acumula a produção certa; dez horas param no estoque máximo | PASS |
| três melhorias simultâneas: só uma passa; construção alheia dá 404; nível máximo é respeitado | PASS |
| expansão passa a custar recursos e é recusada sem saldo | PASS |

`tests/integration/quick.test.ts`:

| Verificação | Resultado |
|---|---|
| cria mundo próprio com arena de 40 regiões e 3 bots; pedir de novo devolve a mesma partida | PASS |
| campanha continua separada; cabeçalho de mundo alheio não dá acesso | PASS |
| fundação só dentro da arena; relógio de 15 min começa na fundação; expansão fora da arena recusada | PASS |
| bots agem pelas mesmas regras e só dentro da arena | PASS |
| mais da metade da arena encerra com vitória, classificação e aviso em tempo real | PASS |
| depois do fim, construir e expandir são recusados | PASS |
| abandonar encerra e põe quem saiu em último | PASS |
| fim do tempo decide por regiões; partida sem fundação expira sem vencedor | PASS |

`multi-instance.test.ts` agora prova que uma obra concluída por dois workers concorrentes é anunciada uma única vez. Unitários novos (`tests/unit/economy.test.ts`, 12): fórmulas de produção, energia, eficiência, jazidas, custos e tempos progressivos, projeção com teto, regras de construção, arenas conectadas com pontos suficientes nos 8 teatros, identidades dos bots e regra de vitória.

### Interface — navegador automatizado com SERVIDOR FALSO

`tests/e2e/play-visual.cjs` contra `tests/e2e/fixtures/play-mock-server.ts` (memória, durações ÷ 4), Chromium headless, 390×844 e 1280×800, dois navegadores: **21/21** verificações nos dois tamanhos, incluindo construir pelo painel, obra concluída sozinha com aviso, painel de economia com 7 linhas, partida rápida com 3 bots, relógio após a fundação e tela de fim de partida. Capturas em `docs/evidence/play-b/`. Este passeio não prova persistência nem concorrência do servidor real.

### Prévia (Vercel + banco real)

`kingdoms-unbound-215efdnld-test11-1d8d.vercel.app`: `GET /api/meta` 200 com `quick: true` e os mundos renomeados (migração 4 aplicada). Fluxo no navegador contra a prévia **não executado** (o ambiente não alcança `*.vercel.app`).

### Não executado

iPhone/Safari físico, som em aparelho, FPS e memória, carga, partida rápida inteira de 15 minutos com bots no servidor real (os testes forçam o tempo).

## 2026-11-11 — Construção por toque e desempenho do mapa

### Unidade (local, com o mesmo código dos testes do CI)
`tests/unit/play.test.ts` 14/14, `economy.test.ts` 12/12 (espaços por área), `geo.test.ts` 2/2 (ponto dentro/fora da região, ponto livre a 25 km).

### Integração (CI, PostgreSQL real)
`tests/integration/economy.test.ts`, `quick.test.ts` e `multi-instance.test.ts` passam a construir por ponto `[lon, lat]`: dentro do território, a menos de 25 km (`too_close`), em região alheia (`not_owner`), no oceano e fora do mapa (400). Resultado: ver o CI do commit.

### Interface — navegador automatizado com SERVIDOR FALSO
`tests/e2e/play-visual.cjs`: **22/22** em 390×844 e **22/22** em 1280×800. Novo fluxo: abrir a barra, escolher Cidade, tocar no mapa; escolher Depósito, tocar em outro ponto; a obra termina sozinha e avisa; as duas construções aparecem nas coordenadas tocadas (±0,5°). Capturas em `docs/evidence/play-c/`.

### Desempenho (Chromium headless, viewport de celular, DPR 3, sem limitação de CPU)

| Situação | Antes | Depois |
|---|---|---|
| Parado (pontos pulsando) | ~333 ms/quadro (3 fps) | 16,7 ms (60 fps) |
| Arrastando | ~303 ms (3 fps) | 16,7 ms (60 fps) |
| Zoom por roda | ~281 ms (4 fps) | 27,6 ms médio (36 fps), p90 16,7 ms |

Medido em máquina de nuvem sem GPU; um aparelho real pode ter números diferentes. **Não executado:** medição em iPhone/Android físico.

### Prévia (Vercel + banco real)
`kingdoms-unbound-g1e3xbxn3-test11-1d8d.vercel.app` (commit `157f516`): `GET /api/meta` 200. CI do mesmo commit: verde (typecheck + integração com PostgreSQL, incluindo a migração 5). Na primeira tentativa o CI pegou um erro real (parâmetro de longitude tipado como inteiro na busca de vizinhas), corrigido em `157f516`.
