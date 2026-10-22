# Experiência comercial e criação de loja

## Contrato visual

A página comercial ajuda o lojista a reconhecer seu ramo, compreender a jornada da loja e iniciar o cadastro. A criação de loja mantém o formulário e mostra uma prévia ilustrativa com o ramo e o nome digitado. A ação principal continua iniciar o teste conforme o período informado pela plataforma; aprovação, planos e verificações seguem as regras existentes.

Preservar marfim, verde carvão e ação terracota. A interface real é a matéria visual: catálogo, pedido e operação. Nenhuma métrica de resultado, cliente, cobrança ou promessa adicional é inventada. Exemplos têm aviso explícito e não criam registros.

Em 320 px, controles permanecem em uma coluna principal e a prévia se adapta à largura disponível. Em tablet e desktop, texto e demonstração ganham colunas sem esconder campos. Navegação e conteúdo não dependem da animação. Botões nativos e foco visível permitem explorar todos os estados com teclado.

## Tese de animação

- Momento focal: o mesmo produto ilustrativo percorre vitrine, pedido e visão operacional, por iniciativa do visitante.
- Continuidade: ramo e nome mudam o conteúdo da prévia no mesmo lugar; nenhum dado do formulário é modificado pela exploração.
- Retorno: seleção de ramo e de etapa é indicada por texto, estado pressionado e cor. A passagem de painel usa recorte e deslocamento curto de 320 ms.
- Orçamento: CSS e DOM existentes; sem biblioteca de animação, parallax, canvas, autoplay ou loops. `prefers-reduced-motion` remove recorte e deslocamento, mantendo estados visíveis.

## Validação visual

Rotas `/` e `/cadastro?plan=DEMO&segment=printing3d`. Pontos de inspeção: `.commercial-experience`, `.business-journey`, `.business-journey__steps`, `.signup-live-preview`, `.self-signup-progress`. Verificar 320, 768, 1024 e 1440 px, nome longo, todos os ramos, teclado e movimento reduzido. Serviços e aluguel usam consulta ilustrativa e não sugerem confirmação automática de reserva.
