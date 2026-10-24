# DADOS, RELAÇÕES E INVARIANTES

> Especificação conceitual inicial; implementar migrações SQL reais apenas na fase de código, validando índices e regras.

## Separação por domínio

| Domínio | Entidades sugeridas |
|---|---|
| Identidade | users, sessions, governors, civilizations |
| Reino | kingdoms, world_regions, map_objects, kingdom_passages, kingdom_titles |
| Cidade | cities, building_definitions, city_buildings, building_queues, city_decorations |
| Economia | resource_balances, resource_ledger, production_sources, gathering_nodes |
| Pesquisa | technology_definitions, governor_technologies, research_queues |
| Tropas | troop_definitions, troop_stacks, training_queues, hospitals, healing_queues |
| Comandantes | commander_definitions, governor_commanders, skills, talents, equipment, formations |
| Mundo | fog_of_war, scout_missions, armies, marches, waypoints, map_snapshots |
| Batalhas | battles, battle_participants, battle_events, battle_reports |
| Alianças | alliances, alliance_members, alliance_applications, alliance_roles, alliance_permissions |
| Coletivo | alliance_helps, alliance_technologies, alliance_donations, alliance_ledger, alliance_gifts |
| Território | alliance_structures, alliance_territory, alliance_relations, territory_events |
| Social | chat_channels, channel_members, chat_messages, conversations, mail, moderation_reports, blocks |
| Missões | quest_definitions, quest_progress, reward_claims, event_definitions, event_participation |
| Competição | rankings, seasons, season_kingdoms, season_scores |
| Operação | command_idempotency, audit_logs, domain_outbox, system_settings |

Nomes propostos, não esquema aprovado. Migrations podem adaptar conforme consultas reais.

## Chaves e isolamento

Cada governor referencia um user e um kingdom (com regra explícita para múltiplos governadores por conta e mudanças de reino). Entidades pertencentes ao reino devem conter kingdom_id e todas as consultas operacionais devem filtrar por ele; IDs globalmente únicos ajudam a impedir colisão. O chat global requer esquema de canais multi-reino com ACL separada.

Alianças vinculadas a reino; seus membros são governadores elegíveis desse mesmo reino. Uma cidade pertence a exatamente um governador na configuração inicial. Exército pertence a governador, e marcha pertence a exército/reino. Canais restritos vinculam permissão à associação válida.

## Economia transacional

Saldo de recurso exige:
- owner_type e owner_id, resource_type;
- balance e capacity;
- version para concorrência;
- ledger imutável com delta, motivo, command_id e timestamp.

Invariantes: nenhum saldo negativo, nenhum prêmio duplicado, nenhum consumo sem histórico, saldo modificado apenas via serviço autorizado. Ledger e saldo precisam commitar juntos em transação.

## Construções e pesquisas

Definição por versão: id, level, cost, duration, requirements, effect, visual_key. Instância do jogador: definition_id, current_level, position, status. Fila: id, owner, task_type, target, started_at, ends_at, status, modifiers_snapshot, idempotency_key.

Trabalho offline é recuperável pelo timestamp, sem depender de processo vivo.

## Marchas

Marcha: id, governor_id, kingdom_id, army_id, state, origin, destination, waypoints, depart_at, arrive_at, speed, version, target_id. Coordenadas podem ser colunas numéricas indexadas ou recurso geoespacial apropriado. Definir transições válidas e checagem otimista ou transação para comandos concorrentes.

## Batalhas

Registrar confronto único (battle_id), participantes, snapshots relevantes de composição/buffs, cadeia de eventos determinística quando viável, resultado e relatório. Relatórios não devem dar acesso a dados secretos de outros participantes.

## Aliança e território

Membro: alliance_id, governor_id, rank, joined_at, status. Impedir múltiplas associações simultâneas ativas quando a regra for uma aliança por governador.

Bandeira/estrutura com posição, HP, estado, owner, custo, conexões; território calculado de forma auditável e recomputável a partir das estruturas, não salvo como única verdade.

## Chat

channel: type, kingdom_id opcional, alliance_id opcional, visibility, status. message: id, channel_id, governor_id, body, structured_attachment, created_at, edited_at, deleted_at. Índices em (channel_id, created_at, id). Restrições de leitura/escrita no servidor, inclusive ao paginar histórico.

## Versionamento e eventos

Game definition version para efeitos/custos, domain event com sequência por agregado, outbox para publicação após commit. Comandos com idempotency_key únicos por escopo. Eventos entregues mais de uma vez devem ser consumidos de forma segura.

## Segurança e privacidade

Mínimo acesso, senhas nunca em texto puro, segredos fora do banco de jogo ou protegidos por serviço de auth. Políticas de retenção e exclusão para chat, denúncias e auditoria conforme legislação aplicável.

## Primeiro conjunto real de migrações

Prioridade Fase A: users/governors/kingdoms/cities, building_definitions/city_buildings/building_queues, resource_balances/resource_ledger, alliances/alliance_members/alliance_applications, chat_channels/chat_messages, map_objects, command_idempotency e audit_logs. Só depois adicionar módulos militares.

## Testes de integridade

Transações simultâneas, cobrança duplicada, acesso cruzado entre reinos, membro antigo lendo canal, regeneração de território, reinício durante timer, e reconstrução após crash.
