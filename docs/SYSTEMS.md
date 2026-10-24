# MATRIZ DE SISTEMAS E RASTREABILIDADE

Legenda de estágio: **P** planejado; **E** em execução; **T** implementado e testado; **B** bloqueado. Ao criar este documento, todos os sistemas abaixo estão **P** (sem código de jogo validado).

| Sistema | Etapa | Dependências principais | Estado |
|---|---|---|---|
| Contas, login e segurança de sessão | A | autenticação | P |
| Governador e identidade | A | contas | P |
| Civilizações iniciais | A | governador e definição | P |
| Reinos persistentes | A | governador, persistência | P |
| Cidades e posicionamento | A | reino, mapa | P |
| Construção de edifícios | A | cidade, recursos, timers | P |
| Recursos econômicos | A | ledger, governadores | P |
| Produção e timers offline | A | tempo de servidor, filas | P |
| Interface cidade 2.5D | A | estado da cidade, renderer | P |
| Mapa compartilhado | A | reino, regiões, rede | P |
| Coordenadas, pan e zoom | A | renderer, mapa | P |
| Sincronização de snapshots/deltas | A | rede, regiões, auth | P |
| Recrutamento para aliança | A | governador, alianças | P |
| Aliança, R1–R5 e permissões | A | autenticador, RBAC | P |
| Chat do reino | A | auth, reino, WebSocket | P |
| Chat de aliança | A | aliança, ACL, WebSocket | P |
| Chat global entre reinos | A | auth, moderação, escala | P |
| Histórico de chat e não lidas | A | mensagens persistidas | P |
| Reconexão iPhone/PWA | A | sync, sessao, UX | P |
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
| Antifraude e auditoria | A/E | comandos, ledger e logs | P |
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
