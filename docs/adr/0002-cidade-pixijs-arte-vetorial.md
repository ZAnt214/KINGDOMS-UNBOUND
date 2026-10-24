# ADR 0002 — Cidade em PixiJS com arte vetorial isométrica original

**Data:** 2026-10-24 · **Status:** aceito · **Substitui parcialmente:** decisão de Canvas 2D da ADR 0001 (só para a cidade)

## Contexto

A cidade em Canvas 2D com primitivas geométricas (caixas, pirâmides, losangos) ficou muito abaixo da qualidade definida em `UX_ART_DIRECTION.md`: edifícios sem fachada, terreno quadriculado, rótulos permanentes cobrindo a cena, HUD com emojis e seis posições fixas. Precisávamos de uma mudança perceptível de qualidade artística sem perder o backend, a economia e o multiplayer já verificados, e sem quebrar o Safari no iPhone.

## Decisão

1. **Renderização da cidade em PixiJS 8 (WebGL)**, com o motor carregado sob demanda (`import()` dinâmico), para não pesar o login. `pixi.js/unsafe-eval` mantém a CSP sem `unsafe-eval`. O mapa-múndi continua em Canvas 2D nesta etapa.
2. **Arte vetorial original em SVG, gerada por código** (`client/src/city/svg.ts` + `art/*`). Um kit isométrico próprio projeta faces com matrizes afins, então tijolos, telhas, tábuas, janelas e portas ficam na perspectiva de cada face. Cada sprite é rasterizado uma única vez numa textura, com cache por chave, e o resultado é **mantido em sprites isométricos**. Assim, novos edifícios e arte final feita à mão (PNG/atlas) podem substituir o SVG sem mudar o motor.
3. **Luz única do alto à esquerda.** Isso vale para todos os sprites: faces iluminadas e à sombra, sombra projetada para a direita e sombra de contato desfocada.
4. **Terreno pintado em blocos de 1024 px de mundo**, numa resolução de 0,75. Tem manchas de cor, tufos de grama, flores, estradas de terra com sulcos, praça calçada, campos e lago. Evitamos `filter: blur` no terreno (caro no Safari) e usamos bordas em camadas.
5. **Plano urbano como dados** (`shared/cityLayout.ts`). Lotes, pegadas por fase e casas de moradores ficam no arquivo de layout. As **muralhas crescem com a prefeitura**: meia-largura de 9, 11 e 13 tiles nos estágios 1, 2 e 3. Também há **lotes reservados** para os edifícios da Fase B. O layout é coberto por testes unitários (sem sobreposição e dentro das muralhas).
6. **Evolução visual por fases.** Cada edifício tem três fases (níveis 1–3, 4–6 e 7–10). A prefeitura ainda varia detalhes dentro de cada fase: floreiras, estandartes e coroa no nível 10.
7. **Sem rótulos permanentes.** Ao tocar num edifício, aparecem:
   - um contorno dourado pulsante no chão;
   - uma placa com nome e nível;
   - um movimento da câmera que deixa o edifício acima do painel.

   Indicadores contextuais também aparecem: seta verde quando há recursos para melhorar e barra de obra com tempo restante.
8. **Ambiente vivo e leve:** moradores andando pelas estradas, fumaça de chaminés, sombras de nuvens, pássaros e andaimes com trabalhadores durante as obras. A animação é desacoplada da rede e pausa com a aba oculta.
9. **Fallback:** sem WebGL ou se a inicialização falhar, a cidade cai na versão Canvas 2D anterior. O jogo continua funcional.
10. **HUD:**
    - ícones SVG próprios, sem emojis;
    - cartão do governador compacto e recursos com barra de capacidade;
    - fila de obra com progresso e navegação inferior com estado ativo luminoso;
    - painel do edifício com retrato ilustrado, que usa a mesma arte da cena;
    - fonte **Cinzel** (OFL-1.1) empacotada localmente, sem CDN externa.

## Consequências e riscos

- **Bundle:** o PixiJS soma cerca de 70 KB gzip, carregados só ao entrar na cidade.
- **Memória:** as texturas das árvores e dos edifícios mais o terreno ficam na faixa de dezenas de MB. Falta medir num iPhone real (pendência registrada no TEST_REPORT).
- **Safari e `getImageData`:** o Safari pode marcar como contaminado o canvas desenhado a partir de SVG. Nesse caso o toque cai para teste por retângulo. A textura WebGL não depende disso.
- **Performance:** no Chromium sem GPU (SwiftShader), a cena fica pronta em cerca de 1,8 s. O FPS não foi medido em device.
- **Fallback:** a versão Canvas 2D ainda usa a arte antiga. Ela é só a rede de segurança.

## Próximos passos visuais

- Animar estandartes e velas do moinho como sprites próprios.
- Deixar a água do lago com reflexo animado e adicionar a variação dia/tarde.
- Fazer os edifícios da Fase B (quartéis, academia, hospital) nos lotes reservados.
- Levar o mapa-múndi para o mesmo pipeline PixiJS + SVG.
- Gerar atlas em tempo de build (PNG) para reduzir o custo de inicialização no iPhone.
