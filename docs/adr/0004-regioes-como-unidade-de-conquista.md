# ADR 0004 — Nova visão: nações fundadas no mapa e regiões como unidade de conquista

**Data:** 2026-11-11 · **Status:** aceito (branch `claude/fase-a-capital-expansao`)

## Contexto

A visão oficial do jogo mudou: cenário contemporâneo, mapa-múndi real que começa neutro, o jogador escolhe uma capital, recebe uma pequena área e expande. Isso responde à pendência da ADR 0003 (o jogo migra do tema medieval? sim) e torna obsoletos os blocos de cenário (OTAN, Pacto…) como ponto de partida.

## Decisões

1. **Unidade de conquista = região real.** Estados e províncias do Natural Earth, com as muito pequenas fundidas. "Pequena área inicial" é a região da capital; "ocupação de 0 a 100%" vale tanto para a região em andamento (tempo) quanto para o país (área).
2. **Topologia única.** `tools/build-regions.mjs` monta arcos compartilhados; países passam a ser a união das regiões. Vizinhos usam a mesma linha, a vizinhança sai da geometria e cada divisa é desenhada uma vez.
3. **`kingdoms` = mundos de jogo.** Cada linha é uma partida/mundo com `mode`. Reaproveita isolamento, chat e alianças que já eram por reino.
4. **Servidor autoritativo com conclusão preguiçosa.** Ocupações têm início e fim no banco e são concluídas por worker, leitura ou novo pedido, com `FOR UPDATE SKIP LOCKED`. Funciona em processo longo (Railway) e em função (Vercel).
5. **Motor do mapa continua independente.** Ganhou `setTopology`, `setTerritories`, `setFills`, `setPoints`, `setFlags`, `playEffect`; não conhece nações nem regras.
6. **Só controles que funcionam.** Modos inexistentes aparecem bloqueados com o motivo; Construções, Exército, Logística e Pesquisa entram no HUD quando existirem.
7. **Áudio sintetizado** (Web Audio), sem arquivos nem dependências novas.

## Consequências

- O jogo clássico (cidade medieval, comando com blocos) fica acessível só em `/?login=1` e não é mais baixado no fluxo principal. Removê-lo é decisão de produto pendente.
- Todo jogador ainda recebe um governador e uma cidade clássica ao entrar (as tabelas antigas exigem). É dívida a quitar quando a nova economia substituir a antiga.
- Os ids das regiões ficam no banco: mudar os parâmetros de fusão exige migração.
- Contas criadas pelo botão de início continuam descartáveis (credenciais no navegador).
- Imagens de bandeira enviadas não passam por moderação.
