# Continuidade — VendeWeb / Doce Lua

## Objetivo e decisões do usuário

Trabalhar no repositório canônico `JoseLuiz095/vendeweb`, React/Vite/TypeScript + Supabase compartilhado `elttryavkeartoxgdgse`. Responder e documentar em português do Brasil. Preservar `food_*`, `food-*`, worker `foodweb` e tenant `food_stores.id`; não tocar FloriWeb nem arquivos sincronizados em `sources/`.

O usuário autorizou publicar branches, abrir PRs em rascunho e os previews automáticos do Cloudflare. Essa autorização NÃO inclui merge, aplicação de migrations, RLS, estoque real ou deploy de Edge Functions em produção. Antes de qualquer aplicação, revisar diff e schema efetivo; solicitar revisão específica exigida por ele. Não repetir baixa nem fabricar movimentos históricos.

Novas solicitações, em ordem de recebimento:

1. Retirar o botão redundante “Compartilhar só o código Pix”; manter “Copiar código Pix”, link de pagamento e QR.
2. Corrigir o erro do painel: `food_dashboard_metrics_v1(p_store_id)` ausente no cache/schema.
3. Permitir compartilhar a página e o QR de cada ponto de retirada pelo botão Compartilhar, tanto no admin quanto na vitrine.
4. Revisar telas da Doce Lua: foto mostrou “Comprar agora” sobreposto à instrução na página de produto. Revisão abrange também outras rotas, mobile, teclado e axe, com dados sintéticos.
5. Funcionalidade em branch separada: permitir cadastrar dois contatos de WhatsApp para comprovantes. Cada ponto de venda deve encaminhar ao contato configurado para ele. No link geral, o cliente deve escolher entre os contatos da loja. O usuário respondeu explicitamente **“Só destino (Recomendado)”**: não atribuir o pedido nem restringir confirmação ao contato selecionado. Administradores já autorizados continuam confirmando manualmente após conferir o comprovante; envio/cópia/WhatsApp NÃO confirma pagamento e NÃO entrega pedido nem baixa estoque.

O usuário pediu um prompt de continuidade se o contexto estiver perto do limite. Não há contador confiável da porcentagem; este arquivo é um checkpoint, não uma alegação de que 10% foi atingido.

## Histórico confirmado

- Main original de comparação `72b20a2539376f54f86b8e1512e86a057b65191d`.
- #100: reservas integrais/negativas, integrado na main `737ae4a`.
- #101: reserva conserva local ao editar; integrado (`eac69c7`). PostgreSQL nativo de duas sessões passou no CI, além de PGlite; migration não foi aplicada por esta sessão.
- #102: facilitar código/link Pix; integrado na main `90a352745b75594ff6d5820c495259505a13eb94`. O usuário pediu remover o botão extra adicionado nele.
- #103: `codex/dashboard-metricas-isoladas`, preparado para review com somente a RPC de métricas e tratamento de erro; aberto em https://github.com/JoseLuiz095/vendeweb/pull/103. Não presumir merge ou aplicação no banco: reconsultar.
- Na coleta de catálogo de 28/10, a RPC de métricas estava ausente; colunas de orders/stores e helpers de acesso foram revisados. As outras duas RPCs historicamente ausentes (insumo/ficha) não foram instaladas nesta sessão.

## Trabalho local desta sessão

- `/workspace/scratch/710d894d5cae/vendeweb-dashboard-fix`, branch `codex/dashboard-metricas-isoladas`, commit local `50b3f9d`.
  - Migration `20261028130144_food_dashboard_metrics_standalone.sql`: só leitura/agregação por loja, auth/helper, sem limite de 100, grants restritos e guarda contra definição divergente. Corpo equivale ao previsto na migration ampla de fichas/consumo; não aplicar a ampla por causa do painel.
  - 25 verificações PGlite (157 pedidos, duas lojas, roles, vazios, fuso, totais e ausência de escrita), nove de mensagem de erro, quatro browser (RPC ausente → retry → resposta em 320/390/768/1366), typecheck/build/smoke aprovados.
  - Frontend não expõe SQL/schema cru e mantém “—” quando sem totais confiáveis.
- `/workspace/scratch/710d894d5cae/vendeweb-pontos`, branch `codex/doce-lua-interface-compartilhamento`.
  - Contém correções visuais, remoção do botão redundante e compartilhamento por pontos; conferir status/commit/PR atual antes de editar.
  - `useStoreShareTarget`: busca apenas a lista pública de pontos via RPC existente, descarta resposta antiga e liga link/QR ao ponto selecionado; links usam `?ponto=CODIGO` e a loja correta.
  - RPC de listagem foi conferida remotamente: loja acessível, ponto ativo/público e local ativo da mesma loja.
  - `useModalAccessibility`: foco contido, Escape protegido durante salvamento, fundo inerte, scroll e retorno ao acionador em compartilhamento, avulso e detalhe de pedido.
  - Correção de grid do buy-box; uma região main; calendário como grupo de botões; status/alert em AsyncState; labels do Financeiro/Analytics; contraste escopado à Doce Lua e respeito ao movimento reduzido.
  - `qa/doce-lua-review.config.ts` é isolado, usa 5191 e URL Supabase fictícia explícita. Dados/contatos/pontos dos testes são sintéticos.
- `/workspace/scratch/710d894d5cae/vendeweb-pix-fix`: cópia intermediária da remoção do botão (15 testes Pix aprovados); o patch já está no worktree de interface acima. Não publicar duplicado.
- Worktrees/commits anteriores de reserva e Pix foram preservados. Não fazer reset/stash/rebase para limpar esses históricos.

## Antes de implementar os dois contatos

Atualização: a implementação dos dois contatos está em andamento na branch isolada `codex/comprovantes-contatos-por-ponto`, worktree `vendeweb-comprovantes`; consultar seu diff e documentação antes de continuar. Não está instalada em produção. Não confundir pontos compartilháveis com destino de comprovante.

Reconfirmar schema e fluxo de confirmação/checkout/OrderSuccess/OrderPayment. Sugestão de desenho a revisar: dois contatos comerciais configuráveis por loja (slots 1/2, nome público, telefone validado), vínculo de ponto ao slot da mesma loja e leitura pública somente de contatos explicitamente publicados. Nenhuma referência entre tenants. Preferir destino de contato, sem vincular a usuário Auth privado e sem alterar papéis.

A resposta do usuário elimina a necessidade de nova regra de atribuição/autorização. Não marcar como pago ao clicar em WhatsApp nem ao enviar arquivo. Preservar confirmação financeira e status operacional como passos diferentes.

Evitar alterar a função grande de criação do pedido se o destino for apenas comunicação. Verificar se basta retornar contatos de forma validada e persistir a escolha na confirmação do cliente; tratar também links Pix abertos em outro aparelho, ponto inativo, contato removido/trocado e confirmação antiga sem campos novos. Não inferir ponto por nome/slug visual. A configuração de telefones de comprovantes deve informar claramente que são contatos comerciais compartilhados com clientes. Não usar telefones reais em fixtures/logs/capturas.

Testes mínimos da próxima funcionalidade: dois tenants, ponto de outra loja, dois slots/limite, telefone inválido, geral com escolha, ponto com destino direto, zero/um contato e compatibilidade antiga, resposta tardia/troca de loja, link de pagamento fresco, comprovação de que não há chamada de confirmação/baixa ao abrir WhatsApp.

## Operação das ferramentas

Git HTTPS local permite leitura do repo público, mas não tem credencial de push. A publicação foi feita pela integração GitHub, criando árvore/commit/branch sem force e verificando SHA da árvore idêntico ao conteúdo local. Commits locais preservados. Prefira a integração para publicar; não extrair credenciais.

O CLI Supabase criou o arquivo vazio de migration de métricas. Uma tentativa de telemetria para PostHog foi bloqueada pela revisão automática; essa chamada não foi repetida nem contornada. Não precisa dessa telemetria para continuar.

Não tratar capturas sintéticas locais como deploy real. Documentar cobertura e limites de navegador/Android/iOS. Conferir novos checks e resultados de CI antes de concluir.

Decisão adicional do usuário: compra pelo link de ponto mantém o contato desse ponto mesmo quando a modalidade é entrega em casa. Registrar origem de comunicação separada do local de estoque e validar no servidor.
