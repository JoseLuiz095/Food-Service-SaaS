# Indicadores e distinção de pedidos agendados

| Achado | Evidência atual | Prioridade | Arquivos | Correção / dependência | Aceite |
|---|---|---|---|---|---|
| Indicadores continuam indisponíveis | Usuário: POST RPC404; catálogo remoto: food_dashboard_metrics_v1(uuid) ausente; #103 integrado | P1 | Migration 20261028130144 do #103 | Instalar somente a RPC isolada após autorização específica; merge não instala SQL | Endpoint disponível para admin autorizado, anon/outro tenant negados |
| Futuro parece pedido esquecido na operação | processingOrders incluía todos os pagos ativos | P1 | Orders, orderSchedulePresentation, orders-future.css | Grupo recolhível para próximos dias; data/fuso e distinção no Financeiro | Amanhã/futuro separado; hoje/atrasado na fila; busca/calendário não escondem resultado |
| Logs CSP/beacon/SRI | Relato do navegador; política local já permite host static.cloudflareinsights.com | P2 | Nenhuma política alterada | Diagnóstico separado; não liberar script inline desconhecido para tratar RPC404 | Não atribuir404 ao CSP; identificar origem do script antes de qualquer relaxamento |

## Fatos e limites

Main comparada: 8ea1805, com histórico dos PRs103–106. Checkouts anteriores preservados. Na consulta remota desta rodada, a RPC de métricas estava ausente e colunas/helpers ainda correspondiam à migration isolada preparada no #103. Seus25 testes PGlite e9 de erro passaram novamente. A aplicação não foi realizada: o usuário definiu que análise/testes locais não autorizam alterações produtivas. Proposta concreta: aplicar somente 20261028130144_food_dashboard_metrics_standalone.sql, sem db push e sem migrations de estoque/receitas. Ela só lê food_orders por loja, verifica auth/helper, restringe EXECUTE e solicita reload do schema cache. Rollback de função nova: remover apenas essa assinatura após conferir dependências; frontend mantém erro recuperável. Nenhum pedido/cliente real foi lido para este diagnóstico.

CSP inline bloqueado, CORS e integridade do beacon são mensagens diferentes do404 da RPC. A origem do inline não foi identificada; “sandbox eval code” pode envolver código injetado pelo ambiente de execução, hipótese não comprovada. A política já permite o host externo citado. Não adicionar unsafe-inline nem copiar hash de origem desconhecida. O HTML público de /admin respondeu200 nesta coleta; isso não certifica o fluxo autenticado nem prova correção do beacon no aparelho do usuário.

## Comportamento implementado neste PR

Pagos ativos com data em outro dia futuro da loja ficam em **Agendados · próximos dias**, recolhido por padrão. O grupo informa que entrega/retirada é futura e não está atrasada; não afirma que a produção ainda não deve começar. Mantém edição/status/seleção e reservas. Pedidos de hoje, vencidos e sem agenda continuam na operação; quando vira o dia da loja, o relógio já existente reclassifica o pedido. Estados finais não são agendamentos ativos.

Busca, filtro do calendário ou pedido destacado abrem o grupo para não ocultar resultados. A receber do cliente permanece no Financeiro, inclusive para futuro, com indicação de agendamento e fundo distinto. Contagens são rotuladas “nesta lista”; não são apresentadas como agregado completo do servidor e não resolvem a pendência de paginação.

Datas e distinção usam o fuso da loja, com fallback São Paulo para configuração inválida. Não altera data salva, prazo, pagamento ou estoque. Componente compartilhado entre ramos; cores próprias do estado de agenda, sem usar tema como autorização.

## Validação e reversão

Typecheck/build com Supabase fictício, smoke177, fluxo crítico122 e diff check. Cinco testes Playwright: tabela de classificação/fuso/invalidos/finais/virada do dia e quatro browsers320/390/768/1366; grupo separado, futuro não entra no atraso, pagamento futuro visível, busca abre grupo, zero gravações, axe no grupo e overflow. Captura390 inspecionada visualmente, dados sintéticos. Não é captura de produção nem teste iOS/Android físico.

Novos: helper, CSS, config/spec de QA e este documento. Modificados: Orders e verificação estática de fluxo crítico. Removidos: nenhum. Nenhuma migration ou dependência nova neste PR. Risco: grupo recolhido reduz a visibilidade inicial de agendados; o resumo/data e abertura por busca/calendário mantêm acesso. Rollback por reversão do commit; não compensar saldos ou alterar pedidos.
