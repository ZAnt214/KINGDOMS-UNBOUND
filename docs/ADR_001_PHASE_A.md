# ADR 001 — Fundação executável da Fase A

Data: 2026-10-24. Estado: adotada para alpha técnica local, não para escala MMO de produção.

## Contexto e auditoria

Base remota: `b1c7e70a220f869c59f8168f3f35296952393d34` (main). Todos os 14 arquivos existentes foram lidos: README e 13 documentos em docs. Não havia código, AGENTS.md, banco, credenciais de infraestrutura ou configuração de deploy no repositório. Os documentos de produto foram preservados. Não provisionamos serviço pago ou infraestrutura externa.

## Decisões e desvios explícitos da stack candidata

- Node **24.22.1**, JavaScript ESM e APIs nativas. Sem dependências de runtime; a implementação pode ser executada com `npm start`. TypeScript ainda pendente. Sintaxe checada e domínio coberto por integração, mas isso não substitui typecheck.
- SQLite em arquivo com WAL, foreign keys, constraints e `BEGIN IMMEDIATE`. Migração versionada `migrations/001_core.sql`. Escolha para disponibilizar agora persistência real e teste reproduzível sem credenciais externas. **Não equivale ao PostgreSQL pretendido na arquitetura**, nem suporta múltiplas réplicas deste servidor. Migração PostgreSQL e teste de concorrência entre processos são próximos marcos.
- REST para intenções e **SSE/EventSource** para snapshots autorizados. Comunicação real, de baixa frequência, suficiente para construção/chat da fatia A. **Não implementa WebSocket**. Cada conexão recebe exclusivamente estado permitido e revalida sessão/membership em cada envio. A cada comando confirmado e a cada 2s há snapshot. Reconexão envia snapshot completo, sem depender de replay de eventos antigos. ID de transporte reinicia com processo; não é versão durável. `revision` vem da auditoria de comandos, não inclui ticks econômicos; clientes substituem snapshot completo em ordem de conexão, sem aplicar deltas.
- Canvas 2D para cidade/mapa isométrico original, UI HTML/CSS sem framework. Esta é arte provisória, não polimento comercial. PixiJS/WebGL, chunks, LOD, culling, streaming por interesse e escala permanecem pendentes.
- Servidor de longa duração com disco persistente. Não colocar esta aplicação em função serverless efêmera. Dockerfile e workflow adicionados, mas Docker/build hospedado/CI remoto não foram executados nesta entrega.

## Regras originais v1, não números de Rise of Kingdoms

Dois reinos iniciais vazios (Aurora e Véu do Norte), sem jogadores ou mensagens falsas. Um governador/cidade por conta, sem migração. Limite explícito de 400 cidades por reino, ocupando grid de coordenadas entre 5 e 100 com espaçamento 5. Nenhuma cidade se sobrepõe.

Visibilidade da Fase A: todas as cidades do mesmo reino são públicas; cidades de outro reino não são enviadas. A projeção pública expõe proprietário, nome, civilização, coordenadas e nível da prefeitura. Não expõe saldos nem edifícios privados. Névoa individual fica para B.

Civilizações implementadas: Aurianos (+20% alimento) e Silvanos (+20% madeira). Bônus aplicados no servidor: 6 unidades/s/nível contra 5 base. Não há unidade/comandante exclusivo nesta fase.

Prefeitura inicia no nível 1; fazenda, serraria, pedreira e mina no 0. Uma obra ativa por cidade, níveis 0–5. Edifício econômico não ultrapassa prefeitura. Custos/tempos multiplicados pelo nível destino; valores em `src/rules.js`. Saldo inicial de 1000 de cada recurso e teto de 10000 por recurso. Só madeira/pedra são consumidas nas obras desta fatia. Produção começa na conclusão, continua offline e é materializada por timestamp no tick ou no próximo acesso, inclusive após reinício. Segundos inteiros, sem retorno ao cliente como fonte de tempo. Ledger registra concessão, gastos e produção na mesma transação do saldo. Sem cancelamento/aceleração/posicionamento livre nesta entrega.

Alianças: nome/sigla únicos por reino; criador R5; candidaturas/aprovação/recusa; novo membro R1; líder atribui R1–R4; R4/R5 aprovam/recusam; R1–R4 podem sair; líder não pode sair até implementar transferência/dissolução. Auditoria por comando. Matriz padrão em `src/rules.js`, não configurável por aliança ainda.

Chat: global entre reinos, reino e aliança; histórico de 30 por página com cursor exclusivo; texto de até 500 caracteres; 6 mensagens/10s por governador; HTML mostrado como texto (DOM textContent). Saída remove acesso ao histórico e aos eventos futuros, inclusive nas conexões já abertas. Não há mensagem privada, bloqueio, denúncia, mute ou moderação administrativa nesta entrega. Não lidas são contador transitório da UI, ainda sem teste visual e sem persistência.

## Segurança e consistência

Senha scrypt com salt independente; cookies HttpOnly, SameSite=Strict, Secure em produção; sessão opaca armazenada por hash, expira em 7 dias; logout revoga no servidor. JSON com limite de 8KB, campos permitidos, origem e Fetch Metadata, rate limits de auth/comandos/chat. Não aceita saldo, fim de timer ou proprietário enviados como autoridade pelo cliente. Idempotency-Key vinculada a ator e fingerprint; repetições idênticas retornam resultado original, payload diferente retorna 409. Publicação somente após commit. Lógica SQL síncrona serializa transações no processo; hashing de senha assíncrono.

Limites conhecidos: rate limit de IP usa socket (atrás de proxy todos podem compartilhar IP; não confiar cegamente em X-Forwarded-For); limite em memória reseta em reinício; sem recuperação/verificação de conta, MFA, rotação automática, retenção/limpeza de ledger/chat, outbox durável ou monitoramento externo. Snapshots completos a cada 2s geram custo linear; produção gera ledger frequente. São bloqueadores para operação pública em escala. Nenhum benchmark de capacidade realizado.

## Evidência e próxima decisão

`tests/integration.test.js` valida sessões, eventos, transações, ACL e restart. Teste de processo usa relógio real e servidor parado por aproximadamente 16s. Teste de navegador incluído em `tests/browser.mjs`, execução bloqueada por ausência de binário e falha no download. Não confundir integração HTTP com E2E visual.

Próximas decisões: validar UI em Chromium/WebKit e Safari físico; corrigir UX observada; escolher hospedagem com volume/backup; migrar PostgreSQL e introduzir interest management/deltas antes de ampliar população. Só então avançar módulos B.
