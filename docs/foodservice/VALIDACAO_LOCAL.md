# Validação local — FoodWeb v0.3

Data: 31/08/2026.

## Resultados executados no pacote final

- `npm run smoke`: **57/57 verificações aprovadas** + validação de imports relativos em **69 arquivos TS/TSX**.
- `npm run test:critical`: **40/40 verificações críticas aprovadas**.
- Parser TypeScript/TSX: **74 arquivos de aplicação/Edge Functions, 0 erro sintático**.
- Detector visual Impeccable: sem anti-padrões reportados após os ajustes.
- Testes adicionais cobrem limite de foto no banco, banner por plano, vencimento pago, renovação antecipada, analytics server-side, cobrança PIX e Financeiro.

## O que não pôde ser executado neste ambiente

O ambiente de geração está com Node 22.16 e sem todas as dependências npm em cache. O pacote exige Node 22.18+ e uma dependência não estava disponível offline. Por isso, **não considero `npm run build` aprovado aqui**.

Na máquina de implantação, execute obrigatoriamente:

```bash
npm install
npm run validate
```

Também não houve conexão com o Supabase real do FloriWeb; portanto, a migration ainda deve ser aplicada com backup prévio e validada no projeto real usando `supabase/VALIDAR_ISOLAMENTO_FOOD.sql`.
