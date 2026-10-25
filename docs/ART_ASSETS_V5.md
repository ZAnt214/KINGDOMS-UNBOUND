# Arte da cidade v5 — sprites originais

## Integração

Dois atlas WebP RGBA de 1536×1024, seis células de 512×512 por folha:

- `client/src/city/art/atlas/buildings.webp`: prefeitura, armazém, fazenda, serraria, pedreira, mina de ouro.
- `client/src/city/art/atlas/environment.webp`: duas casas, carvalho, pinheiro, árvore de outono, arbustos.

Arte criada em 25/10/2026 com geração de imagens integrada (`image_gen`, skill imagegen), usando os briefings abaixo. As capturas fornecidas pelo usuário orientaram a direção visual; nenhum recorte ou asset dos jogos de referência foi usado. A conversão PNG→WebP é apenas empacotamento, preservando alpha. Download total das duas folhas: 1.14 MB decimal. Não é modelo 3D: são sprites 2D com aparência de renderização 3D.

`atlas.ts` declara os índices e âncoras no chão. `illustrated.ts` decodifica e armazena cada célula uma vez, compartilha texturas entre instâncias e preserva a máscara alpha para seleção dos edifícios. Recorte acontece em canvas no cliente, sem plano de fundo opaco. Civis e tropas continuam sprites animados separados.

Cada edifício continua sendo uma entidade selecionável ligada ao estado do servidor. Nível zero usa o lote original; construídos usam o atlas. A pegada cresce conforme os três estágios definidos em `cityLayout.ts`; neste atlas os estágios compartilham a mesma ilustração (não são três modelos arquitetônicos diferentes). A cor dos telhados azuis é adaptada à heráldica para outras civilizações sem tingir a pedra e o terreno. O retrato usa a célula do atlas na coloração original.

Se um atlas não carregar, a cena usa os desenhos SVG anteriores e mantém as interações. Sem WebGL, continua existindo o fallback Canvas antigo. As muralhas e pequenos adereços permanecem vetoriais. Não há nova funcionalidade de produção, unidade ou combate implícita na arte.

## Briefing de geração — edifícios

Atlas transparente 3×2, seis objetos completamente separados, perspectiva isométrica ortográfica 2:1, luz superior esquerda, materiais táteis, pedra marfim, telhas azul-petróleo, ornamentos dourados discretos, sem texto, interface, pessoas ou logos. Cada célula deve conter um edifício completo, com sua pequena base e sombra de contato, sobre transparência.

1. Prefeitura: palácio amplo com lanterna central em cúpula azul, nervuras douradas, duas torres frontais, escadaria e estandartes, arquitetura original.
2. Armazém: construção de pedra clara, telhado azul, portas de carga abertas, caixas, sacos, barris e plataforma.
3. Fazenda: celeiro com telhado cerâmico, silo e fileiras de milho verde alto com grãos amarelos.
4. Serraria: oficina com telhado azul, estrutura da serra, toras com pontas visíveis e tábuas empilhadas.
5. Pedreira: rochas angulares cinza-azuladas, blocos cortados, guindaste de madeira e abrigo.
6. Mina: encosta rochosa, veios dourados, entrada com vigas, trilhos, vagonete de minério e oficina.

## Briefing de geração — ambiente

Atlas transparente 3×2 de seis objetos separados, mesma câmera isométrica e luz. Arte de estratégia mobile com volume, detalhes legíveis em escala pequena e contato suave com o chão; sem texto, pessoas, interface, logos nem cenário de fundo.

1. Casa compacta de dois andares em pedra/reboco marfim, telhado de telhas azuis, porta de madeira, janelas em arco, chaminé e floreiras.
2. Casa distinta com telhado cerâmico laranja, lucarna, chaminé, lenha e planta à entrada.
3. Carvalho verde com copa irregular em camadas, folhas superiores iluminadas e tronco marrom visível; evitar bolhas esféricas.
4. Pinheiro volumétrico e orgânico com camadas de agulhas e tronco; evitar triângulos planos.
5. Árvore de outono com folhas laranja/douradas e tronco visível.
6. Três arbustos verdes densos com pequenas flores claras, sem tronco de árvore.

## Validação e limites

Veja `TEST_REPORT.md` e `docs/evidence/city-v5/`. A qualidade é verificada no jogo, com HUD, escala e seleção; as folhas isoladas não são a evidência final de integração. Testes de UI usam fixtures, não contas reais. Safari físico e orçamento de memória/FPS em iPhone permanecem pendentes.
