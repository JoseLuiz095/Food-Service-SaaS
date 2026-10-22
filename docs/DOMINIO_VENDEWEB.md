# Domínio vendeweb.com.br

A marca pública passa a se chamar **VendeWeb**. O Worker, os nomes `food_*` no Supabase e o endereço antigo permanecem ativos por compatibilidade com lojas já publicadas.

## Situação verificada em 22/10/2026

Zona ativa na Cloudflare, com `journey.ns.cloudflare.com` e `thaddeus.ns.cloudflare.com`. O endereço oficial é **https://www.vendeweb.com.br**. O Worker conserva o nome técnico `foodweb`.

## Conexão segura

1. Adicione a zona `vendeweb.com.br` à conta Cloudflare usada pelo Worker.
2. No registrador do domínio, troque os nameservers pelos dois nameservers informados pela Cloudflare.
3. Aguarde a zona ficar com status **Active**.
4. Conecte os Custom Domains `vendeweb.com.br` e `www.vendeweb.com.br` ao Worker `foodweb`. A aplicação converge os aliases para `www`, preservando caminho e parâmetros. Não é necessário criar uma rota `/*` adicional.
5. No painel do Turnstile, inclua `vendeweb.com.br` e `www.vendeweb.com.br` nos hostnames do widget usado pelo projeto.
6. No Supabase, mantenha `PUBLIC_APP_ORIGINS` incluindo os três endereços abaixo:

```text
https://vendeweb.com.br,https://www.vendeweb.com.br,https://foodweb.joseluizacama.workers.dev
```

7. Publique as quatro funções públicas (`food-public-checkout`, `food-public-contact`, `food-public-self-signup`, `food-modules-public`) e o Worker. As origens anteriores continuam permitidas.

## Links e instalações existentes

Compartilhamentos de loja, produto e QR Code usam `https://www.vendeweb.com.br/<slug>`. Lojas com domínio próprio continuam usando seu endereço. Links de convite e recuperação usam o domínio oficial, exceto no ambiente local.

Carrinhos, rascunhos, confirmação de pedido e callback PKCE com verificador local permanecem na origem onde a jornada começou. O armazenamento do navegador não pode ser transferido entre origens; essa exceção evita perda de compra ou confirmação. Nenhum dado privado é acrescentado ao endereço para migrá-lo.

Uma instalação PWA e sua permissão push são vinculadas à origem. No domínio novo, o lojista deve entrar, instalar e autorizar notificações novamente. Instalações antigas continuam atendidas na origem anterior.

## Validação após publicação

- Abra `https://vendeweb.com.br` e `https://www.vendeweb.com.br`.
- Confirme o cadeado HTTPS e a convergência dos aliases para `www` em uma sessão sem compra em andamento.
- Teste o captcha no cadastro e no contato comercial.
- Faça um pedido de teste sem pagamento real e confirme Pix, entrega, retirada e notificações.
- Confirme que o endereço antigo continua abrindo a mesma aplicação.
