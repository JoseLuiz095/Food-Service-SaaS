# Atualização FoodWeb v0.4.3

## O que muda
- Vitrine pública redesenhada.
- Landing comercial com previews visuais.
- Teste do Profissional por 30 dias via WhatsApp.
- WhatsApp comercial e de suporte cadastrados no Admin Master.
- Botão flutuante de Ajuda.

## Banco
Execute somente a migration incremental:

`supabase/migrations/202609021600_foodweb_v043_storefront_sales_whatsapp.sql`

Depois execute:

`supabase/VALIDAR_V043.sql`

A migration não altera tabelas do FloriWeb.

## Admin Master
Abra `/admin-master/planos` e preencha:
1. WhatsApp para comprovantes da mensalidade.
2. WhatsApp comercial da página inicial.
3. WhatsApp de suporte / Ajuda.
4. PIX e demais dados de cobrança já existentes.

O número deve incluir DDI e DDD. Exemplo: `5527999999999`.

## Publicação
Execute `PUBLICAR_V043.bat` ou, manualmente:

```cmd
npm install
npm run validate
npx wrangler deploy
```

Não é necessário republicar Edge Functions nesta atualização, pois não houve alteração nelas.
