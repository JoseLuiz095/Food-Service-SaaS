# Lançamento avulso, estoque por ponto e mobile

Base: `main` em `a0f61cfe3bce1e5e5811091b1a4f0c7ca244c13c` (PR #126 integrado).
Branch: `codex/avulso-sicoob-mobile`.

## Diagnóstico

- A chave do avulso era criada na montagem da página e não era renovada ao abrir outra venda. O servidor rejeitava corretamente o mesmo identificador com outro conteúdo.
- Ao adicionar o primeiro produto, seu `defaultOrderStatus` substituía silenciosamente `delivered` por `received`, mantendo reserva em vez de baixa física.
- Parte da validação usava o total do produto e parte o saldo local capturado na abertura do modal.
- O contêiner de navegação do estoque e o grid interno de insumos usavam a classe `inventory-workspace`. O grid de duas colunas era aplicado ao contêiner externo, aumentando sua largura.
- O diagnóstico do Master também apresentava overflow por comandos longos sem quebra.

Consulta somente leitura no Supabase `elttryavkeartoxgdgse`: Paçoca no Sicoob com físico 5, reservado 2, disponível 3. O pedido #00141 já estava entregue, com saída registrada no Sicoob. A consulta agrupada encontrou saída no ledger para todos os itens concluídos criados a partir de 24/10. Há 102 itens antigos sem registro nesse ledger, em pedidos criados até 23/10; a ausência de registro histórico não permite concluir que não houve débito pelo mecanismo anterior. Não foi aplicado débito retroativo nem alterado pedido, saldo, schema ou função remota nesta correção.

## Comportamento implementado

- Nova venda recebe uma chave nova; repetição idêntica do mesmo rascunho conserva a chave e chega à RPC mesmo se a resposta anterior se perder após o débito.
- Bloqueio síncrono contra envio simultâneo e campos desabilitados durante a gravação.
- Venda rápida preserva o status escolhido, com Entregue como padrão. A sugestão de preparo do produto fica no fluxo de encomenda.
- Saldo exibido e validação usam o ponto selecionado, descontando reservas. Uma nova leitura ocorre antes da primeira gravação; o banco continua responsável pela validação transacional final.
- Erro informa produto, local, quantidade disponível e solicitada. Troca de loja invalida respostas pendentes e rascunho.
- Ajuda secundária em ícones de informação por toque/teclado nos painéis de estoque, pedidos, financeiro, configurações, Master e módulos. Nomes, valores, erros, estados e instruções obrigatórias permanecem visíveis.
- Popovers nativos respeitam a largura da janela. Escape fecha primeiro a informação, preservando o modal.
- Contêiner do estoque com classe própria; filtros quebram em linhas no mobile. Modal avulso mantém ações acessíveis e separa indicação de baixa física e conferência do pagamento.

## Verificação

- `npm run build` e `git diff --check`.
- `node scripts/order-item-location-db-test.mjs`: 76 verificações PostgreSQL isoladas.
- `node scripts/sales-stock-db-test.mjs`: 22 verificações, incluindo RPC completa com 5 físicos / 2 reservados, venda entregue, retirada, nova chave, replay sem baixa duplicada, ponto padrão vazio e rollback por falta de saldo.
- Playwright `inventory-command.spec.ts`, `inventory-workspace.spec.ts`, `manual-location-sale.spec.ts`: 17 testes com backend interceptado; larguras 320–1440px, saldo local divergente do total, resposta perdida, reposição e popover em modal.
- Playwright `route-sweep.spec.ts`: rotas públicas, da loja e do Master em 320, 768 e 1366px.

Os testes de UI usam dados sintéticos e os testes SQL são locais; não constituem uma venda real de produção. A mudança de frontend depende da integração/publicação do PR. Não há migration ou Edge Function nova para publicar.
