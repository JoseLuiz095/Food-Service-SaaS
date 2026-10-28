# Recebimento financeiro separado da operação

| Achado confirmado | Evidência | Prioridade | Arquivos | Correção | Dependência | Aceite |
|---|---|---|---|---|---|---|
| Recebimento dizia sempre baixar estoque e oferecia status em segunda requisição | Orders.tsx e RPC efetiva food_confirm_order_payment_v1 revisados | P1 | Orders, config/spec browser | Remover comando combinado e seletor de status do cartão financeiro; manter operação na fila existente | Nenhuma migration | Uma confirmação financeira; nenhum PATCH de status, no sucesso e na falha |

A RPC efetiva, conferida novamente em 28/10, só atualiza payment_status, payment_received_at e payment_confirmed_by. O status operacional e a baixa por conclusão permanecem sob seu fluxo próprio. O frontend deixa de anunciar baixa automática e de executar atualização de status após confirmar recebimento.

No sucesso: “Recebimento confirmado. Entrega ou retirada deve ser concluída separadamente no pedido.” Se não for possível confirmar a resposta, pede atualizar os pedidos antes de repetir; não afirma que o pagamento falhou ou que nada foi gravado. A RPC idempotente existente continua usada. Sem novo comando transacional combinado e sem gravação automática de status.

Doce Lua e outros ramos usam o mesmo cartão. Não altera regras de reserva, venda avulsa, autorização, checkout ou financeiro no servidor. Nenhuma migration/Edge/dependência nova; nenhum dado real consultado ou alterado.

Validação: seis browser em 320/390/1366, sucesso/falha após gravação simulada, conferindo uma RPC e zero PATCH; typecheck/build com destino fictício; smoke177, fluxo crítico122 e estoque PGlite11 aprovados. CI/Cloudflare serão conferidos ao publicar. Rollback: reverter este commit; sem compensação de dados.
