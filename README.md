# KINGDOMS UNBOUND

**MMO persistente de estratégia, civilizações, cidades, alianças e guerras territoriais.**

> Status atual: **documentação de pré-produção**. A existência destes documentos não significa que o jogo, o servidor ou o multiplayer estejam implementados.

## Visão

KINGDOMS UNBOUND será um jogo de estratégia para navegador e PWA mobile, com prioridade para iPhone/Safari. Cada jogador administra uma cidade, desenvolve sua civilização, recruta comandantes, movimenta exércitos num mapa compartilhado, integra uma aliança e compete pelo controle político/militar do reino.

A referência principal de experiência é **Rise of Kingdoms**. Queremos profundidade similar nas *mecânicas de gênero*, com código, textos, identidade visual, mapas, recursos gráficos e personagens **originais**, sem copiar materiais protegidos de terceiros.

## Documentação e entrada para o Work

- [Prompt mestre para o ChatGPT Work](docs/WORK_MASTER_PROMPT.md) — briefing completo, escopo, fases, testes e entregáveis.
- [Game Design](docs/GAME_DESIGN.md) — loop de jogo, progressão, cidade, economia e civilizações.
- [Sistemas de multiplayer e mundo](docs/WORLD_MAP.md) — reinos, mapa, exploração, marchas e sincronização.
- [Alianças e política](docs/ALLIANCE_SYSTEM.md) — clãs, cargos, territórios, diplomacia, governo e chat.
- [Combate](docs/COMBAT_DESIGN.md) — tropas, comandantes, confrontos, hospitais e relatórios.
- [Arquitetura técnica](docs/ARCHITECTURE.md) — cliente, simulação autoritativa, tempo real, PWA e segurança.
- [Modelo de dados](docs/DATABASE.md) — entidades, isolamento por reino e consistência.
- [Plano de implementação](docs/IMPLEMENTATION_PLAN.md) — marcos executáveis e definição de pronto.
- [Matriz de sistemas](docs/SYSTEMS.md) — inventário, integrações e cobertura.
- [Testes e validação](docs/TEST_REPORT.md) — cenários e estado de verificação.
- [Progresso](docs/PROGRESS.md) — status verdadeiro, decisões e próximos passos.
- [Referências de pesquisa](docs/RESEARCH_REFERENCES.md) — fontes e protocolo de verificação de mecânicas.
- [UX e direção de arte](docs/UX_ART_DIRECTION.md) — visual original de jogo e experiência mobile/Safari.

## Primeira meta jogável

1. Dois jogadores com contas e cidades independentes;
2. ingresso no **mesmo reino persistente**;
3. mapa sincronizado mostrando cidades conforme regras de descoberta;
4. construção com recursos, tempo de servidor e persistência;
5. criação, convite/solicitação e ingresso em aliança;
6. chat do reino, da aliança e global, com mensagens realmente transmitidas;
7. recarregar, sair e voltar sem perder progresso.

Depois: tecnologia, unidades, comandantes, marchas, coleta, combate, territórios, política e guerras entre reinos.

## Princípios que não negociamos

- **Nunca simular funcionalidade como se fosse real.** Mock deve ser identificado.
- **Servidor é fonte da verdade:** recursos, relógio, progresso, movimentação, combate e permissões.
- **Testar com duas sessões reais** antes de alegar multiplayer.
- **Foco no iPhone:** interface mobile-first com toque, zoom, safe-area, suspensão e reconexão.
- **Arquitetura modular** e dados versionados, prontos para recursos originais futuros.
- **Segurança e comunidade:** acesso de canais, antiabuso, moderação, auditoria.
- **Nenhuma promessa de escala** sem teste de carga.

## Como iniciar no Work

Abra este repositório `ZAnt214/KINGDOMS-UNBOUND`, leia `docs/WORK_MASTER_PROMPT.md` e as especificações relacionadas, examine o código existente e inicie a **Fase A** sem trocar a documentação por telas decorativas. Registre o que realmente foi construído e testado em `docs/PROGRESS.md` e `docs/TEST_REPORT.md`.

## Referências de pesquisa

- https://rok.lilith.com/ — referência oficial de produto.
- https://play.google.com/store/apps/details?id=com.lilithgame.roc.gp — apresentação pública do jogo.
- https://riseofkingdoms.fandom.com/wiki/Rise_of_Kingdoms_Wiki — enciclopédia da comunidade; verificar precisão e atualidade.

**Nota:** sistemas, números e regras citados em referências externas devem ser conferidos antes de serem tratados como fatos atuais. Esta documentação é a especificação **do nosso projeto**.
