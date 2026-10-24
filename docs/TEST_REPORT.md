# TEST REPORT — FASE A / HISTÓRICO BASELINE

## Execução em 2026-10-24 — work/phase-a-core

Ambiente: Linux, Node v24.22.1, SQLite real em arquivos temporários, HTTP local, cookies separados, conexões SSE simultâneas. Base remota b1c7e70a220f869c59f8168f3f35296952393d34; código e evidência versionados juntos no PR. Responsável: Codex.

**PASS:** `npm run check`; `npm test` (11 testes, 0 falhas, aproximadamente 18s). [Saída integral](evidence/phase-a-integration.txt). Sem mocks de rede/banco: clientes falam por HTTP com o servidor real. Teste principal usa clock injetado para limites/timers; teste adicional lança dois processos sucessivos com relógio real, encerrando o servidor durante a obra e aguardando sua duração.

| Critério | Resultado observado e limite |
|---|---|
| A-01–03 | PASS backend: contas/cookies/cidades/saldos separados, mesmo reino; terceiro não membro e quarto em outro reino |
| A-04–06, A-20 | PASS backend: cobrança única sob duas requisições concorrentes; payload adulterado negado; requisitos; obra termina offline após reinício real |
| A-07–08 | PASS backend/SSE: mesmas cidades públicas, atualizações sem reload; renderização visual pendente |
| A-09–10 | PASS backend/SSE: criar, solicitar, aprovar, membros, promoção e bloqueio de não líder |
| A-11–12 | PASS SSE: mensagens reino/aliança recebidas pelo outro cliente sem nova consulta manual |
| A-13 | PASS backend: global visível ao jogador do outro reino; cidades/canal de reino continuam isolados. Stream cross-realm específico não exercitado |
| A-14 | PASS backend: histórico persistente, cursor, páginas sem sobreposição, eventos novos |
| A-15–16 | PASS backend/SSE: C bloqueado; saída de B remove histórico/canal e mensagens posteriores da conexão já aberta |
| A-17 | PASS reconexão HTTP/SSE após restart; Safari minimizar/retomar NÃO TESTADO |
| A-18–19 | BLOQUEADO: navegador indisponível; teclado, pinça, arraste, orientação e visual não validados |
| Extras | PASS: origem externa negada, sessão revogada, cursor inválido, flood limit, ledger somado igual ao saldo |

**E2E de navegador: BLOQUEADO, não PASS.** `tests/browser.mjs` foi criado e tentado; parou no lançamento por ausência de Chromium. Download via Playwright falhou com “End of central directory record signature not found” (ZIP truncado). [Erro da tentativa](evidence/browser-attempt.txt). Nenhuma interação visual desse script foi executada. Os testes HTTP não comprovam usabilidade nem renderização.

Sem benchmark, teste de carga, restore de backup, execução Docker, CI remoto confirmado ou deploy. Não há alegação de milhares de jogadores, Safari validado, arte final ou Fase A completa.

---
## Baseline original (abaixo, mantido como registro anterior)

Data da abertura: 2026-10-24.
**Resultado:** AINDA NÃO TESTADO. Neste commit foram produzidos somente arquivos de documentação; nenhum servidor do jogo, client, testes automatizados ou infraestrutura de gameplay foi implementado/validado.

## Como manter este arquivo

Para cada execução de teste registrar: data/hora, branch/SHA, ambiente e versões, passos, resultado observado, evidências (log, screenshot, link), status PASS/FAIL/BLOCKED e responsável. Uma checklist escrita **não** é evidência de execução.

## Cenários da Fase A

| ID | Teste | Resultado atual |
|---|---|---|
| A-01 | duas contas e sessões independentes | NÃO EXECUTADO |
| A-02 | ambos no mesmo reino | NÃO EXECUTADO |
| A-03 | cidades e recursos isolados por governador | NÃO EXECUTADO |
| A-04 | economia com saldo debitado apenas uma vez | NÃO EXECUTADO |
| A-05 | construção permanece após reload | NÃO EXECUTADO |
| A-06 | construção termina pelo relógio do servidor offline | NÃO EXECUTADO |
| A-07 | cidades aparecem no mesmo mapa conforme descoberta | NÃO EXECUTADO |
| A-08 | mudanças relevantes chegam sem reload | NÃO EXECUTADO |
| A-09 | criação, candidatura e aprovação em aliança | NÃO EXECUTADO |
| A-10 | lista de membros sincroniza e cargos respeitam RBAC | NÃO EXECUTADO |
| A-11 | chat de reino transmite entre A e B | NÃO EXECUTADO |
| A-12 | chat de aliança transmite apenas para membros | NÃO EXECUTADO |
| A-13 | chat global cruza reinos conforme design | NÃO EXECUTADO |
| A-14 | histórico persiste, pagina e recebe novos eventos | NÃO EXECUTADO |
| A-15 | terceiro não membro é bloqueado de canal restrito | NÃO EXECUTADO |
| A-16 | saída de aliança revoga acesso | NÃO EXECUTADO |
| A-17 | reconexão após minimizar Safari recupera estado | NÃO EXECUTADO |
| A-18 | teclado virtual não quebra chat/viewport no iPhone | NÃO EXECUTADO |
| A-19 | gesto de pinça/arraste e botões funcionam | NÃO EXECUTADO |
| A-20 | comandos repetidos não duplicam prêmios/recursos | NÃO EXECUTADO |

## Testes da Fase B+

- Marcha alcança alvo e retorna corretamente.
- Dois clientes enxergam a mesma marcha em diferentes posições interpoladas.
- Coleta não supera recurso do nó nem capacidade de carga.
- Combate resolvido apenas no backend gera relatório reprodutível.
- Feridos, mortos e cura têm contabilidade consistente.
- Permissões de rally, estrutura territorial e governo são verificadas.
- Eventos têm recompensas idempotentes e tempos autoritativos.
- Latência, consumo e FPS avaliados em dispositivo real e em carga.

**Estado desses testes:** NÃO EXECUTADO.

## Critérios de alerta

Rejeitar resultados baseados só em screenshots, mensagens mockadas, dados estáticos, cache de navegador ou inspeção visual sem validação de persistência.

## Registro de execuções

Nenhuma execução registrada até o início do desenvolvimento.

