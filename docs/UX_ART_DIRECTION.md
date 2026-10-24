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

