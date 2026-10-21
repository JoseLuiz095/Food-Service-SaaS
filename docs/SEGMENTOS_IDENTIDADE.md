# Apresentação por ramo e proposta comercial

## Decisão e preservação

Classificação: `shared_future`, apresentação e configuração visual. A auditoria encontrou uma configuração JSON já persistida e exposta de forma pública controlada: `food_stores.visual_theme`. O novo atributo opcional `businessSegment` usa essa configuração, as consultas e as permissões existentes.

Não há migration, nova tabela, alteração de RLS ou publicação de Edge Function nesta evolução. Nenhum registro existente precisa ser atualizado. Sem atributo, o ramo é alimentação e o visual anterior continua. O preset `doce_lua` e as cores `custom` têm prioridade.

Checkout, carrinho, serviços de preço/estoque/pedidos/Pix, contextos de autenticação e loja, CSS global e migrations existentes permanecem sem mudanças. O teste de preservação mantém comparação exata de 104 arquivos operacionais com a base anterior. As exceções visuais estão enumeradas no teste e cobertas pelos testes de navegador e de normalização.

## O que foi implementado

- Comercial multirramos, prévia interativa, recursos existentes, planos com valores vindos da configuração e contato protegido.
- Cadastro com seis ramos e prévia, herdando `segment` do link comercial; modos de conta nova e existente permanecem.
- Loja e painel adaptam cores, termos, títulos, busca, catálogo e navegação ao ramo. Fotos reais prevalecem; ausência de imagem nos novos ramos usa uma ilustração neutra.
- Configurações da loja permitem mudar o ramo sem trocar cores próprias. A prévia deixa de usar doces em todos os negócios.
- Master vê o ramo na listagem e pode defini-lo ao criar ou editar uma loja. Mudar apenas o ramo grava somente `visual_theme`, sem atualizar assinatura, acesso ou vencimento.
- Cadastro grava a apresentação somente depois da autenticação e somente na loja recém-criada. Uma conta que já tem loja não recebe nova identidade silenciosamente.
- Se essa gravação visual falhar, a conta permanece criada e a tela mostra um aviso e acesso às Configurações, evitando orientar novo cadastro.
- Cinco nomes e três conceitos de logo ficam em documentos separados; a marca atual permanece até a escolha.

## Ramos disponíveis

| Valor | Negócio | Vitrine / painel |
| --- | --- | --- |
| `food` | Alimentação | Cardápio / operação da loja; compatibilidade anterior |
| `confectionery` | Doces e confeitaria | Catálogo de doces / ateliê e encomendas |
| `retail` | Produtos e varejo | Catálogo / loja e catálogo |
| `printing3d` | Impressão 3D e personalizados | Peças e personalizados / produção e projetos |
| `rentals` | Aluguel e eventos | Catálogo para eventos / agenda e locações |
| `services` | Serviços e outros negócios | Produtos e serviços / serviços e atendimento |

O ramo define apresentação. Ele não converte produtos normais em serviços agendados, não cria reservas e não liga módulos. Produtos prontos continuam no catálogo normal; propostas com parceiros, reservas e personalizados usam os módulos opcionais. A calculadora 3D permanece no módulo de personalizados e aceita preço final editável.

## Como testar

1. Execute `npm ci`, `npm --prefix qa ci` e `npm run dev -- --configLoader runner`.
2. Na página inicial, selecione Impressão 3D e confira a prévia e o link de cadastro. O link deve incluir `segment=printing3d` e o plano escolhido.
3. Em `/cadastro?segment=printing3d`, troque o ramo, navegue pelos cartões com teclado e confira a seleção. Use uma loja de teste para completar o cadastro; não crie usuários de teste em produção.
4. Em **Admin → Configurações**, selecione um ramo, confira a prévia e salve. Reabra a vitrine e o painel. Logo, fotos e cores próprias devem ser preservados.
5. No Master, edite somente o ramo de uma loja de teste. O vencimento, plano e acesso devem permanecer iguais.
6. Confira alimentação e Doce Lua sem configuração nova: busca, produtos, carrinho, checkout, retirada, entrega e Pix devem seguir o fluxo anterior.
7. Em **Módulos opcionais**, confirme todas as opções desativadas. Para testar vendas com parceiros, siga [o roteiro dos módulos](TESTAR_MODULOS_OPCIONAIS.md), ativando-os somente numa loja de teste.
8. Abra `docs/brand-directions.html` no navegador para comparar as três direções de logo. Consulte os cinco nomes em [Propostas de marca](PROPOSTAS_MARCA.md).

## Validações

Comandos reproduzíveis:

```text
npm run validate
npm run test:modules
npm run qa:modules
git diff --check
```

`validate` cobre smoke, fluxos críticos, normalização/persistência de ramo, typecheck e build. Os testes dos módulos incluem 58 verificações reais em PostgreSQL local via PGlite, sem escrever na produção. Playwright simula o banco e cobre apresentação em 390/768/1366 px, checkout normal com retirada/entrega e Pix, identidade Doce Lua, cancelamento/revisão de combos, MFA, cadastro e Master.

Os testes textuais antigos que exigiam chamadas e slogans da landing anterior foram atualizados para os novos componentes; as verificações operacionais e a demonstração interativa permanecem.

Resultado final desta entrega: **177 verificações smoke, 120 verificações críticas, testes de ramo/tema/persistência, 58 verificações PostgreSQL e 31 cenários Playwright aprovados**. Typecheck, build e conferência do diff passaram. Os 31 cenários incluem preservação explícita do tema Doce Lua e falha controlada na gravação visual após criar uma conta.

## Limites e implantação

- A marca definitiva depende da escolha e da verificação de disponibilidade, registro e domínio. As propostas não afirmam exclusividade.
- Cores próprias têm precedência sobre a paleta sugerida. Trocar o ramo altera a apresentação, sem repintar uma identidade customizada.
- A gravação da apresentação no cadastro é posterior à criação da conta. Falha nessa etapa gera aviso explícito e pode ser corrigida em Configurações, sem recriar a loja.
- Os ramos não alteram as regras operacionais dos módulos: Pix, sinais, repasses e reembolsos seguem as confirmações manuais já documentadas.
- Validação de navegador usa dados simulados. Não substitui a conferência com o catálogo e as fotos reais da loja antes da publicação.
- Esta entrega deve ser publicada como frontend depois da revisão. Não execute migrations históricas nem reprovisione lojas para usar o seletor de ramo.

## Arquivos

Novos componentes e estilos: `src/segments/*`, `src/components/marketing/CommercialSegments.tsx`, `src/services/businessPresentation.ts`, `public/assets/placeholder-catalog.svg`.

Integrações visuais: layouts Admin/Master/Store; páginas Landing/SelfSignup/Home, Dashboard/Onboarding/Products/ProductForm/Settings/Login/Plan e Master Stores; ProductCard/ProductMedia/StoreHeader, AdminStoreShare, ImageWithFallback e ExistingValueSection.

Persistência e tipos: `selfServiceSignup.ts`, `platformApi.ts`, `types/index.ts` e `storeVisualTheme.ts`. A alteração é limitada à apresentação; usa as permissões existentes e não aceita segmentação como autorização.

Testes: `scripts/segments-unit-test.mjs`, `qa/tests/modules/segments.spec.ts`, `qa/tests/modules/presentation-preservation.spec.ts`, smoke, critical-flow e contrato de preservação. Nenhuma dependência foi adicionada.
