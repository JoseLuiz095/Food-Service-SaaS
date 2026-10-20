# Preparação da integração de cotação da 99

O projeto possui o adaptador `food-delivery-quote-99`. Ele permanece inativo até que a ativação seja feita explicitamente: mesmo com chave e endpoint configurados, a função retorna `503 NINETY_NINE_DISABLED` enquanto `NINETY_NINE_ENABLED` não for exatamente `true`. A loja continua usando a taxa da zona e a confirmação manual da entrega.

## Variáveis da Edge Function

Configure somente no ambiente do Supabase, nunca em `VITE_*` ou no frontend:

- `NINETY_NINE_API_KEY`: chave fornecida pela 99;
- `NINETY_NINE_ESTIMATE_URL`: endpoint oficial de estimativa. Pode conter `{employeeId}`;
- `NINETY_NINE_EMPLOYEE_ID`: identificador exigido pelo contrato, quando aplicável.
- `NINETY_NINE_ENABLED`: use `true` somente depois de validar contrato, endpoint e limites de uso. A ausência desta variável mantém o fallback manual.

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

## Modos de operação da loja

O painel separa a decisão operacional da integração técnica:

- **Entrega própria**: a loja assume o envio e combina o entregador depois da confirmação.
- **99 Entrega**: a loja sinaliza a preferência pela 99, mas o pedido continua sendo confirmado normalmente. Até as credenciais e o contrato de cotação estarem validados, a solicitação é manual após a confirmação; uma falha da API nunca bloqueia o checkout.
- **Somente retirada**: desativa a entrega e mantém a retirada como único meio de recebimento.

O modo é salvo no JSON já existente de horários (`opening_hours.delivery_mode`), evitando uma migration prematura. Quando a API estiver pronta, o modo 99 poderá habilitar apenas a cotação (com cache curto) e, em uma etapa posterior, o despacho manual com chave de idempotência. Não haverá criação automática de corrida no momento da compra.

## Próximo passo

Depois de receber o contrato da 99, confirme os nomes dos campos de valor retornados e, se necessário, ajuste somente `extractAmount` em `supabase/functions/food-delivery-quote-99/index.ts`. A criação automática do pedido deve ser uma segunda etapa, com idempotência, status e cancelamento próprios.
