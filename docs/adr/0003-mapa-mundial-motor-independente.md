# ADR 0003 — Mapa mundial como motor independente da interface

**Data:** 2026-11-11 · **Status:** proposto (branch `work/world-map-command-center`, aguardando CI)

## Contexto

O briefing do centro de comando pede um mapa-múndi real (países individuais, zoom, arraste, seleção) e exige que o mapa seja independente da interface, para que zoom regional, cidades selecionáveis, tropas e invasões entrem depois sem reconstruir a tela.

## Decisão

Três camadas que não se importam entre si, mais uma tela que as compõe:

| Camada | Onde | Conhece |
|---|---|---|
| Geometria | `client/public/world/*.json`, gerada por `tools/build-world-data.mjs` | só formas (Natural Earth 1:50m simplificado) |
| Motor do mapa | `client/src/worldmap/engine/` | canvas, câmera, entrada; **não** conhece React, HUD nem regras |
| Dados e regras | `shared/world/` (países, cenário, `territoryActions`) e `server/src/services/world.ts` | **não** conhece desenho |
| Tela | `client/src/command/` | compõe as três e lê `/api/world` |

- **Renderização:** Canvas 2D próprio, sem dependência nova. 242 países viram `Path2D` uma vez; cada quadro só redesenha quando algo muda (ou quando há rota/disputa animada). Nenhum elemento DOM por país. D3 e MapLibre foram avaliados e dispensados nesta etapa: D3 acrescentaria ~60 KB para uma projeção que cabe em 15 linhas, e MapLibre exige ladrilhos e WebGL que o jogo ainda não precisa. A projeção é uma interface (`Projection`), então trocar por Mercator para ladrilhos regionais não altera o resto.
- **Projeção:** Miller cilíndrica — retangular (pan/zoom simples) e com menos exagero polar que Mercator.
- **Extensão:** o motor recebe dados (`setCountryStyles`, `setCities`, `setMarkers`, `setRoutes`) e aceita camadas (`addLayer`) com `minZoom`/`maxZoom`. Cidades já aparecem por nível de zoom. Tropas e frentes de invasão entram como marcadores, rotas ou camadas, sem tocar na tela.
- **Servidor é a fonte de controle territorial:** `world_blocs`, `world_territories`, `world_wars` por reino (migração 2). O cliente só lê. A única rota de escrita é o alistamento; `WorldService.setControl` existe para os futuros sistemas de combate/diplomacia e publica `world.updated`.
- **Ações por território:** `territoryActions` em `shared/world` é a mesma função no cliente (explicar) e no servidor (autorizar). Enquanto exércitos, guerras, diplomacia e espionagem não existem (`WORLD_SYSTEMS`), as ações aparecem bloqueadas com o motivo.

## Consequências

- A tela nova entra como aba **Comando**; cidade, mapa do reino, alianças e chat ficam como estavam.
- O jogo passa a ter dois mundos visuais (cidade medieval e comando moderno) e dois conceitos de "aliança" (alianças de jogadores e blocos do cenário). Unificar é decisão de produto, não desta ADR.
- Bandeiras (flag-icons, MIT) e geometria (Natural Earth, domínio público) ficam versionadas em `client/public/`; regenerar com `npm run world:data -- <dir-natural-earth> <dir-bandeiras>`.
