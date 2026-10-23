# Auditoria autônoma de UX e funcionamento do VendeWeb

Data: 23/10/2026  
Escopo: Admin Master, shell administrativo, dashboards por segmento, navegação operacional, cadastro público, timezone dos indicadores e fluxo de estoque já descrito em `AUDITORIA_UX_OPERACIONAL_20261023.md`.

## Estado da entrega

| Estado | Resultado |
|---|---|
| Implementado e validado localmente | Sidebar responsiva do Admin Master, controle acessível do menu móvel, navegação agrupada, leitura de tabelas largas, dashboard operacional para segmentos de serviço, data dos indicadores no timezone da loja e abertura da aba operacional correta pelos atalhos. O cadastro agora descreve o fluxo real de criação e aprovação. |
| Implementado, aguardando validação visual em navegador | Mudanças visuais e comportamentais do shell e dos painéis. A suíte automatizada Playwright não conseguiu iniciar Chromium neste ambiente, porque a criação de socket foi negada pelo sistema operacional. Não há screenshot real desta rodada. |
| Não executado por falta de ambiente | Criação das sete lojas, login real, validação autenticada entre tenants e aplicação da migration de estoque em Supabase de homologação. |

## Problemas comprovados e correções

| Área | Problema encontrado | Correção |
|---|---|---|
| Admin Master — desktop | O shell já mantinha a sidebar visível; faltava recolhimento para dar mais espaço às tabelas e manter o controle independente entre páginas. A navegação era plana e pouco contextual. | Sidebar recolhível com preferência persistida, organização em grupos e indicação de contexto. Nenhum link novo foi criado sem uma tela correspondente. |
| Admin Master — celular | O menu lateral podia ficar aberto atrás da rolagem e o fechamento por teclado não gerenciava foco. | Gaveta modal com bloqueio da rolagem de fundo, foco inicial, ciclo de foco por Tab, fechamento por Escape, restauração de foco e retorno automático a desktop. O comportamento compartilhado também vale ao painel do lojista. |
| Tabelas administrativas | As listas de negócios e solicitações de cadastro podem ultrapassar a largura móvel, sem dica de rolagem nem foco de teclado no contêiner. | Orientação de rolagem em telas estreitas e região focável com contorno visível para navegação por teclado. |
| Dashboard — Personal, Nutrição e Creator | A composição priorizava indicadores comerciais de pedidos e produtos, mesmo em negócios sem catálogo comercial, e não levava diretamente às tarefas de atendimento. | Quando não há atividade de comércio, o dashboard prioriza tarefas e atalhos do módulo operacional. Lojas com atividade de comércio continuam vendo os indicadores comerciais. A tela de Nutrição também lembra que o painel não é local para registrar notas clínicas. |
| Indicadores diários | O agrupamento de “hoje” usava a data local do computador do administrador, embora a loja tenha timezone próprio. | Datas e rótulos de período diário usam `openingSchedule.timezone`, com fallback seguro para timezone inválido. |
| Atalhos de operação | Links para clientes, serviços, agendamentos, acompanhamento, campanhas e links comerciais abriam a página sem selecionar a aba indicada. | A página lê `?tab=` e seleciona a aba apenas se ela estiver autorizada para o usuário. |
| Cadastro público | O texto dizia que o usuário confirmaria e-mail antes da ativação. O fluxo real marca a conta criada pela Edge Function como confirmada, inicia a sessão e aguarda revisão do Admin Master antes da publicação. | Texto atualizado para descrever o fluxo de segurança, preparação e aprovação sem prometer uma confirmação por e-mail que não ocorre. |
| Estoque e pedidos | Diagnóstico, lógica físico/reservado/disponível, ajuste absoluto, trilha auditável e atualização da fila estão detalhados em `AUDITORIA_UX_OPERACIONAL_20261023.md`. | Código e migration de ajuste auditável integram o PR; migration ainda não foi aplicada em Supabase. |

## Auditoria ampliada e pendências

- A plataforma não possui rota pública de autoagendamento para o cliente contratar um serviço. Agendamentos e serviços encontrados nesta rodada são operações administrativas; a vitrine não completa esse fluxo. Não foi criada uma jornada nova sem regras completas de disponibilidade, duração, pagamento e confirmação.
- O dashboard e o onboarding ainda não formam um fluxo guiado completo de publicação para todos os segmentos. Os atalhos foram contextualizados, mas faltam estados de conclusão e publicação por ramo.
- A configuração de loja e a inicialização do segmento ocorrem em operações consecutivas após o cadastro. Se a segunda operação falhar, o cliente pode ter uma conta e solicitação válidas, mas precisar concluir o segmento pelo painel. A correção transacional exige alteração coordenada da Edge Function/RPC e validação em Supabase de homologação; permanece pendente.
- O Admin Master não tem busca e paginação no seletor/lista de negócios. A lista já tem filtros e ações diretas, mas operações em escala ainda precisam de melhoria.
- O checkout restaura um rascunho local no dispositivo, conforme aviso mostrado ao cliente. Dados pessoais podem permanecer no navegador até a limpeza após pedido concluído ou remoção manual; uma ação explícita de limpeza e política de retenção merecem revisão dedicada.
- A revisão desta rodada priorizou as áreas acima e não equivale a teste manual autenticado de cada tela, papel e segmento. A matriz e pendências anteriores permanecem em `AUDITORIA_UX_OPERACIONAL_20261023.md`, `MATRIZ_INTEGRACAO_20261022.md` e `VALIDACAO_VENDEWEB_20261022.md`.

## Lojas de teste e acesso Supabase

Nenhuma das sete lojas foi criada nesta execução. A verificação do workspace não encontrou `.env` com configuração de desenvolvimento/homologação; somente `.env.example` está presente. O fallback local aponta para uma configuração de produção e possui guarda de segurança, por isso não foi utilizado. A integração Supabase conectada oferece um projeto inativo chamado `banco-financeiro`, que não corresponde ao VendeWeb.

Além disso, o cadastro real exige `VITE_TURNSTILE_SITE_KEY` no build, segredo Turnstile na Edge Function e `SUPABASE_SERVICE_ROLE_KEY` no ambiente servidor. O botão permanece bloqueado sem a chave pública. Sem o projeto e segredos corretos de homologação, não existe caminho autorizado para criar usuários Auth, fazer login, consultar os tenants ou validar vitrines. Nenhuma credencial fictícia foi inventada e nenhum registro foi apresentado como criado.

O fluxo encontrado é: formulário público → Edge Function `food-public-self-signup` → Auth + RPC de solicitação/tenant → login do proprietário → inicialização de segmento e apresentação → aprovação pelo Admin Master → liberação da loja. A provisionação via script administrativo não substitui o cadastro pela interface solicitada.

## Testes e evidências

- `npm run validate`: passou após as mudanças de dashboard, operação, navegação, timezone e navegação móvel. Inclui smoke (177 checks), fluxos críticos (122), testes de segmentos/domínio, PWA (8), notificações (1), segurança, PostgreSQL/PGlite (94 reparos, 44 guards multi-tenant e 15 de estoque), plataforma (96), provisionamento (7), TypeScript e build.
- O teste Playwright focado não iniciou: Chromium encerrou com `FATAL ... socket() failed: Operation not permitted`. A instalação do navegador foi tentada, mas a restrição do ambiente impede validar o comportamento visual interativo. Não foram capturadas imagens.
- O teste anterior `npm run qa:lite` continua registrado no relatório operacional: 46 falhas e 1 ignorado, principalmente violações sérias de contraste preexistentes na página comercial e respostas `ERR_EMPTY_RESPONSE` de recursos externos. Esse resultado não deve ser interpretado como validação visual aprovada.
- Sem conexão ao banco correto, a migration `20261023101500_food_product_stock_adjustments.sql` está apenas preparada no branch. Não houve alteração de Supabase, Auth ou dados remotos.

## Arquivos desta rodada

- `src/components/admin/admin-navigation.css`
- `src/hooks/useAdminMobileNavigation.ts`
- `src/layouts/AdminLayout.tsx`
- `src/layouts/MasterLayout.tsx`
- `src/pages/admin/Dashboard.tsx`
- `src/pages/master/SignupRequests.tsx`
- `src/pages/master/Stores.tsx`
- `src/pages/master/master-refinements.css`
- `src/pages/store/SelfSignup.tsx`
- `src/platform/OperationsPage.tsx`
- `src/utils/storeHours.ts`
- `qa/tests/modules/master-ux.spec.ts`
- `scripts/domain-unit-test.mjs`

As mudanças de estoque, testes de banco e migration estão enumerados no relatório operacional referido acima.

## Próximas prioridades

1. Conectar configuração Supabase/Turnstile de homologação; então criar as sete lojas pela interface e validar login, tenant, vitrine, painel e isolamento.
2. Rodar Playwright autenticado e visual no ambiente que permita iniciar browser; capturar desktop, tablet e mobile.
3. Validar/aplicar a migration de estoque em homologação após comparar schema e migrations existentes.
4. Tornar criação de conta, tenant e segmento uma operação recuperável/atômica e testar falhas intermediárias.
5. Projetar a jornada pública de agendamento com disponibilidade, duração, regras de confirmação, política de cancelamento e pagamento.
6. Revisar contraste da landing e adicionar busca/paginação ao gerenciamento de negócios.
