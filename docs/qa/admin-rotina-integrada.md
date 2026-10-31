# Administração: rotina integrada

Escopo exclusivo de administração, a partir da main 2bcc6bf. Não altera vitrine, checkout, tabelas ou funções. A implantação pendente do fluxo de comprovantes do PR #145 continua independente deste trabalho.

| Área revisada | Achado | Entrega |
|---|---|---|
| Dashboard e segmento | Dashboard inferia ramo pela aparência; menu usa cadastro operacional | Cadastro operacional como origem, aparência como fallback |
| Atendimento e catálogo | Rotina de atendimento desaparecia do início quando havia atividade comercial | Ferramentas de atendimento permanecem acessíveis junto do catálogo |
| Navegação diária | Operações frequentes exigiam buscar módulos em telas diferentes | Busca de ferramentas habilitadas, sem distinção de acentos |
| Pedidos e financeiro | Cards abriam listagem geral e exigiam nova seleção | Links diretos às filas de pagamentos, preparação e agendados |
| Clientes, agenda e serviços | Agenda depende de cliente e serviço cadastrado | Atalhos para os três cadastros, condicionados aos módulos efetivos |
| Fitness | Agenda própria difere da agenda genérica de atendimentos | Atalho à agenda Fitness e às fichas no módulo já existente |
| Campanhas e links | Recursos de criadores escondidos na navegação | Acesso direto apenas com módulo creator efetivo |
| Atualização dos indicadores | Dados podiam continuar antigos após operar em outra aba | Atualiza ao recuperar foco ou receber sincronização, sem navegação/reload completo |
| Permissões e planos | Atalho não deve sugerir recurso indisponível | Usa grants efetivos, plano e restrição de acesso existentes |

Validação: build/TypeScript; teste de navegador para os 11 ramos cadastrados, busca com acentos, ausência de módulos não habilitados, destinos das ações e viewport de 390 px. Backend simulado: não equivale a validar transações em produção.

Próximas integrações que exigem auditoria transacional própria: compra financeira com entrada de insumos, estorno com recomposição de estoque, vínculo entre cobrança e agendamento/locação, renovação de acesso Fitness. Este PR não implementa nem declara homologadas essas integrações. Não são automações seguras para ativar apenas por atalhos de interface.
