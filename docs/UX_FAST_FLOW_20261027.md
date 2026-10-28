# VendeWeb — compra rápida e administração simplificada

## Escopo entregue

- Produto simples pode ser adicionado na vitrine com um toque, sem abrir a página de detalhes. O card mostra a quantidade e respeita o saldo do ponto selecionado; produto com opções obrigatórias continua no detalhe.
- A barra fixa móvel leva diretamente ao checkout. A sacola continua acessível no cabeçalho. Quantidades e remoção de itens estão no resumo do checkout.
- Cadastro de produto mostra os campos essenciais primeiro; opções comerciais e personalizações ficam em painéis expansíveis. Negócios de serviços, Personal, Nutrição e Creator iniciam sem controle de estoque.
- A lista de produtos permite editar preço normal e promocional sem abrir o cadastro. A gravação só é confirmada após resposta do backend.
- Admin Master mostra lojas e solicitações em cartões no celular e recolhe configurações secundárias de loja e plano. A isenção de cobrança do piloto Fitness permanece visível.
- A tela de segmento mostra os módulos habilitados primeiro e recolhe os demais em “Ver outros módulos”.

## Medidas observáveis

| Cenário | Antes | Depois |
| --- | --- | --- |
| Produto simples até o checkout móvel | Card → detalhe → compra rápida → checkout | Adicionar no card → Finalizar (barra fixa) → checkout |
| Páginas intermediárias na compra simples | 1 página de detalhe | 0 |
| Campos obrigatórios no cadastro simples | 4 | 3; descrição agora é opcional |
| Controles principais visíveis no cadastro | 13 | 5, além de imagem e publicação |
| Preço na lista | Abrir cadastro, editar, salvar e voltar | Alterar, salvar, com validação do servidor |

As contagens são dos fluxos e controles do código e dos testes locais. Não há medição confiável de tempo real ou conversão; nenhum percentual foi estimado.

## Validação local

- `npm run build`: passou, incluindo TypeScript.
- 24 cenários Playwright de compra, catálogo e Master: passaram em Chromium local.
- Smoke, fluxo crítico, segmentos, domínio, PWA, notificações, segurança, estoque simples, provisionamento demo, integrações e plataforma: passaram até a etapa `test:provision` da validação completa.
- `npm run validate`: parou em um teste preexistente de permissões de arquivo (`OUTPUT_DIRECTORY_MUST_BE_PRIVATE_0700`) no Windows. O teste não toca os fluxos alterados.
- O teste legado `npm run test:modules` compara arquivos com um commit histórico e já falha porque a branch base alterou esses arquivos antes desta tarefa.

## Capturas

- [Checkout móvel anterior](screenshots/ux-before-checkout-mobile.png): snapshot visual já existente no repositório, com dados da loja demo.
- [Checkout móvel após a mudança](screenshots/ux-after-checkout-mobile.png): captura do teste Playwright com dados simulados da Doce Lua. As capturas usam dados diferentes e servem para inspeção visual; a comparação de etapas acima vem do fluxo testado.

## Supabase e pendências

Esta entrega não adicionou migration, RPC, trigger nem policy. Nenhuma alteração foi aplicada ao Supabase remoto. O checkout continua usando a validação existente no servidor. Testes PostgreSQL locais não comprovam o estado remoto.

Continuam fora deste conjunto a medição de tempo e conversão com usuários reais, revisão aprofundada de todas as telas administrativas e a validação de compra/pagamento no ambiente remoto de teste. Não há solicitação Supabase nova para encaminhar nesta etapa.
