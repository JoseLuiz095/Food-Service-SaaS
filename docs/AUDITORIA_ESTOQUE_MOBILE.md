# Consulta de estoque por local e auditoria de pedidos

## Interface

A consulta agora começa pelo local selecionado, com nome, vínculo ao ponto de
retirada e quantidades disponíveis, reservadas e físicas. Busca e detalhes por
produto mantêm a tela mobile legível. Transferências, ajustes e configuração de
locais continuam acessíveis em seções expansíveis. A comparação entre locais
fica disponível nos detalhes de cada produto; a matriz permanece no desktop.

Ajustes e transferências mostram uma confirmação com produto, local e quantidade
antes de chamar as mesmas RPCs existentes. O servidor continua sendo a autoridade
do saldo. Respostas atrasadas de uma loja anterior são descartadas pela tela.
Nomes completos e áreas de toque maiores foram aplicados a produtos e à edição
de pedidos. Configurações identifica a prévia fictícia, e a agenda usa rótulos
em português sem alterar os valores persistidos.

## Investigação sem escrita remota

`scripts/audit-order-stock-readonly.sql` extrai um snapshot consistente de uma
loja explicitamente identificada, sem dados de contato de clientes. A consulta
usa `REPEATABLE READ READ ONLY`. Não chama RPC operacional nem ajusta dados.
Relatórios com pedidos reais e capturas ficam fora deste repositório público.

### Defeito existente confirmado, sem correção SQL nesta branch

`food_update_order_items_v1` libera uma reserva no local do pedido, mas refaz a
reserva sem definir `food.order_stock_location`. A reserva passa a usar o local
principal, embora o pedido continue apontando para o ponto original. O corpo da
função de edição no catálogo remoto foi comparado ao arquivo local e coincide.

Reprodução isolada: `node scripts/audit-order-location-db.mjs`.

O script cria dados sintéticos em PGlite e confirma o defeito: de 1 unidade
reservada no ponto para 2 no principal após editar. Também verifica rollback de
falha e rejeição de outro tenant/anônimo. O sucesso desse script significa
**defeito reproduzido**, não regra corrigida. Ele não conecta ao Supabase.

A correção futura deve preservar o contexto do local durante toda a re-reserva,
testar edição seguida de entrega/cancelamento e ser entregue como migration
revisada. Não usar esse achado para presumir que um pedido histórico foi afetado;
é necessário histórico de edição ou uma divergência atual comprovada.

Outros limites identificados: não há expiração automática de reserva neste
fluxo; pagamento aceita `pending`/`paid`; cancelamento de estoque `committed`
não comprova devolução física e não deve gerar reposição automática. Ausência de
ledger em pedidos anteriores à implantação não prova ausência de baixa.

## Verificação local

O teste `qa/tests/modules/mobile-admin-audit.spec.ts` usa fixtures sintéticas e
interceptação das chamadas Supabase para inspecionar estoque, locais, pedidos,
produtos, configurações, clientes e agenda em 360, 390 e 1366 px. Não comprova
login, contagem física ou deploy de produção. O estágio `before` serve para
capturar a versão original; os asserts das melhorias usam o estágio `after`.

Comandos usados:

```sh
PLAYWRIGHT_CHANNEL='' ./qa/node_modules/.bin/playwright test --config qa/modules.config.ts qa/tests/modules/mobile-admin-audit.spec.ts qa/tests/modules/stock-transfer-flow.spec.ts qa/tests/modules/order-edit.spec.ts
node scripts/audit-order-location-db.mjs
node scripts/stock-transfer-batch-db-test.mjs
npm run smoke
npm run test:critical
npm run build
git diff --check
```

`PLAYWRIGHT_CHANNEL=''` seleciona o Chromium headless fornecido pelo Playwright;
o padrão continua sendo Chrome quando a variável não é definida. Capturas não
incluem usuários reais. Nenhuma migration, RLS, Edge Function ou saldo remoto
foi alterado nesta entrega.
