# VendeWeb — Direção visual por ramo

## Evolução multirramos

- Comercial: fundo marfim, texto verde carvão, ação terracota e prévias ilustradas por ramo. Produto e operação permanecem no centro da comunicação.
- Cadastro: seis opções com rótulos claros, seleção acessível e prévia; planos e liberação comercial permanecem independentes.
- Loja e painel: alimentação mantém o visual anterior; confeitaria usa rosa queimado; varejo azul; impressão 3D índigo; aluguel ocre; serviços verde petróleo. A loja pode manter suas próprias cores.
- Varejo, 3D, aluguel e serviços priorizam imagens inteiras e cards verticais. Conteúdo, fotos e identidade do lojista prevalecem.
- Doce Lua: manter tema, layout e comportamento existentes. Não recebe as classes dos novos temas.
- Master: superfície neutra e navegação verde escura, representando a plataforma inteira.
- Estilos novos ficam em `src/segments/`, com escopo explícito. Evitar regras globais que alterem checkout ou lojas existentes.
- Estudos de nova marca estão separados da interface publicada, em `docs/brand-directions.html`.

As orientações históricas abaixo seguem como base para alimentação e para compatibilidade das lojas existentes.

## Objetivo

Transmitir velocidade, apetite e simplicidade operacional para negócios de alimentação, usando padrões familiares de marketplaces de delivery sem copiar marca, layout proprietário ou identidade visual de terceiros.

## Vitrine pública

- fundo claro e quente;
- vermelho/coral como cor primária de ação;
- texto carvão para contraste;
- fotos de produto como principal elemento visual;
- busca sempre acessível;
- categorias em navegação horizontal/sticky;
- cards de produto horizontais: descrição/preço à esquerda, comida à direita;
- carrinho fixo no mobile;
- status de loja, tempo e modalidade em linguagem curta.

## Painel do lojista

- navegação carvão;
- ações primárias em vermelho/coral;
- sucesso permanece verde;
- densidade maior que a vitrine, sem excesso de cards decorativos;
- Financeiro prioriza valores, situação e lançamentos;
- Planos usam uma escada simples, com Starter como recomendação visual.

## Regras de consistência

- uma hierarquia de elevação;
- raios moderados, sem excesso de pílulas;
- sem glassmorphism;
- sem gradientes decorativos pesados;
- foco visível para teclado;
- estados de erro/sucesso não dependem apenas de cor;
- responsividade alvo: 390x844, 768–1024 e 1366x768.
