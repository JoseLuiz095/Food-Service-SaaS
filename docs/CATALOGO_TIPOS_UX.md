# Catálogo por tipo — fluxos e contrato comercial

## Vitrine

| Tipo | Descoberta no desktop e celular | Ação atual | Fonte e regra preservada |
| --- | --- | --- | --- |
| Produto | Busca compartilhada, filtro Produto e categorias nas vitrines multissetoriais; a vitrine tradicional mantém o cardápio | Ver detalhes | Snapshot público de produtos; estoque, reserva e disponibilidade seguem o fluxo de produto existente. Fitness não oferece compra online nesta etapa. |
| Consulta com agenda | Busca compartilhada e filtro Consultas com agenda | Ver horários e confirmar reserva | Serviços de treino publicados e horários da RPC Fitness; exige login de aluno e aceite das regras de cancelamento/reagendamento. Nenhuma cobrança é feita pela reserva. |
| Serviço geral | Busca compartilhada e filtro Serviços | Consultar as condições | Serviço público ativo do módulo habilitado, com preço, duração e descrição; sem reserva automática. |
| Conteúdo | Busca compartilhada e filtro Conteúdos | Abrir link HTTPS em outra aba | Links públicos retornados pelo módulo de criação habilitado; URLs com credenciais, protocolos não HTTPS ou inválidas não aparecem. Nenhum pagamento/acesso é inferido de um link. |

Nas vitrines não tradicionais, o filtro Consultas seleciona serviços de nutrição; agendamento online é exclusivo do fluxo Fitness confirmado. Toda consulta e serviço profissional só aparece com prestador ativo da mesma loja, nome e registro; Treinamento exige CREF e Nutrição exige CRN. A vitrine também recusa respostas públicas incompletas. Na academia, a consulta nutricional com CRN aparece em Consultas se o módulo de Nutrição e as condições de publicação do piloto estiverem habilitados; não oferece reserva ou pagamento online. No celular, a busca ocupa a largura disponível e o seletor de tipo fica em linha própria a 390 px ou menos. Os cards descem para uma coluna conforme o espaço. Resultados ausentes mostram mensagem contextual; carregamento e falha de agenda têm estado e tentativa de recuperação. A lista de agendamentos do aluno permanece acessível ao filtrar o catálogo.

## Admin

A navegação usa **Catálogo** como entrada para os produtos existentes. A tela oferece **Novo produto** sempre, **Novo serviço ou consulta** quando o módulo de agenda/serviços está efetivo e **Novo conteúdo ou link** quando o módulo de criação está efetivo. A criação encaminha para os formulários e contratos já existentes. O proprietário confirma nome, conselho e registro de uma conta ativa da equipe na mesma loja; Admin atribui o prestador a cada serviço. A consulta ou serviço sem atribuição permanece fora da vitrine. Serviços de treino só são publicados na agenda Fitness após confirmação de preço e políticas pelo profissional e atribuição com CREF; cadastrar um serviço não o torna automaticamente reservável. A lista de produtos conserva ações rápidas, status e limite do plano.

A profissional de Nutrição entra por `/profissional` com conta própria já cadastrada e vê apenas seus dados profissionais e serviços atribuídos. A área não mostra fichas ou dados de alunos. Para habilitar a profissional na loja piloto são necessários nome real, e-mail da conta e CRN com região, além da confirmação humana do registro e do vínculo pelo proprietário. A migração não cria identidade fictícia, não habilita o módulo de Nutrição e não altera o banco remoto automaticamente. Como o piloto Fitness exige publicação comercial própria, as condições de exposição de consultas nutricionais também precisam ser revistas antes de ativá-las.

Na academia, os atalhos **Alunos**, **Treinos** e **Agenda e horários** aparecem conforme os módulos efetivos. **Pedidos** contém os filtros contextuais Todos, Conferir pagamentos, Entregas pendentes e Agendados; Análises é uma rota separada. A URL `?queue=` permite abrir diretamente a fila. Em telas pequenas os filtros são empilhados; cada botão expõe o estado com `aria-pressed`.

## Estados e acessibilidade

- Busca e seletor de tipo têm nome acessível; filtros selecionados indicam estado, links externos usam `noopener noreferrer`, o foco possui contorno visível.
- Vitrine sem produtos, sem serviço, sem horários, sem conteúdo e sem resultado de busca oferece texto distinto. Erros de agenda preservam a ação de tentar novamente.
- Entrada de menu e ações de criação têm alvos de pelo menos 44 px na alteração atual. O menu mobile mantém o mecanismo de foco e fechamento existente.

## Regras comerciais antes de qualquer checkout unificado

Definir por tipo: formação de preço e tributos, estoque e reserva de produto por local, confirmação e expiração de horário, reagendamento/cancelamento e estorno de consulta, concessão/revogação de acesso a conteúdo, faturamento e conciliação, e pedidos mistos. Só então estabelecer um contrato de pedido e migração, com validação no servidor e isolamento por loja. Esta alteração não cria pagamento, acesso ou checkout novos.

## Validação desta branch

`npm run build`, `npm run smoke`, teste de migrações em PGlite e Playwright `fitness-catalog.spec.ts` (13 cenários, incluindo identificação de CREF/CRN e recusa de consulta sem prestador) passaram localmente. A suíte Admin `catalog-navigation.spec.ts` passou com 4 cenários na primeira versão da branch. Os cenários responsivos exercitam 320, 390, 768 e 1366 px no Chromium com dados simulados e verificam ausência de rolagem horizontal. Os testes de banco cobrem vínculo de conta na mesma loja, incompatibilidade CRN/CREF, atribuição e isolamento da área profissional. O banco remoto, a criação da conta real da nutricionista e transações de pagamento/agenda em produção não foram alterados ou validados por esses testes.
