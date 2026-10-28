# Dois contatos e destino do comprovante por link

Classificação: core. Implementação preparada em branch isolada sobre main `90a3527`; nenhuma migration, função remota, estoque ou configuração produtiva foi alterada.

## Decisões confirmadas pelo usuário

- Até dois contatos comerciais de WhatsApp por loja, com nome público.
- Link de ponto: contato vinculado à origem daquele link, inclusive quando a compra for entregue em casa.
- Link geral: cliente escolhe entre os contatos cadastrados, inclusive se escolher retirada em um ponto.
- Escolha define **somente o destino do comprovante**. Não atribui pedido a usuário nem restringe confirmação. Papéis e autorização existentes permanecem.
- Abrir WhatsApp só registra a abertura já existente. Não comprova envio, não confirma pagamento e não conclui entrega/retirada. O cliente anexa o comprovante no WhatsApp; não há upload automático.

| Achado | Evidência atual | Prioridade | Arquivos | Correção | Dependência | Aceite |
|---|---|---|---|---|---|---|
| Um único WhatsApp na confirmação | OrderConfirmation/OrderSuccess | P1 | ReceiptDestination, receiptContactsApi, Settings | Cadastro de dois contatos e seleção explícita | Migration de contatos, flag frontend | Geral pede escolha; ponto abre destino configurado |
| Origem de link não equivale a retirada | Decisão explícita + payload atual só tem pickup_location_id | P1 | CartContext, useReceiptSourceCode, Checkout, storeApi, wrapper SQL | Origem de comunicação separada, validada e gravada na mesma transação | Migration de origem + atualização da Edge checkout | Entrega não recebe pickup_location_id nem muda local do estoque |
| Navegação do carrinho remove query do link | Reproduzido em E2E | P1 | useReceiptSourceCode | Preserva código por sessão/loja; link geral da vitrine limpa origem anterior | Código validado novamente pelo servidor | Origem chega ao checkout após navegar; outra loja não reutiliza estado |
| Link Pix em outro aparelho não tem confirmação local | OrderPayment/handler existentes | P1 | food-order-payment handler/index | Resolução obtém origem gravada do pedido, não destino fornecido pelo cliente | Deploy específico da função (não realizado) | Link novo retorna contato do servidor sem alterar pagamento |
| Erro de carga poderia apagar configuração | Tratamento revisto | P1 | ReceiptContactsSettings | Salvar bloqueado sem carga completa; falha ao salvar mantém rascunho | RPC de gravação | Erro não permite gravar configuração vazia |

## Contrato e segurança

`food_receipt_contacts`: chave `(store_id,slot)` e CHECK slots 1/2; nome 1–60 e telefone internacional de 10–15 dígitos. `food_pickup_receipt_contacts` liga ponto e slot da **mesma loja** com FKs compostas. Sem leitura direta por anon; authenticated só lê a própria loja pelo helper efetivo. Escritas apenas pela RPC administrativa autenticada, com validação e substituição transacional serializada por loja. Retry da mesma configuração não duplica registros.

`food_get_receipt_destinations_v1` expõe somente os contatos comerciais explicitamente cadastrados em loja acessível. Ponto precisa ser público/ativo e ter local ativo da mesma loja. Modos: general, point, unassigned e unavailable. Ponto sem vínculo informa isso e oferece escolha; ponto inválido/inativo bloqueia encaminhamento. Erro de consulta oferece retry e não usa silenciosamente um telefone alternativo. Sem contatos no link geral, mantém o WhatsApp comercial legado; confirmação antiga sem storeId também mantém compatibilidade.

`food_order_receipt_sources` guarda origem por pedido, inclusive NULL para uma compra geral. Leitura apenas service_role; browser não consulta nem grava. `food_create_public_order_with_receipt_v1(payload)` é executável só por service_role e chama a **RPC existente**, sem substituí-la. Valida ponto/loja, grava origem na mesma transação e conserva a primeira origem em retry. Se a gravação falhar, o pedido e as reservas da chamada são desfeitos. Não muda local, estoque, preço ou validações comerciais existentes.

A Edge checkout escolhe o wrapper só quando habilitada e devolve a origem gravada, inclusive em recuperação por chave idempotente. A confirmação usa essa resposta, não infere o destino pelo nome do ponto. A Edge Pix lê a origem por pedido/loja, reconsulta os contatos atuais e ignora telefones/pontos enviados pelo navegador. Pedidos antigos sem evidência de origem usam escolha geral; não inferir a origem pelo local de estoque.

Respostas tardias são descartadas; formulário/destino são vinculados ao contexto da loja/pedido. Nenhum usuário Auth privado é publicado. Telefones de comprovante não entram em analytics/logs. Configuração informa ao administrador que nome e número serão públicos aos clientes.

## Baseline remoto revisado

- Catálogo confirmou ausência das tabelas novas de contatos e ausência de coluna específica de comprovante nos pontos. Não foram lidos pedidos/clientes reais.
- Helper instalado autoriza owner/admin/manager ativos e Master conforme regras atuais; acessibilidade pública considera status/assinatura.
- `food_create_public_order(jsonb)` efetiva retorna `TABLE(order_id uuid, order_number bigint, order_total numeric)` e concede EXECUTE só postgres/service_role; MD5 da definição coletada: `f917a334f93cefef7506f009a6529c11`. O wrapper não altera seu corpo. Revalidar antes de instalar.
- `food-public-checkout` versão remota 18 corresponde à main, normalizando CRLF. O diff acrescenta apenas a seleção do wrapper/leitura da origem sob flag.
- `food-order-payment` não consta nas 15 funções remotas listadas nesta coleta; get retornou Function not found. Merge de código não significa instalação.
- `food_mark_public_order_whatsapp_clicked` instalado atualiza somente timestamps de clique/updated_at, não payment_status/status. Não ampliar seu significado.

## Validação local

- PGlite de contatos: 26 verificações (dois tenants, dois contatos, RLS/grants, anônimo, telefone inválido, ponto estrangeiro/privado/inativo, rollback e retry).
- PGlite de origem: 17 verificações do wrapper com RPC legada **simulada**; ACL, origem de entrega, pedido sem origem, replay estável, erro comercial e falha após criação com rollback. Não substitui teste completo do checkout/concorrência em PostgreSQL nativo.
- Handler Pix: 13 testes, incluindo destino obtido com IDs do pedido do servidor, rejeições e ausência de alteração financeira.
- Browser: 11 cenários com fixtures sintéticas e egress bloqueado, 320/390/768/1366, seletor geral, ponto direto, link Pix fresco, erro/retry, zero/um contato, clique sem confirmação, cadastro e falha de carga. Inclui compra de entrega via link do ponto e retirada pelo link geral. Axe no seletor nos quatro tamanhos.
- Regressão estoque PGlite: 11 verificações de venda/reserva/pagamento/entrega/retry/local e 68 de edição/local/opções/saída única/rollback/ACL/dois tenants.
- Typecheck/build com destino Supabase fictício explícito, smoke 177, fluxo crítico 122 e diff check. CI/Cloudflare serão conferidos após publicação.

## Instalação pendente e rollback

Desativado por padrão: `VITE_RECEIPT_CONTACTS_ENABLED` precisa ser `true` para cadastro/consulta no frontend. `ORDER_RECEIPT_CONTACTS_ENABLED` precisa ser `true` nas duas Edge Functions. Não mudar flags em produção antes de revisar e homologar as dependências abaixo.

Migrations novas, nesta ordem: `20261028143000_food_receipt_contacts.sql` e `20261028150000_food_order_receipt_source.sql`. Não usar db push em lote. Depois da revisão específica de schema/grants e testes no ambiente alvo, publicar somente food-public-checkout/food-order-payment com autorização específica. Link Pix também depende das configurações já documentadas de segredo, origem e habilitação do próprio link. Nenhum segredo vai ao browser.

Rollback imediato: desligar as flags de contatos no frontend e Edge Functions, restabelecendo o caminho legado. Reverter código se necessário. Manter as tabelas para preservar configurações e origem até revisar dependências/backups; não apagar registro comercial no rollback automático. Se desfizer schema, remover wrapper antes da tabela de origem e remover RPCs de contatos antes das tabelas, após conferência. Não repetir baixa de pedidos ou gerar compensações de estoque.

Limitações: não abre/cola automaticamente em qualquer banco; isso depende de integração bancária específica. Não valida um comprovante nem recebe confirmação automática do Pix. Android/iOS físico e instalação remota continuam pendentes de revisão. QR de origem é público e identifica a loja/ponto, não autentica o cliente ou o recebedor.
