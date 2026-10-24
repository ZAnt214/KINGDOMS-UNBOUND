# DIREÇÃO VISUAL E EXPERIÊNCIA MOBILE

## Objetivo

KINGDOMS UNBOUND precisa parecer um **jogo de estratégia premium**, com cidade e mapa em isometria 2.5D, arte própria, movimentos compreensíveis e HUD focado na tomada de decisão. Não fazer dashboard de produto corporativo.

## Linguagem visual

- Terreno rico, biomas coerentes, iluminação consistente e profundidade de camadas.
- Prédios originais com identidade por civilização, nível e função.
- Muralhas, caminho, vegetação e moradores criando sensação de vida.
- Silhuetas reconhecíveis para tropas, comandantes, bandeiras e fortes.
- Sinais visuais de seleção, estado de marcha, alvo e alerta.
- Efeitos de partículas limitados; clareza tática acima do excesso de brilho.
- Paleta, tipografia, iconografia e direção de arte próprias.

## Câmera e mundo

Pinça de zoom centrada corretamente nos dedos, pan responsivo, inércia moderada, retorno à cidade, foco em exército, bookmarks e coordenadas. LOD evita poluição do mapa distante. Transição cidade/mundo deve preservar continuidade sem necessariamente renderizar tudo na mesma cena física.

## HUD da cidade

Barra de recursos, governador, poder, construções e filas, centro de tarefas, tropas, comandantes, pesquisa, missões, correio, eventos, aliança e botão de mapa. Chat compacto persistente com badge de não lidas. Painéis laterais/bottom sheets devem ser legíveis e não bloquear ações essenciais.

## HUD do mundo

Reino, posição, coordenadas, exércitos disponíveis e marchas, busca, mini mapa, marcadores, chat e ações no alvo. Um toque seleciona, segundo toque/confirmação executa ordem militar conforme contexto, evitando ataques acidentais.

## Interface de aliança

Resumo, emblema, poder, membros, regras, lista R1–R5, candidatura/convite, chat e comunicados, tecnologias, doações, ajuda, estruturas, territórios, rallies e diplomacia. Botões bloqueados explicam requisito/autoridade, não ficam aparentemente quebrados.

## Chat

Teclado iOS não deve ocultar input ou alterar o zoom do mapa. Histórico paginado com rolagem previsível, menções/contadores, canais acessíveis, denúncias/bloqueios. Coordenadas enviadas como referências estruturadas, clicáveis, e não apenas texto plano.

## iPhone/Safari

Respeitar safe-area, notch, Dynamic Island, barras do navegador, backgrounding, memória limitada e rede móvel. Evitar re-render destrutivo do canvas; preservar posições ao alternar painel. Medir desempenho em aparelho real antes de declarar pronto.

## Acessibilidade

Alvos táteis adequados, texto escalável, contraste, distinção além de cor, feedback sonoro opcional, redução de movimentos se configurada e suporte a leitor quando possível nas interfaces de HTML.

## Critério de qualidade

O jogador deve reconhecer instantaneamente onde está, o que pode fazer, quanto custa, qual tempo falta e quais consequências sua ação terá. HUD bonito sem clareza e botões funcionais é falha de experiência.


## Direção implementada — cidade v2 (2026-10-24)

Ver decisões técnicas em `docs/adr/0002-cidade-pixijs-arte-vetorial.md` e evidências em `docs/evidence/visual-v2/`.

- **Estilo:** ilustração isométrica 2:1 com contornos implícitos (sem linhas pretas), materiais texturizados (pedra aparelhada, reboco, enxaimel, telha cerâmica, tábuas), janelas com luz quente e luz única do alto à esquerda.
- **Paleta:** verdes de prado dessaturados, pedra calcária `#b9ae99`, madeira `#5b3a22`, ouro de HUD `#d9ad48`, e telhados/estandartes na cor da civilização (Auren azul, Kharuun vermelho, Veyra verde).
- **Prefeitura (referência de qualidade):**
  - Nv 1–3: solar de pedra e enxaimel, com torre do sino, lucarna, chaminé com fumaça e escadaria.
  - Nv 4–6: paço com ala lateral, torre do relógio e estandartes.
  - Nv 7–10: palácio-fortaleza com torre de menagem, torres cônicas, pináculos dourados e estátuas.
- **Muralhas:** segmentos modulares com talude, ameias no lado externo e parapeito interno, torres de canto com telhado cônico, torres intermediárias com ameias e guarita do portão com grade levadiça e brasão. O anel cresce com a prefeitura.
- **Terreno:** pintado sem grade; estradas de terra com sulcos ligam o portão à praça calçada e aos edifícios; campos, lago, bosques e floresta densa nas bordas dão profundidade.
- **Vida:** moradores, fumaça, sombras de nuvens, pássaros, obras com andaimes e trabalhadores.
- **Câmera:** arraste com inércia, pinça centrada nos dedos, limites para não sair do reino, zoom de 0,2 (panorama) a 1,15 (detalhe) e foco automático no edifício selecionado.
- **HUD:** compacto, escuro com filete dourado, sem emojis; nada cobre a cidade permanentemente.
