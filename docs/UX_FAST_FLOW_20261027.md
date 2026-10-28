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

## Validação local após integrar a main atual

- `npm run build`: passou, incluindo verificação TypeScript.
- `npm run test:payment-links`: 12 casos passaram; `npm run test:cart`: 14 verificações passaram.
- `npm run smoke`: 177 verificações passaram; `npm run test:critical`: 122 verificações passaram.
- `npm run test:segments`, `npm run test:domains`, `npm run test:platform` (96 verificações PostgreSQL locais) e `npm run test:security`: passaram.
- Playwright não pôde iniciar Chromium neste executor: o processo foi encerrado porque a criação de socket Unix não é permitida (`socket() failed: Operation not permitted`). Portanto, não há nova validação visual/E2E desta revisão integrada. As 24 execuções citadas no histórico eram da revisão anterior da branch, antes da integração mais recente.

## Capturas

- [Checkout móvel após a mudança](screenshots/ux-after-checkout-mobile.png): captura do teste Playwright anterior com dados simulados da Doce Lua.
- A captura anterior da branch era uma página 404, não um baseline válido, e foi removida. A comparação de etapas acima descreve o fluxo no código/testes, não uma comparação visual antes/depois.

## Supabase e pendências

Esta entrega não adicionou migration, RPC, trigger nem policy. Nenhuma alteração foi aplicada ao Supabase remoto. O checkout continua usando a validação existente no servidor. Testes PostgreSQL locais não comprovam o estado remoto.

Continuam fora deste conjunto a medição de tempo e conversão com usuários reais, revisão aprofundada de todas as telas administrativas e a validação de compra/pagamento no ambiente remoto de teste. Não há solicitação Supabase nova para encaminhar nesta etapa.
