# GAME DESIGN — KINGDOMS UNBOUND

## Propósito

MMO de estratégia persistente para mobile web/PWA: crescimento individual, cooperação de aliança e competição por objetivos de reino. Referência conceitual: jogos da família 4X e Rise of Kingdoms. Arte, lore, código e interface próprios.

## Experiência-alvo

O jogador começa como governador, constrói uma cidade, aprende sobre recursos, treina tropas, recruta comandantes, explora um reino compartilhado e entra numa aliança. Ao evoluir, participa de coleta, caçadas, guerras de campo, fortalezas, disputa de passagens, governo político e, posteriormente, temporadas entre reinos.

O jogo tem três camadas interligadas:
- **Cidade pessoal**: produzir, construir, pesquisar, treinar, curar, equipar.
- **Reino persistente**: explorar, coletar, marchar, lutar, defender e localizar jogadores.
- **Comunidade/aliança**: organizar, compartilhar ajuda, controlar território e conquistar o reino.

A simulação deve avançar com o aplicativo fechado; voltar ao jogo deve revelar progressos e relatórios reais.

## Loops

**Loop de minutos:** colher recursos, reiniciar filas, verificar marchas, completar missões, responder chat e pedidos de ajuda.

**Loop diário:** progredir edifícios, pesquisas e comandantes, gastar pontos de ação, explorar, participar de atividades de aliança.

**Loop semanal:** planejar tecnologia, defesa, expansão territorial, eventos, reforços e alianças.

**Loop de temporada:** conquistar objetivos, disputar governo, competir entre reinos e obter resultados persistentes.

## Primeiro usuário: onboarding verificável

1. Criar conta e governador.
2. Escolher uma das civilizações iniciais implementadas.
3. Entrar no reino e receber cidade inicial.
4. Melhorar prefeitura ou produção, descontando recursos reais.
5. Observar progresso baseado no relógio do servidor.
6. Abrir mapa e enxergar região compartilhada.
7. Criar ou solicitar entrada numa aliança.
8. Conversar e receber mensagens de outro jogador em tempo real.
9. Fechar/reabrir o navegador e recuperar o progresso.

Tutorial deve contextualizar esses passos. Não mostrar tarefas impossíveis por funcionalidades ainda inexistentes.

## Civilizações

Cada civilização é um pacote de: identificador estável, nome original, arquitetura, bônus econômicos/militares, unidade especial, comandante inicial, ícone e paleta. Planejar suporte para pelo menos 15; implementar inicialmente poucas com mecânicas reais. Não usar arte/nomenclatura proprietária de jogos referenciados.

Dados de definição devem ser versionados e migráveis. Modificadores devem indicar fonte, operação, escopo, tipo de empilhamento e limite.

## Governador e poder

Perfil com avatar, nome, reino, civilização, cidade, XP, nível, poder e conquistas. Poder deve ser calculado com fontes auditáveis (edifícios, pesquisas, tropas, comandantes), e não editável pelo cliente. Rankings podem ser materializados e atualizados periodicamente.

## Cidade

Render 2.5D isométrico: grades/slots e colisão de construções, paisagismo, habitantes e elementos ambientais decorativos sem sacrificar performance. A câmera e a UI devem continuar estáveis ao abrir telas.

Catálogo de edifícios previsto:
| Categoria | Edifícios | Efeito principal |
|---|---|---|
| Centro | Prefeitura, muralha, comando/castelo | Limites de progressão e defesa |
| Economia | Fazenda, serraria, pedreira, mina, armazém | Geração/proteção de recursos |
| Ciência | Academia | Pesquisa |
| Militar | Quartel, estábulo, arqueiros, oficina de cerco | Treino por tipo de tropa |
| Apoio | Hospital, taverna, oficina, batedores, centro de alianças, comércio | Cura, comandantes, equipamentos, exploração, cooperação |
| Ambientação | Estradas, praça, monumentos, decoração | Identidade e navegação |

Regras por edifício: níveis, requisitos, custos, tempo, capacidade, aparência por nível, slots, efeitos, fila e permissões. Alteração real no banco, por transação.

## Temporizadores e filas

Guardar start_at, finish_at, parâmetros da tarefa, owner_id e status. Não contar segundos localmente como verdade. Ao consultar ou executar ação, derivar conclusão a partir do relógio do servidor. Prever fila adicional como desbloqueio explícito e acelerações legítimas controladas pelo backend.

## Economia

Recursos: alimento, madeira, pedra, ouro, pontos de ação e recursos/créditos de aliança. Moeda premium apenas se projeto aprovar, sem pagamento na fase inicial.

Separar:
- saldo disponível e protegido;
- capacidade de armazenamento;
- produção de base;
- modificadores;
- produção acumulada offline;
- ledger de entrada/saída com referência ao comando.

Alterações atômicas impedem saldo negativo e gastos duplicados. Coleta externa depende de marchas reais e quantidade presente nos nós do mapa.

## Pesquisa

Duas árvores: economia (produção, coleta, construção, comércio, logística) e militar (treino, velocidade, capacidade, atributos, tiers). Cada nó inclui dependências, tempo, custo, estágio, efeito real e UI. Pesquisa tem histórico, fila e bloqueios.

## Comandantes e equipamentos

Heróis originais, com XP, níveis, estrelas, talentos, habilidades com gatilhos definidos, equipamentos e papéis distintos. Habilidades requerem implementação dentro do motor do jogo. Comandante principal/secundário e limites de formação devem ser documentados antes de balancear.

## Progressão e onboarding social

Priorizar entrada em aliança, cooperação e construção coletiva. Chat, solicitações, ajuda e notificações são mecanismos centrais, não extensões cosméticas.

## Missões e eventos

Motor declarativo para objetivos verificáveis no servidor. Missões iniciais, diárias, econômicas, militares, sociais, rankings e temporadas. Recompensas com idempotência e histórico.

## Balanceamento e métricas

Registrar tempo até primeira construção, primeiro chat, primeira aliança, primeira marcha e primeira batalha; progressão por nível, economia média, taxa de retorno e saúde das alianças. Sem afirmar equilíbrio até testar com usuários e dados.

## Fora do primeiro marco

KvK completo, vasto catálogo de comandantes e civilizações, monetização real e produção de arte final podem ser implementados em fases seguintes. O repositório não deve apresentar esses sistemas como operacionais antes de serem testados.

## Critérios de aceitação da fase A

Dois usuários com estados independentes, mesmo reino e mapa; construção persistente com consumo correto; aliança real e chat com controle de acesso; reconexão; UI mobile funcional. Ver docs/IMPLEMENTATION_PLAN.md.

