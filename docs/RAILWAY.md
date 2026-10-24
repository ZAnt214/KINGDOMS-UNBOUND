# Publicação no Railway

Solicitada em 2026-10-24. **Preparação no repositório concluída; serviço ainda não criado/publicado.** A integração Railway precisa estar conectada para provisionar e verificar o ambiente.

## Fonte de código

Repositório `ZAnt214/KINGDOMS-UNBOUND`, branch `work/phase-a-core` (contém a implementação; main ainda tem apenas documentação). Dockerfile na raiz. `railway.json` define Docker, healthcheck `/health`, timeout 120s, uma réplica e restart por falha. Não há comando de pre-deploy: a migração executa no início do servidor, com o volume montado.

## Configuração necessária no serviço

Criar **volume persistente** montado em `/app/data` antes da primeira conta. A instrução VOLUME do Dockerfile não provisiona automaticamente o volume Railway. Uma única instância/região; SQLite não deve ser compartilhado por réplicas.

| Variável | Valor |
|---|---|
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| DB_PATH | /app/data/kingdoms.sqlite |
| ORIGIN | https://DOMINIO-PUBLICO-GERADO-PELO-RAILWAY |
| RAILWAY_RUN_UID | 0 |

PORT é fornecida pelo Railway e lida pelo servidor. Gerar domínio público e preencher ORIGIN com a URL HTTPS exata, sem barra final. Sem isso, a validação de origem rejeitará os formulários no proxy HTTPS. Cookie Secure permanece habilitado.

O Dockerfile usa usuário node. A documentação Railway informa que volumes são montados como root; RAILWAY_RUN_UID=0 evita erro de permissão no SQLite neste host. Essa configuração é específica de runtime, não mudança global de permissões do projeto.

## Verificação após publicação

1. Build e deploy saudáveis, `/health` retorna 200.
2. Abrir o domínio HTTPS em duas sessões, cadastrar governadores independentes.
3. Conferir duas cidades no mesmo reino; construir, solicitar/aprovar aliança e conversar.
4. Recarregar e autenticar novamente, confirmando persistência.
5. Reiniciar o serviço e verificar manutenção de contas, obra, aliança e histórico no volume.
6. Atualizar PROGRESS e TEST_REPORT com URL, deployment ID, SHA e resultados observados.

Custos/limites dependem do workspace/plano disponível e serão verificados na conta antes de ativar recursos cobrados. Não há publicação, cobrança ou capacidade de produção confirmada por este documento.

## Referências consultadas

- https://docs.railway.com/config-as-code/reference
- https://docs.railway.com/volumes
- https://docs.railway.com/variables/reference

A alpha continua com as limitações registradas no ADR 001 e sem benchmark MMO. Não desativar validação de origem nem Secure cookies para contornar configuração incorreta.
