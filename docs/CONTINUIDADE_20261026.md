# Continuidade — VendeWeb, FloriWeb e Impulso

Inventário de 26/10/2026. O inventário começou somente leitura; depois foram executadas apenas as duas renomeações administrativas autorizadas e a preparação de documentação em branch própria. Este documento não autoriza migrations, alterações de RLS, deploy de funções ou merge em `main`.

## Decisões confirmadas

- VendeWeb é uma plataforma multissetorial; Food é uma de suas áreas.
- O nome visível desejado do Supabase compartilhado é `VendeWeb`; o ref permanece `elttryavkeartoxgdgse`.
- O slug desejado do repositório principal é `JoseLuiz095/vendeweb`, preservando o repositório de ID `1349673787` e seu histórico.
- A autorização para excluir o Supabase Academia refere-se exclusivamente a `vnpoinodvchmmbyxpacj`, depois de backup recuperável e resolução das dependências. Não inclui excluir o repositório Academia/Impulso.

## Repositórios e branches

| Produto | Repositório inventariado | Estado remoto |
| --- | --- | --- |
| VendeWeb | [Food-Service-SaaS](https://github.com/JoseLuiz095/vendeweb), ID `1349673787` | Ativo, público; `main` em `26a65e3877943d7b70de38d2d4044fa32358082d`; nenhum PR aberto no início do inventário |
| FloriWeb | [floriweb01](https://github.com/JoseLuiz095/floriweb01), ID `1346547464` | Ativo, público; `main` em `d67be0d130b6b0f930f8cba165a29743fdab1b6f`; nenhum PR aberto |
| Impulso | [Academia](https://github.com/JoseLuiz095/Academia), ID `1387963065` | Ativo, público; `main` em `99aca44f1af7f0a677a1f00e481ab04ce7cc9ad1`; [PR #32](https://github.com/JoseLuiz095/Academia/pull/32) aberto, branch `codex/fit-notifications-and-tenant-review`, head `9876af56ac93ffef4d1b676b95536bf62362a036` |

As listagens remotas retornaram apenas `main` no VendeWeb e FloriWeb; Academia também tem a branch do PR #32. O clone local antigo do VendeWeb está em `codex/ux-operacional-estoque`, com alterações staged, unstaged e arquivos novos. Foi preservado, sem reset, stash ou troca de branch. Esta revisão usa um worktree separado a partir da `main` remota.

### Os dois commits de transferência já foram publicados

O estado conhecido de dois commits não publicados foi superado pelo remoto:

| Commit | Mudança | Evidência |
| --- | --- | --- |
| `22186006580e30df781a370215f0d69aa61fafe2` | Simplifica transferência de estoque em lote | [PR #89](https://github.com/JoseLuiz095/vendeweb/pull/89), integrado |
| `f3ad9d9877d700b77c7b97bafbc7d24a01588e44` | Isola regras de checkout da transferência | [PR #90](https://github.com/JoseLuiz095/vendeweb/pull/90), integrado |

Ambos são ancestrais da `main` inventariada. A branch `codex/transferencia-estoque-mobile` não está presente nos clones/worktrees acessíveis nem na listagem remota atual; seu histórico está preservado nesses commits e merges. Não recriar PR nem fazer cherry-pick duplicado. Os dois commits tiveram checks `regression` e `Workers Builds: foodweb` concluídos com sucesso.

Revisão: a tela usa uma RPC de lote, preserva a chave de idempotência em retry, bloqueia envio concorrente, desconta reservas e valida origem/destino. O segundo commit separou os guardas de checkout da migration original. Mudanças posteriores do PR #91 ajustaram o SQL implantável; não aplicar o arquivo antigo por conta da revisão histórica.

## Deploys e referências de produção

- VendeWeb: domínio documentado `https://www.vendeweb.com.br`; worker `foodweb`, endereço documentado `https://foodweb.joseluizacama.workers.dev`.
- FloriWeb: worker `floriweb`, endereço documentado `https://floriweb.joseluizacama.workers.dev`.
- Impulso: worker `academia`, endereço documentado `https://academia.joseluizacama.workers.dev`.
- As consultas HTTP diretas aos quatro endereços acima retornaram 403 neste ambiente. Isso não comprova indisponibilidade do produto nem valida o deploy servido.
- GitHub informou `has_pages=false` no repositório principal. A listagem de deployments do GitHub está vazia nos três repositórios; isso não significa ausência de deploy no Cloudflare.
- Os checks dos PRs #89 e #90 e seus comentários do bot confirmam builds de preview no Cloudflare Workers. A revisão mais recente da `main` não foi comprovada por um teste funcional de produção nesta rodada.
- VendeWeb tem os workflows `deploy-supabase-functions.yml` (manual) e `vendas-estoque.yml` (PR com filtro de paths e execução manual). FloriWeb tem deploy de funções manual. O clone Academia não tem workflow em `.github/workflows`.
- Nos workflows examinados não há chamada `uses: JoseLuiz095/Food-Service-SaaS@...`, filtro por nome do repositório ou URL de clone fixa. Segredos são referenciados por nome; seus valores não foram consultados.
- O painel autenticado de Webhooks não listou webhooks próprios. GitHub Apps instalados: ChatGPT Codex Connector, Cloudflare Workers and Pages, draw.io App, Netlify, Supabase e Vercel. A instalação de um app não comprova um deploy ativo nesse provedor. Não foram alterados vínculos ou permissões. A configuração interna do Cloudflare e o ambiente efetivo do worker, OAuth/SMTP, domínios customizados e secrets não foram integralmente inventariados. Após a renomeação, o [PR #94](https://github.com/JoseLuiz095/vendeweb/pull/94) foi aberto e o check **Workers Builds: foodweb** do commit `e5666c5540ca08a9511c40f97121d61cbb7268e7` concluiu com sucesso, confirmando a continuidade do build integrado. Não foi realizado deploy manual de produção.

### Renomeação do GitHub

O GitHub confirmou `vendeweb is available`. O repositório foi renomeado para **[JoseLuiz095/vendeweb](https://github.com/JoseLuiz095/vendeweb)**; o conector confirmou o mesmo ID `1349673787`, `main` como padrão e as mesmas permissões. O remote `origin` do clone local e do worktree foi atualizado para `https://github.com/JoseLuiz095/vendeweb.git`. A consulta `git ls-remote --heads origin` confirmou `main` no mesmo SHA `26a65e3877943d7b70de38d2d4044fa32358082d`. Outros clones, fora deste ambiente, ainda devem atualizar seus remotes.

Após a renomeação, conferir o mesmo ID `1349673787`, a `main`, branches, PRs, Actions e permissões; atualizar os remotes dos clones para o novo URL e conferir `git ls-remote`. Preservar `wrangler.jsonc` com worker `foodweb`, domínios, variáveis, project ref e integração existente; não criar outro worker por causa da marca. O preview da branch de continuidade passou no check Cloudflare depois da renomeação; manter validação funcional do produto em uma revisão própria, sem deploy manual de produção nesta rodada. Não reutilizar o nome antigo em outro repositório, pois isso pode invalidar redirecionamentos.

[Documentação GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository): URLs do repositório e operações Git normalmente redirecionam, mas URLs de GitHub Pages e referências a Actions hospedadas no próprio repositório exigem atenção específica.

## Supabase compartilhado — VendeWeb e FloriWeb

Ref confirmado: **`elttryavkeartoxgdgse`**. Nome inicial observado: **`floriweb01`**. Nome visível alterado e confirmado: **`VendeWeb`**. Região `sa-east-1`; estado `ACTIVE_HEALTHY`; PostgreSQL 17.6.1.165. O conector retornou apenas a branch padrão `main`, sem homologação separada identificada.

O nome visível foi alterado para **VendeWeb** no painel e confirmado pelo conector com o mesmo ref, host e estado saudável. A ação editou somente `Project name`; `https://elttryavkeartoxgdgse.supabase.co`, configurações, dados e integrações não foram alterados por esta operação.

Inventário de dependências compartilhadas:

- 102 tabelas em `public`: 77 `food_*` e 25 com outros nomes; contagem não equivale a auditoria de permissões.
- 15 Edge Functions listadas, incluindo funções Food e FloriWeb e as legadas sem prefixo. Nenhuma foi publicada, removida ou alterada nesta rodada.
- 7 buckets: `food-custom-files`, `food-finance-documents`, `food-product-images`, `food-store-assets`, `flori-finance-documents`, `product-images`, `store-assets`. Arquivos privados continuam privados; nenhum objeto foi exportado ou modificado.
- 3 jobs no catálogo `cron.job`; seus comandos não foram exibidos para evitar possível exposição de credenciais.
- `auth.users` é intencionalmente compartilhado, conforme os `AGENTS.md`; tabelas operacionais, permissões e buckets continuam separados por produto.
- Não migrar tabelas FloriWeb para o namespace VendeWeb/Food, não renomear schemas ou RPCs, não trocar endpoints ou rotacionar chaves como parte do nome visível.

### Histórico de migrations

A `main` VendeWeb inventariada contém 68 arquivos SQL em `supabase/migrations`; o histórico remoto compartilhado contém 40 entradas. Essas contagens não medem quantas migrations estão pendentes: há instalação histórica e versões locais/remotas divergentes.

Últimas entradas remotas verificadas:

| Versão remota | Nome |
| --- | --- |
| `20261023101500` | `food_product_stock_adjustments` |
| `20261024003848` | `food_business_segments` |
| `20261024004724` | `food_multilocation_stock` |
| `20261024005013` | `food_sales_fulfillment_location_ledger` |
| `20261024005608` | `food_location_initial_balance_upsert` |
| `20261026105329` | `food_stock_simple_mode` |
| `20261026112835` | `food_location_stock_fast_flow` |
| `20261026115308` | `food_stock_location_balance_bootstrap` |

Por exemplo, o modo simples usa a versão local `20261025090000`, enquanto o remoto o registra em `20261026105329`. Não executar `supabase db push` para tentar resolver a diferença. Comparar SQL efetivo, grants, triggers e schema sob revisão própria, com backup, em homologação.

### Pendências exclusivas do VendeWeb

Consultas ao catálogo confirmaram as assinaturas:

- `food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)`;
- `food_stock_mode_v1(uuid,boolean)`;
- `food_get_public_location_availability_v1(uuid,uuid)`.

Continuam ausentes nas assinaturas esperadas:

- `food_update_inventory_item_v1(uuid,uuid,jsonb)`;
- `food_save_product_recipe_v1(uuid,uuid,text,numeric,text,text,jsonb)`;
- `food_dashboard_metrics_v1(uuid)`.

Os triggers `food_orders_require_public_pickup_stock_trg` e `food_order_items_require_pickup_stock_trg` existem no catálogo remoto. Isso não comprova que seu corpo seja idêntico ao arquivo local separado; reconciliar com o handoff histórico antes de qualquer nova implantação.

Priorizar essas dependências do frontend numa revisão própria do VendeWeb, preservando o FloriWeb. A renomeação administrativa não é autorização para corrigi-las agora. Presença de RPC no catálogo não prova login, autorização via Data API nem persistência de uma nova operação real.

## Academia / Impulso — exclusão suspensa

Identidade confirmada duas vezes pelo conector: **Academia / `vnpoinodvchmmbyxpacj`**, região `sa-east-1`, estado **`INACTIVE`**, PostgreSQL 17.6.1.166. O repositório [Academia](https://github.com/JoseLuiz095/Academia) permanece ativo e não está autorizado para exclusão.

Dependências identificadas:

- `AGENTS.md` declara esse ref como banco oficial independente do Impulso;
- README, configuração local, planejamento e login fazem referência ao projeto;
- worker documentado `academia` e fluxos React/Supabase continuam dependentes desse backend; a configuração de produção efetiva não foi acessível;
- cinco Edge Functions listadas: `generate-content-idea` v13, `ask-niche-assistant` v8, `create-public-order` v7, `access-product` v4 e `report-public-store` v2;
- o clone tem 47 migrations; a listagem remota falhou com timeout de conexão, compatível com o estado inativo, sem afirmar uma causa definitiva;
- PR #32 aberto no repositório ativo; não foi fechado ou alterado.

**Exportações obtidas; recuperação completa ainda não validada. Exclusão: não executada.** Código e migrations do GitHub não substituem backup de dados, usuários Auth ou objetos Storage. O conector não disponibiliza exportação completa ou exclusão de projeto. O painel autenticado confirma que o projeto está pausado; Database, Auth e Storage estão indisponíveis nesse estado. Não restaurar/reativar, resetar senha ou gerar custos automaticamente apenas para tentar o backup.

Para liberar a exclusão já autorizada, obter fora do projeto um backup verificável do banco (schemas, dados, Auth, roles/grants e funções), objetos Storage e código/configuração das Edge Functions, além das configurações Auth/OAuth/SMTP, cron, webhooks e integrações. Credenciais devem permanecer em armazenamento seguro, fora de chat, logs e Git. Verificar integridade/checksums, contagens e restauração isolada; resolver a dependência do Impulso/worker antes de excluir. O arquivo deve sobreviver à exclusão do projeto; backups automáticos mantidos somente dentro do Supabase não satisfazem essa condição.

Foram baixados pelo painel, sem reativar o projeto: dump SQL gzip PostgreSQL 17.6.1.166 (119.296 bytes), arquivo ZIP de Storage (22 bytes, vazio) e o código/configuração de versão das cinco Edge Functions via conector. A leitura integral do gzip confirmou o rodapé de conclusão, 81 CREATE TABLE, 81 seções COPY, 15 definições de roles e 430 registros, incluindo 4 usuários Auth. O dump tem 2 buckets e 0 objetos Storage, consistente com o ZIP vazio; a integridade do ZIP foi conferida. Os arquivos e checksums ficam em pacote privado fora do Git. Não foram expostos registros, hashes de senha, tokens ou segredos na documentação.

Permanecem sem validação: restauração integral em ambiente isolado e configuração externa de Auth/OAuth/SMTP, secrets, cron e integrações que não puderem ser reconstruídos a partir do dump e dos exports. Além disso, o código ativo do Impulso e seu worker continuam referenciando o projeto. Sem resolução dessa dependência, a exclusão permanece suspensa mesmo com as exportações disponíveis. A autorização para exclusão continua válida quando forem satisfeitas as condições; não foi pedida nova confirmação.

## Validação desta rodada

- `git merge-base --is-ancestor` confirmou ambos os commits de transferência na `main` remota.
- Revisão dos diffs dos dois commits e do estado posterior da tela de transferência.
- `git diff --check` do intervalo histórico sem erros.
- `npm run typecheck`: aprovado.
- `npm run smoke`: 177 verificações aprovadas.
- `node scripts/stock-transfer-batch-db-test.mjs`: 47 verificações aprovadas em PGlite local, sem banco remoto.
- PR #94 aberto, sem merge e sem conflitos na consulta final; check `Workers Builds: foodweb` aprovado após renomear. A CI `Vendas e estoque` não é acionada por alterações somente em Markdown, conforme seu filtro de paths.
- E2E Playwright não reexecutado: o navegador esperado pela instalação local não está instalado; checks remotos existentes foram inventariados, sem alegar novo teste visual.
- Foram alterados somente o slug do repositório, o nome visível do Supabase e a documentação em branch própria. Não houve migration, mudança de RLS, deploy manual de função, alteração de dados, exclusão ou merge nesta rodada.
