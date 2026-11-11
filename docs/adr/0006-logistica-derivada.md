# 0006 — Rede logística derivada, não guardada

**Contexto.** A Fase C pede ferrovias automáticas entre construções próximas, bônus de produção e conexões entre aliados, sem botão e sem poluir o mapa.

**Decisão.** A rede é uma função pura das construções concluídas (`shared/play/logistics.ts`): por nação, a menor árvore (Kruskal) entre construções a até 300 km em regiões iguais ou vizinhas; fábricas se ligam à cidade/porto aliado mais próximo. Nada é gravado: o servidor calcula ao acertar o saldo, e o cliente calcula a mesma rede para desenhar e mostrar bônus.

**Por quê.**
- Uma fonte só: o trilho no mapa é exatamente o que gera bônus, sem tabela para sincronizar.
- A rede muda sozinha quando construções mudam (e, na Fase E, quando territórios caírem).
- Sem custo de migração; trocar o alcance ou o bônus é mudar uma constante (com `ECONOMY_RULES_VERSION` subindo).

**Custo.** Toda mudança que altera a rede precisa acertar o saldo dos afetados antes: conclusão de obra nova (nação + membros da aliança) e entrada/saída de aliança (gancho `MembershipHooks` na `AllianceService`). Os acertos seguem ordem crescente de id para duas transações não se travarem. O cálculo é O(n²) por nação, aceitável para dezenas de construções; se uma nação passar de algumas centenas, trocar por grade espacial.
