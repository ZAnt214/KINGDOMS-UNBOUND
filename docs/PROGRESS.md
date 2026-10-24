# PROGRESSO REAL — KINGDOMS UNBOUND

**Última atualização:** 2026-10-24 · branch `claude/fase-a-railway`.

## Estado do projeto

**Fase A implementada e testada em ambiente local/CI.** Servidor autoritativo Node/TypeScript com PostgreSQL e WebSocket, cliente PWA mobile-first. **Em produção** em https://kingdoms-unbound.vercel.app (Vercel + Supabase, ver `docs/DEPLOY_VERCEL.md`). Fases B–E não iniciadas.

## Entregue nesta etapa

### A1 — Identidade e mundo
- [x] Cadastro, login, logout, sessão em cookie HttpOnly (token com hash SHA-256, bcrypt para senha).
- [x] Governador com nome único (case-insensitive), um por conta.
- [x] Três civilizações originais com bônus reais aplicados no servidor: Coroa de Auren (+15% alimento), Clãs de Kharuun (+15% pedra), Ligas de Veyra (obras 10% mais rápidas).
- [x] Dois reinos (Valdoria, Ostmark) com terreno determinístico original 120×120; isolamento por reino em mapa, alianças e chat.
- [x] Cidade criada em posição válida (terreno construível, distância mínima entre cidades).
- [~] Snapshot do mapa limitado ao próprio reino e a uma área máxima. **Não há névoa de guerra** (todas as cidades do reino são visíveis): decisão da Fase A, névoa prevista na Fase B.

### A2 — Cidade e economia
- [x] Cidade isométrica navegável (arraste, pinça, roda), seleção de edifício e painel com custo, tempo, efeito e motivo de bloqueio.
- [x] Seis edifícios com efeito real: Prefeitura (limite de níveis), Fazenda, Serraria, Pedreira, Mina de Ouro (produção), Armazém (capacidade).
- [x] Saldos + ledger imutável (concessão inicial, produção, custo de obra) na mesma transação; restrição `amount >= 0`.
- [x] Obra por timestamps de servidor; worker de 1 s e conclusão preguiçosa na leitura; sobrevive a reinício.
- [x] Idempotência por `idempotency_key` (repetição devolve a mesma resposta sem cobrar).
- [x] Fila única de construção por cidade (índice parcial único + lock da cidade).

### A3 — Mapa compartilhado
- [x] Mapa isométrico próprio com culling, LOD por zoom, pan/pinça, coordenadas, "ir para" e "minha cidade".
- [x] Cidades de todos os governadores do reino; atualização em tempo real (`map.city`) ao concluir obras ou mudar de aliança.
- [x] Reconexão com backoff; ao reconectar o cliente recarrega snapshots.
- [~] Assinatura por **reino**, não por região/chunk (suficiente para 120×120; chunks na Fase B).

### A4 — Alianças
- [x] Criar (nome/sigla únicos por reino), buscar, candidatar, cancelar, aprovar/recusar, sair, expulsar, promover/rebaixar, transferir liderança, dissolução quando o último membro sai.
- [x] RBAC R1–R5 verificado no servidor (`ALLIANCE_PERMISSIONS` em `shared/rules.ts`) e auditoria em `audit_logs`.
- [x] Eventos em tempo real de candidatura e mudança de membros.

### A5 — Chat
- [x] Canais global (entre reinos), reino e aliança; mensagens persistidas, histórico paginado, não lidas.
- [x] ACL no servidor em leitura, escrita e entrega WebSocket; saída da aliança revoga imediatamente.
- [x] Rate limit (5 mensagens/10 s), limite de 500 caracteres, saneamento de caracteres de controle.
- [x] Coordenadas `X:12 Y:40` viram referência estruturada validada pelo servidor e link que centraliza o mapa.

### A6 — Qualidade e entrega
- [x] 24 testes de integração (Vitest, Postgres real, 4 jogadores em 2 reinos).
- [x] E2E com dois navegadores independentes em viewport de iPhone 13 (12 verificações).
- [x] CI no GitHub Actions (typecheck, testes, build).
- [x] Suporte a Vercel (`server.ts`, `vercel.json`, cliente em `public/`) e a múltiplas instâncias; 3 testes multi-instância.
- [x] Dockerfile + `railway.json`; imagem simulada localmente (build limpo, só dependências de produção, healthcheck OK).
- [ ] Teste em **iPhone/Safari físico** — não disponível neste ambiente.
- [x] Deploy real na Vercel com Supabase; E2E de dois jogadores contra a URL pública: 12/12.

## Limitações e dívidas conhecidas

- Tempo real entre instâncias via Postgres LISTEN/NOTIFY (testado com 2 instâncias); rate limits ainda são por instância.
- Sem névoa de guerra, marchas, tropas, combate, pesquisa, comandantes (Fase B+).
- Sem moderação/denúncia/bloqueio de chat, correio, recuperação de senha, painel admin.
- Arte procedural provisória (original, mas não final).
- Sem teste de carga; nenhuma afirmação de capacidade.

## Próxima ação objetiva

2. Testar em iPhone físico (Safari e PWA instalada) e registrar resultados em `TEST_REPORT.md`.
3. Iniciar Fase B: chunks do mapa, névoa de guerra, tropas e marchas.

## Decisões registradas

- `docs/adr/0001-stack-fase-a.md` — stack, Canvas 2D em vez de PixiJS, Railway com 1 réplica.
- Valores de balanceamento em `shared/rules.ts` (`RULES_VERSION = 1`) são decisões próprias iniciais, não números de outros jogos.
