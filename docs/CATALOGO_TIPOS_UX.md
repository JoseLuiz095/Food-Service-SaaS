# Catálogo por tipo — fluxos e contrato comercial

## Vitrine

| Tipo | Descoberta no desktop e celular | Ação atual | Fonte e regra preservada |
| --- | --- | --- | --- |
| Produto | Busca compartilhada, filtro Produto e categorias nas vitrines multissetoriais; a vitrine tradicional mantém o cardápio | Ver detalhes | Snapshot público de produtos; estoque, reserva e disponibilidade seguem o fluxo de produto existente. Fitness não oferece compra online nesta etapa. |
| Consulta com agenda | Busca compartilhada e filtro Consultas com agenda | Ver horários e confirmar reserva | Serviços de treino publicados e horários da RPC Fitness; exige login de aluno e aceite das regras de cancelamento/reagendamento. Nenhuma cobrança é feita pela reserva. |
| Serviço geral | Busca compartilhada e filtro Serviços | Consultar as condições | Serviço público ativo do módulo habilitado, com preço, duração e descrição; sem reserva automática. |
| Conteúdo | Busca compartilhada e filtro Conteúdos | Abrir link HTTPS em outra aba | Links públicos retornados pelo módulo de criação habilitado; URLs com credenciais, protocolos não HTTPS ou inválidas não aparecem. Nenhum pagamento/acesso é inferido de um link. |

Nas vitrines não tradicionais, o filtro Consultas seleciona serviços de nutrição; agendamento online é exclusivo do fluxo Fitness confirmado. No celular, a busca ocupa a largura disponível e o seletor de tipo fica em linha própria a 390 px ou menos. Os cards descem para uma coluna conforme o espaço. Resultados ausentes mostram mensagem contextual; carregamento e falha de agenda têm estado e tentativa de recuperação. A lista de agendamentos do aluno permanece acessível ao filtrar o catálogo.

## Admin

A navegação usa **Catálogo** como entrada para os produtos existentes. A tela oferece **Novo produto** sempre, **Novo serviço ou consulta** quando o módulo de agenda/serviços está efetivo e **Novo conteúdo ou link** quando o módulo de criação está efetivo. A criação encaminha para os formulários e contratos já existentes. Serviços de treino só são publicados na agenda Fitness após confirmação de preço e políticas pelo profissional; cadastrar um serviço não o torna automaticamente reservável. A lista de produtos conserva ações rápidas, status e limite do plano.

Na academia, os atalhos **Alunos**, **Treinos** e **Agenda e horários** aparecem conforme os módulos efetivos. **Pedidos** contém os filtros contextuais Todos, Conferir pagamentos, Entregas pendentes e Agendados; Análises é uma rota separada. A URL `?queue=` permite abrir diretamente a fila. Em telas pequenas os filtros são empilhados; cada botão expõe o estado com `aria-pressed`.

## Estados e acessibilidade

- Busca e seletor de tipo têm nome acessível; filtros selecionados indicam estado, links externos usam `noopener noreferrer`, o foco possui contorno visível.
- Vitrine sem produtos, sem serviço, sem horários, sem conteúdo e sem resultado de busca oferece texto distinto. Erros de agenda preservam a ação de tentar novamente.
- Entrada de menu e ações de criação têm alvos de pelo menos 44 px na alteração atual. O menu mobile mantém o mecanismo de foco e fechamento existente.

## Regras comerciais antes de qualquer checkout unificado

Definir por tipo: formação de preço e tributos, estoque e reserva de produto por local, confirmação e expiração de horário, reagendamento/cancelamento e estorno de consulta, concessão/revogação de acesso a conteúdo, faturamento e conciliação, e pedidos mistos. Só então estabelecer um contrato de pedido e migração, com validação no servidor e isolamento por loja. Esta alteração não cria pagamento, acesso ou checkout novos.

## Validação desta branch

`npm run build`, Playwright `fitness-catalog.spec.ts` (11 cenários, incluindo a vitrine de Nutrição) e `catalog-navigation.spec.ts` (4 cenários de Admin autenticado) passaram localmente. A suíte Admin usou Chromium headless com uma configuração temporária equivalente à configuração de módulos; a instalação local não tinha o canal Chrome completo. Os cenários responsivos exercitam 320, 390, 768 e 1366 px no Chromium com dados simulados e verificam ausência de rolagem horizontal. Admin autenticado, backend remoto e transações de pagamento/agenda em produção não foram validados por esses testes.
