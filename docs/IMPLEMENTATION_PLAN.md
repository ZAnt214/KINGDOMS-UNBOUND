# PLANO DE IMPLEMENTAÇÃO E MARCOS

## Filosofia de entrega

Construir **fatias verticais funcionais**: UI -> autorização -> lógica -> persistência -> evento em tempo real -> atualização da UI -> teste. Evitar dez painéis bonitos sem backend.

Cada tarefa concluída precisa de: código versionado, migração quando necessário, teste, critério de aceitação, documentação e demonstração reproduzível.

## Pré-implementação

- [ ] Auditar conteúdo atual do repositório.
- [ ] Rever fontes e classificar o que é referência confirmada versus design próprio.
- [ ] Criar arquitetura e decisões técnicas (ADRs).
- [ ] Escolher stack, orçamento técnico e hospedagem coerente com WebSockets persistentes.
- [ ] Criar ambiente de desenvolvimento e CI.
- [ ] Especificar regras de construção, recursos, criação de reino e alianças para primeira versão.
- [ ] Criar wireframes e mapa original.
- [ ] Definir critério de aceite de duas sessões.

## Fase A — Primeiro multiplayer real (MVP técnico)

### A1. Identidade e mundo
- [ ] Cadastro, login, logout e sessão.
- [ ] Governador e nome exclusivo conforme regra.
- [ ] Escolha entre civilizações iniciais implementadas.
- [ ] Ingresso e isolamento por reino.
- [ ] Criação/atribuição de cidade com posição válida no mapa.
- [ ] Snapshot de reino autenticado e limitado por visibilidade.

**Aceite:** A e B entram no mesmo reino, mas não compartilham identidade/cidade/saldo.

### A2. Cidade e economia
- [ ] Cidade visualmente navegável e com seleção de edifício.
- [ ] Definições de edifícios, níveis, custos e requisitos.
- [ ] Saldo de recursos persistido e ledger.
- [ ] Início e conclusão de uma obra por timestamps de servidor.
- [ ] Validação transacional e erro amigável.
- [ ] Atualização visual e recuperação após reload.

**Aceite:** custo debitado uma vez, prédio evoluído uma vez, progresso idêntico após reabrir.

### A3. Mapa compartilhado
- [ ] Mapa próprio com pan/zoom mobile.
- [ ] Cidades A e B como entidades persistentes do mesmo mapa.
- [ ] Subscrever região e receber snapshot/deltas autorizados.
- [ ] Coordenadas e clique para centralizar/inspecionar.
- [ ] Reconexão.

**Aceite:** duas sessões percebem um estado consistente sem recarregar manualmente.

### A4. Alianças
- [ ] Criar aliança e cargos iniciais.
- [ ] Procurar aliança, solicitar, aprovar e sair.
- [ ] Membros e permissões autenticadas.
- [ ] Eventos de ingresso/saída.

**Aceite:** A cria, B solicita, A aprova, B entra, terceiros não possuem permissão indevida.

### A5. Chat completo da base
- [ ] Canal global (entre reinos), reino e aliança.
- [ ] Mensagens reais persistidas.
- [ ] WebSockets, autorização e histórico paginado.
- [ ] Tratamento de reconexão, rate limiting e mensagens não lidas.
- [ ] Teclado, scroll e links internos de coordenadas no mobile.

**Aceite:** duas sessões trocam mensagens instantaneamente, acesso privado é validado.

### A6. Qualidade e entrega
- [ ] Testes E2E de dois jogadores reais.
- [ ] Testes de saldo, relógio, autorização, persistência.
- [ ] Auditoria de performance iPhone/Safari ou registrar limitação da emulação.
- [ ] Documentação de run/deploy e logs.
- [ ] Atualizar docs/PROGRESS.md e docs/TEST_REPORT.md.

**Fim da fase A:** primeira fatia verdadeiramente jogável compartilhada.

## Fase B — Estratégia, comandantes e exploração

- [ ] Árvore de tecnologias real.
- [ ] Treinamento de quatro tipos de tropas.
- [ ] Primeiros tiers.
- [ ] Comandantes com progressão e habilidades.
- [ ] Batedores e névoa.
- [ ] Marchas, destino, pathfinding e retorno.
- [ ] Nós de recursos e coleta.
- [ ] PvE autoritativo, relatórios e hospital.
- [ ] Missões iniciais e diárias.

**Fim:** jogadores treinam, exploram, coletam e enfrentam alvos PvE.

## Fase C — Guerras de aliança

- [ ] PvP e alvos válidos.
- [ ] Fortificações, cerco, guarnição e reforços.
- [ ] Rallies multiusuário.
- [ ] Fortalezas, bandeiras e conexão territorial.
- [ ] Doações, tecnologia e ajuda coletiva.
- [ ] Relatórios e ranking militar.
- [ ] Diplomacia operacional inicial.

**Fim:** alianças podem disputar e afetar territorialmente o mesmo reino.

## Fase D — Política e campanhas

- [ ] Passagens, templos, marcos e cronologia do reino.
- [ ] Governo, títulos, cargos e comunicados.
- [ ] Eventos sazonais e rankings.
- [ ] Arquitetura de mapas sazonais, migração temporária e KvK.

**Fim:** progresso do reino e metas políticas conectados às guerras.

## Fase E — Evolução e refinamento

- [ ] Arte final original, animação, áudio.
- [ ] Balanceamento de economia, unidades e comandantes.
- [ ] Expansão gradual para 15+ civilizações.
- [ ] Mais heróis, missões e eventos.
- [ ] Otimização de redes, FPS, memória, LOD e testes de carga.
- [ ] Administração, moderação e operação maduras.
- [ ] Novos diferenciais próprios a partir de base estável.

## Dependências principais

Auth -> governor/kingdom -> city/map -> economy/timers -> armies -> march -> combat.
Auth -> alliances -> ACL social/chat -> ajuda/coletivo -> territory -> government -> KvK.
Comandantes/tecnologias/economia alimentam exércitos, pesquisa, batalha e território.

## Definição de pronto

Implementado não significa simplesmente código gerado. Pronto exige persistência, segurança, integração e teste registrado. Se não houver conta, infraestrutura ou device físico disponível, registrar bloqueio; nunca marcar como sucesso.

## Ordem para o Work

1. Inspecionar repositório.
2. Especificar arquitetura inicial.
3. Implementar A1 -> A6.
4. Testar duas sessões.
5. Fazer commits claros e manter docs.
6. Prosseguir B -> C -> D -> E conforme capacidade e prioridade.

Não inventar prazo ou escala sem medir.
