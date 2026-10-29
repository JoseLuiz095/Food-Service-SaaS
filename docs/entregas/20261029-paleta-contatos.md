# Paleta única e conferência dos destinos — 29/10/2026

| Achado | Evidência atual | Prioridade | Arquivos | Correção | Dependência | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Opções de temas confundiam a personalização da mesma loja | Settings tinha radios de ramo/Doce Lua e oito cores simultâneas | P1 UX | Settings, StoreAppearanceEditor, appearanceEditor | Uma paleta salva por loja; clicar na prévia seleciona a cor; todas as cores em ajustes avançados | Tema existente | Salvar/reabrir preserva cores e identidade do ramo |
| Atualização de fundo podia substituir rascunho de configurações | Efeito de Settings copiava qualquer novo snapshot | P1 | Settings | Preservar rascunho sujo na mesma loja; reiniciar no contexto de outra loja | StoreContext existente | Evento de sync não apaga cor em edição |
| Configuração de contatos ficava oculta com recurso público desligado | Render condicionado à flag | P1 UX | Settings, StockLocations, ReceiptContactsSettings | Expor configuração e informar ativação pendente; conferir cada WhatsApp manualmente | Tabelas/RPCs de contatos já versionadas | Erro de schema impede salvar; não simular gravação |
| Não havia confirmação do operador para os números/destinos | Cadastro tinha apenas nome/telefone/seleção | P1 UX | ReceiptContactsSettings, receiptContactErrors | Links de teste de WhatsApp e confirmação explícita antes de salvar; edição invalida confirmação | Contatos comerciais fornecidos pela loja | Uma gravação dedicada; não regrava configurações gerais |

## Estado confirmado e limites

Base remota reconfirmada em `32b20e026d6a77e145a6d14c6122f89369e01083`. Histórico anterior e worktrees preservados. PRs #100/#118 estão integrados no GitHub; isso não é evidência de schema/deploy. A consulta somente leitura desta rodada encontrou tabelas/RPCs de comprovantes ainda ausentes no Supabase compartilhado. Migrations de contatos/origem já existem no histórico (`20261028143000` e `20261028150000`); nenhuma foi reaplicada. A UI mostra ativação pendente e mantém gravação bloqueada quando a consulta falha.

Classificação: `core`. Uma paleta por loja acompanha os links e pontos da mesma loja, sem permissões comerciais baseadas em tema. A identidade Doce Lua e `businessSegment` são preservados; outros segmentos usam o preset customizado para que o resolver não substitua suas cores. A prévia é ilustrativa, com dados sintéticos, e só publica a paleta ao salvar.

Confirmar números significa conferência manual do administrador e do destino comercial, sem OTP e sem comprovação de titularidade pela plataforma. Nenhuma mensagem foi enviada automaticamente. A regra opcional de marcar pagamento no clique pertence a uma entrega financeira posterior; este PR mantém a conferência manual existente.

## Validação e reversão

Typecheck/build, smoke 177, fluxo crítico 122, três testes unitários de cores/erros e cinco testes Playwright de aparência passaram. A regressão de contatos/pedido cobre mais 11 cenários, incluindo cadastro dedicado, geral/ponto, entrega pela origem de ponto, falha e retry. Larguras 320/390/768/1366, teclado, layout sem overflow e axe nos componentes. Sem validação em aparelho físico ou garantia de contraste para qualquer cor arbitrária escolhida pelo usuário.

Novos: editor TSX/CSS, utilitários de cores/erros, testes unitários, configuração/spec de aparência e este documento. Modificados: Settings, StockLocations, ReceiptContactsSettings, receipt-contacts.css, regressão de contatos e workflow. Nenhum removido, migration, dependência nova ou `sources/` alterado.

Risco: lojas com backend de contatos ainda não ativado verão aviso; não há dados fictícios persistidos. Rollback: reverter este commit restaura o seletor anterior e a visibilidade por flag, sem ação no banco; paleta já salva continua no formato existente. Reativar a seleção antiga não apaga cores no banco. Checks remotos devem ser consultados no PR. Nenhum deploy de Supabase foi realizado.
