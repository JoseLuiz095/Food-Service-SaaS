# Atualização FoodWeb v0.4.0

## O que muda

### Visual
- nova identidade pública FoodWeb;
- vermelho/coral como ação principal;
- cabeçalho de marketplace alimentar;
- busca e categorias sticky;
- destaques e produtos mais compactos;
- sacola fixa no celular;
- favicon próprio FoodWeb.

### Assinatura
- somente PIX manual;
- chave PIX, titular, cidade e WhatsApp cadastrados pelo Master;
- PIX Copia e Cola recebe o valor correto do plano;
- tela Meu Plano mostra os três planos e preços;
- alteração de plano auditada;
- comprovante obrigatório via WhatsApp;
- somente o Master confirma o pagamento.

### Financeiro
- Entradas;
- Saídas;
- Resultado gerencial;
- A receber / A pagar;
- principais despesas;
- últimos seis meses;
- leitura de documento opcional;
- IA não escolhe Entrada/Saída;
- documento não gera lançamento sem confirmação.

### Segurança
- origem oficial FoodWeb permitida na Edge do checkout;
- POST continua validando origem;
- Turnstile continua server-side;
- documentos financeiros validados por tamanho, MIME e assinatura do arquivo;
- OCR exige permissão do Financeiro e documento da própria loja;
- nenhum secret no navegador.

### Diagnóstico
- GET de health do checkout não falha só porque a origem está errada;
- health informa `originAllowed`;
- diagnóstico explica que Wrangler não publica Supabase Edge Functions;
- pg_cron da Demo é consultado de verdade.

## Passo a passo

1. Faça backup do Supabase.
2. Execute `202609020800_foodweb_v040_manual_pix_finance_visual.sql`.
3. Execute `VALIDAR_V040.sql`.
4. No Admin Master > Planos, configure PIX e WhatsApp.
5. Confirme o host `foodweb.joseluizacama.workers.dev` no Turnstile.
6. Configure no Supabase:
   - `TURNSTILE_SECRET_KEY`
   - `TURNSTILE_REQUIRED=true`
   - `PUBLIC_APP_ORIGINS=https://foodweb.joseluizacama.workers.dev`
7. Execute `DEPLOY_SUPABASE_FUNCTIONS.bat`.
8. Rode `npm install`.
9. Rode `npm run validate`.
10. Rode `npx wrangler deploy` (ou use `PUBLICAR_V040.bat`, que executa instalação, validação e deploy do frontend).
11. Faça um pedido real de teste.
12. Faça uma cobrança PIX de teste.
13. Teste uma mudança de plano.
14. Teste o Financeiro.
15. Abra o Diagnóstico Master.

## Git

Se continuar trabalhando no mesmo clone:

```bash
git add -A
git commit -m "feat: FoodWeb v0.4.0"
git push origin main
```

`git push --force` não é necessário para uma atualização normal.
