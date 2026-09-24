# QA Lite - FoodWeb

## Objetivo

Diminuir o trabalho de teste e correcao nas novas versoes sem criar dependencia obrigatoria de login, Turnstile, MFA ou Supabase QA.

## Antes de publicar

1. Rode `npm run validate`.
2. Rode `npm run qa:lite`.
3. Se houver mudanca visual intencional, revise no navegador e rode `npm run qa:update`.
4. Abra o relatorio com `npm run qa:report` quando o Playwright apontar falha.
5. Publique a release somente depois do Preview passar no mesmo `qa:lite`.

## Checklist manual curto

Use este checklist apenas para fluxos autenticados ou que alteram dados.

- Admin login: entrar com usuario real de teste e confirmar que Turnstile/MFA conclui sem erro.
- Admin pedidos: abrir a lista, mudar um status de pedido de teste e confirmar que nenhum WhatsApp abre automaticamente.
- Admin produtos: abrir cadastro/edicao de produto de teste e confirmar que campos principais continuam carregando.
- Admin configuracoes: salvar uma alteracao pequena e reversivel, como texto de mensagem de teste.
- Admin Master: abrir planos/lojas e confirmar que dados comerciais carregam sem erro.
- Checkout publico: fazer um pedido de teste apenas em loja QA/manual, validando Turnstile e WhatsApp.

## Fora do escopo automatico

- criar pedido real;
- alterar plano real;
- promover loja de cliente;
- validar credenciais ou tokens;
- executar migrations;
- contornar Turnstile.

## Sinais de bloqueio

Pare a publicacao se aparecer:

- erro 5xx em rota publica;
- erro de console novo e relevante;
- pagina com scroll horizontal geral;
- imagem principal quebrada;
- diferenca visual nao intencional;
- falha manual de login/Admin/Master.
