# QA Lite com Playwright

Esta pasta e independente do `node_modules` principal. O objetivo e reduzir retrabalho antes de publicar, sem depender de login, Turnstile, MFA ou dados reais.

## Fluxo padrao

Use o painel unico da raiz do projeto.

```bat
FOODWEB.bat
```

O comando principal e:

```bat
npm run qa:lite
```

Quando `QA_BASE_URL` nao estiver definido, o Playwright inicia ou reutiliza o Vite local em `http://172.26.224.1:5173`. Esse hostname deve estar liberado no widget Turnstile; a porta fica apenas na URL local.

Para testar um Preview:

```bat
set QA_BASE_URL=https://seu-preview.exemplo.dev
npm run qa:lite
set QA_BASE_URL=
```

## O que o QA Lite cobre

- paginas publicas configuradas em `qa.config.json`;
- navegacao publica sem mutacao de banco;
- responsividade em mobile, tablet, notebook e desktop;
- overflow horizontal do documento;
- imagens quebradas por elemento `img` ou resposta HTTP 4xx/5xx;
- erros relevantes no console;
- erros JavaScript nao tratados;
- respostas HTTP 5xx;
- acessibilidade essencial, bloqueando violacoes serias ou criticas;
- comparacao visual publica quando ja existir baseline aprovada.

## Baseline visual controlada

A primeira execucao nao falha por falta de baseline. Depois de revisar o visual atual, aprove a referencia pelo painel ou rode:

```bat
npm run qa:update
```

Depois disso, `npm run qa:lite` passa a comparar as paginas publicas contra as imagens versionadas em `qa/tests/__screenshots__/`.

Atualize a baseline somente quando a mudanca visual for intencional.

## Login, Admin e Master

O fluxo completo agora pede o e-mail e a senha no terminal, abre o navegador para a validação Turnstile e pede o código do Authenticator somente no Admin Master. Nenhum desses valores é salvo no repositório.

```bat
npm --prefix qa run test:full
```

O comando captura `qa/.auth/admin.json` e `qa/.auth/master.json`, que são ignorados pelo Git, e depois exercita as rotas autenticadas.

Se em algum momento voce quiser investigar telas autenticadas com Playwright, ainda existem comandos opcionais:

```bat
npm run qa:auth:admin
npm run qa:auth:master
npm run qa:authenticated
```

As sessoes ficam em `qa/.auth/` e nao devem ser versionadas.
