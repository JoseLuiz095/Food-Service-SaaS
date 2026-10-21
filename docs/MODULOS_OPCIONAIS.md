# Módulos opcionais — auditoria e implementação

## Base auditada em 21/10/2026

Checkout local inicial: `b3ee673`, árvore limpa. PRODUCT.md, DESIGN.md, README.md e AGENTS.md lidos antes de editar. O README ainda descreve v0.4.1; package.json está em v0.6.5. Não reaplicar migrations antigas seguindo essa documentação defasada.

O banco compartilhado `floriweb01` foi consultado somente para metadados e identificação das lojas, sem extrair clientes. Doce Lua está ativa com Pix. As 41 tabelas Food encontradas têm RLS. A lista remota de migrations usa timestamps diferentes do pacote e não registra todo o histórico inicial; não é seguro executar reset/replay contra produção.

### Superfície preservada

| Operação | Caminho atual que permanece intacto |
|---|---|
| Vitrine, opções, carrinho | StoreContext, CartContext, Home, ProductDetail, Cart, StoreLayout |
| Venda normal | Checkout → storeApi.createOrder → food-public-checkout → food_create_public_order |
| Pix e confirmação | utils/pix, OrderSuccess, food_confirm_order_payment_v1 |
| Estoque | food_order_items_inventory_reserve_trg, food_orders_release_inventory_trg, food_products_restock_commit_trg |
| Insumos/receitas | food_order_items_recipe_reconcile_trg, food_inventory_order_consumptions |
| Financeiro | food_orders_financial_sync_trg e food_financial_entries |
| Agendamento/retirada/entrega | food_store_is_accepting_orders, food_orders_delivery_start_time_trg, storeHours |
| Notificações | AdminNotifications, pwaNotifications, food-send-push |
| Administração | AuthContext, food_store_users, criação de loja via food-platform-create-store |

Os helpers existentes são SECURITY DEFINER. O helper food_is_platform_admin no banco verifica associação ativa, mas não AAL2. As novas funções verificam AAL2 adicionalmente para operações Master; não alteram a autorização do legado. As novas tabelas não dependem de policies permissivas do legado.

Linha de base: `npm run validate` passou (smoke, 120 verificações críticas, typecheck e build). Parte relevante dos testes antigos verifica estrutura textual; isso não equivale a uma compra real em produção.

## Decisões e riscos

- Classificação `shared_future`, inteiramente no namespace food_*. Monólito React/PostgreSQL; nenhuma fila ou microserviço novo.
- Organização é um agrupamento administrativo novo. Apenas lojas explicitamente habilitadas são vinculadas. Permissão sempre exige a loja e sua organização correspondente; pertencer a outra loja da mesma organização não dá acesso.
- Fornecedores de organizações diferentes podem colaborar por ofertas publicadas e aprovações explícitas. Dados privados não acompanham o catálogo.
- Estoque dos módulos é uma alocação própria, cadastrada conscientemente na oferta. Não espelha nem debita o estoque/insumos do checkout normal. Não anunciar o mesmo saldo físico simultaneamente nos dois catálogos. Compartilhar estoque futuramente exige integração e testes próprios.
- Cada nova edição gera uma versão do combo, inclusive antes da primeira venda. Aprovações são específicas da versão e dos termos. Versões e snapshots vendidos são imutáveis.
- Valores inteiros em centavos; percentual em pontos-base. Desconto e urgência calculados por item, sem rateio arbitrário. A soma das partes é o total do pedido.
- Uma cobrança manual Pix por pedido, recebida pelo seller_store_id. O cliente fecha a revisão antes de gerar o Pix; depois disso a edição fica bloqueada. Um Pix já copiado não pode ser revogado: após cancelamento, crédito bancário precisa ser conferido antes de confirmar o valor atualizado.
- Cancelamento parcial preserva o valor originalmente pago e cria obrigação de reembolso. A receber é interno; não é transferência bancária. Liquidação e reembolso exigem confirmação humana auditada.
- Reservas de aluguel bloqueiam sobreposição por ativo/intervalo; manutenção impede novas reservas. Sinal, contrato e checklists são registros operacionais manuais.
- Arquivos privados, limite de 25 MiB e formatos permitidos; não executar/renderizar modelos enviados como código. Arte e aprovação seguem pelo WhatsApp.

## Etapas e publicação

1. Fundação: organização/loja, flags false, catálogo, combos/aprovações, pedidos/partes/snapshots, auditoria, recebíveis, personalizados e aluguel.
2. RPCs transacionais com locks, validação de preço no servidor, capability privada do cliente e RLS; nenhuma mutação direta financeira pelo navegador.
3. Páginas independentes, carregadas sob demanda; apenas links administrativos de entrada são adicionados ao aplicativo.
4. Testes SQL em PostgreSQL embarcado descartável, testes da calculadora, proteção dos arquivos legados e `npm run validate`.

Não aplicar automaticamente no banco compartilhado. Antes de publicar: revisar diff, backup, testar em staging com Auth/Storage reais, executar teste autenticado multiloja, testar pedido normal da Doce Lua (delivery, retirada, Pix, estoque/insumos, horários e notificações), aplicar somente migrations novas, publicar a nova Edge Function, depois frontend. Não abrir PR antes da validação da operação atual. Módulos permanecem false até ativação explícita.

Desativar um módulo bloqueia novas vendas/publicações, mas permite administrar obrigações e pedidos já existentes. Voltar o frontend e desativar flags é o rollback operacional; não apagar tabelas com histórico.
