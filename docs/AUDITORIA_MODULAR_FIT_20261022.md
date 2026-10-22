# VendeWeb, FloriWeb e base Fit — auditoria e primeira entrega

Data: 22/10/2026. Escopo: código disponível, correções locais e proposta de consolidação. Não houve implantação, cobrança, alteração de assinatura ou migração remota.

## 1. Fontes e limites do diagnóstico

| Nome solicitado | Fonte inspecionada | Confirmação |
| --- | --- | --- |
| FoodWeb / VendeWeb | `JoseLuiz095/Food-Service-SaaS`, base `2cead11a45309c4a92c328f8fa716dd5e3feffd0` | `PRODUCT.md` identifica VendeWeb; Food permanece como namespace técnico. Não são dois repositórios distintos na fonte encontrada. |
| FloriWeb | `JoseLuiz095/floriweb01`, base `d67be0d130b6b0f930f8cba165a29743fdab1b6f` | Produto de floricultura com contratos próprios de entrega/presente. Auditoria de código, sem alterações. |
| Fit de COSMIN | `JoseLuiz095/Academia`, base `99aca44f1af7f0a677a1f00e481ab04ce7cc9ad1` | README identifica **Impulso**, para personal trainers/criadores. É a base candidata ao Fit; a associação literal com COSMIN não foi confirmada. Nenhuma marca foi substituída. |

VendeWeb e FloriWeb apontam ao projeto Supabase `elttryavkeartoxgdgse`. Academia documenta `vnpoinodvchmmbyxpacj`. A conexão Supabase desta sessão listou somente `banco-financeiro`, inativo, sem vínculo confirmado. Não foram consultados dados, logs ou advisors dos bancos dos produtos. As constatações de RLS abaixo são estáticas e/ou reproduzidas em PostgreSQL local com fixtures; não comprovam o estado implantado.

Dois agentes reais fizeram frentes independentes: auditoria/correção Fit e comparação comercial. O coordenador implementou e validou as correções do VendeWeb. Não houve edição concorrente dos mesmos arquivos.

## 2. Diagnóstico e reaproveitamento

| Área | Existe no código | Reaproveitamento seguro |
| --- | --- | --- |
| Identidade e negócio | Auth Supabase, associações por loja no VendeWeb/Flori; workspaces no Impulso | Mesma interface conceitual de sessão e associação; manter IDs, namespaces e autorizações atuais durante a transição. |
| Master e planos | Aprovação, planos, vencimentos, Pix manual e auditoria | Reaproveitar a operação, com adaptadores; não substituir regras/valores de assinaturas vigentes. |
| Catálogo e vendas | Produtos, categorias, opções, pedidos, checkout, imagens | Compartilhar primitivas; preservar snapshots e validação de preços no servidor. |
| Flori | Destinatário, cartão, assinatura, envio anônimo e janela de entrega | Módulo próprio de encomendas/presentes; não descartar campos na migração. |
| Comércio/alimentação | Estoque, receitas, adicionais, preparo, delivery/retirada, financeiro | Permanecer no VendeWeb e servir como base comercial existente. |
| Serviços/locações | Eventos, combos, personalizados, reservas por ativo/intervalo, sinal e checklists | Reutilizar os módulos atuais; agenda de consulta não deve ser uma reserva de equipamento renomeada. |
| Fit/Impulso | Vitrine, serviços/digitais, avaliações, pedidos, acesso por token, ideias de IA, lembretes e avisos ao cliente | Adaptar comercial/agenda, mantendo dados especializados separados. |
| Notificações | Web Push administrativo no VendeWeb; lembretes locais/avisos no portal no Impulso | Compartilhar contratos de evento e transporte após explicitar consentimento, público, tenant e política de conteúdo. |

Comparação estática encontrou 83 caminhos `src` comuns entre Food e Flori e 11 arquivos idênticos. Exemplos: `Badge`, `PasswordChangeCard`, `ToastContext`, `cepApi`, `clipboard`, `email`, `format`, `id`, `text`. Isso identifica candidatos; nenhum pacote compartilhado foi extraído nesta entrega.

Os carrinhos são incompatíveis: Flori usa variação/adicionais e campos de presente; VendeWeb usa grupos `SelectedOption[]`, regras de encomenda e preparo. Não reutilizar armazenamento de carrinho por troca de prefixo. Food e Flori compartilham Auth intencionalmente, mas as tabelas e permissões operacionais permanecem separadas.

## 3. Estratégia de integração

| Estratégia | Benefício | Risco/custo | Decisão |
| --- | --- | --- | --- |
| Fusão direta agora | Menos aplicações aparentes | Alto risco de incompatibilidade de pedidos, roles, Auth e dados históricos | Não aplicar neste estágio. |
| Compartilhar componentes/serviços entre aplicações | Migração por contratos, com regressão menor | Manter temporariamente mais de uma aplicação | Estratégia de transição. |
| Núcleo compartilhado e módulos especializados | Uma base operacional sustentável para um desenvolvedor | Exige contratos e migração gradual dos tenants | Destino recomendado: **monólito modular**, sem microserviços. |

O núcleo futuro reúne identidade, memberships, negócios/unidades, catálogo comercial, pedidos/financeiro, concessões de recursos, identidade visual e eventos. Módulos mantêm suas regras e telas: alimentação/comércio, floricultura, locações, personal, nutrição administrativa e creator. Compartilhar infraestrutura não significa conceder acesso a todos os domínios.

Não criar um segundo cadastro genérico ou notificações paralelas antes de avaliar os serviços existentes. Inicialmente, adaptar `store_id` e `workspace_id` por contratos explícitos. Em uma migração, manter mapa `origem + ID original → ID de destino`, validar colisões e reconciliar pedidos, saldos e relações. A movimentação de usuários entre projetos Auth requer plano próprio; não copiar senhas ou supor que JWTs de projetos diferentes sejam intercambiáveis.

## 4. Lacunas por segmento e segurança

| Prioridade | Área / evidência | Situação |
| --- | --- | --- |
| P0 | Impulso: `PublicLayout.tsx` solicita `products.content`; migration `20261005121000_expose_product_content.sql` concede leitura a `anon`; `StoreContent.tsx` renderiza os itens completos | Contradiz a liberação por token em `access-product`. Não corrigido nesta entrega: precisa separar prévia pública/conteúdo privado e coordenar grants, RPC/projeção e consumidores. Ocultar a UI não resolve. |
| P0 | Impulso: grant integral a `authenticated` na migration inicial e leitura de produtos publicados em `20260925213000_consolidate_read_policies.sql` | Revogar apenas `anon` não protege o conteúdo de usuários autenticados sem vínculo. Testar ambos os papéis. Estado remoto desconhecido. |
| P1 | `evaluation_availability`, `evaluation_bookings`, `client_notifications`: FKs simples e policies por workspace | Fixture local reproduziu vínculos entre IDs de tenants distintos. Há draft de guards testado, **não aplicado**. FKs compostas/proteção contra mover registros-pai continuam necessárias. |
| P1 | `evaluation_bookings_member_update` em `20261005150000_evaluation_scheduling.sql` concede UPDATE amplo | Fechar transições de estado/pagamento em RPC autorizada e transacional. O draft de referências não resolve esse problema. |
| P1 | VendeWeb: `food_modules_enabled` e ação `settings` de `food_modules_command` verificam flags/acesso, sem concessão por `food_store_has_feature` | Existe isolamento operacional, mas não licenciamento de add-ons por plano. Não comercializar esses controles como enforcement de plano já concluído. |
| P1 | Personal | Faltam gestão longitudinal de alunos, pacotes de acompanhamento, sessões recorrentes e dashboard próprio completos. Catálogo/avaliação não equivalem a esse módulo. |
| P1 | Nutrição | Existe suporte a conteúdo/credencial; faltam jornadas administrativas de pacientes, retorno/documentos e segregação clínica adequada. Não tratar conteúdo de saúde como catálogo comercial comum. |
| P2 | Creator | Ideias de IA e lembretes existem; faltam campanhas, mídia kit estruturado, calendário comercial e integrações oficiais completas. |
| P2 | UX | Menus/telas ainda não variam completamente por segmento. Redesign integral e onboarding especializado não foram entregues. |

Proposta para o conteúdo privado: preservar IDs e conteúdo existente; criar prévia comercial explicitamente aprovada; remover acesso direto indevido inclusive de `authenticated`; prover leitura administrativa por vínculo real e acesso do comprador pela função existente. Antes de promover: inventariar grants/policies/views/RPCs, comparar catálogo e fluxos de compra, testar `anon`, membro autorizado e usuário de outro tenant e preparar reversão sem reabrir dados privados. Não executar uma simples revogação que quebre o checkout ou a administração.

## 5. Melhorias implementadas

**VendeWeb**

- Central de avisos informa permissão bloqueada, falha de entrega e sucesso real da API do navegador; a aceitação pelo navegador não comprova leitura humana.
- Uma falha não é mais marcada como envio bem-sucedido; novas tentativas continuam possíveis. Sinais concorrentes com o mesmo tag compartilham a tentativa e deduplicam apenas entregas aceitas.
- Mensagens/contador/diagnóstico são limpos ao trocar usuário ou loja; processamento aguarda snapshot da loja selecionada. Isso não substitui RLS nem cancela uma escrita remota já iniciada.
- Teste pontual não registra assinatura contínua quando a preferência está desligada. Disponibilidade técnica e assinatura registrada têm rótulos diferentes.
- Painel aceita Escape, move foco ao abrir e devolve ao acionador. Mensagens usam `alert`/`status`; sem biblioteca de animação nova.
- Configurações trata o resultado real do envio de teste.
- Produto em 320 px: corrigida a distribuição entre quantidade e total, sem ocultar overflow ou mudar preço/carrinho. Teste reproduziu corpo com 334 px antes do ajuste; controles permanecem utilizáveis depois.
- Orientação de migrations em `AGENTS.md` corrigida: a base antiga não é a única migration do repositório.

**Impulso / base candidata Fit**

- Removido relógio que inventava alerta de pendência administrativa a cada 15 minutos.
- Dashboard depende de dados reais, respeita opt-out imediatamente e evita avisos durante loading/erro.
- Mantidos lembretes locais do cliente por workspace; textos esclarecem a dependência do painel aberto.
- Criados testes do consentimento, scheduler e permissões, além do draft de integridade de referências.

## 6. Módulos, planos e custos — proposta, sem cobrança alterada

Recomenda-se manter os planos vigentes e introduzir concessões explícitas por recurso no backend, usando a infraestrutura de features existente. Pacotes por segmento podem ser a apresentação comercial de um básico compartilhado + add-ons; não precisam ser outra família de tabelas/assinaturas.

| Pacote proposto | Base compartilhada | Regras especializadas | Custo/complexidade relativa estimada |
| --- | --- | --- | --- |
| Comércio / alimentação | Catálogo, clientes, pedidos, financeiro | Adicionais, preparo, estoque/receitas, entrega | Média; escrita de pedidos/estoque e fotos. |
| Floricultura | Mesma base comercial | Presentes, mensagens, destinatário, encomendas | Média; imagens e agenda de entrega. |
| Serviços / locações | Ofertas, contratos, clientes, pedidos | Disponibilidade, ativos, duração, conflito de reservas | Média/alta; concorrência e arquivos. |
| Personal | Vitrine, cobrança, comunicação | Alunos, treinos, pacotes, sessões/histórico | Alta; acesso privado e mídia. |
| Nutrição administrativa | Vitrine, serviços, agenda | Retornos/documentos e acesso restrito | Alta; privacidade e responsabilidades próprias. Dados clínicos exigem projeto separado de autorização/retenção. |
| Creator | Catálogo, links, cupons, comunicação | Campanhas, portfólio, calendário e adaptadores sociais | Média sem publicação; alta com OAuth, mídia, quotas e revisão de apps. |

As classificações são estimativas de engenharia, não medições de produção. Não há evidência de uso/faturas para estimar reais por tenant ou definir preços. Medir usuários, unidades, pedidos, GB armazenados/transferidos, jobs/notificações, consumo de banco, IA e chamadas externas.

Modelo de custo: parcela da infraestrutura compartilhada + armazenamento/egresso medidos + execução de banco/funções + mensagens cobradas pelo provedor + IA/integradores + operação/suporte. Aplicar tarifas contratadas e margem somente após levantar esses dados. Evitar novos custos de fila/push/serviço externo até comprovar necessidade.

Contrato de autorização proposto para toda escrita: sessão válida + associação ativa com papel permitido + tenant do objeto + concessão vigente + limite transacional. Owner não concede seu próprio plano; frontend só explica a decisão do servidor. Flags de apresentação não são entitlements. Preservar direitos existentes por migração explícita, com auditoria, validade e política de expiração; não desligar módulos já usados por falta de mapeamento.

## 7. Automações e integrações

Reutilizar o transporte de notificações VendeWeb e os avisos internos do Impulso com contratos de evento por tenant/módulo. Proposta: evento persistido após a transação, chave idempotente por tenant/evento/destinatário/canal, template versionado, consentimento, fuso, horário permitido, quota, retries limitados e cancelamento. Separar mensagens transacionais de campanhas. Avisos de saúde devem ser genéricos na tela bloqueada e abrir detalhes apenas após autorização.

O cronograma universal e publicação social **não foram implementados**. Lembrete local não equivale a envio com aplicativo fechado.

- [Instagram Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing): publicação depende de conta profissional, escopos e revisão/acesso do app; containers não publicados expiram em 24 horas. Agenda própria deve preparar o container próximo do horário, respeitando limites.
- [YouTube Video](https://developers.google.com/youtube/data/reference/rest/v3/videos): `status.publishAt` agenda vídeo privado ainda não publicado; validar data futura/UTC e OAuth.
- [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines): Direct Post não auditado tem restrições de usuários/visibilidade; exigir prévia, consentimento e revisão apropriada.

São possibilidades verificadas em documentação oficial em 22/10/2026, não integrações disponíveis no produto. Tokens somente no servidor, vinculados ao tenant e conta externa, com revogação e escopos mínimos. Referências de banco: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [Database Functions](https://supabase.com/docs/guides/database/functions).

## 8. Arquivos, migrations e dependências

VendeWeb: `AGENTS.md`, `package.json`, `qa/modules.config.ts`, `scripts/critical-flow.mjs`, `scripts/notification-delivery-test.mjs`, `src/services/pwaNotifications.ts`, `src/components/admin/AdminNotifications.tsx`, `src/pages/admin/Settings.tsx`, `src/pages/store/ProductDetail.tsx`, `src/segments/product-detail-mobile.css`, `qa/tests/modules/notifications-ux.spec.ts`, `qa/tests/modules/product-mobile.spec.ts` e este relatório.

Academia: `package.json`, `src/lib/pwa.ts`, `src/components/PwaExperience.tsx`, `src/pages/admin/Dashboard.tsx`, `scripts/pwa.test.mjs`, `scripts/tenant-reference-guards.test.mjs`, `supabase/drafts/tenant_reference_guards.sql` e `docs/AUDITORIA_FIT_20261022.md`.

Nenhuma dependência/lockfile alterado. Dependências existentes instaladas com `npm ci`. PGlite do VendeWeb foi reutilizado para o teste SQL do Fit; para executá-lo isoladamente, fornecer `PGLITE_MODULE_URL` apontando a uma instalação de `@electric-sql/pglite` 0.3.14. O draft não foi adicionado à cadeia ativa nem registrado/aplicado em banco remoto.

## 9. Validação e aceite

| Execução nesta sessão | Resultado e alcance |
| --- | --- |
| VendeWeb `npm run validate` | Aprovado: smoke (177 checks estruturais), fluxo crítico (122 checks), segmentos, domínio, oito testes PWA, teste de entrega/deduplicação, segurança, 138 verificações PostgreSQL locais, TypeScript e build. Os checks estruturais não substituem E2E. |
| VendeWeb `npm run test:modules` | Aprovado: calculadora, preservação de 92 arquivos operacionais, contratos das Edge Functions e 58 verificações PostgreSQL de módulos, incluindo isolamento, AAL2, reservas e snapshots. |
| Playwright amplo, antes do ajuste responsivo | 63/64 aprovados. A falha foi overflow de 334 px em viewport 320 px no produto. |
| Playwright final focado | 8/8 aprovados: quatro cenários da central de avisos; produto de 320 px com adição ao carrinho; varredura pública, Admin e Master em 320/768/1366 px. A rodada ampla não foi reexecutada integralmente após o CSS; os cenários afetados foram repetidos. |
| Fit `npm test` e build | Três casos aprovados; TypeScript/Vite aprovados. Não houve E2E do Fit com backend real. |
| Fit draft PostgreSQL | Um caso com várias asserções permitidas/negadas passou. Reproduz a lacuna antes e testa o draft com empresas fitness/creator sob RLS em fixture. Não equivale a aplicar/testar o esquema remoto. |
| Diffs | `git diff --check` aprovado nos dois repositórios alterados. |

Não há script de lint nos apps; não foi alegado lint executado. Chromium padrão falhou ao iniciar por restrição de socket do ambiente; o canal `chromium-headless-shell` funcionou. Use `PLAYWRIGHT_CHANNEL=chromium-headless-shell npm run qa:modules` após instalar esse navegador com o Playwright existente. Screenshots da central em 390/1366 px e do produto em 320 px foram inspecionados. Testes de navegador usaram backend simulado; não criaram compras/cobranças reais. A troca comércio/serviços verifica estado da UI; a prova de autorização no banco vem das fixtures PostgreSQL, não do mock.

Nenhum resultado de documentação histórica foi apresentado como teste desta sessão. A auditoria de dependências por vulnerabilidades não foi repetida; não houve atualização de pacotes. Sem benchmark de performance, auditoria legal ou certificação de acessibilidade. As animações existentes foram cobertas pela rodada ampla de movimento reduzido; a correção nova de produto é CSS estático.

Critérios ainda pendentes: auditoria do esquema implantado e advisors; E2E autenticado do Fit com backend real de homologação; segurança integral e privacidade do conteúdo; licenciamento backend de todos os add-ons; migração entre produtos; redesign completo; jornadas completas personal/nutrição/creator; custos reais e validação em aparelhos físicos. Não declarar a consolidação concluída.

## 10. Próximas prioridades

| Ordem | Ação | Impacto | Esforço relativo |
| --- | --- | --- | --- |
| 1 | Confirmar vínculo COSMIN/Academia e acesso aos dois projetos Supabase corretos; identificar desenvolvimento/homologação/produção | Libera diagnóstico real e execução segura | Baixo, depende de acesso |
| 2 | Proteger conteúdo privado no backend e testar ambos os papéis públicos | Crítico: privacidade e venda digital | Médio |
| 3 | Rever transições de agendamentos, aplicar integridade por tenant após diagnóstico e validar pais imutáveis/FKs compostas | Alto: segurança e integridade | Médio |
| 4 | Concessões de módulos no servidor com direitos atuais preservados | Alto: sustentabilidade comercial | Médio |
| 5 | Pilotar uma jornada Fit e uma comercial com dados sintéticos; comparar pedidos, acesso, notificações e permissões | Alto: evita migração com perda funcional | Médio |
| 6 | Extrair utilitários/componentes estáveis e adaptar floricultura sem mudar o checkout existente | Médio: manutenção | Médio |
| 7 | Implementar alunos/agenda/retornos administrativos e telas especializadas; depois campanhas/calendário Creator | Alto: produto | Alto, incremental |
| 8 | Medir custos e contratar integrações/planos novos somente com dados e autorização de cobrança/publicação | Médio: margem/custo | Médio |

Antes de mover dados: backup testado, mapa de IDs/tenants/usuários, inventário de FKs/tokens/buckets, ensaio reversível, reconciliação por tenant e período, comparação de histórico financeiro e plano de retomada. Preservar os produtos originais até o aceite do piloto. Nenhum merge, publicação em produção ou cutover faz parte desta entrega.
