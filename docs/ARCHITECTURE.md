# ARQUITETURA TÉCNICA

## Estado

Esta arquitetura é uma **proposta** para orientar a implementação; o Work deverá validar escolhas e documentar desvios antes de produzir código. Nenhum serviço de produção ou servidor foi provisionado por estes documentos.

## Objetivos

MMO persistente com cliente PWA mobile-first, simulação autoritativa, entidades espaciais, chat real, dados confiáveis, reconexão e extensão modular.

## Stack candidata

- **Cliente**: TypeScript, React, UI HTML/CSS, PixiJS/WebGL 2D para cidade e mapa isométricos, PWA. Next.js é opcional se não atrapalhar o ciclo do render.
- **Servidor**: TypeScript/Node.js como serviço de longa duração, REST/RPC validado para comandos administrativos e WebSockets para eventos de gameplay/chat.
- **Dados**: PostgreSQL, extensões geográficas se apropriado, Redis para presença, pub/sub, locks efêmeros e cache sob critério.
- **Assets**: armazenamento compatível e CDN com cache versionado.
- **Operação**: logs estruturados, métricas, monitoramento de erros, deploy contínuo, migrações e backups.

**Importante**: não hospedar o servidor autoritativo WebSocket/tick contínuo numa plataforma puramente serverless incompatível. Vercel pode servir o frontend; backend deve ter runtime com conexões persistentes quando necessário. Supabase pode apoiar auth e PostgreSQL sem substituir por si só a simulação confiável do mundo.

## Módulos propostos

- identity/auth e governor;
- kingdom & region;
- economy/ledger;
- city/building queues;
- technology;
- troops/commanders;
- armies/marches;
- combat;
- alliance/territory;
- chat/mail/moderation;
- quests/events/rankings;
- observability/admin.

Contrato entre módulos via comandos, queries e eventos de domínio, sem importações circulares.

## Fluxo de comando

1. Cliente solicita intenção (ex.: iniciar melhoria de prédio).
2. Backend autentica usuário e contexto de reino.
3. Valida permissões e pré-condições.
4. Executa transação econômica e grava tarefa.
5. Publica evento versionado após commit.
6. Clients autorizados recebem delta e atualizam interface.
7. Cliente reconcilia contra snapshot se houve perda de pacote/ordem.

Todos os comandos modificadores devem ter idempotency_key, request_id e rastreabilidade por ator.

## Tempo de servidor e tarefas offline

Guardar início, fim e regras; calcular projeção por horário confiável. Workers ou processadores de eventos podem materializar tarefas quando necessário; ausência de conexão não pausa produção. Preferir algoritmos capazes de reconstituir estado após reinício sem depender de setTimeout vivo.

## Mundo espacial

Dividir cada reino por regiões/chunks, indexação espacial, filtros de interesse e snapshots/deltas. Conexões devem ingressar em rooms autorizadas de reino, aliança e área de interesse. Os eventos carregam versão e sequence; reconexão exige ressincronização segura.

## Persistência

PostgreSQL com migrations versionadas, FK/constraints, índices, ledger para economia, transações, isolamento por reino, histórico de atividade e parâmetros configuráveis. Redis é auxiliar, nunca fonte única da verdade de dados críticos sem política explícita.

## Segurança

Auth com cookies/sessão/tokens protegidos; autenticação de WebSocket; validação de input; ACL por reino, aliança e conversa; rate limits; antipirataria econômica; event logs; permissões para painel admin; moderação de chat, bloqueios e denúncias. Não aceitar informações de custo, duração, propriedade ou dano fornecidas pelo cliente como autoridade.

## Resiliência

- reconexão com backoff e recuperação de estado;
- tolerância a redes móveis e suspensão iOS;
- comandos repetidos idempotentes;
- fila durável para eventos críticos quando necessário;
- processo restaurável após crash;
- logs e alertas, backup testável;
- testes de concorrência, corrida e carga.

## Performance iPhone

Pan e pinça fluidos, animação desacoplada de rede, batching de sprites, LOD, culling, limitação de partículas, render somente visível, redução de tráfego, evitar recarregar árvore do canvas ao abrir HUD, respeitar safe area e teclado virtual. Adotar orçamento medido de FPS, memória, latência e consumo.

## Qualidade e CI

Lint, typecheck, unit tests, integration tests com banco real, testes e2e com duas sessões, teste de acesso chat e teste de carga inicial. Seed deve ser identificado como ambiente de desenvolvimento.

## Contrato de pronto

Não considerar multiplayer implementado até duas sessões autenticadas independentes alterarem e perceberem a mesma realidade, com persistência após reload, controle de autorização e resultados consistentes.

## Infraestrutura e custos

Inventariar serviços disponíveis antes de provisionar qualquer coisa. Aprovação explícita para cobranças, serviços pagos, segredos e alterações irreversíveis. Nunca armazenar credenciais no repositório.


## Implementação inicial (2026-10-24)

A stack candidata acima permanece como alvo. A fatia executável usa Node 24/JavaScript, SQLite, SSE e Canvas 2D; consulte [ADR 001](ADR_001_PHASE_A.md) para desvios, contratos e limites. PostgreSQL, TypeScript, WebSockets, chunks/deltas, outbox e infraestrutura em escala não foram entregues.
