# Edição preservada e troca do ponto de retirada

| Achado confirmado | Evidência | Correção | Dependência / aceite |
| --- | --- | --- | --- |
| Atualização da lista encerra edição | OrderDetailsModal zerava edição/rascunho em todo novo objeto order; polling roda a cada 15 s | Manter rascunho durante edição, identidade por loja/pedido; cancelar volta ao estado mais recente | Atualização por foco e entre abas preserva cliente, itens e observação |
| Sincronização pode desmontar a tela | StoreContext fazia reloadAdmin com loading na sincronização e em renovação de acesso | Leitura silenciosa quando o snapshot pertence ao mesmo tenant; erro conserva tela | Nunca reutilizar snapshot ao trocar tenant |
| Servidor bloqueia mudança de local após reserva | food_guard_order_stock_location instalada recusa qualquer alteração com itens | RPC específica com lock do pedido/produtos, liberação no local original e reserva no destino em uma transação | Migration nova revisável; rollback integral se faltar saldo |

## Escopo

Core multissetorial. Campo Ponto de retirada em Editar pedido, carregado apenas da loja ativa. O estoque de saída é o vinculado ao ponto, validado no servidor. Preserva preço, opções e recebimento. Pedido pago ainda aberto pode mover a reserva; não edita itens pagos. Pedido entregue, retirado ou cancelado não muda de local. Uma chamada repetida para o mesmo destino não cria novo evento de mudança. Ponto alterado por outro operador exige reabrir o detalhe (salvo retry para o mesmo destino).

Não representa transferência física entre depósitos: move o compromisso do pedido; a baixa física ocorre ao concluir a retirada. Falta de saldo para retirada imediata aborta toda a edição. Encomendas futuras seguem a política já instalada de reserva. Não reescreve movimentos históricos ou origem do link de comprovante, não confirma pagamento, não reaplica baixa de pedido.

## Banco

`20261029145753_food_order_relocation.sql`: cria food_edit_order_pickup_v1 e modifica exclusivamente o guard de local. Baseline efetiva e colunas conferidas somente para leitura em elttryavkeartoxgdgse. Migration exige hash normalizado do guard e da edição de itens do PR #101; recusa drift. A RPC exige auth.uid e food_is_store_admin; filtra ponto/local pela loja e estado ativo; anon não tem EXECUTE. O guard continua bloqueando PATCH direto, inclusive se authenticated definir o GUC: exceção estreita exige execução como postgres, contexto da RPC, status released e nenhuma reserva restante. Revisar o proprietário efetivo da função na instalação; proprietário diferente falha fechado.

Registra auditoria da troca (pedido, ator, loja, origem/destino) na mesma transação, sem dados de cliente. Não altera RLS, preços, funções financeiras ou FloriWeb. Sem Edge Function ou dependência nova. Sem aplicação em produção ou deploy manual.

Rollback revisável em docs/rollback/food_order_relocation.sql restaura o guard observado e remove só a RPC nova. Não move pedidos de volta nem desfaz entregas. Reverter frontend preserva pedidos/estoque já persistidos. Instalar e testar primeiro em ambiente isolado; depois revisão específica de produção, sem db push em lote.

## Validação

- Typecheck/build com Supabase fictício; smoke 177 e fluxo crítico 122.
- Suíte de baseline: 68 verificações de edição, locais, opções, retry, rollback e dois tenants; testes específicos de mudança incluem saldo insuficiente, preservação da origem no rollback, retry/auditoria única, ponto de outro tenant/inativo, sessão sem permissão, PATCH direto com GUC forjado, pedido pago aberto e conclusão no novo ponto.
- Quatro testes de navegador (320/390/1366 e regressão existente): foco e sincronização entre abas mantêm rascunho; payload de troca usa RPC única; atualização de preço/quantidade anterior preservada. axe limitado aos campos de edição novos, teclado para salvar. Rede/Supabase simulados, dados sintéticos; não certifica dispositivos Android/iOS ou produção.
- Runner PostgreSQL 17 isolado incluído no CI para retry concorrente, além da baseline; resultado remoto registrado no PR. Ambiente local root não permite runner nativo sem privilégios, portanto não se declara validação nativa local.

Limite: a troca depende da RPC nova instalada. Sua ausência mantém a edição aberta com mensagem em português; não tenta PATCH de local nem finge ter mudado o estoque. O aviso anterior de indicadores é independente e continua aguardando autorização específica para instalar sua RPC.
