# SOLICITAÇÃO SUPABASE — VENDEWEB: CONSISTÊNCIA DE VENDAS, ESTOQUE E PAGAMENTOS

## 1. Problema e causa confirmada
O fluxo atual reserva ao inserir itens, mas confirma a saída física ao marcar pagamento como recebido. Um pedido entregue sem pagamento confirmado pode manter reserva, e um pedido pago sem entrega pode consumir estoque. O histórico não possui uma referência imutável de saída por item. Há pedidos concluídos com estado de estoque divergente. A confirmação de PIX manual deve permanecer uma ação explícita.

## 2. Ambiente de destino
Aplicar primeiro em projeto **isolado de homologação do VendeWeb**, após confirmar URL, ref e esquema com o responsável. O projeto compartilhado ativo contém pedidos existentes. Não aplicar diretamente nele sem autorização específica e janela de recuperação.

## 3. Objetos
Dependência: `supabase/migrations/20261023140000_food_multilocation_stock.sql` do PR #80.
Migration proposta: `supabase/migrations/20261023153000_food_sales_fulfillment_location_ledger.sql` do PR #81.
Afeta `food_orders`, `food_pickup_locations`, a nova `food_order_stock_movements`, a sincronização `food_product_location_stock`, funções de reserva, baixa, liberação, confirmação de pagamento e criação de pedidos, e um trigger de entrega. Mantém `food_financial_entries` e assinaturas existentes.

## 4. SQL e RLS
Executar o conteúdo completo e versionado das duas migrations, nessa ordem, somente após revisão. A nova tabela de movimentos concede leitura a administradores da loja e impede escrita direta por `anon` e `authenticated`; as funções confiáveis escrevem em transação. Os pontos públicos são expostos por RPC somente quando ativos e vinculados a um local ativo da própria loja. Rever também as policies existentes de pedidos, produtos, pontos e usuários antes da execução.

## 5. Preservação e aplicação
1. Gerar backup e registrar a versão das migrations, contagens e somas de estoque antes de iniciar.
2. Aplicar em homologação e executar `supabase/audits/food_sales_stock_audit.sql` antes e depois.
3. Testar com duas lojas, dois locais por loja, produtos controlados e não controlados e usuários de papéis distintos.
4. Não sintetizar movimentos para pedidos antigos. A migration não reconcilia saldos históricos.
5. Após revisão técnica e aprovação separada para produção, agendar implantação e observar erros de RPC, reservas e pagamentos.

## 6. Testes SQL e funcionais
- 20 unidades físicas, pedido pendente de 3: físico 20, reservado 3, disponível 17 no local escolhido.
- Entrega de 3: físico 17, reservado 0, exatamente um movimento `sale` por item. Repetir confirmação sem nova saída.
- Cancelamento antes da entrega: reserva liberada sem aumentar o físico.
- Pagamento confirmado antes de entregar: entrada financeira paga uma vez e físico inalterado.
- Venda rápida entregue no local B: somente B perde unidades; A permanece igual; um recebimento ocorre apenas se marcado como conferido.
- Duas compras simultâneas pelas últimas unidades: somente as quantidades disponíveis podem ser reservadas.
- Repetir a mesma chave de tentativa: retorna pedido original; mesma chave e carga distinta deve falhar.
- QR de ponto de retirada: pedido vinculado ao local configurado, não ao saldo principal.
- Trocar `store_id` ou usar usuário de outra loja: operação negada.
- Cancelamento após pagamento: conferir política comercial de estorno e devolução; não presumir reentrada física.
- Verificar soma dos saldos locais contra o produto global e reservas de itens contra saldo reservado.

## 7. Recuperação
A migration usa transação; falha de DDL deve desfazer o lote. Após implantação, não reverter por exclusão de colunas ou movimentos sem inventário e análise de pedidos novos. Se houver falha operacional, interromper novas vendas, capturar logs e restaurar por migration compensatória revisada; reconciliar novas operações antes de qualquer restauração de backup.

## 8. Resultado esperado e evidências a devolver
Informar projeto e ambiente efetivos, versões de migration aplicadas, resultado dos testes, plano de execução, captura de dois pontos com saldos antes/depois, pedido e seu movimento por item, recibo financeiro, resultado da consulta de divergências e logs de falhas sem dados pessoais. Distinguir resultado em homologação do resultado em produção. Pedidos antigos divergentes devem ser analisados um a um, com autorização específica antes de ajustar seus saldos.
