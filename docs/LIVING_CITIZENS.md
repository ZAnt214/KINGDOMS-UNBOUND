# Living Citizens — moradores animados da cidade

## Implementação

Código em `client/src/livingCitizens.ts`, integrado a `client/src/components/CityView.tsx`.

Oito moradores com visual 2D autoral em Canvas: rei, cavaleiro, lanceiro, arqueira, camponês, ferreiro, mercadora, batedor. Cada um possui pontos de passagem, velocidade, pausas, animação de passos, respiração e elementos visuais específicos da profissão. Uma interação por toque exibe nome e atividade do habitante.

Posições são convertidas para o mesmo sistema isométrico da cidade e desenhadas em ordem de profundidade junto das construções e árvores. Nenhuma alteração nas tabelas econômicas ou nos serviços de multiplayer.

## Estado e limites

**Este módulo é ambientação visual.** Personagens não existem como entidades de servidor, não produzem recursos, não participam de combates e não sincronizam entre contas. Suas rotinas usam o relógio de animação local; portanto não existem permanentemente quando o app fecha.

Para transformar habitantes em sistema de simulação de mundo vivo, acrescentar depois: estado do NPC no backend, tarefas, horários, objetivos, pathfinding, prioridades, eventos de servidor, persistência e transmissão por área de interesse.

O estilo atual desenha os personagens por formas originais no Canvas para preservar performance e evitar assets externos; **não confundir com sprites de arte final derivados da folha de conceito**. Próxima melhoria visual deverá converter as ilustrações aprovadas em sprites/rigs originais, com 4 ou 8 direções, passos, trabalho e ataques.

## Teste

`tests/unit/living-citizens.test.ts` cobre integridade dos oito papéis, posições válidas, determinismo, não mutação e alternância entre andar/trabalhar. CI deve executar typecheck/build/test; registrar resultados somente após execução.

## Controle de qualidade visual

Verificar em iPhone físico: personagens distinguíveis no zoom padrão, sem atravessar prédios visivelmente, sem sobreposição de toque com construção, ausência de flicker e impacto de FPS/memória. O ambiente deve continuar acessível com zoom e pan.

## Próximas etapas

1. Validar qualidade artística e proporção dos personagens em dispositivo.
2. Criar rig 2D com partes independentes (cabeça, tronco, membros, acessórios), não apenas sprites que se deslocam.
3. Adicionar estações reais para atividades (forja, colheita, comércio, guarda).
4. Integrar com serviços de população, guardas e profissões apenas quando regras de gameplay estiverem prontas.
