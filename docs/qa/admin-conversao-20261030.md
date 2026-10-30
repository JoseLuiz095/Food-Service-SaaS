# Administração enxuta e conversão — 30/10/2026

Escopo core de apresentação: Análises, Catálogo, Categorias, Entregas, Financeiro, Configurações e Plano. Sem mudança de tabelas, funções, coleta de analytics, preços ou permissões. Estoque e locais, incluindo a seção de estoque das Configurações, foram preservados. Não há deploy de produção nesta entrega.

## Conversão: como agir

31,7% significa aproximadamente 32 sessões com pedido por 100 sessões. Não equivale a visitantes únicos, pagamentos confirmados ou faturamento. Antes de definir uma meta, comparar a própria loja em períodos semelhantes, considerando tamanho da amostra, origem do tráfego, campanhas e sazonalidade. Os eventos agregados não formam necessariamente uma coorte sequencial de pessoas; não atribuir causa de abandono apenas pela diferença entre contadores.

Prioridades propostas, a validar com clientes:

1. Facilitar a escolha: nome, preço, foto e prazo claros nos itens mais vistos. Alimentação/comércio: itens prontos; floricultura/locações: personalização e antecedência; serviços/Fitness/Nutrição: responsável, duração, agenda e entrega; digital: formato e acesso.
2. Reduzir esforço: aproveitar os recursos de adição rápida e checkout já existentes, testar com usuários no celular e remover campos que não se apliquem à modalidade. Preservar identificação necessária do cliente.
3. Evitar surpresa: informar taxas, pedido mínimo, horário e opções de pagamento antes da conclusão.
4. Acompanhar o pedido até o pagamento: separar pedido criado, comprovante informado e valor efetivamente recebido; não inferir pagamento pelo clique no WhatsApp.
5. Testar uma alteração de cada vez. Acompanhar sessões, pedidos, pagamentos confirmados, ticket e cancelamentos. Uma evolução hipotética de 31,7% para 35% daria 33 sessões adicionais com pedido por 1.000 sessões; isso é uma simulação, não previsão.

As sugestões aparecem em “Como vender mais”, recolhidas por padrão e com atalhos para executar a revisão. Funil, produtos e histórico operacional também podem ser expandidos. A conversão e o valor dos pedidos ficam em primeiro plano; o histórico operacional explicita que usa os pedidos carregados, independentemente do seletor de período. A interface não inventa uma meta universal nem uma causa automática para o abandono.

## Histórico GitHub

Base inspecionada: `904cee3` em `main`. Foram consultados os 40 PRs mais recentes, #99 a #138, e verificada a ancestralidade dos respectivos heads: todos já pertenciam à main. Nenhuma branch remota desse clone tinha commits fora da main naquele momento. Isso confirma integração de histórico, não equivalência funcional de cada alteração nem o deploy servido ao cliente.

- [#99](https://github.com/JoseLuiz095/vendeweb/pull/99): `feat/ux-fast-purchase-admin` integrada. Não reaplicar commits antigos.
- [#122](https://github.com/JoseLuiz095/vendeweb/pull/122): fechado sem merge, porém o mesmo head entrou por [#124](https://github.com/JoseLuiz095/vendeweb/pull/124), que documenta a resolução de conflitos.
- [#133](https://github.com/JoseLuiz095/vendeweb/pull/133): CI retornou falha; [#134](https://github.com/JoseLuiz095/vendeweb/pull/134) retornou sucesso posteriormente.
- [#135](https://github.com/JoseLuiz095/vendeweb/pull/135) e [#137](https://github.com/JoseLuiz095/vendeweb/pull/137): CI consultada com sucesso.
- [#136](https://github.com/JoseLuiz095/vendeweb/pull/136) e [#138](https://github.com/JoseLuiz095/vendeweb/pull/138): CI consultada com falha. O log de [regression #99](https://github.com/JoseLuiz095/vendeweb/actions/runs/41103741651) mostra `test:payment-links` rejeitando o novo campo `fulfillmentStatus`. A expectativa foi atualizada e seu valor também é verificado; a lista estrita de campos públicos e as verificações de autorização permanecem.

A descrição do #136 registra dependências ainda não implantadas naquela entrega: migrations de comprovante, Edge Function `food-order-payment` e flags de ativação. Não foi consultado o catálogo remoto nesta revisão. Merge, build do frontend, banco e configuração de produção precisam ser conferidos separadamente; não atribuir tudo a conflitos de branch.

Durante a publicação deste PR, o [#139](https://github.com/JoseLuiz095/vendeweb/pull/139) entrou na main com a mesma atualização do contrato Pix. A branch foi sincronizada com `044b355`, preservando a correção integrada e a verificação adicional do valor de `fulfillmentStatus`. O conflito ficou restrito ao teste; não houve alteração no handler ou em Estoque e locais.

## Validação e prevenção

- Build e typecheck aprovados; aviso local de Turnstile sem chave de ambiente.
- Smoke: 177 verificações; fluxo crítico: 122 verificações.
- Pagamento: 13 testes aprovados, incluindo o contrato que falhou na CI.
- Integrações isoladas PGlite: reparo operacional 94, guards multi-tenant 44, produto 17, vendas 24, transações 37 e transferências 51 verificações.
- Playwright: telas em 320, 390, 768 e 1366 px, ajuda por teclado/Escape e dentro do viewport, ausência de overflow e erro JavaScript; distinção entre 317 sessões e 330 pedidos, estado sem dados, RPC ausente e preservação dos campos recolhidos ao editar categoria. Backend simulado, sem pedido real ou acesso a dados de clientes.
- Adicionado job `admin-ux` à CI com os testes de interface e artefatos em caso de falha. O workflow também passa a reagir a mudanças nesses testes. Não altera proteções de branch: revisar ambos os jobs antes do merge.

Os testes não demonstram aumento real de conversão. Essa medição exige publicar a alteração revisada e observar tráfego real. Não foi feita auditoria funcional integral de todos os commits históricos ou confirmação de produção.
