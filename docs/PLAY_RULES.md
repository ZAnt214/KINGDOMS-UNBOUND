# Regras do ciclo territorial (Fase A)

Todos os valores abaixo ficam em `shared/play/rules.ts` (`PLAY_RULES_VERSION = 1`). São decisões iniciais de balanceamento, ajustáveis num único lugar. O servidor aplica; o cliente só exibe.

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

Velocidade do modo: campanha 1, partida rápida 3, equipe 1,5 (só a campanha existe no servidor).

A ocupação começa e termina pelo relógio do banco (`started_at`, `ends_at`). É concluída por três caminhos equivalentes: worker a cada segundo, leitura do estado e novo pedido de expansão. Nenhum depende de o jogador estar conectado.

**Limitação conhecida:** nesta fase o único custo da expansão é o tempo. Custos em recursos e exigência de tropas entram com a economia (Fase B) e o exército (Fase D).

## Progressão

- Experiência = 100 × regiões + 400 × países dominados.
- O nível *n* exige 120 × (n − 1)² de experiência.
- Metas de expansão (`MILESTONES`): 1, 3, 6, 12, 25, 50 e 100 regiões; 1, 3 e 8 países. São indicadores derivados do território; não concedem recursos, que ainda não existem.
