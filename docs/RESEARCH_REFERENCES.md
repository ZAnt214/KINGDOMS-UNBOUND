# REFERÊNCIAS E CRITÉRIOS DE PESQUISA

> Este arquivo é uma lista de fontes a consultar e um protocolo de verificação. Não declara que todas as mecânicas foram verificadas em outubro de 2026.

## Fontes iniciais

- Site oficial de Rise of Kingdoms: https://rok.lilith.com/
- Google Play, ficha pública: https://play.google.com/store/apps/details?id=com.lilithgame.roc.gp
- Wiki comunitária: https://riseofkingdoms.fandom.com/wiki/Rise_of_Kingdoms_Wiki

## Áreas para investigar

- Edifícios, níveis, pré-requisitos, filas, aceleração.
- Economia, armazenamento, nós de coleta, pontos de ação.
- Tecnologias, bônus, progressão e atributos.
- Comandantes, raridade, talentos, skills, equipamento.
- Tropas T1–T5, formação e especializações.
- Movimento livre e múltiplas marchas no mapa.
- Exploração, batedores, fog of war.
- PvE, PvP, guarnições, ataques coordenados e relatórios.
- Formação de alianças, cargos R1–R5, ajuda, doação e presentes.
- Bandeiras, fortalezas, domínio e conexões territoriais.
- Objetivos de reino, passagens, templos e política do rei.
- Chat do reino e da aliança, canais, correio, compartilhamento de coordenadas.
- KvK, mapas especiais, temporadas, eventos, ranking e migração.
- UI e performance em dispositivos móveis.

## Planilha de análise recomendada

Para cada referência registrar: funcionalidade, URL exata, categoria da fonte (oficial ou comunidade), data de publicação/atualização, versão de jogo, resumo do comportamento, confiança, screenshots permitidos como referência e decisão para KINGDOMS UNBOUND.

Marcar cada conclusão:
- **FONTE CONFIRMADA:** documentação ou demonstração inequívoca e atual.
- **COMUNIDADE/INCERTO:** precisa de confirmação.
- **DECISÃO ORIGINAL:** sistema próprio, sem pretender precisão literal do jogo original.

## Observação jurídica e artística

Buscar fidelidade às **mecânicas estratégicas gerais**, não copiar expressão protegida: imagens, trilha, logos, mapas, layout idêntico, texto proprietário, personagens, asset packs extraídos ou código. Identidade de KINGDOMS UNBOUND será original.

## Pesquisa técnica complementar

Comparar PixiJS/WebGL/Canvas, arquitetura authoritative server, WebSocket gateway, PostgreSQL/Redis, chunks e spatial interest management, reidratação offline, workers, padrões de idempotência, auth e PWA iOS. Verificar documentação atual das bibliotecas escolhidas no momento da implementação.


## Consulta durante a implementação — 2026-10-24

| Fonte | Resultado verificável | Classificação / uso |
|---|---|---|
| https://rok.lilith.com/ | Página oficial acessada; conteúdo textual recuperável insuficiente para regras detalhadas | Referência de produto; NÃO confirma números de construções/alianças |
| https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html | Documentação oficial da linha 24 localizada; node:sqlite executado localmente em 24.22.1 | Fonte técnica + validação direta: banco em disco e APIs DatabaseSync |
| https://developer.mozilla.org/en-US/docs/Web/API/EventSource | Documenta conexão HTTP persistente para eventos enviados pelo servidor | Fonte técnica para SSE; implementação validada por sockets HTTP reais |

Custos, tempos, civilizações, mapa e regras de visibilidade nesta entrega são DECISÕES ORIGINAIS descritas no ADR, não números extraídos ou apresentados como confirmação de Rise of Kingdoms. Pesquisa aprofundada de sistemas militares/políticos segue pendente, e não foi usada para alegar fidelidade exata nesta fatia técnica.
