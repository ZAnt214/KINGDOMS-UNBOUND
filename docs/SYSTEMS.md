# MATRIZ DE SISTEMAS E RASTREABILIDADE

Legenda de estágio: **P** planejado; **E** em execução; **T** implementado e testado; **B** bloqueado. No baseline todos eram P. Atualização de 2026-10-24: E indica implementação parcial (backend e fluxo visual básico validados, critérios completos ainda pendentes); os sistemas compostos permanecem E até todos seus critérios serem cobertos.

| Sistema | Etapa | Dependências principais | Estado |
|---|---|---|---|
| Contas, login e segurança de sessão | A | autenticação | E |
| Governador e identidade | A | contas | E |
| Civilizações iniciais | A | governador e definição | E |
| Reinos persistentes | A | governador, persistência | E |
| Cidades e posicionamento | A | reino, mapa | E |
| Construção de edifícios | A | cidade, recursos, timers | E |
| Recursos econômicos | A | ledger, governadores | E |
| Produção e timers offline | A | tempo de servidor, filas | E |
| Interface cidade 2.5D | A | estado da cidade, renderer | E |
| Mapa compartilhado | A | reino, regiões, rede | E |
| Coordenadas, pan e zoom | A | renderer, mapa | E |
| Sincronização de snapshots/deltas | A | rede, regiões, auth | E |
| Recrutamento para aliança | A | governador, alianças | E |
| Aliança, R1–R5 e permissões | A | autenticador, RBAC | E |
| Chat do reino | A | auth, reino, WebSocket | E |
| Chat de aliança | A | aliança, ACL, WebSocket | E |
| Chat global entre reinos | A | auth, moderação, escala | E |
| Histórico de chat e não lidas | A | mensagens persistidas | E |
| Reconexão iPhone/PWA | A | sync, sessao, UX | E |
| Tecnologia econômica/militar | B | recursos, filas, balanceamento | P |
| Tropas e filas de treinamento | B | economia, tecnologia | P |
| Comandantes e habilidades | B | governor, combate | P |
| Equipamentos e talentos | B | comandantes | P |
| Batedores e névoa | B | mapa, marchas, visibilidade | P |
| Pathfinding e marchas | B | mapa, tropas, tempo | P |
| Nós de recursos e coleta | B | mapa, marchas, economia | P |
| PvE | B | combate, tropas, marchas | P |
| Hospitais e cura | B | PvE, filas, economia | P |
| Relatórios de combate | B | motor de combate | P |
| Missões e eventos | B | progresso, economia, social | P |
| PvP campo aberto | C | combate, marchas, segurança | P |
| Guarnição, defesa e cerco | C | PvP, cidade, estruturas | P |
| Reforços e rallies | C | combate, alianças | P |
| Ajuda coletiva | C | aliança, timers | P |
| Tecnologia e doações de aliança | C | economia, aliança | P |
| Fortalezas e bandeiras | C | mundo, alianças, economia | P |
| Conexão e fronteiras territoriais | C | estruturas e grafos | P |
| Diplomacia | C | alianças, comunicação | P |
| Governo do reino e títulos | D | território, objetivos | P |
| Passagens e objetivos centrais | D | mapa, PvP, cronologia | P |
| Eventos sazonais avançados | D | missões, rankings | P |
| KvK e mapas temporários | D | reino, campanhas, rede | P |
| Expansão de civilizações | E | balanceamento e assets | P |
| Polimento audiovisual | E | renderer, assets, UX | P |
| Administração e moderação | A/E | auth, logs, chat | P |
| Antifraude e auditoria | A/E | comandos, ledger e logs | E |
| Performance e testes de carga | A/E | instrumentação | P |

## Cadeias de interação críticas

**Construção:** ação de UI -> permissão -> custo/requisitos -> transação no banco -> tarefa -> projeção de relógio -> evento -> UI.

**Aliança:** aplicação -> aprovação com RBAC -> membro -> ACL de canal -> mensagem de chat -> snapshot/delta para envolvidos.

**Marcha:** ordem -> reserva de tropas -> validação de rota -> simulação de deslocamento -> chegada -> coleta/combate -> retorno -> disponibilidade.

**Território:** projeto -> requisitos coletivos -> estrutura construída -> grafo de conexão -> fronteira -> buffs/visibilidade -> disputas.

**Reino/KvK:** desenvolvimento do reino -> liberação de passagens -> conquista -> governo -> classificação -> temporada entre reinos.

## Critérios de rastreabilidade

Cada linha precisa no futuro de: ID de feature, issue/PR, esquema de dados, endpoint/evento, UI, teste e link de documentação. Só mudar P para T após testes concretos descritos no TEST_REPORT.

## Pesquisa versus regras próprias

O comportamento exato de Rise of Kingdoms deve ser consultado em fontes públicas atualizadas, não reproduzido como dado certo sem fonte. Este documento especifica o **escopo pretendido do nosso produto**, não uma alegação de que tudo esteja atualmente disponível.


## Cobertura concreta desta entrega

| ID | Código / contrato | Evidência | Pendência |
|---|---|---|---|
| A-IDENTITY | server.js register/login/logout; users/sessions/governors | teste A-01–03 | Safari físico, recuperação de conta |
| A-ECONOMY | game.js command build / settle / produce; ledger/queues; rules.js | A-04–06/20 e processo com relógio real | visual, cancelamento, PostgreSQL |
| A-MAP | snapshot cities filtrado pelo reino; Canvas app.js | A-07–08 HTTP/SSE | chunks/deltas, gestos validados, arte |
| A-ALLIANCE | comandos alliance.*; members/applications; PERMISSIONS | A-09–10/15–16 | convites, transferência/dissolução, configuração por aliança |
| A-CHAT | command chat; messages cursor; events SSE | A-11–16 | WebSocket, coord. clicável, não lidas persistentes, moderação |
| A-CLIENT | public/*, tests/browser.mjs | syntax PASS; browser Chromium mobile PASS | WebKit/Safari, performance |

Implementação de todos estes IDs na branch/PR `work/phase-a-core`. Nenhum ID de B–E implementado. Referência de execução: [TEST_REPORT](TEST_REPORT.md); limites arquiteturais: [ADR](ADR_001_PHASE_A.md).
