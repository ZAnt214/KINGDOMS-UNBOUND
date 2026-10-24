# ALIANÇAS, COMUNICAÇÃO, TERRITÓRIO E POLÍTICA

## Organização social

**Aliança** é a organização formal primária. "Clã" e "guilda" são termos equivalentes na UX por enquanto, sem sistemas duplicados. Coalizões/federações são entidades futuras distintas, com permissões e canais próprios.

## Criação, recrutamento e ciclo de vida

Criar aliança com reino, criador, nome, sigla, emblema original, idioma, descrição, restrições e visibilidade. Impor unicidade de nomes/siglas segundo regra por reino; aplicar rate limit e prevenção de spam.

Fluxos: busca, convite, candidatura, aprovação, recusa, cancelamento, sair, expulsar, transferir liderança e dissolver aliança. Operações geram auditoria, avisos e mudanças de ACL em chat. Impor limite de alianças por jogador e um governador por aliança simultânea.

## Hierarquia e RBAC

Cinco níveis conceituais:
- R1 — ingresso;
- R2 — membro;
- R3 — membro experiente;
- R4 — oficial;
- R5 — líder.

Tabela de permissões configurável por aliança/sistema:
| Ação | Requisitos padrão (ajustáveis) |
|---|---|
| Ler chat e membros | membro autenticado |
| Solicitar ajuda, doar | membro habilitado |
| Convidar/recrutar | R4/R5 |
| Aprovar ou expulsar membros | R4/R5 com exceções para pares |
| Promover/rebaixar | R5 ou competência delegada limitada |
| Editar anúncios, marcar alvos | R4/R5 |
| Pesquisar, iniciar projetos | R4/R5 |
| Construir/retirar estruturas | R4/R5 e requisitos territoriais |
| Declarar diplomacia | R4/R5 |
| Transferir liderança, dissolver | R5, com salvaguardas |

A matriz definitiva deve ser definida no código e explicitada ao jogador. Registrar atores, alvos, antes/depois e timestamp. Evitar que um membro remova o líder por elevação indevida de permissões.

## Painel da aliança

Abas: visão geral, membros, candidaturas, hierarquia, chat, ajuda, doações, tecnologias, loja, presentes, território, construções, operações, diplomacia, classificação, histórico e configurações.

## Ajuda mútua

Solicitação vinculada a tarefa válida de construção, pesquisa ou cura. Cada ajudante elegível só contribui conforme regras; impedir ajuda duplicada e redução abaixo do limite mínimo. Consumir/alterar tempo do servidor e publicar atualização ao dono da tarefa.

## Doações e tecnologia

Conta de contribuição individual e recurso coletivo da aliança. Doar gasta saldo do governador em transação, credita progresso coletivo e registra ledger. Pesquisas coletivas concedem bônus comprovadamente aplicados em construção, combate, coleta etc. Loja interna usa moeda do jogo, sem integração financeira inicial.

## Estruturas e território

Forte inicial, fortalezas adicionais conforme progressão, bandeiras, estruturas defensivas e pontos estratégicos. Cada estrutura registra coordenada, estado, proprietário, HP, custo, construído_em e conexões. Crescimento territorial segue grafo espacial de estruturas válidas; bandeira não conectada não pode fornecer área de controle, salvo regra própria.

Construção valida posição, distância, bloqueios, recursos coletivos, concorrência, limite e permissão. Fronteiras e bônus são calculados no backend e projetados em camada visual. Ataque/destruição de estrutura altera imediatamente território, limites, bônus e rotas quando aplicável.

## Operações conjuntas

Rallies, guarnições, reforços, alvos marcados, lembretes e avisos militares. Líder oficial inicia operação dentro das permissões e outros enviam exércitos reais. Conflitos de tropas simultâneas exigem transações/lock apropriado.

## Diplomacia

Relações: neutra, amigável, aliada, não agressão, hostil e coalizão, com ofertas, aceitação, prazo, revogação e histórico. Mensagens de diplomacia podem gerar efeitos sociais; buffs ou restrições militares só se regra específica for implementada.

## Reino, trono e títulos

Uma aliança pode conquistar objetivo central, habilitando escolha de rei/liderança do reino. Sistemas para cargos, títulos, bônus, comunicados, mandatos e eleições/nomeações conforme modo escolhido. O painel administrativo real nunca deve ser acessível por rei do jogo.

## Chat — canais e ACL

- **Global**: comunicação ampla entre reinos, com shard/paginação e moderação própria.
- **Reino**: apenas governador pertencente ao mesmo reino.
- **Aliança**: apenas membro atual; ao sair perde acesso a eventos posteriores e a histórico conforme política.
- **Coalizão**: apenas participantes autorizados.
- **Privado**: usuários envolvidos; bloqueios/denúncias.
- **Grupo**: membros autorizados.
- **Sistema/eventos**: emissão somente por serviços autenticados do jogo.

Campos de mensagem: id, channel_id, author, timestamp de servidor, texto/elementos estruturados, editado/deletado, referência opcional a coordenada e batalha. Validação de comprimento, sanitização, rate limiting, filtro antispam e auditoria proporcional.

Coordenadas e relatórios devem ser componentes clicáveis com autorização e deep-link interno. Avisos de ataque e anúncio de aliança devem diferenciar mensagem de jogador e mensagem oficial.

## Correio

Correspondência separada do chat: mensagens pessoais, comunicados, recompensas, batalhas e sistema; leitura, arquivamento, envio/recebimento e histórico.

## Critério de aceitação fase A

Duas contas: A cria aliança; B solicita; A aprova; B aparece como membro; B envia mensagem na aliança; A recebe instantaneamente; C não membro não acessa; B sai e perde permissão. Chat do reino e global transmitem mensagens verdadeiras, persistem e são pagináveis.

