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

### Logística e ferrovias (Fase C)

Regras em `shared/play/logistics.ts`, usadas pelo servidor (produção) e pelo cliente (mapa e painéis).

- **Ferrovia automática, sem custo:** duas construções concluídas (nível ≥ 1) da mesma nação se ligam quando estão a até **300 km** e em regiões iguais ou vizinhas (a ferrovia não cruza o mar nem salta regiões).
- **Traçado discreto:** a nação usa a menor árvore que liga tudo o que é alcançável (Kruskal; empates pelos ids). Três construções em linha têm dois trechos, não três.
- **Bônus de produção:** cada trecho dá **+4%** às duas pontas, mais **+1% por nível** acima de 1 do lado mais fraco; teto de **+15%** por construção.
- **Distribuição:** depósito ou porto ligado à rede guarda **+50%** da sua capacidade.
- **Aliados:** cada fábrica concluída se liga à cidade ou porto concluído mais próximo de outra nação da mesma aliança (mesmas regras de alcance e vizinhança): **+5%** para as duas pontas, fora do teto.
- A rede não é guardada no banco: é derivada das construções a cada cálculo. Antes de uma obra do nível 0→1 terminar, e antes de alguém entrar ou sair de uma aliança, o servidor acerta o saldo de todos os afetados (a nação e os membros da aliança, em ordem crescente de id) com a produção antiga.
- Metas novas: "Ligar duas construções por ferrovia" e "Ter 6 trechos de ferrovia".

### Sistema militar (Fase D)

Regras em `shared/play/military.ts` (servidor aplica, cliente mostra). Combate é da Fase E.

**Instalações militares** (construídas como as demais: barra de construções + toque no mapa; não produzem recursos):

| Instalação | Custo (nível 1) | Tempo | Energia | Efeito |
|---|---|---|---|---|
| Base militar | $900, 600 materiais, 200 metal | 60 s | 2 | Ativa o treino normal; +30 recrutas/h e +250 de teto por nível; libera mecanizados (com pesquisa) |
| Centro de treinamento | $1.000, 500 materiais, 250 metal | 75 s | 2 | −12% no tempo de treino por nível; +15 recrutas/h; libera forças especiais |
| Instalação de produção militar | $1.400, 700 materiais, 500 metal, 150 petróleo | 90 s | 3 | Libera blindados e artilharia |
| Base aérea | $1.800, 900 materiais, 600 metal, 400 petróleo | 120 s | 3 | Libera aviação |
| Base naval (litoral) | $1.600, 800 materiais, 700 metal, 300 petróleo | 120 s | 2 | Libera marinha |
| Centro de defesa | $1.000, 700 materiais, 300 metal | 70 s | 2 | Libera defesa terrestre; +10% de defesa por nível |

**Recrutas:** crescem sozinhos, como os recursos: 8/h sem instalações, +30/h por nível de base militar, +15/h por nível de centro de treinamento (× ritmo econômico do modo). Teto: 150 + 60 por nível de cidade + 250 por nível de base militar. Nação nova começa com 40. Acertados junto com o saldo, na mesma transação.

**Unidades** (por unidade; manutenção por hora, campanha):

| Unidade | Custo | Recrutas | Tempo | Ataque | Defesa | Manutenção | Exige |
|---|---|---|---|---|---|---|---|
| Infantaria | $30 | 1 | 1,5 s (×3 sem base militar) | 1 | 1,2 | $3 | — |
| Mecanizados | $80, 20 metal, 8 petróleo | 1 | 4 s | 3 | 3 | $5 + 1 petróleo | Base militar + Motorização |
| Blindados | $260, 110 metal, 30 petróleo | 3 | 10 s | 12 | 9 | $10 + 4 petróleo | Produção militar + Blindagem composta |
| Artilharia | $200, 80 metal, 12 petróleo | 4 | 8 s | 10 | 3 | $7 + 1 petróleo | Produção militar |
| Forças especiais | $180, 6 componentes | 1 | 12 s | 8 | 6 | $12 | Centro de treinamento + Operações especiais |
| Defesa terrestre | $140, 60 materiais, 40 metal | 2 | 6 s | 1 | 12 | $4 | Centro de defesa |
| Aviação | $700, 240 metal, 150 petróleo, 20 componentes | 2 | 30 s | 34 | 16 | $28 + 12 petróleo | Base aérea + Caças a jato |
| Marinha | $1.000, 450 metal, 180 petróleo, 12 componentes | 12 | 40 s | 32 | 34 | $34 + 14 petróleo | Base naval + Engenharia naval |

- **Criação na hora** (pedido do dono do jogo): com a instalação exigida e os recursos, as unidades entram no exército no mesmo pedido, de 1 a 500 por vez. Sem fila, sem tempo de treinamento, sem recrutas e sem pesquisa obrigatória; a pesquisa só dá bônus. As colunas de tempo e recrutas da tabela abaixo ficaram sem uso.
- **Manutenção** sai da produção por hora. Se passar da produção, o estoque cai até zero (nunca negativo) e o painel avisa.
- Antes de um lote ou pesquisa terminar, o saldo é acertado até o fim com a manutenção antiga.

**Pesquisa** (exige centro tecnológico concluído; uma de cada vez; até o nível 3; custo dobra e tempo ×1,8 por nível): Doutrina de infantaria (+10%/nível infantaria e especiais), Motorização (libera mecanizados; +8%), Blindagem composta (libera blindados; +8% blindados e mecanizados), Balística (+10% artilharia), Operações especiais (libera especiais; +10%), Fortificação (+8% de defesa de todo o exército), Caças a jato (libera aviação; +8%), Engenharia naval (libera marinha; +8%), Logística militar (−10% de manutenção/nível), Métodos de treinamento (−10% no tempo de treino/nível).

**Poder militar** (público, no ranking e no cartão da nação):
- Por unidade: ataque × (1 + pesquisa) e defesa × (1 + pesquisa) × (1 + fortificação + centro de defesa).
- Poder = (soma dos ataques + soma das defesas) ÷ 2 + 40 por nível de instalação militar, arredondado.
- O dono vê o detalhamento: ataque, defesa, tropas e a parte de cada grupo (tropas, blindados e artilharia, aviação, marinha, defesa, infraestrutura) e quanto a tecnologia soma.

**Bots:** constroem base militar (a partir de 3 construções) e centro de defesa (a partir de 5) e treinam com os recrutas disponíveis, gastando até 40% do dinheiro por vez.

### Guerra (Fase E)

Regras em `shared/play/war.ts` (servidor aplica; a tela usa as mesmas funções para estimar). Migração 7 (`operations`, `strikes`, `military.troops`).

**Ataque terrestre ou naval**
- Alvo: região de outra nação, que não seja aliada. A região da capital também pode ser tomada, mas defende 50% mais.
- Nação que perde todas as regiões é derrotada. Na campanha, volta à escolha do ponto de partida e pode fundar uma nação nova (a antiga sai do mundo). Na partida rápida, o jogador derrotado perde a partida.
- Origem: região sua com fronteira terrestre; ou, com pelo menos 1 navio, região litorânea sua a até 700 km de um alvo litorâneo (ataque naval, que também leva os navios). Com navios, a expansão para regiões neutras litorâneas segue a mesma regra.
- Porcentagem enviada: 25%, 50%, 75% ou 100% (nada abaixo de 25%), a mesma de cada tipo de unidade, arredondada para baixo. Mísseis nunca vão; navios só em operação naval.
- Até 2 operações de ataque por nação e 1 operação por região.
- Defesa automática: o defensor engaja 1/√(número de regiões dele) das tropas em casa (sem navios). Toda região tem ainda uma resistência local de 3.

**Combate determinístico, passo de 1 segundo** (nenhum sorteio):
- A = ataque das tropas restantes (com pesquisa); D = defesa das tropas restantes × (1 + fortificação + centros de defesa) + 3; r = A ÷ (A + D).
- Ocupação += (2r − 1) ÷ tempo-base (mínimo 0). Tempo-base = 40 s + 1 s por 12.000 km² da região, entre 40 e 180 s, ÷ ritmo do modo.
- Baixas por passo: atacante perde 0,9 × (1 − r)^1,5 ÷ tempo-base de cada tipo; defensor perde 0,9 × r^1,5 ÷ tempo-base. Sem resistência, as perdas são quase nulas.
- Vitória ao chegar a 100%: a região, a bandeira e as construções dela passam ao atacante.
- Fracasso se o ataque cair abaixo de 10% do inicial ou passar de 3× o tempo-base.
- Sobreviventes dos dois lados voltam para casa ao fim. A manutenção das tropas enviadas continua até o fim da operação; o saldo dos dois lados é acertado no instante do fim, antes de as baixas pararem de custar.
- O servidor guarda só o início e os acontecimentos (reforços, mísseis) e simula de novo quando precisa; o fim previsto (`ends_at`) é recalculado a cada acontecimento.

**Defesa e contra-ataque:** o defensor é avisado (som e aviso vermelho com o progresso). Pode enviar 25–100% das tropas em casa para reforçar a região, contra-atacar a região de origem (se for atacável) e lançar míssil nela.

**Inteligência (público):** poder militar e tropas estimadas (2 algarismos significativos) de cada nação; defesa estimada de uma região = poder do dono ÷ √(regiões do dono). Risco do ataque: baixo (ataque ≥ 3× defesa estimada), médio (≥ 1,5×), alto (abaixo).

**Mísseis**
- **Com o silo pronto, já ataca:** sem pesquisa e sem estoque. Cada lançamento paga o seu custo. Silo: $2.200, 1.000 materiais, 800 metal, 400 petróleo, 60 componentes; 150 s.
- Duas armas: **Míssil** ($500 + 80 petróleo; alcance 2.500 km + 750 km por nível do silo; voo 1.500 km/min) e **Bomba pesada** ($1.000 + 150 metal + 150 petróleo; 60% do alcance; voo 900 km/min; o dobro do estrago).
- Um lançamento em voo por silo; alvo de outra nação, não aliada (capital incluída). Atalho: no cartão de uma região inimiga no alcance, "Míssil ou bomba".
- Tempo: 2,2 s de preparação e abertura do silo, depois o voo (mínimo 20 s), ÷ ritmo do modo.
- Interceptação: 20% por nível de sistema antimísseis do alvo + 10% por nível da pesquisa Interceptação, até 85%; sem antimísseis, 0. Decidida no lançamento com um sorteio reproduzível pelo id do lançamento (qualquer um pode conferir), e acontece a 85% do trajeto.
- Impacto do míssil: a maior construção concluída da região perde 1 nível (chegando a 0, é destruída); o alvo perde 6% de cada tipo de tropa em casa; tropas do alvo engajadas naquela região (ou que partiram dela para atacar) perdem 25%, e a batalha é recalculada. Bomba pesada: 2 níveis, 12% e 40%.
- Sistema antimísseis: $1.500, 600 materiais, 500 metal, 40 componentes; 100 s.

**Bots:** reforçam uma vez cada região atacada (50% das tropas em casa) e, passados 4 minutos de partida, atacam com 50% a região inimiga vizinha mais fraca quando o ataque passa de 2,5× a defesa estimada. Bots não lançam mísseis.

### Autoridade do servidor

O saldo é guardado como "valor num instante" (`nation_resources.settled_at`). Antes de qualquer mudança que altere a produção (região ganha, obra concluída) ou o saldo (gasto), o servidor acerta o saldo até aquele instante com a produção antiga. Obras e ocupações terminam pelo relógio do banco, por três caminhos equivalentes (worker, leitura, novo pedido), com `FOR UPDATE SKIP LOCKED`. O cliente nunca envia custo, nível, duração ou saldo; quando envia, é ignorado.

**Ainda não existe:** manutenção de unidades (Fase D), centro de distribuição (Fase C).

## Partida rápida

- Mundo próprio criado sob demanda: o jogador e **3 nações controladas pelo servidor**.
- **Arena:** as 40 regiões mais próximas do centro de um de 8 teatros (Brasil Central, Europa Central, China Oriental, Costa Leste da América do Norte, África Austral, Norte da Índia, Mesoamérica, Levante e Nilo), sorteado. O resto do mapa fica apagado; expansão e fundação só dentro dela.
- **Sem prazo:** a partida começa na fundação do jogador e vai até a conquista. Sem fundar em 10 minutos, a partida expira sem vencedor. O relógio na tela mostra o tempo de partida.
- **Ritmo:** tempos ÷ 3, produção × 12.
- **Vitória (visão):** vence quem controlar **100% das regiões da arena**. Ter mais da metade ou ocupar todas as neutras não encerra: a guerra continua.
- **Derrota:** o jogador que perder todas as regiões perde a partida na hora e fica em último.
- Classificação gravada: regiões da arena (empate: maior área; depois, quem fundou antes).
- **Abandono:** encerra a partida na hora e põe quem saiu em último. A partida nunca fica sem resolução: termina na conquista total, na derrota do jogador ou no abandono.
- **Bots:** a cada 3–7 s, cada bot tenta construir (cidade na capital, usina se faltar energia, fábrica, cidades nas demais regiões, melhorias) e ocupar uma região vizinha neutra (prefere fechar o próprio território e regiões menores). Usam os mesmos serviços e regras de um jogador.
- Resultado gravado em `match_results`.

## Diplomacia (Fase F)

Regras em `shared/play/diplomacy.ts`; o servidor (`server/src/services/diplomacy.ts`) decide tudo.

- **Pedido de aliança:** no cartão do território de outra nação (ou no painel Diplomacia), *Solicitar aliança*. O outro lado aceita ou recusa; só depois de aceito a aliança vale. O pedido vence em 24 h na campanha e em 10 min na partida rápida. Se a outra nação já tinha pedido a você, pedir de volta forma a aliança na hora.
- **Formação:** se nenhum dos dois tem aliança, nasce uma com o nome das duas nações (quem pediu lidera). Se um já tem, o outro entra nela. Nações em alianças diferentes não se aliam sem antes uma sair.
- **Aliados:** não se atacam (terra e mísseis), ligam as ferrovias (Fase C), enviam recursos e mandam tropas para as batalhas um do outro.
- **Envio de recursos:** dinheiro, materiais, metal e petróleo chegam na hora. Só chega (e só é cobrado) o que cabe no armazém de quem recebe.
- **Ajuda nas batalhas:** um aliado do defensor manda 25–100% das tropas em casa para defender; um aliado do atacante entra no ataque (num ataque naval, só navios). As tropas de cada lado somam na batalha; no fim, os sobreviventes de cada lado voltam a quem mandou, na proporção do que cada um mandou de cada tipo. A manutenção das tropas enviadas segue com quem mandou até o fim.
- **Quebra:** romper tem penalidade automática, registrada no servidor (`alliance_breaks` e `audit_logs`): −10% de cada tipo de tropa em casa, −20% de cada recurso e 30 minutos sem poder atacar os antigos aliados. Os antigos aliados são avisados. Com um só membro restante, a aliança é dissolvida. Sair pela rota antiga (`/alliance/leave`) também é quebra, com a mesma penalidade.
- **Bots (partida rápida):** respondem na hora por regra fixa: recusam quem está em guerra com eles (operação ou míssil em andamento entre os dois), quem já rompeu uma aliança com eles na partida e a nação mais forte da partida (por poder); aceitam os demais. Bots não atacam aliados nem quem eles abandonaram há menos de 30 min, e ajudam uma vez (25% das tropas em casa) a defender um aliado atacado.
- **Vitória na partida rápida:** continua sendo conquistar 100% da arena sozinho; aliados ocupando regiões impedem a vitória até a aliança acabar.
