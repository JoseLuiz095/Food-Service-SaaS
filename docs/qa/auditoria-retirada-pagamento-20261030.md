# Auditoria de retirada e comprovantes — 30/10/2026

## Resultado e limite da entrega

Base: `eb1c5f7bf6136b60c49a66e468b675da59c319dd` da main, posterior ao PR #144. A conversa compartilhada foi lida e as alterações já instaladas foram preservadas. Esta branch prepara correções adicionais; não representa ativação em produção.

Regra confirmada pelo usuário nesta revisão: após confirmar o envio do comprovante, pedido online de retirada imediata em ponto configurado fica operacionalmente pago e retirado, com baixa naquele local. A origem permanece identificada como declaração do cliente; isso não comprova liquidação bancária. Agendamentos, delivery e outras lojas mantêm seus fluxos e políticas.

## Estado ativo conferido

- Supabase `elttryavkeartoxgdgse`, nome VendeWeb. Contatos por ponto, destino único, ciclo de locais, origem de comprovantes e troca de ponto já instalados pelo outro chat; não reaplicados aqui.
- As RPCs de declaração/revisão de comprovante, suas colunas e `food-order-payment` ainda ausentes. O checkout ativo v18 não contém o fluxo de comprovantes. Integrar a interface não atualizou essas dependências.
- Doce Lua: pontos Moveis Linhares e Sicoob, ambos publicados e associados a locais ativos. Nenhum WhatsApp de ponto gravado no momento da consulta. Não atribuir destinatários por suposição.
- Consultas em todas as lojas: zero divergências entre reservas por item e saldo reservado por local; zero pedidos abertos com local diferente do ponto; zero vínculos entre pedido e ponto de outro tenant; zero saldos negativos ou reservas acima do físico. É uma verificação de consistência do banco, não contagem física.
- Vitrine oficial aberta em `https://www.vendeweb.com.br/doce-lua?ponto=ML-01`: seleciona Moveis Linhares e mantém o código nos links de produtos; cards exibem disponibilidade daquele ponto.
- GitHub registra build Cloudflare aprovado da base, versão `bba09ebd-40e4-49f6-8887-aba62e69ea69`. O domínio ainda não expõe identificação de commit suficiente para provar a correspondência integral do artefato servido.

## Correções desta branch

1. Não anuncia pagamento/retirada quando a RPC devolve resposta ausente, rejeitada ou incompleta.
2. Bloqueia replay de declaração após cancelamento. Retry válido não duplica baixa nem auditoria.
3. Retirada automática exige local do pedido igual ao do ponto e reserva integral dos itens controlados; não completa reserva com saldo de outro local. Datas de recebimento bancário permanecem vazias até conferência administrativa.
4. Permite ativar a política com WhatsApp próprio do ponto sem duplicar contato geral. Retira o seletor de vínculo legado que concorria com o editor exclusivo do ponto; preserva vínculos existentes válidos.
5. Integra testes de comprovante à CI e adiciona teste com funções reais de reserva, baixa e ledger. O teste anterior de comprovante simulava a baixa apenas trocando o status.
6. Gera `build-info.json` com commit e instante do build e cabeçalho sem cache para conferir a versão após implantação.

## Verificação executada

| Verificação | Resultado |
|---|---|
| TypeScript e build | Aprovados; build sem chave Turnstile local, sem criar pedidos reais |
| Smoke / fluxo crítico | 177 / 122 verificações |
| Handler Pix e comprovante | 17 testes |
| Estoque real por local + comprovante | 36 verificações em PGlite, inclui reserva incompleta, baixa única e financeiro pendente |
| Edição de itens / troca de ponto | 87 / 12 verificações, inclui dois tenants e rollback |
| Contatos exclusivos e ciclo de locais | Aprovado |
| Origem transacional de comprovante | 17 verificações, RPC legada simulada |
| Comprovante/pagamento/contatos no navegador | 34 testes existentes, mais 3 de editor do ponto e 1 de loja sem contato geral |
| QR, disponibilidade e edição preservada | 13 testes no navegador |

Testes de navegador usam backend simulado e dados fictícios, em larguras de 320 a 1440 px conforme a suíte. Os testes SQL usam banco isolado. Não equivalem a homologação autenticada no ambiente publicado. Nenhum pedido real, saldo ou movimento foi corrigido por esta auditoria. Não foi executado novo teste de concorrência em PostgreSQL neste ambiente; os runners existentes permanecem na CI.

## Pacote de ativação preparado, ainda bloqueado

Não executar `db push`: versões remotas diferem dos nomes locais. A aplicação tentada do pacote abaixo foi rejeitada pela revisão automática por exigir autorização específica de implantação de alto impacto. Nenhum comando alternativo foi usado para contornar a rejeição.

Aplicar em UMA transação, após aprovação, os conteúdos destes arquivos nesta ordem (remover os `begin/commit` internos e usar apenas uma transação externa):

1. `supabase/migrations/20261029171540_food_customer_receipt_payment.sql`
2. `supabase/migrations/20261030160000_food_pickup_receipt_closeout.sql`
3. `supabase/migrations/20261031004025_food_receipt_pickup_integrity.sql`

As versões intermediárias não devem ser expostas: a primeira escreve data de recebimento e a última corrige esse comportamento. O pacote cria colunas, funções e triggers; não atualiza pedidos antigos por conta própria. O risco é mudar transações futuras de pagamento, financeiro e retirada no banco compartilhado, razão para implantação coordenada e teste antes de ativar políticas.

Depois: publicar as versões revisadas de `food-public-checkout` e `food-order-payment`; configurar pelo provedor `ORDER_RECEIPT_CONTACTS_ENABLED`, `ORDER_RECEIPT_AUTOPAID_ENABLED`, `ORDER_PAYMENT_LINK_ENABLED`, `ORDER_PAYMENT_ALLOWED_ORIGINS` e segredo `ORDER_PAYMENT_LINK_SECRET` (mínimo 32 caracteres); frontend com `VITE_RECEIPT_CONTACTS_ENABLED` e, para links Pix, `VITE_PIX_PAYMENT_LINK_ENABLED`. Não colocar segredo no Git, frontend ou chat. Esta sessão não possui credenciais CLI de Supabase/Cloudflare nem ferramenta para gravar secrets; não se presume que os secrets estejam configurados.

Antes de habilitar para loja real: testar em tenant de homologação o cadastro/reload do contato, pedido por QR, reserva, envio declarado, retry, retirada única, conferência/rejeição financeira, agendamento e negação por outro tenant. Depois conferir `build-info.json` do domínio e salvar os destinatários reais informados pelo proprietário.

Reversão operacional: desabilitar os flags de emissão/declaração e as políticas por loja, preservando as tabelas e a auditoria. Não apagar colunas ou desfazer baixas reais automaticamente; qualquer movimento já concluído exige conciliação própria.
