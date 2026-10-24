# TEST REPORT — BASELINE

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
