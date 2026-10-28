# Evidência mobile do primeiro incremento

Coleta com Chromium, fixtures sintéticas e destino explícito `https://localqa.supabase.co`. As 19 rotas foram abertas em 320, 360, 390, 768 e 1366 px. O bloqueio de egress impediu requisições fora do servidor local e das fixtures. Nenhuma chamada remota foi feita pelos testes novos.

As 95 observações não tiveram erro JavaScript nem overflow horizontal. A coleta não afirma conformidade WCAG. Abaixo, o número de tipos de violação axe (não o número de elementos afetados).

| Rota | Axe 320 | Axe 360 | Axe 390 | Axe 768 | Axe 1366 | Região main |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `/admin` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/admin/pedidos` | 3 | 3 | 3 | 3 | 3 | 1 |
| `/admin/produtos` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/admin/produtos/novo` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/admin/produtos/20000000-0000-4000-8000-000000000001` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/admin/estoque` | 1 | 1 | 1 | 1 | 1 | 2 |
| `/admin/estoque-locais` | 1 | 1 | 1 | 1 | 1 | 2 |
| `/admin/financeiro` | 2 | 2 | 2 | 2 | 2 | 1 |
| `/admin/configuracoes` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/admin/negocio` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/admin/operacao` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/admin-master` | 0 | 0 | 0 | 0 | 0 | 1 |
| `/admin-master/lojas` | 0 | 0 | 0 | 0 | 0 | 1 |
| `/admin-master/solicitacoes` | 0 | 0 | 0 | 0 | 0 | 1 |
| `/doce-lua` | 0 | 0 | 1 | 0 | 0 | 2 |
| `/doce-lua/produto/brigadeiro-teste` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/doce-lua/carrinho` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/doce-lua/finalizar` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/pagamento/pix` | 1 | 1 | 1 | 1 | 1 | 1 |

## Achados atuais

- Pedidos: `role=grid` sem filhos `row` e 42 botões `gridcell` sem pai correto, nas cinco larguras. O modal de detalhes também mantém problemas de contraste.
- Financeiro: axe identificou `label` ausente e contraste insuficiente.
- Contraste: violações em todas as páginas administrativas Food coletadas e na jornada pública. Master não teve violações nos estados coletados; isso não cobre concessão/suspensão, formulários preenchidos ou tenant tardio.
- Estoque, locais e catálogo: duas regiões main, contadas separadamente das tags WCAG do axe.
- Detalhe do pedido: edição por tecla Enter passou em 320/360/390/768/1366. Isso não comprova trap de foco, Escape, retorno ao acionador ou fundo inerte. Inspeção mostra diálogos avulso/detalhe próprios, sem esses mecanismos completos.

## Limites e estados

- Dashboard usou métricas fictícias com contrato válido. A RPC real está ausente; esta coleta não comprova indicadores remotos.
- Negócio/operação foram observados no estado de configuração inicial pendente; financeiro/solicitações têm dados mínimos ou vazios. Não chamar isso de cobertura completa dos ramos.
- Erro total: a interface exibiu “Não foi possível carregar” e “Tentar novamente”, com zero regiões alert/status; achado atual de anúncio acessível.
- Catálogo vazio e resposta suspensa/liberada para simular carregamento foram coletados em 390 px. Um erro apenas na RPC inicial caiu em fallback bem-sucedido: não era um teste válido da tela de erro. O caso foi corrigido para falhar todas as leituras REST e reexecutado separadamente.
- Android/iOS reais, WebKit, zoom de 200%, todos os controles de toque, preservação de filtros, troca de tenant com resposta tardia, modal de avulso por teclado e todos os estados de erro/loading nas telas admin seguem pendentes.
- Sem teste autenticado real, sem imagens de clientes, sem alterações em produção.

A evidência detalhada e sanitizada está em `baseline-mobile.json`.
