# ADR 0005 — Fim do jogo medieval, economia autoritativa e partida rápida com bots

**Data:** 2026-11-11 · **Status:** aceito (branch `claude/fase-a-capital-expansao`)

## Contexto

O usuário pediu: apagar o jogo medieval antigo, fazer a Fase B (recursos, produção, construções) e ligar a Partida Rápida, com bots por enquanto.

## Decisões

1. **Medieval removido do código e da documentação.** Cidade isométrica, civilizações, mapa do reino 120×120, centro de comando com blocos, os testes e a documentação da visão antiga saíram. As tabelas antigas continuam no banco, sem uso: apagá-las é irreversível e deve vir numa migração própria quando nenhum deploy antigo as ler. As dependências `pixi.js` e `@fontsource/cinzel` continuam no `package.json` (sem uso) porque o ambiente não regenera o `package-lock.json`.
2. **Alianças e chat ficam no servidor, sem interface.** São a base da diplomacia (Fase F) e da comunicação do modo Equipe; os testes continuam passando.
3. **Um usuário, vários mundos.** `governors` passa a ser "lugar do usuário num mundo" (um por mundo; bots sem usuário). O mundo de cada requisição vem do cabeçalho `X-KU-World` e, no tempo real, de `/ws?world=`. Sem cabeçalho, vale a campanha.
4. **Saldo por acerto no tempo.** `nation_resources` guarda valor e instante; a produção é calculada das regiões e construções pela mesma função do cliente (`computeEconomy`). Isso evita escrever saldo a cada segundo e funciona offline.
5. **Partida rápida = mundo novo com arena.** Arena determinística por teatro; vitória por maioria ou por regiões ao fim do tempo, porque sem ataques ninguém chega a 100%.
6. **Bots no servidor, pelas mesmas portas.** Chamam `TerritoryService.expand` e `EconomyService.build`; não há regra especial para eles. São movidos pelo worker e também pela leitura do estado da partida, para andarem onde o processo não fica vivo (Vercel).

## Consequências

- Migração 4 aplicada pela prévia no banco compartilhado: acrescenta colunas e tabelas e remove a unicidade de `governors.user_id` (substituída por usuário + mundo). Nenhum dado é apagado.
- Numa função serverless, os bots e o fim da partida dependem de alguém estar com a partida aberta (o cliente relê o estado a cada poucos segundos). Num processo contínuo (Railway, Docker) o worker cuida disso sozinho.
