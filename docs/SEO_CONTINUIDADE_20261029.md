# SEO VendeWeb — continuidade de 29/10/2026

Escopo core: página pública comercial da plataforma. Não é a otimização das vitrines dos tenants.

## Evidência atual

A captura fornecida do Search Console mostra 1 impressão, 0 cliques, CTR de 0% e posição média 45, no período selecionado de 3 meses, com ponto em 27/10. É evidência histórica fornecida pelo usuário; não houve acesso à conta nem identificação da consulta/página responsável. Uma impressão não permite estimar tendência de ranking ou escolher palavras prioritárias.

A main remota ecca40e já contém a primeira fase descrita em SEO_VENDEWEB_20261028.md: Worker com conteúdo inicial na raiz dos hosts da plataforma, canonicalwww,Organization JSON-LD com hash CSP, sitemap só da raiz e noindex transacional. Foi preservada. A busca pública nesta rodada não reproduziu um resultado confiável do domínio; isso não invalida a captura. Tentativas HTTP do ambiente retornaram 403, inclusive para robots/sitemap: não concluir que Googlebot recebe esse status, nem afirmar validação do deploy.

## Achado implementado

Após iniciar o React, Landing trocava a introdução HTML por um indicador de carregamento até a RPC pública responder. Em rede lenta, uma página com conteúdo pré-renderizado podia voltar a mostrar apenas espera.

Agora a apresentação estável, navegação, descrição de recursos/segmentos e CTA ficam visíveis durante a consulta. Preços, lojas e duração do teste não são antecipados nessa fase. A duração aparece quando a resposta chega; o comportamento existente após sucesso/falha da API foi preservado. O cabeçalho principal passou de uma frase genérica de personalidade para “Sua vitrine online. Seu jeito de vender.”, compartilhado com o Worker por constantes. O Worker também usa a mesma âncora ramos da apresentação completa.

Os testes de SEO existentes passam a rodar no workflow de regressão; alterações de Worker, headers, HTML, robots e sitemap agora disparam o check. Nenhum novo sitemap de lojas, avaliação/depoimento fictício ou página de palavras-chave foi criado. Nenhuma CSP foi relaxada.

## Validação

Cinco testes Node de Worker com HTMLRewriter simulado: HTML inicial, canonical/JSON-LD/hashCSP, âncoras, isolamento de domínio de loja, encaminhamento das rotas de compra e noindex/sitemap. QA browser em 320/390/1366 segura a resposta da RPC: conteúdo continua legível, não antecipa preço/prazo e a resposta real atualiza o teste para 21 dias sintéticos. Dados fictícios, egress bloqueado. Typecheck/build, smoke (177) e fluxo crítico (122) aprovados localmente; conferir também os checks do PR. Esses testes não certificam o HTMLRewriter efetivo no Cloudflare nem resultados no Google.

## Depois do merge e publicação pelo fluxo existente

1. No Search Console, propriedade do domínio, abrir Sitemaps e conferir/enviar `https://www.vendeweb.com.br/sitemap.xml`. Deve conter somente a raiz canônica nesta fase.
2. Em Inspeção de URL, usar `https://www.vendeweb.com.br/`, executar teste da URL publicada e conferir HTML/renderização, canonical escolhida e ausência de noindex na raiz. Solicitar indexação após a nova versão estar publicada, se a ferramenta permitir. Não repetir pedidos diariamente.
3. Em Desempenho, usar 28 dias, ativar cliques/impressões/CTR/posição e abrir Consultas e Páginas. Enviar exportação ou captura dessas abas sem dados de conta/credenciais. Separar buscas pela marca de buscas por vitrine online/gestão de pedidos; priorizar conteúdo com base nos termos efetivamente observados, sem assumir volume por palavra.
4. Comparar períodos equivalentes após acumular dados; não interpretar posição média de uma única impressão como ranking estável. Mudanças levam tempo e podem não produzir melhora mensurável.

Próxima fase, condicionada às consultas reais: conteúdo útil para dúvidas comerciais dos públicos que já buscam a plataforma, com links internos e páginas próprias apenas quando houver conteúdo distinto suficiente. Não migrar infraestrutura ou impor SEO da plataforma a uma loja.

## Referências primárias

- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap

## Risco / rollback

Risco de divergência entre a introdução inicial e a apresentação completa: título compartilhado e testes reduzem esse risco. Conteúdo de carregamento é estável e não consulta dados privados. Reverter o commit restaura o comportamento anterior; sem rollback de banco, alteração de preço, namespace ou tenant. Nenhum deploy manual de produção, submissão no Search Console ou melhoria de posição é afirmado por esta entrega.
