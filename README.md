# VendeWeb — vendas e operação para pequenos negócios

Endereço oficial: **https://www.vendeweb.com.br**. Links de loja, produto e QR Code compartilham o domínio oficial. Consulte [configuração de domínio e PWA](docs/DOMINIO_VENDEWEB.md) e [experiência comercial](docs/VENDEWEB_EXPERIENCIA.md).

Publicação e testes de 22/10/2026: [relatório de validação, segurança e pendências](docs/VALIDACAO_VENDEWEB_20261022.md).

## Estoque por local em desenvolvimento

O painel permite selecionar um local, adicionar/remover/definir saldo, transferir um ou vários produtos e baixar o QR Code de um ponto público. A vitrine consulta apenas o saldo disponível no ponto escolhido; o servidor exige que o pedido de retirada use esse mesmo estoque. Migrations novas e ordem de implantação estão em [handoff Supabase](docs/SUPABASE_PENDING_HANDOFF.md). **Nenhuma dessas migrations foi aplicada em produção.** Implante o frontend somente após validar as RPCs em homologação e aplicar as migrations no ambiente correspondente. A opção de encomenda futura com reserva na origem ainda depende de contrato próprio; não há promessa automática de reposição.

Validação local: `npm run smoke`, `npm run test:critical`, `npm run test:integrations`, `node scripts/sales-stock-db-test.mjs`, `npm run typecheck` e `npm run build`. O workflow `Vendas e estoque` também instala um PostgreSQL isolado para `node scripts/recipe-concurrency-db-test.mjs` e testa locks, idempotência, isolamento e transferências concorrentes.

Correção da edição de pedidos e revisão posterior: [auditoria operacional, integrações, Master e animações](docs/AUDITORIA_OPERACIONAL_20261022.md).

## Vitrines e painel por ramo

A página comercial e o cadastro agora apresentam alimentação, confeitaria, varejo, impressão 3D, aluguel e serviços. O ramo adapta a apresentação e pode ser alterado em **Configurações** ou pelo Master. Lojas existentes mantêm seu visual; a Doce Lua preserva sua identidade e operação.

Esta evolução reutiliza `visual_theme`, sem migration. A ativação de módulos continua separada e desativada por padrão. Consulte [como configurar e testar](docs/SEGMENTOS_IDENTIDADE.md) e [ideias de nome e logo](docs/PROPOSTAS_MARCA.md).

## Evolução opcional: eventos, combos, personalizados e aluguel

Novos módulos ficam desativados por padrão e têm catálogo, pedidos e financeiro interno separados da venda normal.
O checkout atual da Doce Lua permanece no mesmo fluxo. A configuração fica em **Módulos opcionais** no painel da loja e do Master.

Consulte [auditoria e arquitetura](docs/MODULOS_OPCIONAIS.md) e [implantação, testes e arquivos alterados](docs/TESTAR_MODULOS_OPCIONAIS.md).
As instruções históricas abaixo descrevem a versão original; não reaplique migrations antigas em produção.

Plataforma SaaS multempresa para negócios de alimentação, construída em React + TypeScript + Vite, Supabase/PostgreSQL e Cloudflare.

A v0.4.1 consolida três frentes comerciais:

- vitrine pública com linguagem visual de marketplace/delivery;
- assinatura manual por PIX com comprovante obrigatório via WhatsApp;
- financeiro gerencial com entradas, saídas e leitura assistida de documentos.

## Estrutura comercial

### Teste grátis
Novas lojas podem receber 14 dias com recursos equivalentes ao Profissional.

### Essencial
Cardápio, pedidos, WhatsApp, delivery/retirada e 1 foto por produto.

### Starter
Tudo do Essencial + Analytics e recursos comerciais adicionais.

### Profissional
Tudo do Starter + Financeiro gerencial e leitura assistida de nota, cupom, boleto ou PDF.

Os preços são cadastrados no Admin Master e lidos do PostgreSQL. O navegador não define o valor da mensalidade.

## Mensalidade por PIX

O fluxo da v0.4.1 é exclusivamente manual:

1. o Admin Master cadastra chave PIX, titular, cidade e WhatsApp financeiro;
2. o lojista acessa `Meu plano`;
3. escolhe renovar ou mudar de plano;
4. o servidor cria a cobrança com o preço cadastrado no plano;
5. o VendeWeb monta o PIX Copia e Cola com o valor exato;
6. o lojista paga;
7. o card de comprovante abre o WhatsApp cadastrado no Master;
8. o lojista informa que enviou o comprovante;
9. o Master confere crédito + comprovante;
10. somente o Master confirma a mensalidade e ativa/renova o plano.

Não existe renovação automática via gateway nesta versão.

## Financeiro

O módulo Profissional oferece:

- entradas realizadas;
- saídas realizadas;
- resultado gerencial;
- valores a receber e a pagar;
- distribuição das despesas por categoria;
- comparação dos últimos seis meses;
- entrada ou saída manual;
- receitas automáticas quando pedidos Food chegam a `delivered` ou `picked_up`;
- documentos privados no bucket `food-finance-documents`;
- leitura assistida de PDF/JPG/PNG/WebP.

A IA não decide se o lançamento é Entrada ou Saída e nunca grava um lançamento silenciosamente. O lojista revisa e confirma os dados.

## Identidade visual

A vitrine foi redesenhada para uma linguagem própria de delivery:

- coral VendeWeb como CTA;
- fundo neutro e superfícies brancas;
- cabeçalho compacto da loja;
- busca e categorias sticky;
- produtos com fotografia dominante;
- seção de destaques;
- sacola fixa no mobile;
- personalização e CTA de compra focados em celular.

O favicon usa a identidade VendeWeb.

## Banco compartilhado com FloriWeb

O projeto usa o mesmo projeto Supabase, mas os dados permanecem separados por namespace:

```text
FloriWeb                    FoodWeb
stores                      food_stores
products                    food_products
orders                      food_orders
store_users                 food_store_users
platform_admins             food_platform_admins
```

O Auth (`auth.users`) é compartilhado.

## Atualizando uma instalação v0.3.x

Aplique somente:

```text
supabase/migrations/202609020800_foodweb_v040_manual_pix_finance_visual.sql
```

Não reaplique migrations anteriores em um banco que já possui a v0.3.

Depois execute:

```text
supabase/VALIDAR_V040.sql
```

## Variáveis do frontend

Crie `.env`:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_DEFAULT_STORE_SLUG=central-food-demo
VITE_APP_ENV=production
VITE_ANALYTICS_ENABLED=true
VITE_TURNSTILE_SITE_KEY=SUA_SITE_KEY
VITE_VAPID_PUBLIC_KEY=SUA_CHAVE_PUBLICA_VAPID
```

Nunca coloque `service_role`, segredo do Turnstile ou token de IA em `VITE_*`.

`VITE_VAPID_PUBLIC_KEY` é pública e serve apenas para registrar o telefone. A chave privada VAPID deve ficar somente nos secrets da Edge Function.

## Edge Functions

`npx wrangler deploy` NÃO publica as Edge Functions do Supabase.

Depois de atualizar o código, execute:

```bat
DEPLOY_SUPABASE_FUNCTIONS.bat
```

Ele publica somente:

```text
food-platform-create-store
food-platform-manage-store-user
food-public-checkout
food-public-contact
food-public-self-signup
food-send-push
food-modules-public
```

### Secrets obrigatórios para checkout em produção

No Supabase, configure:

```text
TURNSTILE_SECRET_KEY=SEU_SECRET
TURNSTILE_REQUIRED=true
PUBLIC_APP_ORIGINS=https://vendeweb.com.br,https://www.vendeweb.com.br,https://foodweb.joseluizacama.workers.dev
```

O código já reconhece o domínio VendeWeb e o endereço anterior por padrão, mas manter `PUBLIC_APP_ORIGINS` explicitamente configurado é recomendado.

No widget Turnstile da Cloudflare, o hostname deve incluir:

```text
vendeweb.com.br
www.vendeweb.com.br
foodweb.joseluizacama.workers.dev
```

### Leitura automática de documentos — opcional

Para OCR/IA:

```text
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_AI_TOKEN=...
```

Sem essas duas configurações o Financeiro manual continua funcionando.

## Cloudflare Worker

O Worker é:

```text
foodweb
```

Publicação:

```bash
npm run deploy
```

ou:

```bash
npm run build
npx wrangler deploy
```

`npm run deploy` já executa o build antes do Wrangler.

## Validação local

```bash
npm install
npm run validate
```

`validate` executa:

```text
smoke
test:critical
typecheck
vite build
```

Na montagem deste pacote também foram executadas verificações estruturais específicas da v0.4 para PIX, plano, OCR, CORS, isolamento e cron.

## Ordem recomendada de publicação

1. Backup do Supabase.
2. Aplicar migration v0.4.
3. Executar `VALIDAR_V040.sql`.
4. Configurar PIX/WhatsApp no Admin Master.
5. Confirmar hostname no Turnstile.
6. Configurar secrets da Edge Function.
7. Executar `DEPLOY_SUPABASE_FUNCTIONS.bat`.
8. `npm install`.
9. `npm run validate`.
10. `npx wrangler deploy`.
11. Testar pedido real.
12. Testar renovação PIX.
13. Testar mudança de plano.
14. Testar lançamento financeiro.
15. Testar leitura de documento, se IA estiver configurada.
16. Executar Diagnóstico no Admin Master.

## Git

Se a pasta já é um repositório Git, não execute `git init` novamente:

```bash
git add -A
git commit -m "feat: identidade VendeWeb"
git push origin main
```

Evite `git push --force` para atualizações normais. Use force somente quando você realmente deseja substituir o histórico remoto.
