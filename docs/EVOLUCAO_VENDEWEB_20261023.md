# VendeWeb — implementação, auditoria e validação

Escopo: evolução incremental da branch `codex/segmentos-modulos-demonstracoes`, baseada em `f9899553eb5b6c25b66f94ee87142f396bf6683b` (PR #74 já incorporado). Alterações locais de 22–23/10/2026. Sem implantação ou alteração de produção.

## Diagnóstico e estratégia

A [matriz comparativa](MATRIZ_INTEGRACAO_20261022.md) registra 26 capacidades e os caminhos efetivamente inspecionados em VendeWeb/Food, FloriWeb e Academia/Impulso. Academia é o candidato localizado para Fit de COSMIN; o nome do repositório não comprova essa equivalência. A unificação anterior não incorporou toda a jornada floral nem a gestão digital e de atendimentos de Impulso. A quantidade de arquivos do PR não foi usada como indicador de completude.

| Estratégia | Benefício | Custo e risco | Decisão |
| --- | --- | --- | --- |
| Copiar/fundir aplicações imediatamente | Uma base aparente | Contratos diferentes de pedidos, carrinhos, Auth e dados privados; migração arriscada | Não adotada |
| Manter aplicações e compartilhar bibliotecas | Menor mudança imediata | Duplicação de operação e autorização; versões de contratos diferentes | Transição para originais que seguem independentes |
| Núcleo comercial existente com módulos específicos | Reutiliza catálogo, lojas, checkout, planos e identidade; um desenvolvedor mantém um monólito | Exige contratos explícitos e concessões no servidor | Arquitetura aplicada gradualmente nesta branch |

Não foram criados microserviços, bancos substitutos ou novos pacotes. As aplicações originais e seus históricos permanecem independentes. Esta entrega não importa usuários ou transações reais entre bancos.

## Implementações

- Página comercial com nova hierarquia, hero, navegação, cards expansíveis, planos existentes e demonstração detalhada de alimentação preservada sob demanda. Os preços já existentes foram mantidos; nenhum novo preço por segmento foi inventado.
- Demonstrações locais interativas de sete segmentos, seleção desktop/mobile e vitrine/painel: alimentação com adicionais/carrinho; floricultura com cartão e data de exemplo; comércio com estoque; serviços com horários; personal/nutrição com clientes e rotina; creator com links e campanhas. Dados fictícios e simulações estão identificados; não executam contratação real.
- Cadastro apresenta os sete segmentos principais; os identificadores antigos continuam reconhecidos. A escolha inicial chama RPC autenticada e valida o perfil persistido. Conta existente não é recadastrada nem muda de segmento por query string. Falha pós-cadastro preserva a conta e oferece conclusão da configuração.
- `/admin/negocio` mostra o segmento persistido, concessões, acesso efetivo, plano, dependências e histórico. Configurações visuais preservam cores; não servem para conceder permissões.
- `/admin-master/segmentos` permite escolher o negócio, configurar segmento, conceder módulo por plano ou exceção justificada, definir validade e revogar sem apagar registros. Master exige MFA AAL2 no servidor. Migração explícita de operação legada pode preservar seus módulos ativos.
- `/admin/operacao` oferece cadastro/edição/arquivamento de clientes e serviços, agenda com conflitos por profissional, tarefas de acompanhamento administrativo, campanhas e links HTTPS. Os menus seguem as capacidades efetivas do servidor. Troca de loja invalida respostas anteriores; o layout remonta a página por tenant.
- Vitrines publicam somente a projeção de serviços ativos e links autorizados, sem expor clientes, agenda ou histórico administrativo. Contratação de serviços ocorre por atendimento manual configurado, com disponibilidade confirmada pelo negócio; não há reserva pública automática.
- Provisionador seguro e idempotente para sete empresas fictícias e cenários complementares. [Manifesto e instruções](CONTAS_TESTE_20261022.md). Senhas só são geradas ao criar Auth real e ficam criptografadas fora do Git.

## Segmentos, módulos e planos

| Segmento principal | Base inicial além do catálogo comum | Complementos |
| --- | --- | --- |
| Alimentação | Catálogo/adicionais/carrinho/pedidos existentes | Agenda, eventos, locação etc. mediante concessão |
| Floricultura | Perfil floral | Agenda de oficinas/serviços mediante concessão |
| Comércio | Catálogo e operação comercial existentes | Agenda e outros módulos compatíveis |
| Serviços e locações | Clientes, serviços e agenda | Eventos/locação de equipamentos mediante concessão |
| Personal | Clientes/alunos, agenda e acompanhamento administrativo de treino | Catálogo físico já compartilhado |
| Nutrição | Clientes, agenda e acompanhamento administrativo | Sem prontuário clínico nesta entrega |
| Creator | Campanhas e links comerciais | Catálogo compartilhado; agenda mediante concessão |

Catálogo, loja, usuários, checkout físico, pedidos, identidade, notificações existentes e cobrança SaaS manual continuam no núcleo. `food_business_profiles` registra o segmento; `food_business_entitlements` registra origem `segment`, `plan` ou `exception`, vigência e motivo. Recursos de plano usam o mecanismo existente `food_store_has_feature`; a migration cadastra os códigos sem adicionar direitos pagos aos planos existentes. Não altera preços, cobrança, assinaturas ou concessões de clientes existentes automaticamente. Exceções do Master são registradas por loja. Dependências não criam permissões implicitamente.

Os módulos antigos continuam funcionando para lojas sem perfil novo; a inicialização não converte flags legadas silenciosamente. Desativação preserva dados e impede novas operações pelo servidor. O módulo floral é uma classificação e ponto de evolução; não representa checkout de presentes completo.

## Banco e segurança

Migration aditiva: `supabase/migrations/20261022215432_food_business_segments.sql`. Novas tabelas operacionais usam prefixo `food_*`: perfis, concessões, auditoria, clientes, serviços, agendamentos, acompanhamentos e campanhas/links. Foreign keys compostas vinculam entidades ao mesmo tenant. Escrita operacional somente por RPC com autoridade explícita, allowlist de campos e transações; leitura direta sujeita a RLS. As funções privadas usam `search_path` vazio e permissões restritas.

A migration estende a autorização dos módulos legados para lojas já configuradas, protege alterações do segmento via tema visual e mantém parâmetros operacionais separados das concessões. Agenda usa locks transacionais e rejeita sobreposição; o servidor revalida permissões. Não há campos de diagnóstico, medidas de saúde ou prontuário. Campos livres administrativos ainda exigem orientação e governança de uso; não constituem conformidade LGPD integral.

O provisionamento começa desabilitado, exige guard positivo do banco de desenvolvimento/homologação e `service_role`. O script bloqueia referências de produção conhecidas, não envia convites/e-mails, não redefine senhas existentes, não adota usuários alheios e registra falhas parciais sem apagá-los automaticamente.

**Aplicação remota: não executada.** O único projeto conectado disponível era `banco-financeiro`, inativo e alheio aos produtos. Não foi usado. As sete contas têm estado `NOT_CREATED`; não existem credenciais reais a entregar. Testes HTTP simulados não equivalem a login real ou implantação de RLS no Supabase remoto.

## Recursos reaproveitados e limites

O núcleo existente preserva catálogo/opções, pedidos, estoque, checkout server-side, identidade por loja, planos/cobrança manual, MFA, notificações e módulos de eventos/combos/locação/personalizados. Conceitos de agenda e acompanhamento de Impulso orientam o contrato novo, sem copiar autorização ampla ou expor conteúdo pago. A jornada de presente de FloriWeb foi auditada; sua adaptação transacional não foi substituída por uma demonstração.

Ainda não implementados: checkout floral completo (destinatário, anonimato, cartão e janelas de entrega reais), entrega privada de conteúdo digital, fichas completas de treino, assinatura recorrente/pacotes com saldo de sessões, área autenticada do aluno, prontuário clínico, scheduler comum de comunicações, cupons completos e publicação por APIs sociais. Campanhas e tarefas novas não disparam notificações automaticamente. Cadastro de serviços e agenda administrativa não representam esses recursos adicionais.

## Validação

Resultados consolidados ao término desta rodada são registrados abaixo. O repositório não tem script `lint`; TypeScript, verificações de segurança/source, build e testes existentes são os checks disponíveis. Aviso de build sobre Turnstile vazio no ambiente local: Playwright usa chave local de teste; homologação precisa da chave autorizada real. Não desabilitar captcha para implantação.

## Prioridades seguintes

| Ordem | Trabalho | Impacto / esforço |
| --- | --- | --- |
| 1 | Disponibilizar Supabase independente de homologação, revisar/aplicar migration e executar provisionador; repetir login/CRUD/isolation com contas reais | Muito alto / médio |
| 2 | Adaptar checkout de presentes de FloriWeb com contrato explícito e validação server-side | Alto / médio-alto |
| 3 | Área do aluno e entrega digital privada com autorização por compra/tenant e URLs temporárias | Alto / alto |
| 4 | Pacotes com saldo, validade e reservas transacionais; calendário de profissionais mais completo | Alto / alto |
| 5 | Fila de eventos/lembretes com opt-in, idempotência e limites, reutilizando transporte existente | Médio-alto / médio-alto |
| 6 | Estimar armazenamento, banco, usuários e entrega de notificações por plano antes de definir preços por segmento | Alto comercial / médio |
| 7 | Avaliar APIs oficiais sociais apenas com contas/permissões elegíveis e escopo concreto | Médio / variável |

## Implantação proposta e riscos

Esta branch precisa da migration compatível antes de liberar o frontend em um ambiente. Sem as RPCs, as telas novas exibem erro e falham fechadas; não simulam permissões concedidas. Não implantar somente os arquivos React. Primeiro validar em cópia independente de homologação: schema/constraints existentes, RLS com usuários reais, lojas antigas sem perfil, loja com flags antigas e duas lojas de segmentos diferentes. Depois aplicar provisionamento e executar Playwright autenticado. Nenhum destes passos remotos foi executado nesta sessão.

O volume das listas administrativas e públicas é limitado; paginação e múltiplos profissionais com seleção dedicada ficam para expansão. A agenda atual usa o usuário autenticado como profissional. O histórico exibido contém até 50 eventos recentes por loja. O núcleo de estoque/financeiro pode continuar visível por seus próprios recursos de plano, mesmo em segmentos de serviços, porque é compartilhado e já tem permissão no servidor.

Reversão segura: manter o schema aditivo e os registros, e reverter a versão da aplicação de forma revisada; não apagar tabelas com dados nem restaurar flags de concessão para contornar autorização. Uma eventual implantação em produção continua exigindo autorização específica.

### Testes locais consolidados

- `npm run validate`: passou, incluindo smoke (177), fluxo crítico (122), segmentos/onboarding, domínios, PWA (8), notificações (1), segurança, integração PostgreSQL existente (94 + 44), novos segmentos PostgreSQL/PGlite (96), provisionador (7), TypeScript e build Vite.
- `npm run test:modules`: passou, incluindo 58 verificações PostgreSQL dos módulos existentes e proteção dos arquivos do núcleo.
- Os testes novos de banco usam contratos legados mínimos e migrations opcionais reais; não executam toda a cadeia remota Supabase. Locks e UPSERT foram revisados, mas concorrência com duas conexões PostgreSQL independentes precisa de homologação.
- Playwright utiliza Chromium headless shell e REST/Auth simulados por cenário. Testa interface e contratos, não cria contas reais nem comprova implantação remota de RLS. As verificações locais PostgreSQL exercitam papéis e isolamento no banco de teste separadamente.

## Arquivos modificados nesta branch

- `docs/CONTAS_TESTE_20261022.md`
- `docs/EVOLUCAO_VENDEWEB_20261023.md`
- `docs/MATRIZ_INTEGRACAO_20261022.md`
- `package.json`
- `qa/tests/modules/commercial-showcase.spec.ts`
- `qa/tests/modules/fixtures.ts`
- `qa/tests/modules/segment-platform-fixtures.ts`
- `qa/tests/modules/segment-platform.spec.ts`
- `qa/tests/modules/segments.spec.ts`
- `scripts/critical-flow.mjs`
- `scripts/provision-test-tenants.mjs`
- `scripts/provision-test-tenants.test.mjs`
- `scripts/segment-platform-db-test.mjs`
- `scripts/segments-unit-test.mjs`
- `scripts/smoke.mjs`
- `src/App.tsx`
- `src/components/marketing/BusinessJourneyPreview.tsx`
- `src/components/marketing/CommercialSegments.tsx`
- `src/components/marketing/InteractiveShowcase.tsx`
- `src/components/marketing/SegmentShowcase.tsx`
- `src/components/marketing/segment-showcase.css`
- `src/layouts/AdminLayout.tsx`
- `src/layouts/MasterLayout.tsx`
- `src/modules/ModulesPage.tsx`
- `src/modules/components/ModuleSettingsForm.tsx`
- `src/pages/admin/Onboarding.tsx`
- `src/pages/admin/Settings.tsx`
- `src/pages/store/Home.tsx`
- `src/pages/store/Landing.tsx`
- `src/pages/store/SelfSignup.tsx`
- `src/platform/BusinessModules.tsx`
- `src/platform/OperationsPage.tsx`
- `src/platform/PublicBusinessOffers.tsx`
- `src/platform/api.ts`
- `src/platform/business.css`
- `src/platform/useBusinessStatus.ts`
- `src/segments/BusinessSegmentPicker.tsx`
- `src/segments/businessSegments.ts`
- `src/segments/commercial.css`
- `src/services/businessPresentation.ts`
- `src/utils/storeVisualTheme.ts`
- `supabase/migrations/20261022215432_food_business_segments.sql`

### Rodada integrada final de navegador

**83/83 cenários passaram em 3,2 minutos**, numa execução integrada após as correções. Arquivos: `commercial-showcase`, `segment-platform`, `segments`, `presentation-preservation`, `regression`, `cart-behavior`, `master-ux` e `notifications-ux`, usando `qa/modules.config.ts` e Chromium headless shell. Inclui sete segmentos, desktop/mobile/320px, movimento reduzido, onboarding RPC, preservação de cores/Pix, carrinho/checkout existente, Master→lojista, dados públicos/privados simulados e troca de tenant com resposta atrasada. Screenshots de referência entregues separadamente em `VendeWeb-evidencias-20261023.zip` (50 imagens; dados fictícios, sem credenciais).

A classificação dos novos componentes e tabelas é `shared_future`; checkout, estoque e módulos comerciais existentes continuam com seus contratos próprios. O diff desta entrega contém 42 arquivos, listados acima. Não há dependências adicionais nem migração executada remotamente. Não houve commit de credenciais.
