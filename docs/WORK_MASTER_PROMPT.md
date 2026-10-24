# PROMPT MESTRE — KINGDOMS UNBOUND
> Especificação oficial do projeto e instrução para o ChatGPT Work. Edição inicial: 24/10/2026.
> Status: **planejamento documentado; implementação não iniciada por este documento**.

## MISSÃO PRINCIPAL

Atue como uma equipe completa de desenvolvimento de jogos MMO: diretor de jogo, game designer, gameplay programmer, engenheiro backend, arquiteto de banco, engenheiro de redes e multiplayer, designer UI/UX mobile, artista técnico, especialista em performance, QA e DevOps.

**Crie KINGDOMS UNBOUND, um MMO de estratégia persistente inspirado em profundidade e experiência de gênero em Rise of Kingdoms**, com cidades, civilizações, reinos, exércitos, comandantes, alianças, chat, diplomacia e disputas territoriais. Primeiramente, buscamos um núcleo profundamente completo e fiel **às mecânicas conceituais do gênero**; somente depois introduziremos diferenciais e inovações.

**Não crie um clone infrator:** jamais reutilize código, artes, mapas, textos, interfaces idênticas, nomes de personagens fictícios, sons, logos ou outros ativos protegidos de terceiros. A estrutura e as experiências de gênero podem servir de inspiração; todo conteúdo produzido deve ser original.

**Não faça apenas uma landing page, um mockup estático ou um dashboard bonito.** O foco é um jogo realmente funcional e multijogador. Não declare concluído nada que ainda seja simulado.

**Repositório autorizado:** ZAnt214/KINGDOMS-UNBOUND (branch principal: main). Antes de começar, leia este arquivo e toda a documentação no diretório docs. Preserve o trabalho existente, verifique permissões e desenvolva preferencialmente por branches e pull requests. Não altere outros repositórios.

## 0. PESQUISA FUNDAMENTADA E ENGENHARIA REVERSA CONCEITUAL

Pesquise os sistemas públicos e documentados de Rise of Kingdoms, complementando com materiais oficiais, guias de comunidades, capturas de gameplay, vídeos e análises, verificando datas e versões.

Referências iniciais:
- https://rok.lilith.com/
- https://play.google.com/store/apps/details?id=com.lilithgame.roc.gp
- https://riseofkingdoms.fandom.com/wiki/Rise_of_Kingdoms_Wiki

Investigue em profundidade:
1. Criação de governador, civilização e cidade.
2. Evolução da cidade, construções, filas e requisitos.
3. Produção, coleta, inventário, proteção e economia.
4. Pesquisa econômica/militar e desbloqueios.
5. Tipos de tropas, níveis, treino, cura e perdas.
6. Recrutamento e progressão de comandantes, habilidades, talentos, equipamentos e formações.
7. Mapa mundial contínuo, zoom, regiões, coordenadas, passagens e geografia.
8. Batedores, névoa de guerra, exploração e inteligência.
9. Marchas abertas, rotas, movimentação e cancelamento.
10. Combate PvE/PvP, campo aberto, cercos, guarnições, reforços e ataques conjuntos.
11. Alianças, hierarquia R1–R5, recrutamento, doações, ajudas, tecnologias e presentes.
12. Territórios, fortes, bandeiras e estruturas estratégicas.
13. Chat global, chat do reino, chat da aliança, mensagens privadas, grupos, relatórios e correio.
14. Políticas de reino, governo, templos e título de rei.
15. Temporadas e guerras entre reinos (KvK).
16. Missões, eventos, ranking, monetização como referência de equilíbrio (sem integrar cobranças nesta etapa).
17. UX, HUD, feedback, animações, mobile e controles.
18. Backend, administração, moderação, antifraude e escalabilidade.

Para cada sistema, descreva: objetivo, experiência do jogador, elementos UI, regras e exceções, entidades persistidas, eventos e mensagens do servidor, integrações com outros sistemas, testes e ordem de implementação.

Separe: **confirmado por fonte**, **inferido** e **decisão de design para KINGDOMS UNBOUND**. Não apresente números não verificados como fatos atuais. Mantenha uma matriz de rastreabilidade e cobertura em docs/SYSTEMS.md.

## 1. ESTRUTURA DO JOGO

Jogo MMO de estratégia de civilizações em mundo persistente, com cidade em perspectiva isométrica 2.5D, exércitos em mapa compartilhado, alianças e política. Começar na web/PWA com foco em Safari no iPhone; arquitetura extensível a Android e desktop.

Entidades fundamentais: conta, governador, civilização, cidade, reino, mapa e região, objeto geográfico, exército/marcha, comandante, aliança, estruturas territoriais, mensagens, eventos e temporadas.

Um **reino** é um mundo/servidor persistente compartilhado por múltiplos jogadores. Cada governador controla sua **cidade**; ele não governa o reino automaticamente. Domínio político deve decorrer de disputa e conquista. Jogadores conectados ao mesmo reino devem perceber estado sincronizado; a simulação deve continuar respeitando horário de servidor mesmo quando alguém está offline.

## 2. CIDADE, CONSTRUÇÃO E VISUAL

Cidade isométrica rica, com ruas, árvores, muralhas, habitantes e atividades ambientais. Construção em terreno válido, ocupação de espaço, pré-visualização, posicionamento, custos, pré-requisitos, cancelamento quando permitido, filas, temporizadores reais, upgrades, limites ligados à prefeitura, mudança visual por nível, indicadores de produção, reorganização/decorativos conforme regras, efeitos e conclusão.

Edifícios previstos: prefeitura, muralhas, fazendas, serrarias, pedreiras, minas, armazém, academia, quartel de infantaria, estábulo, campo de arqueiros, oficina de cerco, hospitais, taverna, centro de alianças, acampamento de batedores, castelo/comando, oficina de equipamentos, entreposto comercial, monumento histórico, caminhos e decoração.

Cada prédio deve ter finalidade real, requisitos, custos versionados, níveis, capacidades, consequências de gameplay e UI contextual. Construir/atualizar deve alterar o estado persistido do servidor. Timers são calculados por timestamps confiáveis; reabrir o app nunca reinicia temporizadores.

## 3. CIVILIZAÇÕES, GOVERNADORES E PROGRESSÃO

Civilizações com nome e identidade originais, arquitetura, bônus econômicos e militares, unidades especiais, comandante inicial e estilos distintos. Arquitetura preparada para 15+ civilizações futuras; na primeira fase implementar **um conjunto pequeno, completo, jogável e equilibrado**, indicando claramente as ainda indisponíveis.

Governador: perfil, nível, poder, estatísticas, conquistas, histórico, avatar, ranking, tutorial, progressão da prefeitura e tecnologias; sistema de eras apenas se contribuir para evolução. Parâmetros de balanceamento ficam em dados configuráveis versionados.

## 4. ECONOMIA, COLETA E TECNOLOGIA

Recursos iniciais: alimento, madeira, pedra, ouro, pontos de ação, créditos individuais/coletivos de aliança e moeda especial opcional sem cobrança real neste marco.

Recursos têm fontes, custos, limites de armazenamento, proteção e registro transacional. Construções produzem ao longo do tempo. Nós de recurso existem como entidades reais no mapa, com quantidade limitada, nível, tipo e posição. Tropas coletam considerando capacidade de carga, distância, velocidade, bônus de pesquisa, comandante e território; marcham ao nó, coletam e regressam com carga efetiva.

Árvores econômicas e militares com pré-requisitos, recursos e temporizadores. Pesquisas econômicas alteram produção, coleta, construção e logística; pesquisas militares alteram treinamento, atributos, velocidade, defesa, desbloqueios e combate. Seus efeitos devem impactar **de verdade** as regras e o estado.

## 5. TROPAS E COMANDANTES

Famílias básicas: infantaria, cavalaria, arqueiros e cerco. Cada uma com nível/patamar (planejar cinco), vantagens/desvantagens, ataque, defesa, vida, velocidade, carga e custo. Relações táticas e fórmulas devem ser explícitas, testáveis e ajustáveis.

Treinar tipo, patamar e quantidade com fila, custos e tempos; prever evolução de tropas existentes, ferimentos e tratamento.

Comandantes originais: recrutamento, raridade, XP, nível, estrelas/patamares, habilidades ativas e passivas, talentos, equipamentos, especialização e formações. Comandante principal e secundário com regras claras de combinação. Papéis em combate, guarnição, coleta, exploração e suporte. Cada habilidade efetua modificador/evento real no motor de jogo, não texto decorativo.

## 6. MAPA MUNDIAL COMPARTILHADO

Mapa interativo real, não imagem. Elementos: cidades, exércitos, acampamentos neutros, fortalezas, recursos, florestas, rios, montanhas, passagens, locais sagrados/estratégicos, bandeiras, fronteiras, objetivos temporários.

Gestos: arrastar, pinça, zoom por botão, seleção, coordenadas, buscar coordenada, mini mapa, filtros, marcadores, centralizar evento e alternar suavemente cidade/mundo. Visualização por chunks/regiões e nível de detalhe; renderização otimizada para mundo grande.

Névoa de guerra individual; batedores revelam terreno, descobrem POIs, investigam cidades e geram relatórios.

Marchas servidor-autoritativas: identificador, tropas/comandantes, origem, destino, caminho, velocidade, timestamps, estado (preparando, marchando, coletando, atacando, defendendo, reforçando, rally, retornando, aguardando). Aceitar mudança de ordens válidas; pathfinding respeita obstáculos, passagem e restrições. Estado real transmitido para clientes pertinentes, com interpolação visual no cliente.

## 7. COMBATE E RELATÓRIOS

Motor de combate servidor-autoritativo, preferencialmente determinístico/reproduzível em testes. PvE e PvP: aberto, ataque a cidade, cerco, defesa, guarnição, reforço, rally, múltiplas tropas, retirada, retorno e relatórios.

Entradas: tropas, quantidades, tipo, tiers, ataque, defesa, vida, pesquisas, comandantes, habilidades, formações, território, bônus de aliança, matchups e modificadores. Expor racional do resultado para o jogador.

Saúde: tropas disponíveis, ferimentos leves/graves e perdas permanentes segundo o modo; hospitais com capacidade, custos e tempo de cura.

Rally: líder prepara operação com janela de entrada, limite de tropas, participantes, deslocamento, reunião, partida, alvo, batalha e resultados. Batalhas registram participantes, coordenadas, horários, efeito de habilidades, feridos, mortos e saque quando permitido. Não fingir combate com animação arbitrária.

## 8. ALIANÇAS, CLÃS E GUILDAS

Aliança será a organização social principal; termos clã/guilda são apelidos da mesma entidade inicialmente, evitando três cadastros conflitantes. Futuramente, coalizões/federações formalizadas.

Criação: nome, sigla, emblema, idioma, descrição, requisitos de poder/entrada, recrutamento aberto ou aprovado, convites, candidaturas, aceitar/rejeitar, sair, expulsar, dissolver conforme regra.

Papéis R1, R2, R3, R4 (oficiais) e R5 (líder), com **matriz de permissões configurável**, incluindo: convite, aprovar, expulsar, promover/rebaixar, comunicados, marcadores, pesquisa, construção, diplomacia, liderança e configurações. Auditoria de ações administrativas.

Painel: resumo, membros, cargos, candidaturas, chat, ajuda, pesquisa, doações, presentes, território, estruturas, operações, diplomacia, ranking, histórico, configurações.

Ajuda coletiva diminui temporizadores de construção/pesquisa/cura dentro de limites; doação alimenta tecnologias e crédito, loja interna sem dinheiro real, presentes e recompensas.

Territórios: fortaleza principal, estruturas, bandeiras, conexão válida, cálculos de fronteira e bônus por área, construção coletiva, reparo, ataque, destruição e perda de benefícios. Visualização colorida e nítida no mapa.

Diplomacia: aliados, pactos de não agressão, coalizões, relações hostis, acordos e comunicados; relações diplomáticas não bloqueiam automaticamente combates sem regra explícita.

## 9. CHAT, SOCIAL E CORREIO

Canais: **global entre reinos**, **reino local**, **aliança restrita**, **coalizão**, **mensagens privadas**, **grupos privados**, **avisos do sistema** e canal opcional de eventos.

Mensagens reais via comunicação em tempo real; persistência e paginação, avatares, identificadores de reino e aliança, status de não lidas, respostas, emojis, bloqueio, denúncias, mute, rate limit, antispam e controles de privacidade. Preparar tradução futura.

Coordenadas compartilhadas em chat precisam ser links internos clicáveis que centralizam o mapa. Compartilhar relatórios de combate e avisos de batalha por referências com autorização. Controle de acesso checado no servidor; ninguém pode consultar chat de aliança não pertencente. Correio distinto do chat: pessoais, alertas, relatórios, anúncios e recompensas.

Não crie usuários/mensagens falsos apresentados como população real.

## 10. REINOS E POLÍTICA

Cada reino: ID, nome, criação, população, estado, idade/fase, mapa, regiões, alianças, rankings, histórico, regras. Cronologia libera passagens, monumentos, territórios e eventos. Objetivo central conquistável determina governo.

Governança: rei, títulos, cargos, buffs, comunicados, mandatos, transições e disputas; diferenciar poderes políticos **dentro do jogo** das permissões administrativas da plataforma. Rankings por poder, aliança, eliminações, atividade, recursos coletados, território, conquistas, eventos e temporada.

## 11. GUERRAS ENTRE REINOS E TEMPORADAS

Preparar sistema equivalente conceitual de PvP entre reinos: inscrição, elegibilidade, coalizões, calendário, mapa temporário, portões, passagens, objetivos, pontuação, recompensas, encerramento, retorno e histórico. Deferir complexidade avançada até núcleo multiplayer funcionar, mas garantir arquitetura sem reformulação radical posterior.

## 12. EVENTOS, MISSÕES E ONBOARDING

Sistema configurável: missões iniciais, diárias, desenvolvimento, coleta, guerra, aliança, exploração, ranking, conquistas e temporadas. Cada evento tem objetivos, duração, regras, progresso, recompensas e idempotência para evitar resgates duplicados.

Tutorial progressivo, ensinando construção, produção, pesquisa, treinamento, exploração e entrada em aliança sem sobrecarregar a interface.

## 13. DESIGN VISUAL, HUD E MOBILE

Identidade visual original, qualidade de jogo mobile comercial: cidade e mundo isométricos 2.5D, terrenos ricos, vegetação, luz, partículas, animações de tropas e construções, ícones autorais, som contextual e estados claros. Evitar visual genérico de site SaaS.

HUD cidade: governador, poder, recursos, tarefas, construção, alertas, mundo, tropas, comandantes, alianças, missões, correio, chat compacto e ajustes. HUD mundo: reino, região, coordenadas, marchas, tropas, mapa, busca, marcadores, avisos e chat sem abandonar a simulação.

Foco vertical iPhone/Safari: safe areas, Dynamic Island/notch, barras do navegador, pinça, arraste, painéis deslizantes, alvos táteis, teclado, orientação, reconexão, suspensão/retorno, conexões instáveis. Preservar câmera, seleção e scroll ao abrir menus; não resetar ao alternar chat.

## 14. ARQUITETURA TÉCNICA

Avaliar frontend TypeScript/React ou Next.js, renderização 2.5D por PixiJS/WebGL (ou justificativa superior), UI via HTML/CSS, PWA.

Backend Node/TypeScript ou opção fundamentada, **servidor autoritativo persistente**, APIs com validação, WebSockets/eventos em tempo real, PostgreSQL, Redis quando apropriado, armazenamento para assets e observabilidade. GitHub + Vercel + Supabase podem ser avaliados conforme contas disponíveis; não hospedar servidor WebSocket/mundo contínuo numa função serverless incompatível.

Regras:
1. Estado econômico, combate, marchas, permissões e tempo pertencem ao servidor.
2. Cliente envia intenção de comando e recebe resultado validado.
3. Transações e idempotência em mutações críticas.
4. Reconexão, snapshots + atualizações e tratamento de eventos fora de ordem.
5. Isolamento por reino e por canais.
6. Mapas por chunks; stream por área de interesse e níveis de detalhe.
7. Clock confiável; tarefas offline resolvidas sem depender do cliente.
8. Configurações versionadas, migrações e separação de responsabilidades.
9. Logs, auditoria, monitoramento, backup e testes.
10. Não alegar capacidade para milhares de usuários sem benchmark.
11. Segurança: autenticação, validação, ACL, rate limits, denúncia, antispam, anti-exploit econômico.
12. Separar renderização, simulação, regras de domínio e armazenamento.

Consultar detalhes em docs/ARCHITECTURE.md e docs/DATABASE.md.

## 15. ADMINISTRAÇÃO E MODERAÇÃO

Painel administrativo independente para reinos, usuários, eventos, denúncias, balanceamento e operações; logs auditáveis; controle de acesso, proteção de dados aplicável, procedimentos de exclusão/privacidade e prevenção de trapaças. Cargos do reino **não** são admins do sistema.

## 16. IMPLEMENTAÇÃO EM FASES CUMULATIVAS

**Fase A — núcleo jogável real:** cadastro/login, governador, civilização inicial, reino, cidade, construção e recursos persistentes, mapa com duas cidades visíveis conforme regras, criação/entrada em aliança, chat do reino/aliança/global real e retorno da sessão.

**Fase B — progressão e movimento:** tecnologia, treino, comandantes, batedores, névoa, coleta, marchas, PvE, relatórios, hospitais e missões.

**Fase C — guerra e território:** PvP, guarnições, reforços, rallies, fortalezas, bandeiras, território, pesquisa/doação coletiva e ranking militar.

**Fase D — política e temporadas:** passagens, objetivos estratégicos, governo, cargos, diplomacia, cronologia, eventos e base de guerras entre reinos.

**Fase E — polimento:** arte, efeitos, som, UX, balanceamento, expansão de civilizações/comandantes, performance, testes de carga e infraestrutura.

Não simule etapas futuras como concluídas; maximize o escopo implementado **corretamente** no tempo disponível, registrando dívidas e pendências.

## 17. TESTES OBRIGATÓRIOS

**Duas contas/sessões independentes**: ambas no mesmo reino, cidades diferentes, mapa compartilhado, construção persistente, uma cria aliança, a outra solicita, líder aprova, ambos veem membros, chat transmite sem reload, canais privados têm ACL, informações persistem após sair e voltar.

Combate: marcha real, chegada, resolução de batalha no servidor, feridos/perdas, retorno e relatório.

Segurança: impedir adulterar recursos, enviar tropas inexistentes, acessar canal restrito, promover sem permissão, forçar timer ou coletar recompensa duas vezes.

iPhone: Safari físico quando disponível; senão emulação automatizada, com limitação relatada. Zoom, safe area, toque, chat/teclado, orientação, background/foreground, conexão instável, FPS e memória.

Nenhum recurso está pronto antes de ter critérios de aceitação e teste real.

## 18. ENTREGÁVEIS

- GDD e especificações detalhadas;
- inventário rastreável de sistemas;
- arquitetura frontend/backend/network;
- esquema de banco e migrações;
- regras de simulação, combate e mapa;
- biblioteca de parâmetros de jogo;
- código organizado, interface mobile de jogo, backend persistente;
- testes, fixtures e documentação de execução;
- deploy verificável quando disponível;
- relatório honesto do implementado e do que falta;
- backlog priorizado e estado de progresso.

Documentos oficiais já criados aqui: GAME_DESIGN, ARCHITECTURE, SYSTEMS, WORLD_MAP, COMBAT_DESIGN, ALLIANCE_SYSTEM, DATABASE, IMPLEMENTATION_PLAN, TEST_REPORT e PROGRESS (todos sob docs).

## 19. CRITÉRIOS INEGOCIÁVEIS

Rejeite: mapa só em imagem, chat com mensagens falsas, marcha só animada, recursos locais, construções sem persistência, botões decorativos, multiplayer fingido, mistura de contas, estados perdidos após atualização, exploits aceitos por backend, visuais genéricos de dashboard.

Dados de desenvolvimento podem ser simulados **somente quando claramente rotulados**. O jogador precisa sentir que integra um mundo persistente, onde sua cidade cresce, outros jogadores existem, alianças disputam território e a guerra altera o estado compartilhado.

## 20. PREPARAÇÃO PARA DIFERENCIAIS FUTUROS

Nesta etapa, o foco é fidelidade conceitual e solidez. Futuras ideias próprias serão adicionadas depois, sem reescrever o núcleo. Priorize módulos extensíveis, eventos de domínio, regras configuráveis, dados versionados, isolamento renderização/simulação, novos modos futuros de diplomacia, economia, combate e política.

## INSTRUÇÃO FINAL PARA O WORK

**EXECUTE o projeto**, não apenas proponha um roteiro.

1. Leia todo o repositório e esta documentação.
2. Pesquise e valide pressupostos em fontes atuais.
3. Atualize a matriz de cobertura e registre decisões.
4. Selecione arquitetura técnica realista para PWA e multiplayer.
5. Implemente um fluxo vertical real da Fase A com duas contas.
6. Valide backend, persistência, permissão e reconexão.
7. Teste a interface mobile e reporte limitações.
8. Continue os módulos seguintes em ordem de dependência.
9. Mantenha docs/PROGRESS.md e docs/TEST_REPORT.md honestos; não declare terminado o que não foi testado.
10. Faça commits e/ou pull requests rastreáveis neste repositório. Solicite confirmação apenas se necessário para serviços externos, custos, credenciais e operações arriscadas.

**Meta de primeiro marco**: dois jogadores entram no mesmo reino, possuem cidades próprias, criam/ingressam numa aliança, conversam em canais reais e persistem progresso ao sair do app — tudo executado, verificado e documentado.
