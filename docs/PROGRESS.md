# PROGRESSO REAL — KINGDOMS UNBOUND

**Última atualização:** 2026-10-24 · branch `claude/fase-a-railway`.

## Estado do projeto

**Fase A implementada e testada em ambiente local/CI.** Servidor autoritativo Node/TypeScript com PostgreSQL e WebSocket, cliente PWA mobile-first. **Em produção** em https://kingdoms-unbound.vercel.app (Vercel + Supabase, ver `docs/DEPLOY_VERCEL.md`). Fases B–E não iniciadas.

## Entregue nesta etapa

### A1 — Identidade e mundo
- [x] Cadastro, login, logout, sessão em cookie HttpOnly (token com hash SHA-256, bcrypt para senha).
- [x] Governador com nome único (case-insensitive), um por conta.
- [x] Três civilizações originais com bônus reais aplicados no servidor: Coroa de Auren (+15% alimento), Clãs de Kharuun (+15% pedra), Ligas de Veyra (obras 10% mais rápidas).
- [x] Dois reinos (Valdoria, Ostmark) com terreno determinístico original 120×120; isolamento por reino em mapa, alianças e chat.
- [x] Cidade criada em posição válida (terreno construível, distância mínima entre cidades).
- [~] Snapshot do mapa limitado ao próprio reino e a uma área máxima. **Não há névoa de guerra** (todas as cidades do reino são visíveis): decisão da Fase A, névoa prevista na Fase B.

### A2 — Cidade e economia
- [x] Cidade isométrica navegável (arraste, pinça, roda), seleção de edifício e painel com custo, tempo, efeito e motivo de bloqueio.
- [x] Seis edifícios com efeito real: Prefeitura (limite de níveis), Fazenda, Serraria, Pedreira, Mina de Ouro (produção), Armazém (capacidade).
- [x] Saldos + ledger imutável (concessão inicial, produção, custo de obra) na mesma transação; restrição `amount >= 0`.
- [x] Obra por timestamps de servidor; worker de 1 s e conclusão preguiçosa na leitura; sobrevive a reinício.
- [x] Idempotência por `idempotency_key` (repetição devolve a mesma resposta sem cobrar).
- [x] Fila única de construção por cidade (índice parcial único + lock da cidade).

### A3 — Mapa compartilhado
- [x] Mapa isométrico próprio com culling, LOD por zoom, pan/pinça, coordenadas, "ir para" e "minha cidade".
- [x] Cidades de todos os governadores do reino; atualização em tempo real (`map.city`) ao concluir obras ou mudar de aliança.
- [x] Reconexão com backoff; ao reconectar o cliente recarrega snapshots.
- [~] Assinatura por **reino**, não por região/chunk (suficiente para 120×120; chunks na Fase B).

### A4 — Alianças
- [x] Criar (nome/sigla únicos por reino), buscar, candidatar, cancelar, aprovar/recusar, sair, expulsar, promover/rebaixar, transferir liderança, dissolução quando o último membro sai.
- [x] RBAC R1–R5 verificado no servidor (`ALLIANCE_PERMISSIONS` em `shared/rules.ts`) e auditoria em `audit_logs`.
- [x] Eventos em tempo real de candidatura e mudança de membros.

### A5 — Chat
- [x] Canais global (entre reinos), reino e aliança; mensagens persistidas, histórico paginado, não lidas.
- [x] ACL no servidor em leitura, escrita e entrega WebSocket; saída da aliança revoga imediatamente.
- [x] Rate limit (5 mensagens/10 s), limite de 500 caracteres, saneamento de caracteres de controle.
- [x] Coordenadas `X:12 Y:40` viram referência estruturada validada pelo servidor e link que centraliza o mapa.

### A6 — Qualidade e entrega
- [x] 24 testes de integração (Vitest, Postgres real, 4 jogadores em 2 reinos).
- [x] E2E com dois navegadores independentes em viewport de iPhone 13 (12 verificações).
- [x] CI no GitHub Actions (typecheck, testes, build).
- [x] Suporte a Vercel (`server.ts`, `vercel.json`, cliente em `public/`) e a múltiplas instâncias; 3 testes multi-instância.
- [x] Dockerfile + `railway.json`; imagem simulada localmente (build limpo, só dependências de produção, healthcheck OK).
- [ ] Teste em **iPhone/Safari físico** — não disponível neste ambiente.
- [x] Deploy real na Vercel com Supabase; E2E de dois jogadores contra a URL pública: 12/12.

### Reformulação visual da cidade (v2)
- [x] Cidade em PixiJS/WebGL com arte vetorial isométrica original (ADR 0002); fallback Canvas 2D sem WebGL.
- [x] Prefeitura ilustrada em 3 fases + variações por nível; demais edifícios ilustrados em 3 fases.
- [x] Muralhas modulares, torres, guarita do portão; anel cresce com a prefeitura (estágios 1–3).
- [x] Terreno pintado (estradas, praça, campos, lago, floresta), vegetação e adereços.
- [x] Moradores animados, fumaça, nuvens, pássaros, obra com andaimes e trabalhadores.
- [x] Sem rótulos permanentes; seleção contextual com foco de câmera; indicador de melhoria disponível.
- [x] HUD redesenhado (ícones SVG próprios, fonte Cinzel local, painel com retrato do edifício).
- [x] Plano urbano por dados com lotes reservados; testes unitários do layout.
- [x] Revisão v3 (tom épico/militar): castelo em 3 estágios, muralhas monumentais com fosso, soldados e sentinelas, acampamento, braseiros animados, paleta sombria, HUD heráldico.
- [ ] Medição de FPS/memória e teste em iPhone/Safari real.
- [ ] Mapa-múndi no mesmo pipeline visual; animação de estandartes/água.

## Limitações e dívidas conhecidas

- Tempo real entre instâncias via Postgres LISTEN/NOTIFY (testado com 2 instâncias); rate limits ainda são por instância.
- Sem névoa de guerra, marchas, tropas, combate, pesquisa, comandantes (Fase B+).
- Sem moderação/denúncia/bloqueio de chat, correio, recuperação de senha, painel admin.
- Arte procedural provisória (original, mas não final).
- Sem teste de carga; nenhuma afirmação de capacidade.

## Próxima ação objetiva

2. Testar em iPhone físico (Safari e PWA instalada) e registrar resultados em `TEST_REPORT.md`.
3. Iniciar Fase B: chunks do mapa, névoa de guerra, tropas e marchas.

## Decisões registradas

- `docs/adr/0001-stack-fase-a.md` — stack, Canvas 2D em vez de PixiJS, Railway com 1 réplica.
- Valores de balanceamento em `shared/rules.ts` (`RULES_VERSION = 1`) são decisões próprias iniciais, não números de outros jogos.

## 2026-10-24 — Revisão visual v4 a partir das referências do usuário

Implementada na branch `work/city-reference-art`, baseada em `claude/fase-a-railway` no commit `1561141`. A `main` continua sendo documental; esta revisão não substitui a implementação multiplayer por uma demonstração.

Alterados palácio, materiais, terreno, vegetação, caminhos, jardins e HUD; adicionados controles reais de câmera e atualização em resize. Também removidos indicadores órfãos ao reconstruir a cidade por mudança de estágio. Estado, custos, filas e APIs de servidor preservados.

Validação: TypeScript, nove testes de layout, build cliente/servidor e harness visual Chromium com APIs de teste interceptadas. Capturas em `docs/evidence/city-v4/`. Integração PostgreSQL indisponível localmente; ver TEST_REPORT. Revisão disponibilizada para análise por PR; não implica merge ou deploy. Acabamento ainda não equivale à referência comercial; faltam assets mais ricos, densidade de prédios funcionais, animações de personagens e validação Safari físico.

## 2026-10-25 — Continuação v5: arte ilustrada dentro da cidade jogável

Integrados dois atlas originais com transparência: seis edifícios e seis elementos de ambiente. Substituem as formas vetoriais dos prédios, casas e vegetação na cena WebGL. Muralhas/adereços, lógica de câmera, APIs e simulação permanecem existentes. Texturas compartilhadas, seleção por alpha, ancoragem isométrica e fallback para SVG em falha de download.

Fonte e briefings em `docs/ART_ASSETS_V5.md`; capturas em `docs/evidence/city-v5/`. Os níveis compartilham ilustrações e variam a pegada, não três modelos 3D diferentes. Não foi adicionada batalha nem nova construção funcional.

A CI da v4 foi concluída com sucesso incluindo integração PostgreSQL: run 40141533430, commit f3f61d9. Esta continuação tem sua própria validação registrada no TEST_REPORT.

## 2026-11-11 — Centro de comando e mapa-múndi (branch `work/world-map-command-center`)

Baseada em `work/city-reference-art` (`c5f4751`). Decisão em `docs/adr/0003-mapa-mundial-motor-independente.md`.

**Entregue em código**
- Motor de mapa independente (`client/src/worldmap/engine/`): 242 países vetoriais reais, zoom (roda, pinça, botões, duplo clique), arraste, seleção por país, rótulos, cidades por nível de zoom, marcadores, rotas e camadas extras.
- Tela de comando (`client/src/command/`) na aba **Comando**: barra superior, navegação lateral, legenda, painel do território, cinco módulos, painel de guerras, layouts para desktop, tablet e celular.
- Servidor: migração 2 (`world_blocs`, `world_territories`, `world_wars`, `governors.bloc_id`), `GET /api/world`, `POST /api/world/enlist`, evento `world.updated`, cenário inicial por reino a partir de `shared/world/scenario.json`.

**Ligado a sistemas que já existiam:** sessão/logout, governador, recursos da cidade (valores e produção reais), fila de obras, ranking por poder, não lidas do chat, abas de cidade e aliança.

**Não existe no servidor e aparece como indisponível, sem dados inventados:** exércitos/aviação/marinha, pesquisa, construção em territórios, declaração de guerra, diplomacia, espionagem, missões, loja, posse de país por jogador, tropas e produção por território. Os recursos mostrados são os da economia atual (alimento, madeira, pedra, ouro), não ouro/dinheiro/petróleo/população do briefing.

**Pendências**
- [ ] CI (typecheck, integração com Postgres, build) — não executável no ambiente em que isto foi escrito; ver TEST_REPORT.
- [ ] Decisão de produto: o jogo migra do tema medieval para o geopolítico? Blocos do cenário e alianças de jogadores viram um sistema só?
- [ ] Nova economia (dinheiro, petróleo, população) se o tema migrar.
- [ ] Tornar a aba Comando a tela de abertura (hoje a abertura continua sendo a cidade para não quebrar o E2E existente).
- [ ] Teste em iPhone/Safari físico e medição de FPS.

### 2026-11-11 — Entrada rápida no lugar da tela de login

A pedido, o jogo deixou de abrir no formulário de login: cria uma conta de comandante pelas rotas de cadastro existentes e abre direto na aba Comando. As credenciais geradas ficam no navegador (`localStorage`), então a conta se perde se os dados do site forem apagados. O formulário continua em `/?login=1` e após "Sair"; os testes E2E usam esse caminho. A CI de `c894089` passou (typecheck, integração com Postgres, build).

## 2026-11-11 — Nova visão, Fase A: fundar no mapa e expandir (branch `claude/fase-a-capital-expansao`)

Baseada em `work/world-map-command-center` (`5ca2115`). Decisões em `docs/adr/0004-regioes-como-unidade-de-conquista.md`; fórmulas em `docs/PLAY_RULES.md`.

**Entregue e funcionando de ponta a ponta**
- [x] Tela inicial, seleção de modo (Campanha aberta; Partida rápida e Equipe bloqueadas com o motivo) e tela de identidade: nome, 16 cores, 12 bandeiras prontas, editor e envio de imagem validado.
- [x] Mapa neutro com 279 pontos de partida; tocar mostra capital, país, área inicial, fronteiras e prévia tracejada; CONFIRMAR LOCALIZAÇÃO funda a nação no servidor.
- [x] Fundação animada: feixe de luz, cor se espalhando a partir da capital, bandeira fincada, som.
- [x] Expansão para regiões neutras vizinhas com duração do servidor; preenchimento progressivo sincronizado com o relógio do servidor; clarão, bandeira e som na conclusão.
- [x] Domínio de país (100% das regiões) com bandeira no país e aviso.
- [x] HUD: nação e nível, regiões e países, meta atual, Território / Expandir / Ranking, ocupação em andamento, configurações (música, efeitos, mudo, reduzir animações, sair).
- [x] Tempo real entre jogadores do mesmo mundo (`play.nation`, `play.occupation`, `play.region`) e releitura ao reconectar.

**Não existe ainda (e não aparece como se existisse):** recursos e produção, construções, ferrovias, exército, ataques a outras nações, mísseis, diplomacia da nova visão, temporada de 10 dias, partida rápida, equipes, travessia marítima.

**Dívidas**
- [ ] O único custo de expandir é o tempo (ver PLAY_RULES).
- [ ] Jogadores em ilhas não têm para onde expandir até existir Marinha (o cartão do ponto avisa antes).
- [ ] Governador e cidade clássicos ainda são criados para cada jogador.
- [ ] Sem moderação de imagens de bandeira; contas de início rápido são descartáveis.
- [ ] Teste em iPhone/Safari físico e medição de FPS em aparelho.

## 2026-11-11 — Medieval removido, Fase B e Partida Rápida com bots

Mesma branch (`claude/fase-a-capital-expansao`). Decisões em `docs/adr/0005-economia-e-partida-rapida.md`; regras em `docs/PLAY_RULES.md`.

**Removido:** todo o jogo medieval (cidade, civilizações, mapa do reino, centro de comando com blocos), seus testes e a documentação da visão antiga. Alianças e chat continuam no servidor, sem interface. Tabelas antigas ficam no banco sem uso.

**Fase B — entregue**
- [x] Seis recursos (dinheiro, materiais, metal, petróleo, componentes, especiais) e energia como oferta × demanda; cada um com finalidade.
- [x] Produção automática do território e das construções, acertada pelo relógio do servidor, com estoque máximo, retorno decrescente por nível e jazidas por região.
- [x] Sete construções (cidade, depósito, fábrica, usina, porto, refinaria, centro tecnológico), níveis 1–5, custo e tempo progressivos, até 2 obras simultâneas, espaços por região, porto só no litoral.
- [x] Painel de construção com nome, ícone, nível, custo (em vermelho o que falta), tempo, produção prevista, benefícios e CONSTRUIR/MELHORAR.
- [x] Construções no mapa com ícone próprio, anel de progresso da obra e salto de conclusão; som de canteiro e de obra pronta.
- [x] HUD: recursos ao vivo no topo, painel de economia, botão Construções no dock, metas de construção.
- [x] Expansão passa a custar recursos.

**Partida rápida — entregue**
- [x] Mundo próprio com arena de 40 regiões em um de 8 teatros, 3 bots que jogam pelas mesmas regras, 15 minutos, ritmo acelerado.
- [x] Vitória por maioria ou por regiões ao fim do tempo; abandono resolve a partida; expira sem fundação; classificação gravada e tela de fim de partida.
- [x] Um usuário pode estar na campanha e numa partida rápida ao mesmo tempo (migração 4).

**Pendências**
- [ ] Ferrovias, conexões e bônus logístico (Fase C).
- [ ] Vitória por 100% do território depende de ataques (Fase E).
- [ ] Temporada de 10 dias da campanha e modo Equipe (Fase G).
- [ ] Numa função serverless, bots e fim da partida avançam enquanto alguém está com a partida aberta.
- [ ] Remover `pixi.js` e `@fontsource/cinzel` do `package.json` e regenerar o lock num ambiente com acesso ao npm.
- [ ] Apagar as tabelas do jogo medieval numa migração própria.
- [ ] Teste em iPhone/Safari físico e medição de FPS.

## 2026-11-11 — Construção por toque em qualquer ponto e desempenho

**Construção mais rápida**
- [x] Barra de construções fixa embaixo: escolher o tipo e tocar no mapa. Dois toques por construção, sem abrir cartão nem folha. A barra fica aberta para várias obras seguidas e mostra custo, tempo e produção do tipo escolhido.
- [x] Posição livre dentro do território, gravada em longitude/latitude (migração 5). O servidor valida o ponto pelo polígono da região, distância mínima de 25 km e espaços por área.
- [x] Prévia no mapa enquanto o dedo/mouse passa: o ícone fica verde onde pode construir e vermelho onde não pode, com o motivo ao tocar.
- [x] Bots usam as mesmas regras, escolhendo um ponto livre dentro da própria região.

**Desempenho**
- [x] Mapa base (terra, fronteiras, litoral, nomes) desenhado uma vez numa camada em cache; arrastar e dar zoom só reposiciona essa imagem e redesenha nítido quando o gesto para.
- [x] Nível de detalhe das linhas conforme o zoom; sem `shadowBlur`; vinheta em CSS; cache de medidas de texto.
- [x] O mapa só redesenha quando algo muda ou há animação ativa.
- [x] Interface React atualiza só os pequenos componentes com relógio (recursos, relógio da partida, obras), não a tela inteira.
- [x] Medição no navegador automatizado (celular, DPR 3): de 3 fps para 60 fps parado e arrastando, 36 fps no zoom por roda (ver TEST_REPORT).

## 2026-11-11 — Fase C: Logística

Decisões em `docs/adr/0006-logistica-derivada.md`; regras em `docs/PLAY_RULES.md`.

- [x] Ferrovias automáticas entre construções próprias a até 300 km, em regiões iguais ou vizinhas, pelo menor traçado (sem poluir o mapa).
- [x] Bônus de produção por trecho (+4%, +1% por nível do lado mais fraco, teto de 15%) e +50% de estoque para depósito/porto ligado.
- [x] Conexão entre aliados: fábrica ↔ cidade/porto aliado, +5% para os dois. Servidor acerta o saldo de todos os afetados antes de entrar/sair da aliança; testado com banco real.
- [x] No mapa: trilho claro com dormentes (de perto), desenhado aos poucos com uma luz na ponta quando surge; conexão entre aliados em tracejado dourado; som de vagão.
- [x] Prévia ao construir (mouse): linhas verdes mostram os trechos que vão surgir naquele ponto.
- [x] Painel da construção mostra trechos e bônus; painel de economia mostra a rede logística.
- [x] Metas de ferrovia; bots ligam suas construções pelas mesmas regras.

**Pendências**
- [ ] Botão de pedir aliança no jogo (Fase F). Até lá a conexão entre aliados existe e é testada no servidor, mas o jogador não tem como formar aliança pela tela.
- [ ] Prévia de trechos no toque (celular): hoje o toque já constrói; a prévia aparece só com mouse.

## 2026-11-11 — Fase D: Sistema militar

Regras em `docs/PLAY_RULES.md` (seção Sistema militar); migração 6 (`military`, `army`, `training`, `research`).

- [x] Formação de exército progressiva: recrutas crescem sozinhos; sem base militar só infantaria, 3× mais lenta.
- [x] Seis instalações militares no mesmo fluxo de construção (base militar, centro de treinamento, produção militar, base aérea, base naval, centro de defesa).
- [x] Oito unidades (infantaria, mecanizados, blindados, artilharia, forças especiais, defesa terrestre, aviação, marinha) com custo, recrutas, tempo, ataque, defesa e manutenção.
- [x] Treinamento em fila de até 3 lotes, concluído pelo relógio do servidor; manutenção descontada da produção.
- [x] Pesquisa militar com 10 tecnologias e 3 níveis, no centro tecnológico.
- [x] Poder militar calculado pelo servidor, público no ranking e no cartão da nação, com detalhamento para o dono.
- [x] Tela Exército (novo botão no dock), avisos e sons de tropas prontas e pesquisa concluída; ícones vetoriais próprios para instalações e unidades.
- [x] Bots constroem instalações e treinam pelas mesmas regras.

**Fora desta fase (Fase E):** ataques, escolha de porcentagem das tropas, batalhas, ocupação de território inimigo, mísseis e interceptação. Nenhum botão de ataque aparece.
