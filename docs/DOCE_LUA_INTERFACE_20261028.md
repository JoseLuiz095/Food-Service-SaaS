# Doce Lua — interface e compartilhamento por ponto

Fatos confirmados em ambiente local isolado sobre main `90a3527`. Dados de pessoas, produtos, pontos e pedidos nos testes são sintéticos. Não afirmar que o preview ou as capturas representam produção.

| Achado | Evidência atual | Prioridade | Arquivos afetados | Correção | Dependência | Aceite |
|---|---|---|---|---|---|---|
| Compartilhamento só oferece página geral | Componentes consultados | P1 | AdminStoreShare, StoreHeader, useStoreShareTarget | Seleção de pontos públicos, mesmo destino no link/QR/arquivo | RPC pública existente, revisada no catálogo remoto | Dois pontos + geral, QR verificado por módulos, cinco larguras |
| Botão extra duplica cópia Pix | Pedido explícito do usuário / Orders | P2 | Orders, pix-sharing.spec | Remove apenas “Compartilhar só o código Pix” | Nenhuma | Cópia, link e QR continuam disponíveis |
| Comprar agora sobrepõe instrução | Foto do usuário + grid examinado | P1 | product-detail-mobile.css | Ações e instrução ocupam linhas inteiras | Nenhuma | Geometria sem interseção, texto longo, cinco larguras |
| Tabela alarga página com nome longo | Reproduzido em 768/1366 | P1 | Products, doce-lua-accessibility.css | Contenção da tabela e quebra legível do nome | Nenhuma | Documento não ultrapassa viewport |
| Modais não contêm foco | Estrutura/teclado conferidos | P1 | useModalAccessibility, Orders, OrderDetailsModal, compartilhamento | Foco inicial, Tab contido, Escape protegido durante gravação, fundo inerte, scroll e retorno | Browser com inert | Teste avulso/compartilhar por teclado |
| main aninhado / grid incompleto / labels e contraste | axe nas rotas com mocks | P1 | Inventory, StockLocations, Home, AsyncState, Orders, Analytics, Finance, DeliveryZones, Settings, CSS | Uma main, calendário com grupo de botões, status/alert, rótulos e cores legíveis | Tema Doce Lua para contraste específico | 130 observações sem violações automáticas dos critérios selecionados |

## Escopo

Compartilhar permite “Página da loja” ou um ponto ativo/público, sem expor locais internos. A URL usa `?ponto=CODIGO`. Busca falha com retry e permite o link geral; respostas antigas e QR de outra seleção são descartados. O QR não promete saldo ou retirada imediata. A consulta pública remota confirmou filtro de loja acessível e local ativo da mesma loja.

Ajustes de contraste da Doce Lua são escopados ao preset; isso não concede permissão comercial. Contenção de tabela, foco de diálogos, rótulos e semântica são compartilhados com outros ramos. Não altera preço, estoque, pagamentos, checkout, roles ou regras de publicação. Sem dependência nova, migration ou Edge Function neste PR.

## Validação

- 26 rotas × 320/360/390/768/1366: 130 observações, uma main, sem overflow de documento, sem erros de página e sem violações axe dos conjuntos WCAG2A/AA/21AA no estado sintético observado. Evidência em `docs/qa/DOCE_LUA_ROTAS_20261028.json`.
- Inclui painel, pedidos, produtos/novo/edição, categorias, entregas, analytics, plano, primeiros passos, módulos, estoque/locais, financeiro, configurações, negócio, operação, Master/lojas/solicitações, catálogo/produto/carrinho/checkout/pagamento/confirmação.
- 20 testes browser aprovados: coleta inicial, vazio/erro/rede lenta públicos, compartilhamento/admin/vitrine, QR e compra em cinco larguras, recuperação e teclado. Depois da última correção de contraste na prévia, repetidas as oito coletas: aprovadas, sem achados automáticos restantes.
- 15 regressões Pix/link aprovadas no checkout final desta branch.
- Typecheck, build (Supabase fictício explícito), smoke 177, fluxo crítico 122 e diff check aprovados.
- Esta coleta não é certificação WCAG, teste Android/iOS físico, auditoria de todos os estados de todos os formulários, nem teste de RLS. Testes de estoque/banco continuam nos PRs específicos; nenhum saldo real foi consultado ou ajustado aqui.

## Risco e reversão

Foco/inert afeta sobreposições; revisar diálogos que abrem outros diálogos antes de reaproveitar o hook neles. CSS compartilhado pode mudar quebra de texto em outros ramos; cores permanecem específicas onde necessário. Sem alteração de dados: rollback por reversão do commit de interface. A correção do painel está separada no PR #103; este PR não instala aquela RPC.

## Pendências

Dois contatos de comprovante têm implementação separada na branch `codex/comprovantes-contatos-por-ponto`, com migration e revisão próprias. Também permanecem os demais itens do plano amplo de estoque/Sob demanda/reconciliação/mobile; este PR resolve os achados de interface e compartilhamento descritos acima.
