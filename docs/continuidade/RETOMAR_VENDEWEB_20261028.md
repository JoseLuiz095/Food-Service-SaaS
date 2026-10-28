# Prompt de continuidade — VendeWeb

Copie o bloco abaixo para a outra conta. Não contém credenciais ou dados reais de clientes.

```text
Continue no repositório canônico JoseLuiz095/vendeweb. Responda em pt-BR. Antes de editar, compare main remota, PRs/checks e checkouts locais; preserve mudanças e histórico. Leia AGENTS.md, deliverables/vendeweb-revisao-20261028/ANALISE.md, auditoria de 27/10, docs/AUDITORIA_ESTOQUE_MOBILE.md e docs/CONTINUIDADE_20261026.md. Não tratar auditoria antiga como atual.

Base histórica 72b20a2539376f54f86b8e1512e86a057b65191d. #100 reservas negativas, #101 reserva/local ao editar e #102 Pix foram integrados pelo usuário; main observada 90a352745b75594ff6d5820c495259505a13eb94. Reconfirmar: merge não prova instalação de migration/Edge.

PR #103 isola RPC food_dashboard_metrics_v1 e mensagem do painel. Checks GitHub/Cloudflare passaram. A RPC estava ausente na coleta; migration preparada/testada, não aplicada.
PR #104 corrige sobreposição Comprar agora, tabela com texto longo, contraste/landmarks/diálogos, remove botão Pix redundante e compartilha link+QR por ponto público. Atualização corrige horário invisível no mobile: portal no body, card acima do backdrop; toque fora/X/Escape fecha horários e notificações, retorna foco e libera scroll. 130 observações em 26 rotas×5 larguras sem achados axe/overflow no estado sintético; 18 testes funcionais, 15 regressões Pix. Houve falha de smoke no CI porque procurava listener antigo; verificação foi atualizada para o backdrop e passou localmente. Reconsultar checks finais.

A branch codex/comprovantes-contatos-por-ponto implementa dois contatos comerciais de WhatsApp/configuração por ponto. Leia docs/COMPROVANTES_CONTATOS_20261028.md e consulte seu PR/estado atual. Decisões confirmadas: contato define SOMENTE destino; admins já autorizados confirmam manualmente. Link de ponto mantém contato desse ponto mesmo para entrega em casa. Link geral oferece escolha entre contatos mesmo quando cliente seleciona retirada. Origem de comunicação separada de local de estoque. Envio/abertura WhatsApp NÃO confirma pagamento nem entrega/baixa estoque.

Duas migrations preparadas: 20261028143000_food_receipt_contacts.sql e 20261028150000_food_order_receipt_source.sql. Wrapper transacional chama a RPC existente, registra origem e mantém replay. Flags de contatos ficam desligadas por padrão. food-public-checkout remota v18 equivale à main normalizando CRLF; food-order-payment não constava na lista remota. Revalidar schema/diff/Edge antes de qualquer instalação.

26 testes PGlite de contatos +17 do wrapper (RPC legada simulada),13 handler Pix,11 browser, regressões estoque11/local68; consultar resultado final dos checks no PR. Todos os dados de QA são sintéticos. Não afirmar que captura local é deploy.

Usuário autorizou publicar branches/PRs em rascunho e previews automáticos. NÃO autorizou merge, migrations/RLS/Edge/estoque real/deploy manual de produção. Preparar diff e testes primeiro; instalação remota depende de revisão específica. Não usar db push em lote, repetir baixa nem fabricar movimentos. Não tocar FloriWeb ou sources/. Manter food_*, food-*, foodweb, food_stores.id e projeto compartilhado elttryavkeartoxgdgse.

Worktrees desta sessão: vendeweb-dashboard-fix (métricas), vendeweb-pontos (interface), vendeweb-comprovantes (dois contatos), sob /workspace/scratch/710d894d5cae. Checkouts antigos foram preservados. Push HTTPS local não tem credencial; publicação usa integração GitHub com árvore verificada contra HEAD e update_ref sem force/lease. Nunca extrair credenciais.

Restam outros itens do plano amplo: contrato Sob demanda ponta a ponta/agenda, sem reabrir pausa manual; conferência de estoque por evidência/ledger; paginação/agregados; painel com consultas confiáveis; ampliar UX e acessibilidade a todos ramos/Master; autorização Fitness/achados IMP-01..05; fuso/retry/idempotência e fronteiras de tenant. Não declarar esse plano inteiro concluído pelos PRs de interface/comprovantes.

O usuário pediu prompt de continuidade perto do limite. Este documento é checkpoint, sem alegar porcentagem exata de tokens. Atualize o estado confirmado antes de continuar.
```
