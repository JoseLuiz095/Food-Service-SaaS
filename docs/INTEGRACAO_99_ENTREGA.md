# Preparação da integração de cotação da 99

O projeto possui o adaptador `food-delivery-quote-99`. Ele permanece inativo até que as credenciais e o endpoint oficial sejam fornecidos: sem as variáveis do provedor, a função retorna `503 NINETY_NINE_NOT_CONFIGURED` e a loja continua usando a taxa da zona.

## Variáveis da Edge Function

Configure somente no ambiente do Supabase, nunca em `VITE_*` ou no frontend:

- `NINETY_NINE_API_KEY`: chave fornecida pela 99;
- `NINETY_NINE_ESTIMATE_URL`: endpoint oficial de estimativa. Pode conter `{employeeId}`;
- `NINETY_NINE_EMPLOYEE_ID`: identificador exigido pelo contrato, quando aplicável.

O endpoint recebe `POST` com `store_id`, `origin { lat, lng }`, `destination { lat, lng }` e `category`. A função chama a 99 com `x-api-key`, timeout de 4,5 segundos e responde apenas com o valor normalizado:

```json
{
  "provider": "99",
  "available": true,
  "estimated_fee": 12.5,
  "currency": "BRL",
  "expires_in_seconds": 60
}
```

Erros são tratados sem expor a resposta ou a chave do provedor. A tela deve manter a taxa interna quando houver `502`, `503` ou `504`, e recalcular a cotação antes de criar a entrega.

## Próximo passo

Depois de receber o contrato da 99, confirme os nomes dos campos de valor retornados e, se necessário, ajuste somente `extractAmount` em `supabase/functions/food-delivery-quote-99/index.ts`. A criação automática do pedido deve ser uma segunda etapa, com idempotência, status e cancelamento próprios.
