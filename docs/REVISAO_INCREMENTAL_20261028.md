# Revisão incremental do VendeWeb — 28/10/2026

> Atualização para publicação: o usuário autorizou o envio ao GitHub e abertura dos PRs, incluindo previews automáticos. A main avançou para `737ae4a7d09df92fe6cc078153bc656b2a432420` com o merge do #100; esta branch recebeu a main sem reescrever histórico. As conclusões abaixo que descrevem #100 como rascunho pertencem à coleta inicial. Na nova leitura do banco, a migration de reservas não está registrada, o CHECK ainda limita reservado ao físico e o corpo de edição continua na baseline `dc63def9a0dd038cbfa000c7b7d31f98`. Merge de código não comprova aplicação de migration. Nenhuma escrita remota de banco/deploy de funções foi executada.

## Matriz inicial: evidência revalidada antes de implementar

| Achado / classificação | Evidência atual | Prioridade | Arquivos afetados | Correção / proposta | Dependência | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Fato: edição refaz reserva sem contexto de local | `pg_get_functiondef(food_update_order_items_v1)` remoto, coleta de 28/10, e auditoria PGlite histórica | P0 | Migration nova; teste de edição/local | Fixar o local do pedido durante liberação e re-reserva, restaurando o contexto do chamador | Comparação semântica da função instalada; testar também composição com #100 | Quantidade/opções preservadas; saída única e cancelamento no mesmo local; erro reverte tudo; dois tenants |
| Fato: #100 continua separado da main e do banco observado | GitHub: aberto/draft, head `23f87b4`; banco reserva apenas saldo existente e tem CHECK reservado ≤ físico | P0 | `20261028100000_food_reservation_available_balance.sql` no PR #100 | Revisar separadamente; não integrar silenciosamente | Revisão de política de encomenda e baseline | Testar sem #100 e com #100; jamais aplicar em lote |
| Fato: três RPCs continuam ausentes | Catálogo `pg_proc` consultado pelos três nomes, sem assinatura alternativa encontrada | P1 | `inventoryApi.ts`, `dashboardApi.ts`, migration `20261025143142...` | Comparar dependências/semântica antes de preparar implantação própria | Schema, grants, triggers e baseline efetivo | Edição de insumo/ficha e métricas funcionam em isolamento com negativos de tenant |
| Fato: card prioriza indisponibilidade antes do saldo | `ProductCard.tsx`: `availabilityStatus !== 'available'`; demo `storeApi.ts` escreve `sold_out` ao zerar | P1 | `ProductCard.tsx`, `storeApi.ts`, `ProductDetail.tsx`, carrinho/checkout | Contrato compartilhado; texto “Sob demanda”; separar bloqueio comercial e falta de saldo | Definir origem do `sold_out` e política de encomenda sem tema como permissão | Tabela de estados e E2E de agenda/bloqueio em todos os pontos da jornada |
| Decisão de produto pendente: `sold_out` sem origem explícita | O contrato permite salvar manualmente `sold_out`; falta de saldo também gera esse valor | P1 | Tipo Product, funções de estoque e edição comercial | Não reabrir um bloqueio manual a partir do tema ou do saldo | Contrato retrocompatível e revisão específica do backend | Pausado/oculto permanece bloqueado mesmo após reposição |
| Fato: mensagem de pagamento contradiz implementação | `Orders.tsx` informa baixa ao confirmar; função de baixa é chamada ao concluir entrega/retirada | P1 | `Orders.tsx`, teste de pagamento/fulfillment | Distinguir recebimento e entrega, incluindo falha parcial | Revalidar comandos atuais e retry | Pagamento não baixa físico; entrega baixa uma vez |
| Fato: listagem administrativa limitada a 100 | `storeApi.ts` usa `limit=100` em `loadOrders` | P1 | `storeApi.ts`, pedidos/dashboard/financeiro | Paginação e métricas no servidor | RPC de métricas ausente; filtros estáveis | Totais não variam com a página; busca encontra pedido fora dos primeiros 100 |
| Fato: QA pode cair no projeto ativo por fallback | `lib/config.ts`, `scripts/check-env.mjs`, `qa/modules.config.ts` | P0 para execução QA | Configuração isolada de testes | Alvo explícito fictício, bloqueio de egress e destino produtivo nos testes novos | Interceptação integral das requisições | Nenhuma chamada externa, mesmo sem fixture de endpoint |
| Hipótese a investigar: outras divergências mobile/a11y | Auditorias antigas não comprovam a main atual | P1/P2 | Rotas admin, Master, catálogo e checkout | Reexecutar matriz de largura/estado; corrigir em entregas específicas | Fixtures sintéticas e navegador disponível | 320/360/390/768/1366, teclado/axe, vazio/erro/loading/rede lenta |
| Fato: histórico insuficiente não prova falha de baixa | Ledger atual só registra saída; não foi feita contagem física contemporânea | P1 | Lista/detalhe de pedidos, futura trilha transacional | Conferência com grau de certeza e ledger futuro | Design transacional; histórico disponível | Nunca marcar histórico sem evidência como falha; nenhum ajuste baseado no total “15” |

## Baseline e preservação

- Repositório canônico: `JoseLuiz095/vendeweb`. Main remota consultada e buscada em 28/10: `72b20a2539376f54f86b8e1512e86a057b65191d`, igual à referência; diff vazio.
- #100: base igual à main, head `23f87b40d3417b8eba476586e259d6a9fa3b60d1`, aberto/rascunho/não integrado. Dez arquivos, 548 inserções e 34 remoções. Checks remotos `regression` e `Workers Builds: foodweb` passaram. Main possui check `Workers Builds: foodweb` aprovado. Isso não comprova execução do banco nem versão funcional do domínio público.
- Único PR aberto na listagem consultada: #100. Comentário do bot contém previews automáticos; não equivale a autorização para publicar esta revisão.
- Novo worktree/branch `codex/reserva-local-baseline-20261028` criado a partir da main. Nenhum reset/stash/rebase/cherry-pick em checkouts antigos; nenhum arquivo de `sources/` alterado.
- Checkouts comparados por HEAD contra a referência (commits exclusivos local/main): `ded79f4` 0/10; `69cc08d` 1/7; `35ac220` 0/7; `2db9466` 6/7; `409cbb1` 1/2 (árvore igual); `3bb67eb` 1/2; `82f41e9` 0/12; `8c9c85c` 0/11. Mudanças locais detectadas em capturas, documentos, QA e piloto Fitness foram preservadas.
- Banco `elttryavkeartoxgdgse`: somente SELECT em catálogos. Histórico compartilhado contém 45 entradas; cinco entradas Fitness de 27/10 foram encontradas. A reserva futura ainda é parcial e o CHECK impede reservado acima do físico. A correção proposta não modifica nenhuma regra de #100.
- Snapshot versionado em `scripts/fixtures/order-location-remote-baseline.json`: apenas definições, ACLs, constraints e nomes/versões Food; sem pedidos, contatos, saldos reais, usuários ou credenciais. Não é backup integral nem prova de schema futuro.
- `docs/AUDITORIA_ESTOQUE_MOBILE.md` consultada. `deliverables/vendeweb-revisao-20261028/ANALISE.md` não foi localizado nos checkouts, workspace ou buscas disponíveis; não foi sobrescrito nem recriado como se fosse o original. A auditoria Fitness de 27/10 (incluindo IMP-01–IMP-05) também não foi recuperada; a auditoria Doce Lua foi localizada posteriormente, conforme seção abaixo. Esses documentos seguem como lacuna explícita; não incorporar capacidades Impulso com base em resumo histórico.

## Sequência e limites desta entrega

1. Baseline e correção de reserva/local em branch isolada, sem integração de #100.
2. Contrato “Sob demanda” e política de prazo/local no backend e frontend.
3. Pagamento, paginação e conferência com evidência.
4. Próximas ações e UX mobile Doce Lua com agregados confiáveis.
5. Padrões compartilhados para os segmentos e Master, sem ampliar o piloto Fitness antes dos controles.
6. Acessibilidade e acabamento restantes.

Esta entrega implementa o primeiro incremento. Demais linhas da matriz são backlog revalidado ou investigação pendente, não funcionalidades concluídas. Não há autorização para migration remota, deploy, ajuste real, repetição de baixa ou fabricação de movimentos. Não foi consultado o pedido real #00130 nem confrontadas transferências com contagem física.

## Jornada e pontos de autoridade

Inspeção estática da main, com quatro corpos de RPC efetivos comparados por hash do corpo sem whitespace. `food_create_public_order`, `food_create_admin_order_v1` e `food_confirm_order_payment_v1` correspondem à migration `20261023153000_food_sales_fulfillment_location_ledger.sql`; `food_get_public_location_availability_v1` corresponde a `20261026112835_food_location_stock_fast_flow.sql`. Isso não equivale a um teste autenticado do deploy.

| Etapa | Entrada / arquivos | Autoridade / invariantes | Divergência atual ou limite |
| --- | --- | --- | --- |
| Catálogo | `Home`, `ProductCard`, `storeApi` | Projeção pública por loja, produto/categoria ativos | `sold_out` recebe “Indisponível”; zero com `available` recebe “Sob encomenda”, sem consultar política de prazo no card |
| Produto | `ProductDetail`, `usePickupAvailability`, `PickupPointSelector` | Ponto/QR associado à loja; disponibilidade consultada por RPC | Texto e ação variam com ponto; serviço sem track deve permanecer sem etiqueta de saldo |
| Carrinho | `Cart`, `CartContext`, `cartAvailability` | Chaves por loja e personalização; soma da quantidade do mesmo produto | Zero global permite limite 99; ponto desconhecido permite 0; não existe contrato único de apresentação |
| Checkout | `Checkout`, `storeApi.createOrder` | Envia IDs/quantidades/requestId; revalida ponto antes do pedido | Falta global de saldo agenda apenas delivery; prazo genérico “amanhã”; ponto insuficiente é bloqueado |
| Servidor público | `food-public-checkout` → `food_create_public_order` | Recalcula preço, opção, taxa, modalidade, horário; idempotência por loja | Exige `availability_status='available'`; guard BEFORE INSERT de retirada exige saldo no ponto mesmo para futuro |
| Pagamento | `OrderSuccess`, rota `/pagamento/pix`, `Orders.confirmPayment` | Confirmação financeira separada da atualização de status | Mensagem atual promete baixa; PATCH seguinte pode falhar após recebimento já confirmado |
| Reserva | Trigger `food_reserve_inventory_on_item_insert` → `food_reserve_product_inventory` → sincronização de local | Locks no pedido/produto/saldo; contexto transacional de local | Baseline reserva parcialmente encomenda futura; #100 muda para compromisso integral e admite déficit |
| Venda avulsa | `Orders` → `createManualOrder` → `food_create_admin_order_v1` | Local escolhido obrigatório; tenant/estoque validados | Admin admite futuro por data; predicado aceita `v_allow_future` antes do bloqueio comercial. Revisar na etapa 2, sem alterar nesta correção |
| Edição | `OrderDetailsModal` → `updateOrderItems` → `food_update_order_items_v1` | Mantém item/opções e recalcula total; bloqueia pago/committed/cancelled | Defeito de contexto corrigido apenas no candidato local; não corrige reservas históricas |
| Entrega / retirada | `updateOrderStatus` → trigger de fulfillment → `food_commit_order_inventory` | Reserva integral; saída por item/local; UNIQUE impede repetição | Testar falha posterior e concorrência; pagamento sozinho não conclui entrega |
| Cancelamento | PATCH status → `food_release_inventory_on_cancel` | Liberação transacional; `committed` não devolve físico automaticamente | Não inferir retorno nem fabricar movimento antigo |
| Saldo por local | `StockLocations`, RPCs de ajuste/transferência | Servidor valida tenant/local/delta/chave; reservado não é transferível | Déficit depende de #100; UI atual não deve esconder o número técnico se #100 for adotado |

## Matriz de disponibilidade: estado atual e contrato proposto

**Fato confirmado por inspeção de código**, não contagem real de produtos. Físico/reservado abaixo são números sintéticos. Prazo/modalidade/local são parte do contrato; tema visual não concede autorização comercial.

| Estado sintético | Físico / reservado / disponível | Card e detalhe hoje | Carrinho / checkout / servidor hoje | Proposta de UX para etapa 2 |
| --- | --- | --- | --- | --- |
| Oculto, qualquer saldo | 5 / 0 / 5 | Fora da busca de ativos | Servidor público exige ativo | Continuar oculto; nunca reabrir por reposição |
| `unavailable` manual, track ligado | 5 / 0 / 5 | Indisponível | Público recusa; avulso futuro tem predicado mais permissivo | Pausado permanece bloqueado em todos os fluxos |
| `available`, track ligado | 1 / 0 / 1 | Venda imediata | Limite por produto/ponto; backend reserva | Mostrar disponível com ponto e modalidade coerentes |
| `available`, track ligado, transição 1→0 | 0 / 0 / 0 | “Sob encomenda” fora de ponto | Carrinho global permite até 99; delivery pede agenda | “Sob demanda” somente com política futura e primeira data válida |
| `sold_out`, track ligado | 0 / 0 / 0 | “Indisponível” antes de avaliar saldo | Público exige `available` | Origem automática/manual precisa ser discriminada sem reabrir bloqueio |
| `available`, todo físico reservado | 2 / 2 / 0 | Mesmo tratamento de saldo zero | Sem retirada imediata; reserva efetiva protege unidades | “Sob demanda” se permitido; admin mostra 2 físico, 2 reservado, 0 disponível |
| Compromisso acima do físico (#100 candidato) | 0 / 2 / −2 | Não faz parte da regra instalada observada | CHECK remoto atual impede esse saldo por local | Admin “faltam 2”; técnico mantém −2; reserva futura integral |
| Ponto vazio, outro com saldo | ponto 0 / 0 / 0; outro 3 / 0 / 3 | “Ver disponibilidade”; detalhe pode oferecer delivery | Guard público exige saldo no ponto escolhido | “Sem saldo neste ponto”, troca de ponto; encomenda local depende da política |
| Sem controle de estoque / serviço | Não se aplica | `outOfStock` global depende de track | Sem reserva física | Nenhuma etiqueta de estoque; agenda específica do segmento |
| `madeToOrder`, `productionDays` > 0 | Pode ter saldo ou não | Não há contrato compartilhado com prazo | Festa possui leadTime próprio; fora de festa há prazo genérico por saldo | Unificar prazo de produto/loja, horário e fuso; exibir data antes da confirmação |
| Retirada sem saldo | 0 disponível no ponto | Não prometer pronta retirada | Guard instalado bloqueia mesmo encomenda futura | Alterar contrato/guard em PR próprio se a política permitir |
| Delivery sem saldo, sem agenda permitida | 0 disponível global | Card não consulta a política da loja | Checkout combina regras de saldo e funcionamento | “Esgotado” e bloqueio; nenhuma promessa de “amanhã” |

**Decisões de produto pendentes:** representação retrocompatível da origem manual/automática de `sold_out`; aceitação futura por ponto/modalidade; composição dos prazos do produto e da loja para produtos fora de festa. **Proposta:** usar `allowScheduledOrders` como parte da política, nunca como substituto da validação servidor/local/horário. Não foi implementada uma interpretação silenciosa desses campos.

## Papéis e autorização observados

| Papel | Frontend atual | Helper efetivo do banco | Ação nesta entrega |
| --- | --- | --- | --- |
| owner / admin | Vínculo elegível | Loja ativa, não arquivada, aprovação pending/approved e vínculo ativo | Preservado |
| manager | Excluído por `AuthContext` | Incluído em `food_is_store_admin` | Divergência confirmada; não liberar apenas o menu |
| Master | Verificação de plataforma/MFA | `food_platform_admins` ativo + JWT AAL2 | Preservado; não ampliar grants |
| Futuro papel de aluno/profissional | Piloto/contextos específicos | Não auditado integralmente nesta rodada | Não estender acesso nem copiar capacidades Impulso |

## Dependências das três RPCs ausentes

A migration local `20261025143142_food_inventory_recipe_dashboard_transactions.sql` não contém apenas as três RPCs. Ela também altera arquivamento de insumos, linhas ativas de ficha, consumo-alvo histórico, ajustes de produto, `requested_quantity`, search_path e reconciliação. Copiá-la integralmente só para suprir métricas mudaria mais regras que o escopo pretendido. A comparação atual confirma ausência das assinaturas; o plano é separar métricas das mudanças de consumo/ficha após revisar o schema e os triggers correspondentes. Nenhuma dessas alterações foi aplicada.

## Evidência recuperada posteriormente

A auditoria Doce Lua de 27/10 foi localizada no workspace anterior (`entrega-doce-lua/auditoria-doce-lua.html`) e consultada nas seções de roteamento, jornada e limites. Ela registra snapshot histórico e já distinguia insuficiência de evidência de ausência de baixa. Seus saldos, pedidos e transferências não foram usados como contagem atual nem copiados para fixtures. A auditoria integral Fitness com IMP-01–IMP-05 e `ANALISE.md` permanecem não localizados.


## Resultado do primeiro incremento

Migration candidata `20261028105112_food_order_item_reservation_location.sql`: o local ativo da própria loja é selecionado antes de liberar a reserva; o GUC é mantido durante a edição e restaurado ao retornar. Falhas revertem contexto e dados. Pedidos legados sem local usam o principal da mesma loja. Serviços sem estoque continuam editáveis mesmo sem locais. A função mantém assinatura, privilégios, preços, opções já salvas e as regras existentes de pagamento/cancelamento. Não adiciona edição de opções ao contrato atual: testa preservação delas ao alterar quantidade.

Foram usados os corpos efetivos dos helpers de autorização e do trigger de cancelamento. O teste ainda usa schema mínimo e stub explícito da reconciliação de receitas; não substitui a restauração integral do banco com todas as políticas/RLS e triggers de receita/Fitness. Nenhum saldo real ou movimento histórico foi corrigido.

| Verificação | Resultado local |
| --- | --- |
| Auditoria histórica da falha | 8 verificações; defeito reproduzido na função antiga |
| Correção na baseline remota capturada | 68 verificações PGlite aprovadas |
| Composição com migration integral do #100 | Mesmas 68 aprovadas em outro PGlite descartável; #100 não integrado |
| Rollback e reaplicação | Corpo anterior restaurado exatamente; reaplicação validada no teste |
| Typecheck e build | Aprovados; build com alvo público fictício explícito |
| Smoke / fluxo crítico | 177 / 122 verificações aprovadas |
| Vendas/estoque / reparo operacional / guards tenant | 11 / 94 / 44 aprovadas |
| Edição no navegador | 6 cenários aprovados, incluindo cinco larguras e teclado |
| Coleta mobile | 95 observações em 19 rotas; sem erro JS/overflow; problemas axe registrados |
| Estados públicos | Vazio/loading e erro total coletados; erro total reexecutado após remover fallback da fixture |
| PostgreSQL nativo em duas sessões | Runner preparado e adicionado ao CI; execução local bloqueada pelas permissões do executor root, que não permite trocar de usuário. Sem resultado de concorrência para este candidato |
| Checks deste candidato no GitHub | Não executados: branch ainda não publicada |

Mais detalhes em `docs/qa/reserva-local-20261028/RESULTADOS.md`. O próximo incremento de produto não está implementado. Para “Sob demanda”, resolver os contratos apontados antes de reabrir `sold_out` automaticamente ou permitir retirada futura sem saldo.

**Risco:** a migração altera função privilegiada e deve ser revisada/homologada, incluindo concorrência nativa e todos os triggers efetivos, antes da aplicação remota. O teste local não comprova RLS integral. A verificação de baseline recusa sobrepor uma edição desconhecida da função.

**Rollback:** interromper operacionalmente novas edições e revisar `docs/rollback/food_order_item_location.sql`, que restaura somente a função anterior com guarda de baseline. Isso reintroduz o defeito conhecido; não corrige nem desfaz dados produzidos. Não executar ajuste compensatório automático. O SQL de rollback foi testado apenas no banco descartável.

**Publicação:** não houve push, abertura de PR, migration remota ou deploy. O repositório tem integração Cloudflare que publica previews de branches/PRs automaticamente; publicar esta branch precisa da revisão específica de deploy pedida pelo usuário. Não presumir que um PR draft desliga esse efeito.
