# SEO da página principal VendeWeb

Escopo: `core`, apenas a apresentação pública da plataforma em `www.vendeweb.com.br/`. Nenhum dado de loja, schema, função Supabase, checkout ou deploy é alterado.

## Implementação

- O Worker serve uma introdução HTML legível na resposta inicial da raiz dos domínios da plataforma. O React substitui esse conteúdo após carregar a apresentação normal. A introdução contém apenas informações estáveis e já presentes no produto; preços, depoimentos e lojas dinâmicas continuam carregados pelo aplicativo.
- A raiz recebe URL canônica `https://www.vendeweb.com.br/`, metadados Open Graph e marcação `Organization`. A política CSP permite somente o hash exato do bloco JSON-LD.
- `robots.txt` aponta para `sitemap.xml`, que lista apenas a página inicial canônica. Domínios próprios de lojas recebem um `robots.txt` sem referência ao sitemap da plataforma e não recebem a introdução de marketing.
- Rotas privadas e transacionais recebem `X-Robots-Tag: noindex` via regras de assets. Não bloquear essas rotas em `robots.txt`, pois o Google precisa poder rastrear a resposta para ler o cabeçalho.

## Conferência após publicar

1. Abrir `https://www.vendeweb.com.br/robots.txt` e `https://www.vendeweb.com.br/sitemap.xml`, conferindo status 200 e URL canônica.
2. Inspecionar a resposta HTML inicial da raiz: `<h1>`, descrição, canonical, Open Graph e JSON-LD devem estar presentes antes de executar JavaScript. Conferir também o cabeçalho CSP.
3. Inspecionar `/admin/login`, `/carrinho` e `/pedido/identificador-inexistente` para `X-Robots-Tag: noindex`; verificar que `/doce-lua` não recebeu canonical da página principal.
4. No Search Console da propriedade do domínio, enviar `https://www.vendeweb.com.br/sitemap.xml` e usar **Inspeção de URL** na raiz. Conferir a página renderizada, a URL canônica escolhida e possíveis erros de indexação. Repetir a análise de desempenho após a coleta de dados do Google.

O sitemap desta fase não inclui lojas e produtos. Um catálogo multiempresa exige URLs canônicas, conteúdo inicial e regras de publicação por loja antes de adicioná-los; listar URLs de clientes sem essa revisão poderia gerar conteúdo duplicado ou expor páginas pausadas. A inspeção do site publicado e a medição no Search Console continuam necessárias. SEO não garante posição específica no resultado da busca.
