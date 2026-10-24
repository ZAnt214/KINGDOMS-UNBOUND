# MAPA, MUNDO E MULTIPLAYER ESPACIAL

## Conceitos

**Reino**: mundo/instância persistente, com ID, configuração, idade, população e mapa.
**Região/chunk**: divisão para armazenar e transmitir entidades próximas.
**Coordenadas**: referencial canônico do servidor (x,y) e conversão estável para coordenadas visuais.
**Entidade de mapa**: cidade, tropa, recurso, forte, acampamento, monumento, passagem, bandeira ou objetivo.
**Visibilidade**: resultado de regras de exploração, detecção, fog of war e permissões.

## Design físico

Gerar mapa original com biomas, rios, florestas, montanhas, obstáculos, passagens e regiões estratégicas. Não copiar layout protegido de mapas existentes. Colisões e caminhos precisam derivar de dados de navegação, não só de pixels. Reservar espaços para cidades e estruturas territoriais; evitar sobreposição e spawn em terreno inválido.

## Camadas de apresentação

Cidade com câmera isométrica; mapa local com jogadores/tropas/recursos; panorama amplo com fronteiras, fortificações e região. Oferecer transição de zoom agradável, filtros, minimapa, coordenadas, marcadores, pesquisa, foco em exército e retorno à cidade.

Controles: pan por arraste, zoom com pinça, zoom guiado, clique/toque para selecionar, painel contextual, confirmação de ações militares e tolerância a toques imprecisos.

## Renderização e desempenho

- Dividir terreno e entidades em chunks com streaming.
- Filtrar objetos pelo frustum/câmera; renderizar só o necessário.
- Nível de detalhe por zoom e distância.
- Sprites atlas, instancing/batching quando possível.
- Cache local de arte estática, não do estado autoritativo.
- Culling de UI e marcadores.
- Animações e partículas limitadas em aparelhos móveis.
- Limites dinâmicos de exércitos/efeitos visíveis e instrumentação de FPS/memória.
- Suporte a WebGL compatível com Safari, fallback razoável quando faltar aceleração.

## Sincronização

Cliente conecta autenticado ao backend, entra em reino, informa região/câmera de interesse e recebe snapshot inicial filtrado por autorização/visibilidade. Depois recebe deltas versionados e eventos de interesse. Fora da área, não enviar tráfego inútil. Na reconexão, reconciliar snapshot e número de sequência para não aplicar evento duplicado ou fora de ordem.

O servidor valida a posição declarada da câmera/área de interesse contra os limites das APIs e nunca revela dados secretos por simplesmente subscrever um chunk.

## Exploração e fog of war

Manter estado descoberto por governador, por células/chunks, com permissão explícita para objetos revelados. Batedor percorre missão controlada pelo servidor; uma missão concluída revela área e retorna relatório. Separar:
- terreno explorado;
- entidades atualmente visíveis;
- informações históricas de batedores;
- dados privados não reveláveis.

## Marchas

Dados mínimos: id, reino, governador, army_id, origem, destino, waypoints, velocidade efetiva, departure_at, arrival_at, estado, target_id, path_revision, última atualização.

Estados: preparing, marching, gathering, attacking, defending, reinforcing, rallying, returning, waiting, finished, cancelled (regras de transição explícitas).

Envio de marcha valida: governante, tropas disponíveis, tamanho/capacidade, destino acessível, estado dos comandantes, bloqueios/passagens, conflito com marchas existentes e limites de ações. Deduzir ETA com base em caminho e bônus fixados/atualizados por regra. Client usa interpolação exclusivamente visual; posição do backend prevalece.

Redirecionamentos: servidor decide ponto atual, recalcula caminho e ETA, publica nova versão. Caso alvo mude/desapareça, executar política explícita (parar, replanejar, retornar).

## Coleta

Nó com tipo, nível, saldo, capacidade, owner e versão. Marcha chega, entra em estado gathering, consome saldo com transação segura e aumenta carga. Não permitir duas tropas criarem recursos do nada sob concorrência. Ao acabar o nó ou a capacidade, retorna com carga. Se nó desaparecer, resolver retorno de acordo com regra.

## Objetivos estratégicos

Fortalezas, templos, passagens e bandeiras são entidades persistentes do mundo. Possuem proprietário, estado, área de efeito, requisitos e histórico. Fronteiras são geometrias derivadas do grafo de estruturas conectadas e não polígonos arbitrariamente enviados pelo cliente.

## Fluxo do primeiro teste

Sessão A cria governador/cidade no Reino 1; sessão B faz o mesmo. Ambas consultam mesmo mapa e identificam cidades conforme descoberta. A muda uma entidade; B recebe atualização pertinente; reconexão mantém resultado.

## Questões para especificação detalhada antes do código

1. Tamanho inicial do reino e algoritmo de colocação de cidades.
2. Malha de navegação (grid, navmesh ou grafo híbrido).
3. Regras de colisão e passagens bloqueadas.
4. Tolerância de atualização de posição e redes móveis.
5. Visibilidade exata de cidades, marchas, aliados e inimigos.
6. Agrupamento de marchas sobrepostas no zoom distante.
7. Ritmo de ticks, simulação preguiçosa e carga esperada.
8. Transferência/teleporte de cidades e seus requisitos.
9. Regras de cross-kingdom em temporadas.

Não inventar números canônicos; registrar valores iniciais como decisões de balanceamento.

