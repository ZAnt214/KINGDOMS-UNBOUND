# COMBATE, COMANDANTES E HOSPITAIS

## Princípios

Combate estratégico autoritativo no servidor, previsível o bastante para explicar resultados e reexecutável em testes. Cliente renderiza e pode pedir ações válidas, não calcula o resultado oficial.

## Tropas

Quatro famílias: infantaria, cavalaria, arqueiros, cerco. Planejar cinco tiers por família, atributos (ataque/defesa/vida/velocidade/carga), custos/tempo de treino e condição operacional. Matriz de vantagens deve ser explicitada em dados versionados; nunca hardcode espalhado.

## Estados militares

Reservada na cidade, em treinamento, disponível, em marcha, guarnição, em combate, ferida leve, ferida grave, em cura, perdida permanentemente. Garantir que unidades não existam em dois locais ao mesmo tempo.

## Comandantes

Recrutamento, raridade, XP, níveis, estrelas, talentos, habilidades ativas/passivas, equipamentos e papéis. Formação pode ter comandante principal e secundário; validar compatibilidade e evitar reutilizar comandante em marchas conflitantes.

Sistema de efeitos com tipos claros: aumento de atributos, escudo, dano de habilidade, cura permitida, contra-ataque, custo de energia, bônus situacional. Registrar duração, stack/limites, cooldown e prioridade de aplicação.

## Motor de combate

Representar participantes como exércitos com composição, líderes, status, modificadores, posição/alcance e objetivo. O combate avança por eventos/ticks definidos pelo servidor; cada janela resolve habilidades, dano, ferimentos, moral/energia se aplicável, retirada e fim.

Entradas:
- composição e tiers;
- atributos base, pesquisas e bônus de civilização;
- talentos/equipamentos/skills;
- relação de vantagens de tipos;
- território e fortificação;
- tamanho e capacidade de reforços;
- efeitos temporários registrados.

Resultados: vencedores, dano causado/recebido, unidades remanescentes, feridos, perdas permanentes, saques (se permitidos), mudança de posição/ocupação, XP, eventos e relatórios.

Sugestão de base para balanceamento (NÃO regra canônica de Rise of Kingdoms): calcular dano esperado a partir de força ofensiva e mitigação de defesa, multiplicado por efeitos contextualizados; arredondar conforme regra e limitar valores. Implementar testes de invariantes (não gerar tropas, não curar acima do máximo, não causar dano negativo, não duplicar recompensa).

## Modos

1. PvE contra inimigos neutros, níveis e pontos de ação.
2. PvP campo aberto com chegada/interceptação e múltiplas marchas.
3. Ataque a cidade com muralha, guarnição e regras de saque/perdas.
4. Estruturas territoriais e defesa de fortes/templos.
5. Reforços e tropas combinadas.
6. Rally com líder, inscrição, concentração, saída e resultado.
7. Retirada, retorno e recuperação de estado.

Não implementar todos de uma vez; usar mesma fundação de motor.

## Hospitais

Capacidade por nível e bônus; transformar ferimentos graves em fila de cura com custo, duração, slots e descontos configuráveis. Ferimento leve pode seguir recuperação simplificada, conforme regras registradas. Excedente e perdas permanentes devem seguir normas explícitas, sem surpresas não explicadas ao jogador.

## Relatórios e persistência

Relatórios imutáveis com battle_id, reino, coordenadas, horário, participantes, composição inicial/final, modificadores, eventos, baixas, feridos, recompensa e resultado. Políticas de privacidade para divulgação em chat e correio.

## Idempotência

Comando de ataque precisa de identificador único, transação que reserva as tropas, validação do alvo e resolução executada no máximo uma vez. Reiniciar processo ou perder conexão não duplica batalhas nem perdas.

## Testes mínimos

- vantagem entre unidades aumenta/reduz dano como definido;
- buffs não são aplicados duas vezes;
- recursos/tropas nunca negativos;
- baixa e cura respeitam conservação de unidades;
- rally tem capacidade e permissões válidas;
- repetição do mesmo comando não duplica combate;
- combate e relatórios reaparecem após reconexão;
- UI reproduz resultado confirmado pelo servidor.

## Expansões

Cerco avançado, terreno tático, alianças globais, temporadas e unidades históricas originais são objetivos posteriores. Não apresentar como operacionais sem testes.
