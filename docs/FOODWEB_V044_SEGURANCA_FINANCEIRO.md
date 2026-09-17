# FoodWeb v0.4.4 - financeiro e seguranca publica

## O que mudou

- O financeiro ganhou parser deterministico para boletos antes da IA: linha digitavel/codigo, valor, vencimento, beneficiario e numero do documento.
- Se a resposta da IA falhar ou vier sem JSON valido, o parser deterministico continua preenchendo o que conseguiu reconhecer.
- A tela mostra quantidade de campos reconhecidos, confianca, sinais detectados e um trecho do texto lido para diagnostico.
- O suporte da plataforma nao aparece mais na landing nem nas lojas publicas. Ele e consultado por RPC autenticada e fica somente no Admin/Master.
- O contato comercial da landing nao recebe o telefone no JSON publico. Um modal Turnstile valida a pessoa e a Edge Function devolve somente a URL final do WhatsApp. A Edge falha fechada se `PUBLIC_APP_ORIGINS` nao estiver configurado.
- O contato comercial possui rate limit de 5 tentativas por janela de 10 minutos por fingerprint SHA-256. Nenhum IP bruto e armazenado.
- Login Admin e Admin Master enviam `captchaToken` ao Supabase Auth. Em modo Supabase, o formulario fica bloqueado ate o Turnstile ser concluido; se a Site Key nao estiver configurada, o acesso nao e liberado pelo frontend.
- Checkout mantem Turnstile e ganhou uma apresentacao de seguranca mais clara.

## Ordem de publicacao

1. Execute `supabase/migrations/202609031500_foodweb_v044_security_contact.sql` no SQL Editor.
2. Execute `supabase/VALIDAR_V044.sql`.
3. Configure no Supabase Edge Functions: `PUBLIC_APP_ORIGINS`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_REQUIRED=true`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`. `CONTACT_FINGERPRINT_SALT` e opcional, mas recomendado.
4. Execute `DEPLOY_SUPABASE_FUNCTIONS.bat`.
5. No Supabase Auth, habilite CAPTCHA/Bot Protection com Cloudflare Turnstile e informe a secret key do widget.
6. No `.env` do frontend, informe `VITE_TURNSTILE_SITE_KEY` com a site key publica do mesmo widget.
7. Execute `PUBLICAR_V044.bat`.

## Teste do boleto

No Admin da loja, abra `Financeiro`, escolha `Ler documento` e envie PDF/JPG/PNG/WEBP. Para um boleto legivel o sistema deve tentar preencher pelo menos: tipo Boleto, valor, vencimento, beneficiario/origem, numero/linha digitavel e descricao. O status e sugerido como `Pendente` quando boleto + vencimento forem encontrados. Sempre revise antes de salvar.

Se nenhum campo for reconhecido, abra `Ver texto reconhecido no arquivo`. Isso permite diferenciar arquivo ilegivel de parser incompleto sem gravar qualquer lancamento.
