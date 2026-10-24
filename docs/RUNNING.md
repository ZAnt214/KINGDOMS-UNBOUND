# Executar a alpha técnica

Requer Node **24.22.1** (família 24; usa node:sqlite). Sem dependências de runtime, banco externo ou chave de API.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm start
```

Abra http://127.0.0.1:3000. Cadastre A em uma janela e B em outro navegador/perfil anônimo (cookies independentes), escolhendo o mesmo reino. Construir fazenda, abrir Mundo, criar aliança com A, solicitar com B, aprovar com A, conversar nos canais, recarregar e sair/entrar novamente. Há dois reinos para verificar chat global e isolamento. Não há contas padrão nem senha compartilhada.

O servidor escuta apenas localhost por padrão. `HOST=0.0.0.0 PORT=3000 npm start` permite acesso de outros dispositivos na rede, se firewall permitir. PWA, service worker e crypto.randomUUID exigem contexto seguro: para iPhone use HTTPS, não simplesmente HTTP por IP da rede. Não declare Safari validado só por abrir no desktop.

## Configuração e operação

- `DB_PATH`: arquivo SQLite, padrão `data/kingdoms.sqlite`. Nunca colocar em diretório público ou commitar o arquivo.
- `PORT`: padrão 3000. `HOST`: padrão 127.0.0.1.
- `NODE_ENV=production`: habilita cookie Secure. TLS deve terminar em proxy e encaminhar à aplicação.
- `ORIGIN=https://seu-dominio`: origem pública exata, obrigatória na configuração de produção atrás de proxy.
- `GET /health`: consulta simples ao banco. Não retorna credenciais.
- `SIGTERM`/`SIGINT`: fechamento de streams, HTTP e banco.

Só uma instância por arquivo/volume. Sem suporte a filesystem efêmero ou múltiplas réplicas. Não usar Vercel Functions como host deste processo. Dockerfile está fornecido mas não foi construído/testado aqui. Monte volume persistente em `/app/data`, configure ORIGIN e TLS; não exponha uma alpha sem revisar pendências de segurança/moderação/backup no ADR.

Backup nesta versão: parar o processo de forma limpa antes de copiar o diretório `data/` completo; manter cópia fora do host. Restauração deve ser ensaiada em ambiente separado antes de produção. Restore de backup não foi testado; restart de processo foi.

## Contratos principais

| Rota | Uso |
|---|---|
| POST /api/register | login, password, name, kingdom, civilization |
| POST /api/login | login, password |
| POST /api/logout | objeto vazio |
| GET /api/config | reinos/civilizações disponíveis |
| GET /api/state | snapshot privado autenticado |
| GET /api/events | SSE autenticado, event: snapshot |
| GET /api/messages?channel=...&before=... | histórico paginado, ACL em cada leitura |
| POST /api/command | action, data; header Idempotency-Key obrigatório |

Ações: build; alliance.create/apply/approve/reject/rank/leave; chat. Exemplos em `tests/integration.test.js`. Respostas de erro trazem `error` e `requestId`. Credencial fica no cookie, não no localStorage. Ao perder uma resposta, repetir **a mesma chave e payload**. O cliente faz uma repetição automática em falha de transporte; não manter fila offline de comandos.

## Teste visual opcional (ainda bloqueado nesta execução)

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node tests/browser.mjs
```

Este teste cria duas sessões de navegador e banco temporário, executa o fluxo social/construção/chat e grava screenshot em `artifacts/phase-a-mobile.png`. Dependência opcional não faz parte do runtime. Para usar um pacote Playwright já instalado, defina PLAYWRIGHT_MODULE para o index.mjs dele. Binários precisam estar presentes.

Não foi possível executar a UI no ambiente desta entrega: download de Chromium resultou em arquivo truncado. Logs em `docs/evidence/browser-attempt.txt`. Teclado iOS, pinça real, suspensão Safari, FPS/memória, orientação e instalação PWA ainda precisam de teste.
