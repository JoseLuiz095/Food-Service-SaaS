# VendeWeb — evolução operacional e coordenação Supabase

Data: 23/10/2026. Base: `main` em `e9f3040d682915b6bd5ded33af5b3e1e69adf861`. Branch: `codex/evolucao-operacional`.

## Escopo e estado

Esta rodada priorizou falhas comprovadas e produtividade usando as APIs existentes. A auditoria é estática e dirigida pelos fluxos abaixo; não equivale a certificação manual de toda a plataforma em Supabase remoto. O trabalho anterior no checkout antigo foi preservado em outro worktree.

| Estado | Entrega |
|---|---|
| Implementado e testado localmente | Isolamento de respostas/cache por contexto; duplicação revisável de produtos; preservação de rascunho e galeria; busca/filtro/paginação Master; preservação do profissional ao editar agenda; onboarding distingue pedido manual de checkout público. |
| Implementado no código e testado com fronteiras interceptadas; implantação pendente | Edge Function de push bloqueia envio quando a leitura das preferências falha ou a loja inexiste. |
| Bloqueado para execução/validação remota | Schema, migrations, RPC de estoque, RLS, login/criação das sete empresas e teste real de estoque no projeto `elttryavkeartoxgdgse`. A consulta ao projeto pelo conector retornou falta de permissão. Nenhuma escrita remota foi tentada. |
| Planejado | Onboarding por capacidade, paginação de servidor, jornadas completas floral/agendamento/entrega digital, pacotes de sessões e automações duráveis. |

## Problemas comprovados e correções

Todos os recursos desta rodada são `core`: não introduzem regras específicas de alimentação no núcleo.

| Prioridade / área | Antes / causa | Correção efetiva | Evidência |
|---|---|---|---|
| P1 — contexto de negócio | Metadados do cache administrativo permaneciam válidos mesmo após o snapshot ser substituído por uma vitrine pública. O retorno ao painel em até30s podia reaproveitar o snapshot da vitrine. Respostas de gravação antigas também atualizavam o estado após troca de tenant. | Snapshot e carregamento têm escopo de usuário/tenant ou vitrine. Dados anteriores são mascarados enquanto o próximo negócio carrega. Leituras/respostas antigas não prevalecem. Mutations verificam contexto e entidade; filas de pedidos são deduplicadas por escopo, e leituras iniciadas antes de uma gravação são invalidadas. | Três regressões Playwright: troca com resposta atrasada; vitrine de outro negócio e retorno SPA; salvar configurações durante troca de tenant. Não altera nem substitui RLS. |
| P2 — catálogo | Novo sabor/modelo exigia refazer nome, preço e opções; não existia duplicação. | Ação Duplicar desktop/mobile abre rascunho revisável. Produto/grupos/itens recebem IDs próprios; cópia oculta, sem destaque, físico/reserva zerados e sem imagens/código interno. Mantém categoria e regras do mesmo tenant. Nenhuma escrita ao abrir; salvamento usa o mecanismo existente. | Cópia390/1366: grava payload independente, não muda origem e não escreve imagens compartilhadas. Origem ausente/de outro tenant não abre cadastro vazio. |
| P1 — formulário de produto | Todo snapshot de catálogo reidratava campos e apagava nome/preço em edição. Remoção/seleção de imagem dependia dessa reidratação. | Hidratação por rota/tenant; sincronização somente dos campos de mídia persistida. Rascunho é preservado em atualização de outra aba; principal/remoção atualizam a galeria sem resetar texto/opções. | Regressões de storage-event e galeria principal mantêm nome/preço pendentes. Isso não implementa controle de conflito de versões no servidor. |
| P1 — Master | Busca prometia responsável mas ignorava o nome; acentos atrapalhavam busca; lista inteira renderizava sem paginação. | Busca por termos com normalização de acentos, nome/e-mail do responsável, cidade/UF/plano/segmento; filtro de segmento principal;20 registros por página, limpeza de filtros, gestão preservando página. “Clientes ativos” substitui “Pagantes”, pois o grupo também inclui cortesia. |45 negócios fictícios em390/1366, navegar para página2, gerenciar a loja correta, buscar João/Vitória sem acentos, combinar/limpar filtros, sem overflow da página. Paginação é de renderização; API ainda carrega lista completa. |
| P1 — agenda | Edição sempre enviava `professional_id=user.id`, reatribuindo ao editor um compromisso de outro profissional. | Só criação define o profissional atual. Edição omite o campo, e o backend existente preserva o profissional armazenado ao mesclar a alteração. | Teste de reagendamento envia somente campos alteráveis e confirma que o profissional original permanece após reload da API interceptada. |
| P1 — onboarding | `orders.length >0` tratava venda de balcão como evidência de uso do checkout público. | Apenas pedido com `source='site'` habilita essa indicação. Pedido manual continua exibindo orientação para testar a vitrine. | Dois testes, fontes `counter` e `site`. O checklist especializado por segmento continua pendente. |
| P1 — push | Handler ignorava erro na consulta das preferências; loja sem resultado podia continuar até o envio. |503 sem envio para falha de leitura;404 para loja inexistente; preferência desativada mantém200/zero envios. Autenticação e demais regras preservadas. | Cinco testes do handler real com DB/transporte interceptados mais um teste existente de notificações. Falha não consulta inscrições nem aciona transporte; resposta não expõe erro interno. Publicação remota não realizada. |

## Auditoria por segmento e reaproveitamento

A matriz anterior foi comparada com o código atual e as referências locais `Academia` (Fit) e `floriweb01`. Recursos abaixo não foram declarados integrados apenas por existir uma página.

| Segmento | Base atual preservada / validada nesta rodada | Lacuna concreta / próxima integração |
|---|---|---|
| Alimentação | Catálogo/opções, carrinho, pedidos, estoque/receita existentes. Cópia de produto e edição de pedido exercitadas no navegador com API interceptada. |P0: confirmar/aplicar migration da RPC no banco alvo. Testar reserva/cancelamento/baixa física e ingredientes remotamente; não fazer ajustes específicos em produtos reais. |
| Floricultura | Apresentação/catálogo, módulos complementares e projeção de serviços já existentes; teste Master habilita agenda e painel reflete. |P2: CheckoutData não tem destinatário/cartão/anonimato estruturados; `floriweb01/src/pages/store/Checkout.tsx` possui jornada própria a adaptar com contrato/RPC. Não gravar esses campos em notes como solução permanente. |
| Comércio | Catálogo/carrinho/vitrine por tenant, duplicação revisável e estoque sem replicar reservas. |P2: importação CSV e operações em lote precisam validação de contrato/erros e limites; não implementadas. |
| Serviços/locações | Agenda administrativa e módulo de ativos/reservas existentes preservados. |P2: serviços públicos oferecem consulta manual; não há autoagendamento completo de cliente. Reservar equipamento e agendar profissional continuam regras diferentes. Não houve teste remoto de conflito de ativos nesta rodada. |
| Personal | Clientes/alunos, serviços e agenda administrativos existentes; reagendamento preserva profissional. |P2: serviço com nome/preço/duração não é pacote com saldo/validade. Fichas/timer/portal privado da referência Academia não foram portados nesta rodada. |
| Nutrição | Agenda e acompanhamento administrativo existentes; fluxos de painel/vitrine exercitados com fixture. |P2: contratação pública/agendamento e área privada permanecem parciais. Nenhum prontuário ou dado clínico foi criado. |
| Creator | Campanhas/links e projeção pública existentes; CRUD mockado e URLs HTTPS validadas nos testes existentes. |P2: calendário/editor de conteúdo, mídia kit e entrega digital privada ainda não integrados. Campanhas não publicam nas redes; nenhuma API social ou IA nova contratada. |

### Outras pendências priorizadas

| Prioridade | Evidência / impacto | Próxima ação e dependência |
|---|---|---|
|P0 |Erro PGRST202 reportado; estado remoto da função não acessível a esta conta. |Executar [SOLICITAÇÃO SUPABASE — estoque](SOLICITACAO_SUPABASE_ESTOQUE.md) na conversa com acesso, conferir projeto/ambiente/histórico antes de SQL e devolver evidência HTTP/SQL. Não presumir que a migration ainda está ausente se outra conta já a aplicou. |
|P1 |Checklists de `storeReadiness.ts` ainda exigem produto/categoria/entrega de profissionais que usam somente serviços. |Adaptar à capacidade efetiva e presença de serviços/canal real de contratação. Não usar apenas o tema visual como autorização. APIs existentes podem apoiar a primeira etapa, sem prontuário. |
|P1 |Cadastro cria conta/loja e inicializa segmento em chamadas consecutivas (`selfServiceSignup.ts` / `businessPresentation.ts`). |Tornar o processo recuperável/atômico com idempotência no servidor e validação real em homologação. Ainda exige confirmação da estrutura remota. |
|P1 |`food_business_private.operate` limita listas aos últimos100/máximo200; busca e seletores operam nesse subconjunto. Master também recebe a lista inteira. |Paginação/busca no backend por tenant com cursor e contagem; escopo futuro requer solicitação Supabase com contrato definido. Não aumentar para consulta ilimitada. |
|P1 |Preservar rascunho evita apagamento, mas saveProduct/saveSettings não possuem compare-and-swap de versão para edições concorrentes de dois usuários. Upload paralelo pode falhar parcialmente. |Definir controle de versão/recuperação dos passos no backend antes de prometer edição concorrente segura. Não reverter dados de outro usuário via frontend. |
|P1 |Correção de preferências está só na fonte da Edge Function. |Executar [SOLICITAÇÃO SUPABASE — push](SOLICITACAO_SUPABASE_PUSH.md); preservar segredos/configuração e publicar apenas no ambiente autorizado. |
|P2 |Não existe outbox durável de lembretes de consulta/campanha; falhas transitórias de push ainda não têm retry durável. |Reutilizar transporte com pequena fila por tenant/evento, chave idempotente, tentativas limitadas e consentimento. Evitar integração social/canais não autorizados. |
|P3 |Auditoria visual completa de cada papel/estado ainda não foi feita; contraste da landing já tinha pendências no relatório anterior. |Ciclo específico de acessibilidade e estados usando navegador autenticado no ambiente correto. Não adicionar animações nem bibliotecas por quantidade de mudanças. |

## Supabase e coordenação entre contas

- Project ref indicado pelo usuário: `elttryavkeartoxgdgse`. Consulta atual pelo MCP: `You do not have permission to perform this action`.
- Ambiente de destino ainda não confirmado. Alterações de produção continuam exigindo aprovação específica; nenhuma foi executada.
- **Migrations novas nesta rodada:0. Migrations remotas aplicadas:0. Edge Functions publicadas:0.**
- As alterações de frontend usam estruturas/APIs já presentes no repositório e não introduzem chamadas a objetos novos.
- A migration de estoque de PR76 continua uma pendência de implantação/validação desta sessão, não uma correção remota comprovada. O prompt contém SQL integral, checksum, pré-condições, consultas, segurança, recuperação e testes reais exigidos.
- O [inventário de46 RPCs literais](INVENTARIO_RPC_20261023.md) encontrou definição local para todos os nomes. Isso não verifica assinaturas/grants/ordem efetiva de DROP/overloads nem se foram aplicados remotamente. As funções dinâmicas e as46 chamadas precisam ser comparadas com `pg_proc` no destino.
- Não criei as sete lojas/usuários reais nem gerei credenciais. Os sete negócios dos testes são fixtures interceptadas, nunca apresentados como contas existentes no Supabase.

## Testes e evidências

- `npm run validate`: passou no estado final. Inclui smoke177, fluxos críticos122, segmentos/domínio, PWA8, notificações6, segurança, reparo PostgreSQL94, guards multi-tenant44, estoque PGlite17, plataforma PostgreSQL96, provisionamento7, TypeScript e build. Testes SQL locais não comprovam o banco remoto.
- Playwright, canal `chromium-headless-shell`: **65 cenários distintos aprovados**. Uma rodada de63 cobriu catálogo, Master, contexto, agenda, pedido, carrinho, produto mobile, sete segmentos e demonstrações; rodada final de13 repetiu11 Master após ajuste do rótulo e acrescentou2 de onboarding. Não somar as repetições como cenários novos.
- APIs de todos esses cenários foram interceptadas com dados fictícios. Houve execução real do React e Chromium local, com assertions de responsividade320/390/1366, persistência na fixture após reload, comportamento de telas e payloads. Não houve login real remoto nem prova de RLS remoto.
- Inicialmente o Chrome completo foi bloqueado pelo socket do runtime; o Chromium Headless Shell instalado executou a suíte normalmente. Falhas intermediárias de fixture de galeria e locator foram diagnosticadas e corrigidas; a rodada final passou.
- `git diff --check`: passou. Sem script lint separado no projeto.
- Build local apresentou o warning preexistente de `VITE_TURNSTILE_SITE_KEY` ausente. Os testes de navegador usam chave/Turnstile fictícios interceptados. A configuração efetiva do deploy ainda precisa ser verificada; nenhum build foi publicado por esta sessão.
- Sem dependência nova, mudança de lockfile, biblioteca de animação, cobrança ou publicação em produção.

### Antes/depois reais do navegador local

Capturas com APIs interceptadas e dados fictícios. O “antes” foi renderizado a partir do commit base `e9f3040`; o “depois” usa esta branch. Não são screenshots de contas remotas. Os glyphs de emoji dependem da fonte instalada no ambiente de captura.

| Tela | Antes | Depois |
|---|---|---|
|Master mobile390 |[Imagem](evidence/master-before-390.png) |[Imagem](evidence/master-after-390.png) |
|Master desktop1366 |[Imagem](evidence/master-before-1366.png) |[Imagem](evidence/master-after-1366.png) |
|Novo fluxo de cópia |Não existia ação de duplicação. |[Mobile](evidence/catalog-copy-390.png) · [Desktop](evidence/catalog-copy-1366.png) |

## Arquivos modificados

- `src/contexts/StoreContext.tsx`
- `src/pages/admin/Products.tsx`
- `src/pages/admin/ProductForm.tsx`
- `src/utils/productCopy.ts`
- `src/pages/admin/Onboarding.tsx`
- `src/pages/master/Stores.tsx`
- `src/pages/master/master-refinements.css`
- `src/platform/OperationsPage.tsx`
- `supabase/functions/food-send-push/index.ts`
- `package.json` (somente comando de testes)
- `scripts/push-preferences-test.mjs`
- `qa/tests/modules/master-ux.spec.ts`
- `qa/tests/modules/catalog-productivity.spec.ts`
- `qa/tests/modules/store-context-scope.spec.ts`
- `qa/tests/modules/appointment-edit.spec.ts`
- `qa/tests/modules/onboarding-readiness.spec.ts`
- Este relatório, inventário, duas solicitações Supabase e seis capturas em `docs/evidence/`.

## Próxima sequência

1. P0: devolver execução/verificação remota do estoque com ambiente e project ref, assinatura e saldo0→17 persistido. O prompt pode ser copiado manualmente para a conta com acesso.
2. P1: publicar e validar a correção de preferências de push em homologação; verificar as RPCs remotas e os módulos iniciais.
3. P1: criar/validar as sete contas pelo fluxo real; login, tenant, catálogo/vitrine e isolamento com duas contas. Não substituir pelo mock.
4. P1: onboarding por segmento, recuperação de cadastro e paginação backend.
5. P2: escolher um piloto (presente floral, autoagendamento ou pacote de sessões) e definir o contrato completo com solicitação Supabase antes de ativar consumidores.
