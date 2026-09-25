# QA Lite - FoodWeb

## Objetivo

Diminuir o trabalho de teste e correcao nas novas versoes sem criar dependencia obrigatoria de login, Turnstile, MFA ou Supabase QA.

## Antes de publicar

1. Rode `npm run validate`.
2. Rode `npm run qa:lite` para público ou `npm --prefix qa run test:full` para público + Admin + Admin Master.
3. Se houver mudanca visual intencional, revise no navegador e rode `npm run qa:update`.
4. Abra o relatorio com `npm run qa:report` quando o Playwright apontar falha.
5. Publique a release somente depois do Preview passar no mesmo `qa:lite`.

## Publicacao limpa para Preview

Depois dos testes locais, execute `PUBLICAR_QA_RELEASE.bat` ou `npm run qa:publish`.
O fluxo monta uma copia temporaria a partir do codigo atual, executa `npm ci` e `npm run validate`, remove backups, ZIPs, `payload`, `dist`, `node_modules`, credenciais e relatorios de QA, e entao oferece o push de uma branch/tag nova. Ele nunca apaga branch ou tag existente. Se falhar, a pasta temporaria e informada para diagnostico.

## Checklist manual curto

Use este checklist apenas para fluxos autenticados ou que alteram dados.

- Admin login: `npm --prefix qa run test:full` pede e-mail e senha no terminal, valida Turnstile no navegador e confirma acesso ao `/admin`.
- Admin pedidos: abrir a lista, mudar um status de pedido de teste e confirmar que nenhum WhatsApp abre automaticamente.
- Admin produtos: abrir cadastro/edicao de produto de teste e confirmar que campos principais continuam carregando.
- Admin configuracoes: salvar uma alteracao pequena e reversivel, como texto de mensagem de teste.
- Admin Master: o mesmo fluxo pede o código atual do Authenticator e confirma acesso AAL2 ao `/admin-master` antes de abrir planos/lojas.
- Checkout publico: fazer um pedido de teste apenas em loja QA/manual, validando Turnstile e WhatsApp.

## Fora do escopo automatico

- criar pedido real;
- alterar plano real;
- promover loja de cliente;
- validar credenciais ou tokens;
- executar migrations;
- contornar Turnstile.

## Host local e Turnstile

O QA usa `http://172.26.224.1:5173` por padrão para que o widget valide o hostname autorizado. No Cloudflare Turnstile, cadastre o hostname `172.26.224.1`; não inclua `:5173` no cadastro. Para outra porta ou preview, use `QA_BASE_URL` e cadastre o hostname correspondente no widget.

## Sinais de bloqueio

Pare a publicacao se aparecer:

- erro 5xx em rota publica;
- erro de console novo e relevante;
- pagina com scroll horizontal geral;
- imagem principal quebrada;
- diferenca visual nao intencional;
- falha manual de login/Admin/Master.
