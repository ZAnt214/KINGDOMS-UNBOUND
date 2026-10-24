# Deploy no Railway

O repositório já contém `Dockerfile` e `railway.json` (healthcheck `/healthz`, 1 réplica, reinício em falha). As migrações do banco e os reinos iniciais são aplicados automaticamente na inicialização.

## Opção 1 — Painel do Railway (recomendado)

1. Em <https://railway.com/new>, escolha **Deploy from GitHub repo** e selecione `zant214/kingdoms-unbound` (branch `main` depois do merge, ou o branch do PR).
2. No mesmo projeto: **+ New → Database → PostgreSQL**.
3. No serviço do jogo → **Variables**, adicione:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referência ao plugin; usa a rede privada)
   - `NODE_ENV` = `production`
4. Serviço do jogo → **Settings → Networking → Generate Domain** para obter a URL pública `https://<nome>.up.railway.app`.
5. Aguarde o deploy ficar verde (o healthcheck consulta o banco). Abra a URL no iPhone e use **Compartilhar → Adicionar à Tela de Início** para instalar como PWA.

Cada push no branch configurado gera um novo deploy.

## Opção 2 — CLI

```bash
npm i -g @railway/cli
railway login              # ou RAILWAY_TOKEN=<token de projeto> no ambiente
railway init               # cria o projeto
railway add --database postgres
railway up                 # envia e constrói o Dockerfile
railway variables --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --set NODE_ENV=production
railway domain             # gera a URL pública
```

## Variáveis

| Variável | Obrigatória | Padrão | Uso |
|---|---|---|---|
| `DATABASE_URL` | sim | — | PostgreSQL. Para URL pública com TLS, inclua `?sslmode=require`. |
| `PORT` | não | definida pelo Railway | Porta HTTP/WebSocket. |
| `NODE_ENV` | sim em produção | — | `production` ativa cookie `Secure`. |
| `KINGDOM_CAPACITY` | não | 500 | Governadores por reino. |
| `AUTH_RATE_PER_MINUTE` | não | 10 | Tentativas de login/cadastro por IP por minuto. |

## Limitações conhecidas

- **Manter 1 réplica.** O hub de tempo real e os rate limits são em memória; mais réplicas exigem Redis (pub/sub).
- Backups: ative os backups do plugin PostgreSQL no painel do Railway; não há rotina de backup própria ainda.
- Logs são JSON em stdout (visíveis em **Deployments → Logs**).
