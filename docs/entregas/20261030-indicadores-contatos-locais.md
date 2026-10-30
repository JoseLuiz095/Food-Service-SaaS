# Indicadores, contatos por ponto e ciclo de vida dos locais — 30/10/2026

Estado: **código preparado e testes locais; produção não validada nem alterada**.

## Diagnóstico verificado

- Repositório `JoseLuiz095/vendeweb`, `main` em `044b3558697588f5f15da21ea3c3dc72d5f7c23f` no início. PRs #103 (RPC), #105 (contatos), #111 (Financeiro), #121/#124 (UI/conflitos), #126/#127 (estoque) integrados; #122 fechado sem merge, mas seu conteúdo foi incluído em #124. O merge incorporou arquivos, não executou migrations nem Edge Functions.
- Supabase compartilhado `elttryavkeartoxgdgse`: `food_dashboard_metrics_v1(uuid)` ausente; `food_store_subscriptions.billing_mode` ausente; `payment_reported_by_customer` ausente; tabelas `food_receipt_contacts`, `food_pickup_receipt_contacts`, `food_order_receipt_sources` ausentes. Histórico remoto termina em migrações recentes de estoque, sem as migrations de indicadores/contatos. A consulta foi somente ao catálogo, sem ler pedidos, clientes ou números.
- O domínio `www.vendeweb.com.br` respondeu 200 com `/assets/index-CXGxrTSa.js`; o build local da `main` atual gerou `/assets/index-BFq-AmK4.js` (sem configuração de produção). O hash diferente não identifica o commit ativo: variáveis de build e cache também o alteram. Falta a proveniência do Workers Build e teste autenticado na loja para afirmar a versão publicada.
- O SQL anterior devolvia contatos gerais a um ponto sem vínculo. A UI mostrava dois contatos genéricos como se resolvessem o destino de cada ponto. O ponto sem vínculo agora retorna lista vazia.

## Contratos preparados

- Indicadores: RPC isolada retorna campos do contrato vigente, incluindo zero de comprovantes antes da instalação do recurso de declaração. Agregação por `store_id`, dia no fuso validado da loja e permissão de admin. Estoque baixo continua originado no catálogo carregado da loja e permanece visível se a RPC falhar. Erros/atualização da RPC não são apresentados como zero.
- Contatos: até dois por ponto, nome público, telefone internacional e finalidade. RPC de gravação transacional valida admin, loja/ponto, formato e duplicidade. RLS permite leitura só a admin da mesma loja. A projeção pública mostra contatos próprios do ponto para comprovantes; vínculo anterior explicitamente configurado permanece durante a transição. Um ponto sem contato/vínculo não herda contato geral. O link geral conserva seus contatos próprios. O pedido consulta a origem persistida no servidor pela Edge Function existente; a nova migration depende de instalação prévia desse contrato.
- Locais: a RPC verifica principal, último ativo, saldo e reservas; exclui sem dependências ou arquiva quando há pontos/histórico, despublicando os pontos. Histórico e FKs continuam. Saldo não nulo bloqueia a operação para exigir transferência. A UI mostra o nome e impacto antes da ação.
- Declaração do cliente e conferência bancária: **não ativar** `ORDER_RECEIPT_AUTOPAID_ENABLED` nem a política de pagamento por clique. A migration pendente de declaração ainda escreve `payment_status='paid'` e `payment_received_at` antes da conferência; isso conflita com a instrução atual. Sua revisão funcional e financeira deve preceder qualquer ativação. Nenhuma alteração em dados, pagamentos, pedidos ou saldos reais foi feita.

## Sequência de implantação e reversão

1. Conferir no alvo as definições completas, grants e dependências de cada migration já integrada. Não usar `db push` em lote: o histórico remoto diverge dos nomes/versões locais.
2. Homologar em banco isolado a migration de indicadores e, separadamente, o contrato de contatos/origem e a migration nova. Testar JWT de duas lojas, anônimo, pedido por ponto, ponto sem contato, troca de loja e replay; revisar a Edge Function `food-public-checkout` e `food-order-payment` contra o schema instalado.
3. Só após conferência, aplicar as migrations isoladas na ordem revisada, publicar as funções necessárias e ativar `VITE_RECEIPT_CONTACTS_ENABLED`. Manter a declaração automática desligada. Registrar versão da migration, hash do build e ID do deploy; testar no domínio e lojas de homologação com contas autorizadas.
4. Reversão do frontend: voltar ao build anterior e desligar a flag. Em banco, **não** apagar tabelas com contatos/histórico: desabilitar a UI/Edge, preservar registros, revisar acessos e preparar compensação específica caso haja dados já criados. A RPC de retirada arquiva sem apagar histórico; não repetir operação em massa.

## Verificação local

- `npm run typecheck`, `npm run build`, `npm run smoke` (177), `npm run test:critical` (122), `node scripts/dashboard-metrics-db-test.mjs` (27), `node scripts/receipt-contacts-db-test.mjs` (26), `node scripts/point-contacts-location-db-test.mjs` e `git diff --check` aprovados.
- Testes locais são sintéticos/PGlite e não atestam grants instalados no Supabase, QR/WhatsApp real, persistência remota, responsividade no aparelho ou publicação no Cloudflare. Esses critérios seguem abertos.
