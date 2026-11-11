# Regras do jogo (Fases A e B, partida rápida)

Todos os valores abaixo ficam em `shared/play/rules.ts` (território), `shared/play/economy.ts` (economia) e `shared/play/match.ts` (partida rápida). São decisões iniciais de balanceamento, ajustáveis num único lugar. O servidor aplica; o cliente só exibe.

## Unidade de conquista

- O mundo tem **1.589 regiões** reais (estados e províncias do Natural Earth 1:10m), geradas por `tools/build-regions.mjs`.
- Regiões com menos de 12.000 km² foram fundidas à vizinha do mesmo país com a maior fronteira; países com mais de 48 regiões continuam fundindo as menores. Ilhas a mais de 450 km ficam separadas, exceto possessões com menos de 1.500 km².
- Vizinhança = fronteira terrestre compartilhada. Travessia marítima não existe nesta fase.
- **Ocupação de um país** = área das regiões do jogador ÷ área total do país. Com 100% o país é dominado e recebe a bandeira.

## Fundação

- 279 pontos de partida: 199 capitais e 80 cidades com 2,5 milhões de habitantes ou mais. Cada ponto tem uma região inicial exclusiva.
- Uma nação por jogador por mundo. Ponto, nome (sem diferenciar maiúsculas) e região inicial são únicos no mundo.
- Cor: 16 cores. Duas nações com capitais a menos de **2.500 km** não podem usar a mesma cor; se as 16 já estiverem em uso por perto, a regra é dispensada.
- Bandeira: 12 padrões × 8 emblemas × 3 cores, ou imagem PNG/JPEG de até 120×80 e 9.000 bytes. O servidor confere assinatura do arquivo, dimensões e tamanho.

## Expansão

Só para regiões **neutras** com fronteira terrestre com o território do jogador. Uma ocupação por nação e uma por região (garantido por índices únicos no banco).

```
tamanho = limitar(√(área ÷ 50.000 km²), 0,6, 3)
tempo   = limitar(20 s × tamanho × (1 + 0,12 × (regiões − 1)), 15 s, 900 s) ÷ velocidade do modo
```

| Exemplo | Regiões já controladas | Tempo (campanha) |
|---|---|---|
| Região de 50.000 km² | 1 | 20 s |
| Região de 200.000 km² | 1 | 40 s |
| Região de 50.000 km² | 11 | 44 s |
| Qualquer região muito grande com nação enorme | — | 900 s (teto) |

Ritmo do modo (`MODE_SPEED`, divide tempos de expansão e de obra): campanha 1, partida rápida 3, equipe 1,5.

**Custo da expansão** (desde a Fase B): 200 de dinheiro e 100 de materiais, +20% por região já controlada (`expansionCost`).

A ocupação começa e termina pelo relógio do banco (`started_at`, `ends_at`). É concluída por três caminhos equivalentes: worker a cada segundo, leitura do estado e novo pedido de expansão. Nenhum depende de o jogador estar conectado.

**Limitação conhecida:** a expansão ainda não exige tropas; isso entra com o exército (Fase D).

## Progressão

- Experiência = 100 × regiões + 400 × países dominados + 40 × níveis de construção.
- O nível *n* exige 120 × (n − 1)² de experiência.
- Metas (`MILESTONES`): 1, 3, 6, 12, 25, 50 e 100 regiões; 1, 4 e 10 construções; 1, 3 e 8 países. São indicadores derivados do estado real.

## Economia (Fase B)

### Recursos

| Recurso | Para que serve |
|---|---|
| Dinheiro | Toda construção e a expansão |
| Materiais de construção | Base de qualquer obra |
| Metal | Portos, refinarias, centros tecnológicos; depois, equipamento militar |
| Petróleo | Usinas e centros tecnológicos; depois, veículos e navios |
| Componentes tecnológicos | Níveis 4 e 5 de qualquer construção (15 e 30) |
| Recursos especiais | Só de regiões com jazida especial; centro tecnológico a partir do nível 2 (6 × nível) |
| Energia | Não é estocada: oferta × demanda (ver eficiência) |

Saldo inicial: 1.500 dinheiro, 1.200 materiais, 300 metal, 200 petróleo. Estoque máximo: 8.000 por recurso, +3.000 por nível de depósito, +1.500 por nível de porto. O que passa do teto não é perdido, mas para de crescer.

### Produção por hora (campanha)

```
território = capital (3.600 dinheiro, 2.400 materiais, 6 de energia) + 600/400 por outra região + jazida
construção = produção do nível 1 × nível^0,9 × (1,6 se estiver na jazida certa)
eficiência = min(1, oferta ÷ demanda de energia) × (1 + min(15%, 3% × níveis de centro tecnológico))
total      = (território + construções × eficiência) × ritmo econômico
```

Ritmo econômico (`ECONOMY_SPEED`): campanha 1, partida rápida 12, equipe 4. A partida rápida dura minutos; a campanha, dias.

Jazidas são uma regra do jogo, não dado geológico: sorteio determinístico pelo id da região (`regionDeposit`), ~18% petróleo (+480/h), ~18% metal (+480/h), ~7% especial (+120/h).

### Construções

| Construção | Faixa | Custo (nível 1) | Tempo | Nível 1 produz | Energia |
|---|---|---|---|---|---|
| Cidade | Básica | 400 $, 300 mat. | 15 s | 2.400 $, 480 mat. | consome 1 |
| Depósito logístico | Básica | 300 $, 400 mat. | 20 s | +3.000 de estoque | — |
| Fábrica | Intermediária | 600 $, 400 mat. | 30 s | 1.920 mat., 960 metal (jazida de metal +60%) | consome 2 |
| Usina de energia | Intermediária | 550 $, 300 mat., 80 petróleo | 40 s | +6 de energia | — |
| Porto (só litoral) | Intermediária | 700 $, 450 mat., 150 metal | 45 s | 1.440 $, 240 petróleo, +1.500 de estoque | consome 1 |
| Refinaria | Complexa | 800 $, 400 mat., 200 metal | 60 s | 1.440 petróleo (jazida de petróleo +60%) | consome 2 |
| Centro tecnológico | Complexa | 1.200 $, 600 mat., 300 metal, 150 petróleo | 90 s | 360 componentes, +3% de eficiência | consome 3 |

- Níveis 1 a 5. Custo × 1,6 e tempo × 1,7 a cada nível. Nível 5 de um centro tecnológico leva ~12 minutos na campanha.
- Cada construção do mesmo tipo que a nação já tem encarece a próxima em 30% (evita multiplicação infinita).
- **Posição livre.** O jogador escolhe o tipo na barra de construções e toca em qualquer ponto do próprio território; a construção fica exatamente nesse ponto (longitude/latitude). A barra continua aberta para erguer várias em sequência.
- O servidor confere o ponto com o polígono real da região (`server/src/geo.ts`, a mesma malha que o cliente desenha): fora do território → "Construa dentro do seu território."; no oceano ou fora do mapa → recusado.
- Distância mínima de 25 km entre quaisquer duas construções (`ECONOMY.minDistanceKm`).
- Espaços por região proporcionais à área: √(área / 25.000 km²), entre 2 e 6, +2 na região da capital. Pode repetir o tipo na mesma região. Até 2 obras ao mesmo tempo. Porto só em região litorânea.
- Construção nova não produz até o nível 1 terminar; em melhoria, continua produzindo no nível atual.

### Autoridade do servidor

O saldo é guardado como "valor num instante" (`nation_resources.settled_at`). Antes de qualquer mudança que altere a produção (região ganha, obra concluída) ou o saldo (gasto), o servidor acerta o saldo até aquele instante com a produção antiga. Obras e ocupações terminam pelo relógio do banco, por três caminhos equivalentes (worker, leitura, novo pedido), com `FOR UPDATE SKIP LOCKED`. O cliente nunca envia custo, nível, duração ou saldo; quando envia, é ignorado.

**Ainda não existe:** ferrovias e bônus de conexão (Fase C), manutenção de unidades (Fase D), centro de distribuição (Fase C).

## Partida rápida

- Mundo próprio criado sob demanda: o jogador e **3 nações controladas pelo servidor**.
- **Arena:** as 40 regiões mais próximas do centro de um de 8 teatros (Brasil Central, Europa Central, China Oriental, Costa Leste da América do Norte, África Austral, Norte da Índia, Mesoamérica, Levante e Nilo), sorteado. O resto do mapa fica apagado; expansão e fundação só dentro dela.
- **Relógio:** 15 minutos a partir da fundação do jogador. Sem fundar em 10 minutos, a partida expira sem vencedor.
- **Ritmo:** tempos ÷ 3, produção × 12.
- **Vitória:**
  1. imediata para quem controlar **mais da metade** das regiões da arena;
  2. ao fim do tempo, ou quando não sobrar região neutra nem ocupação em andamento, vence quem tiver mais regiões da arena (empate: maior área; depois, quem fundou antes).
  A condição do documento de visão, 100% do território, depende de ataques (Fase E): até lá, as nações não podem tomar regiões umas das outras.
- **Abandono:** encerra a partida na hora e põe quem saiu em último. A partida nunca fica sem resolução: o servidor encerra por tempo mesmo com todos desconectados.
- **Bots:** a cada 3–7 s, cada bot tenta construir (cidade na capital, usina se faltar energia, fábrica, cidades nas demais regiões, melhorias) e ocupar uma região vizinha neutra (prefere fechar o próprio território e regiões menores). Usam os mesmos serviços e regras de um jogador.
- Resultado gravado em `match_results`.
