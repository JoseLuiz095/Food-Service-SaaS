# Domínio vendeweb.com.br

A marca pública passa a se chamar **VendeWeb**. O Worker, os nomes `food_*` no Supabase e o endereço antigo permanecem ativos por compatibilidade com lojas já publicadas.

## Situação verificada em 22/10/2026

`vendeweb.com.br` ainda usa os nameservers `aster.dns-parking.com` e `helios.dns-parking.com`, com um apontamento de estacionamento. Por isso, o domínio ainda não pode ser conectado ao Worker da Cloudflare.

## Conexão segura

1. Adicione a zona `vendeweb.com.br` à conta Cloudflare usada pelo Worker.
2. No registrador do domínio, troque os nameservers pelos dois nameservers informados pela Cloudflare.
3. Aguarde a zona ficar com status **Active**.
4. Crie a rota customizada `vendeweb.com.br/*` para o Worker `foodweb` e ative o domínio customizado. Crie também `www.vendeweb.com.br` como redirecionamento para o domínio sem `www`.
5. No painel do Turnstile, inclua `vendeweb.com.br` e `www.vendeweb.com.br` nos hostnames do widget usado pelo projeto.
6. No Supabase, mantenha `PUBLIC_APP_ORIGINS` incluindo os três endereços abaixo:

```text
https://vendeweb.com.br,https://www.vendeweb.com.br,https://foodweb.joseluizacama.workers.dev
```

7. Publique as Edge Functions públicas e o Worker após a zona estar ativa. A implementação já aceita as novas origens de forma aditiva.

## Validação após publicação

- Abra `https://vendeweb.com.br` e `https://www.vendeweb.com.br`.
- Confirme o cadeado HTTPS e o redirecionamento de `www`.
- Teste o captcha no cadastro e no contato comercial.
- Faça um pedido de teste sem pagamento real e confirme Pix, entrega, retirada e notificações.
- Confirme que o endereço antigo continua abrindo a mesma aplicação.
