import { MARKETING_HEADLINE } from '../src/content/marketingSeo.ts';
// Only the public platform homepage receives an HTML introduction before React loads.
// The existing SPA and its origin-bound shopping/auth flows remain asset-served.
const PLATFORM_HOSTS = new Set(['www.vendeweb.com.br', 'vendeweb.com.br']);
const CANONICAL_URL = 'https://www.vendeweb.com.br/';
const DESCRIPTION = 'Crie uma vitrine online com sua marca, apresente produtos e serviços, receba pedidos e organize a operação do seu negócio com a VendeWeb.';

const introduction = `
  <div class="seo-pre-render">
    <header><a href="/" aria-label="VendeWeb, página inicial">VendeWeb</a><nav aria-label="Navegação principal"><a href="#recursos">Recursos</a><a href="#ramos">Para seu negócio</a><a href="#planos">Planos</a></nav></header>
    <main>
      <section><h1>${MARKETING_HEADLINE}</h1><p>A VendeWeb reúne uma vitrine com a sua marca e ferramentas para apresentar produtos e serviços, receber pedidos e organizar a operação em um só lugar.</p><a href="/cadastro?plan=DEMO">Criar meu negócio</a></section>
      <section id="ramos"><h2>Uma vitrine para diferentes negócios</h2><p>Alimentação, floricultura, comércio e serviços podem começar com o catálogo e os recursos adequados ao seu segmento.</p></section>
      <section id="recursos"><h2>Venda online com uma operação organizada</h2><p>Publique seu catálogo, compartilhe o link da loja, receba pedidos e acompanhe seus produtos. Recursos adicionais dependem do plano e da liberação para cada negócio.</p></section>
      <section id="planos"><h2>Conheça a VendeWeb</h2><p>Explore os recursos e os planos para escolher como começar.</p><a href="/cadastro?plan=DEMO">Começar agora</a></section>
    </main>
    <footer>VendeWeb · Produtos, serviços e novas possibilidades para o seu negócio.</footer>
  </div>`;

const homepageHead = `
    <link rel="canonical" href="${CANONICAL_URL}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="pt_BR">
    <meta property="og:site_name" content="VendeWeb">
    <meta property="og:title" content="VendeWeb — vitrine online e gestão para seu negócio">
    <meta property="og:description" content="${DESCRIPTION}">
    <meta property="og:url" content="${CANONICAL_URL}">
    <meta property="og:image" content="https://www.vendeweb.com.br/assets/marketing/storefront-hero.webp">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'VendeWeb',
      url: CANONICAL_URL,
      logo: 'https://www.vendeweb.com.br/assets/vendeweb-logo.svg',
    })}</script>
    <style>.seo-pre-render{font:16px/1.6 system-ui,sans-serif;color:#382820;max-width:1100px;margin:auto;padding:24px}.seo-pre-render header{display:flex;justify-content:space-between;gap:20px}.seo-pre-render nav{display:flex;flex-wrap:wrap;gap:16px}.seo-pre-render main{display:grid;gap:24px}.seo-pre-render section{padding:32px 0;border-bottom:1px solid #eadfd8}.seo-pre-render h1{font-size:clamp(2rem,5vw,3.6rem);line-height:1.15;max-width:800px}.seo-pre-render p{max-width:680px}.seo-pre-render a{color:#8b3f27;font-weight:700}.seo-pre-render footer{padding:20px 0}@media(max-width:600px){.seo-pre-render header{display:block}}</style>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const platformHost = PLATFORM_HOSTS.has(url.hostname.toLowerCase());
    if (!platformHost && url.pathname === '/sitemap.xml') {
      return new Response('Sitemap indisponível neste domínio.', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
    }
    if (!platformHost && url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (!platformHost || url.pathname !== '/' || !['GET', 'HEAD'].includes(request.method)) {
      return env.ASSETS.fetch(request);
    }

    const asset = await env.ASSETS.fetch(request);
    if (!asset.ok || !asset.headers.get('content-type')?.includes('text/html')) return asset;
    return new HTMLRewriter()
      .on('head', { element(element) { element.append(homepageHead, { html: true }); } })
      .on('#root', { element(element) { element.setInnerContent(introduction, { html: true }); } })
      .on('#foodweb-splash-screen', { element(element) { element.remove(); } })
      .transform(asset);
  },
};
