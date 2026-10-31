# Auditoria das entregas de 30/10/2026 no Supabase compartilhado

Projeto verificado: `elttryavkeartoxgdgse`. Leitura do histórico de migrations, catálogo de tabelas/funções e lista de Edge Functions. Código comparado com a `main` após o merge do PR #142. A presença de código no GitHub não instala SQL nem Edge Functions.

| Fluxo | Código integrado | Banco observado | Ação |
| --- | --- | --- | --- |
| Indicadores da análise inicial | `20261028130144_food_dashboard_metrics_standalone.sql` | RPC `food_dashboard_metrics_v1` existe; migration remota `20261030195922_food_dashboard_metrics_standalone_20261030` | Conferir valores com pedidos reais, sem reaplicar SQL pelo nome local. |
| Ajuste de reserva da venda rápida com vários itens | `20261030140812_fix_multi_item_quick_sale_reservation.sql` | Migration remota `20261030141439_fix_multi_item_quick_sale_reservation` | Já instalado; conferir casos reais sem reaplicar. |
| Excluir/arquivar local e contatos do ponto | `20261028143000_food_receipt_contacts.sql`, `20261030185746_food_point_contacts_and_location_lifecycle.sql`, `20261030213000_food_single_point_receipt_contact.sql` | Tabelas `food_receipt_contacts`, `food_pickup_point_contacts` e RPC `food_retire_stock_location_v1` ausentes | Aplicar em ordem após conferir schema, dados e grants; validar RPC e REST/schema cache. |
| Origem do comprovante no pedido | `20261028150000_food_order_receipt_source.sql` | `food_order_receipt_sources` e wrapper do checkout ausentes | Aplicar após contatos e implantar checkout compatível antes de habilitar flags. |
| Declaração e conferência de pagamento/retirada | `20261029171540_food_customer_receipt_payment.sql`, `20261030160000_food_pickup_receipt_closeout.sql` | RPCs ausentes; Edge `food-order-payment` não está implantada | Bloqueado para ativação: a primeira migration marca `payment_status='paid'` ao cliente declarar envio, antes da conferência bancária. Rever contrato financeiro e testar antes da implantação. |
| Identidade profissional | `20261030114215_service_professional_identity.sql` | `food_service_professionals` ausente | Pendência para agendamento e publicação de produtos ligados ao profissional. |
| Telefone e sessão Fitness | `20261030120000_food_fitness_phone_student_sessions.sql`, `20261030150000_food_fitness_phone_session_enforcement.sql` | `food_fitness_student_sessions` e `food_fitness_student_status_v1` ausentes | Aplicar em sequência com revisão de Auth e RLS; testar aluno A/B e loja A/B. |
| Assistente, publicações e lembretes | `20261030143000_professional_content_student_reminders.sql` | `food_professional_publications` ausente | Depende da identidade profissional e sessão; revisar RLS e entrega de notificações. |
| Ofertas Fitness e nutricionista do piloto | `20261030170000_food_fitness_pilot_offers.sql` | `food_fitness_offers` e `food_fitness_offer_orders` ausentes | Depende de identidade/sessão; não anunciar compra automática de serviços sem entrega habilitada. |
| Troca de ponto de retirada de pedido existente | `20261029145753_food_order_relocation.sql` | `food_edit_order_pickup_v1` ausente | Reconciliar baseline/hash da função de edição antes de instalar; a troca de produto no mesmo ponto usa a RPC já presente. |
| Condições de cobrança do plano | `20261029121944_food_introductory_billing_terms.sql` | `food_store_subscriptions.billing_mode` ausente | Reconciliar política de cobrança e cobranças existentes antes de instalar. |

O `food-public-checkout` remoto aparece como versão 18, anterior às mudanças de 30/10. A configuração das flags de ambiente não é exposta pelo conector, portanto não foi presumida.

## Validação e implantação

1. Conferir o histórico remoto antes de cada migration, inclusive versões remotas com nome/timestamp diferente do arquivo local. Aplicar somente SQL revisado, na ordem acima; não executar `db push` em lote no projeto compartilhado.
2. Confirmar `to_regclass`, `to_regprocedure`, grants e RLS, recarregar o schema cache do PostgREST e repetir o salvamento de um contato do ponto e a operação de retirar um local sem saldo.
3. Testar fluxo de origem do pedido e link do comprovante com pedido sintético, sem marcar pagamento bancário apenas por clique.
4. Para Fitness, validar login por telefone, revogação, isolamento por aluno/loja e autorização do profissional antes de criar ofertas de teste.

As duas tentativas de aplicar a primeira migration de contatos via conector Supabase retornaram `confirmation expired`. Consulta posterior confirmou que a tabela segue ausente. Nenhuma mudança no banco foi realizada nesta auditoria.
