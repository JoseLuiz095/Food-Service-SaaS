# Padrao visual unico - FoodWeb e FloriWeb

Este padrao aproxima os dois produtos de dashboards maduros, sem migrar o stack para Tailwind, shadcn ou outra biblioteca visual.

## Base comum

- Manter React, CSS atual e componentes existentes.
- Preservar identidade propria de cada vertical.
- Usar os mesmos estados de loading, vazio, erro, sucesso e bloqueio.
- Usar botoes, inputs, selects, badges, modais, tabelas e cards com comportamento consistente.
- Evitar refatoracao visual ampla quando um ajuste pontual resolve.

## Desktop - 1280 px ou mais

- Sidebar fixa ou navegacao persistente.
- Conteudo com largura maxima confortavel, sem esticar formularios demais.
- Formularios longos podem usar duas colunas.
- Tabelas e listas devem priorizar leitura rapida, filtros claros e acoes previsiveis.
- Cards devem ser usados para itens repetidos ou paineis realmente agrupados.

## Tablet - 768 a 1279 px

- Sidebar pode recolher ou virar navegacao compacta.
- Formularios grandes passam para uma coluna quando a leitura ficar apertada.
- Tabelas largas devem ter rolagem horizontal propria, sem criar scroll horizontal na pagina inteira.
- Acoes primarias continuam visiveis sem depender de hover.

## Mobile - ate 767 px

- Conteudo em uma coluna.
- Botoes principais podem ocupar largura total quando isso melhora o toque.
- Tabelas viram cards ou ganham rolagem interna controlada.
- Barras fixas de acao devem respeitar teclado, safe area e resumo do carrinho/pedido.
- Nada deve gerar scroll horizontal no documento.

## Regras de QA visual

- Toda tela publica importante precisa passar sem overflow em mobile, tablet e desktop.
- Baseline visual deve ser atualizada apenas quando a mudanca for intencional.
- Imagens de produto, banners e icones precisam ter fallback ou estado quebrado detectavel.
- Textos longos devem quebrar linha dentro do componente.
- Estados vazios e erros precisam parecer parte do produto, nao uma tela tecnica.
