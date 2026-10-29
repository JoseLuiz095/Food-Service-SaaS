# Declaração de pagamento pelo cliente — 29/10/2026

| Achado | Evidência atual | Prioridade | Arquivos | Correção | Dependência | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Envio de comprovante não informava pagamento automaticamente | ReceiptDestination apenas abria WhatsApp | P1 produto | ReceiptDestination, checkout, confirmação e pagamento Pix | Opt-in da loja: registrar Pago informado pelo cliente antes de abrir a conversa | Política da loja, schema e Edge ativados | Status pago com origem explícita; sem mudar entrega/reserva/local/baixa |
| Reverter só o pedido deixaria receita paga | Função financeira instalada trata paid/cancelled, sem ramo pending | P0 integridade | Migration, storeApi, StoreContext, Orders | RPC transacional devolve pedido e lançamento financeiro a A receber | Baseline financeiro revisado | Ambos pendentes ou nenhum alterado; retry idempotente |
| Escrita pública por ID permitiria falsificação | IDs de pedidos não são autorização financeira | P0 segurança | receiptCapability, handler, nova RPC | Capability AES-GCM específica, expira em 24h, vinculada a loja/pedido/valor/versão; RPC só service_role | Secret exclusivamente no servidor | Rejeitar token de leitura, adulteração, troca de loja/valor, expiração e revisão anterior |
| Reenvio após reversão poderia marcar pago novamente | Cliente pode conservar link anterior | P0 integridade | Migration, handler | Versão incrementada na conferência/reversão; só versão inicial aceita | Lock da linha do pedido | Token anterior não reabre declaração após revisão |
| Corrida com tela antiga de confirmação | Admin pode ter snapshot anterior à declaração | P1 | Trigger de guarda e fixture do baseline instalado | Confirmação administrativa legada limpa origem do cliente, invalida token e audita a revisão | Dono postgres das funções confirmado | RPC instalada continua compatível e não baixa estoque |
| Recurso parcialmente ativado confundiria o operador | Backend de contatos ainda ausente no ambiente compartilhado consultado | P1 confiabilidade | receiptPolicyApi, ReceiptContactsSettings, flags | Disponível só com schema e capacidade Edge; padrão desligado | Revisão e ativação específicas | Sem segredo no browser; não prometer ativação por merge de PR |

## Fatos confirmados e decisão de produto

O usuário solicitou marcar pago ao abrir o envio do comprovante e permitir retorno administrativo para A receber. A implementação identifica esse estado como **Pago informado pelo cliente**, separando declaração de conferência bancária. O clique não verifica o Pix nem comprova que um arquivo foi anexado/enviado. A loja escolhe ativar a política, com confirmação dos contatos comerciais. Isso é `core`, opt-in por tenant, sem regra baseada em tema/ramo.

Consulta somente leitura do schema em 29/10 encontrou `food_receipt_contacts`, `food_pickup_receipt_contacts`, RPC de contatos e novas RPCs de declaração/revisão ausentes. `food-order-payment` não estava implantada na consulta desta rodada. O checkout instalado foi lido; é anterior a partes do código atual e precisa de comparação integral antes de qualquer publicação.

O corpo de `food_sync_order_financial_entry` instalado é semanticamente igual ao da migration `202609041610` e tem hash MD5 `d7c236cd8cea993ce3cbd6e0100829a7`. Ele não desfaz receita paga quando payment_status volta a pending. A confirmação instalada tem dono postgres, hash `e4da399ee7668a3aa515c9ef52bcb00c`, não contém a auditoria da migration histórica e retorna inventoryStatus. O teste usa o snapshot exato instalado, salvo em `scripts/fixtures/food-confirm-payment-installed-20261029.sql`, sem dados de pedidos/clientes. A nova migration não substitui essas funções; adiciona a guarda de origem e novas RPCs. Um trigger posterior à sincronização financeira mantém a anotação de declaração do cliente também em edições de total/itens, sem marcar conferência manual por engano.

## Contrato e consistência

- A capability de escrita tem finalidade criptográfica diferente da leitura Pix. Só nasce após checkout revalidado ou resolução de link Pix válido. Não contém contato/endereço. Publicar ID, tenant, telefone ou valor no corpo da requisição não altera seu escopo.
- A Edge abre a capability e a RPC revalida loja ativa/online, política, método Pix, valor, versão e status com lock. Gravar pedido, entrada financeira e auditoria ocorre na mesma transação. Falha na auditoria desfaz tudo. Retry da mesma declaração não duplica receita/auditoria.
- Conferir identifica o administrador e invalida a declaração. Voltar para A receber limpa confirmação financeira e coloca o lançamento do pedido em pending, com paid_at nulo. Nenhum dos dois comandos muda status operacional ou faz movimento de estoque.
- A confirmação administrativa legada também invalida a declaração, cobrindo snapshot desatualizado. Pagamento já conferido não pode ser revertido pela nova ação de declaração.
- Após rejeição/reversão, não há reativação automática do token. O cliente deve falar com a loja. Erro ao declarar oferece conversa manual claramente rotulada, sem outra gravação financeira.
- A fila existente inclui declarações para conferência, mas continua sendo uma visão limitada do lote de pedidos carregado; este PR não resolve paginação/agregações globais. Não usar sua contagem como indicador global.

## Dependências e implantação pendente

O PR depende da UI de contatos/paleta do PR anterior. Migrations de contatos/origem `20261028143000` e `20261028150000` já estão no histórico, porém não foram presumidas instaladas. Nova migration: **`20261029171540_food_customer_receipt_payment.sql`**. Nenhuma foi aplicada remotamente.

Antes de produção, comparar novamente histórico/schema/grants/triggers e checkout instalado; revisar cada migration individualmente em ambiente isolado, incluindo sua interação com as migrations de pedidos já pendentes. Depois, revisar versões completas das duas Edge Functions, secrets e origens permitidas. Não executar db push em lote.

`ORDER_RECEIPT_AUTOPAID_ENABLED` fica desligado por padrão. Para habilitar após homologação, exige `ORDER_RECEIPT_CONTACTS_ENABLED`, secret `ORDER_PAYMENT_LINK_SECRET` de pelo menos 32 caracteres exclusivamente no servidor, ambas as funções compatíveis e a flag pública de contatos conforme o fluxo já existente. A política por loja inicia false e é salva junto dos contatos/vínculos numa RPC única, autenticada. Nenhum segredo é incluído no bundle Vite.

## Testes e limites

Typecheck/build, smoke 177, fluxo crítico 122, regressão de pagamento/estoque (11), contatos/tenant/grants (26) e origem do comprovante passaram localmente. Handler Pix + crypto/contrato: 16 testes. Pagamento/financeiro isolado: 29 verificações, com estado pendente/pago, cancelado/entregue, dinheiro, valor/tenant inválidos, replay após revisão, RPC legada, grants, RLS e rollback. Playwright: 22 cenários de comprovantes e pagamento, incluindo cinco novos de declaração/retry/revisão/configuração e seis de pagamento sem PATCH operacional. Aparência tem validação separada no PR anterior.

Runner PostgreSQL 17 real em duas sessões incluído no CI: duas declarações concorrentes e reversão concorrente com replay, usando loopback, diretório temporário, senha aleatória e sem aceitar URL de banco. Este runner não foi executado localmente como root; seu resultado deve ser conferido no check do GitHub. Nenhum dado real em fixtures/capturas. Browser cobre mobile e desktop sintéticos; Android/iOS físicos não testados. Testes locais não comprovam deploy.

## Arquivos e rollback

Novos: migration; `_shared/receiptCapability.ts`; `receiptPolicyApi.ts`; três scripts de teste de pagamento/comprovante, fixture SQL instalada, spec Playwright e este documento. Modificados: `.env.example`, workflow de regressão, configuração Playwright de contatos, smoke, ReceiptDestination, OrderDetailsModal, ReceiptContactsSettings, StoreContext, Orders, Checkout, OrderPayment, OrderSuccess, orderPaymentApi, receiptContactsApi, storeApi, types e as duas Edge Functions. Nenhum removido, dependência nova, arquivo `sources/` ou objeto FloriWeb alterado.

Risco principal: uma declaração do cliente passa a compor pagamento/receita pagos antes da conferência bancária, conforme política explicitamente solicitada. Por isso a origem é visível e a reversão é atômica. Não habilitar sem validar o entendimento operacional da loja.

Rollback operacional: desligar a flag Edge de declaração impede novas gravações públicas; desativar a política na loja e reverter o frontend/versões das funções após revisão. Manter colunas/auditoria e revisar declarações existentes; não apagar lançamentos nem repetir baixas. Reversão destrutiva do schema não é automática. Nenhuma ação de produção foi executada nesta entrega.
