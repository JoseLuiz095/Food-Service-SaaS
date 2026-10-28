# Estado confirmado e pendências do plano completo

Este documento evita confundir entregas pontuais com conclusão de todo o plano. Usuário reforçou “termine todas essas tarefas”. A autorização de branches/PRs/previews permanece; não autoriza instalar schema/Edge ou corrigir estoque real em produção.

## Entregas revisáveis

- #100 e #101 integrados no código: reservas negativas e edição preservando local; não presumir migrations instaladas.
- #103 aberto: métricas isoladas e erro do painel. GitHub/Cloudflare aprovados; migration não aplicada.
- #104 aberto: revisão visual Doce Lua, compartilhamento por ponto, remoção do botão Pix redundante, horários e notificações por portal, fechar ao tocar fora. GitHub/Cloudflare finais aprovados. Coleta sintética130 observações/26rotas/cinco larguras e18 cenários funcionais; não prova iOS/Instagram físico.
- #105 aberto: dois contatos comerciais, origem de link separada de estoque, mesmo contato no delivery do ponto e escolha no link geral inclusive para retirada. GitHub/Cloudflare aprovados. Flags desligadas; duas migrations e atualização de Edge pendentes de revisão/instalação.
- Branch codex/pagamento-status-separados: remove comando combinado de confirmação/status e texto que sempre prometia baixa. Seis browser aprovados; publicar/conferir seu PR e checks antes de seguir.

## Revalidação remota desta rodada

Main continua 90a352745b75594ff6d5820c495259505a13eb94 na consulta. food_update_inventory_item_v1, food_save_product_recipe_v1 e food_dashboard_metrics_v1 continuam ausentes no catálogo. food_product_location_stock ainda exige reservado <= físico: #100 não pode ser tratado como banco instalado. food_confirm_order_payment_v1 efetiva só confirma campos financeiros; food_update_order_items_v1 ainda tem corpo MD5 f92769b0459f66e98dd2d652c5e8bf57 e precisa ser comparada à correção preparada antes de qualquer instalação. Nenhum pedido/cliente real foi lido nesta checagem.

## Trabalho ainda necessário — NÃO concluído

| Frente | Próximo trabalho | Limite |
|---|---|---|
| Baseline e reservas | Revisão específica das migrations #100/#101 e instalação individual em alvo homologado | Não aplicar por db push nem por mera autorização genérica |
| Sob demanda | Contrato único card/detalhe/carrinho/checkout/servidor, distinguir bloqueio manual/automático, primeira data por produto/loja/fuso e política por ponto | Código ainda usa Sob encomenda e amanhã em caminhos existentes; não substituir só texto e declarar pronto |
| Insumos/receitas | Comparação semântica das duas RPCs ausentes com schema efetivo, isolamento/teste antes de propor instalação | Migration ampla não deve ser aplicada só por ausência |
| Conferência | Evidência por item/local/quantidade/tempo e grau de certeza, filtros e ledger transacional futuro | Histórico sem evidência continua insuficiente; não inferir 116 falhas |
| Busca/agregados | Paginação/busca no servidor e dashboard de próximas ações por consulta completa | Não contar só lote100/página atual |
| Operação mobile | Todos os estados relevantes dos formulários e fluxo completo, zoom/contraste/foco/toque; padrões por segmento e Master | Coleta sintética não cobre todos os estados nem aparelho real |
| Papéis/confiabilidade | manager no frontend/servidor, matriz de acesso, timeout/idempotência, fuso e QA sem fallback produtivo | Não liberar apenas menu |
| Fitness/Impulso | Autorização/dados privados/tenant e IMP-01..05 antes de ampliar conteúdo/IA/cobrança | Integração do acesso não prova segurança das capacidades antigas |
| Doce Lua físico | Contagem contemporânea por quatro SKUs/local e confronto das transferências | Não aplicar delta15 ou repetir baixa #00130 |

## Retomada

Leia primeiro docs/continuidade/RETOMAR_VENDEWEB_20261028.md na branch do #105 e as instruções originais do usuário; acrescente este estado. Trabalhe em pequenos PRs preservando checkouts. Próxima implementação funcional: contrato de disponibilidade e agenda coerente com servidor, com casos negativos de tenant e estoque. Antes de editar, compare main/PRs locais e remotos novamente.

A referência deliverables/vendeweb-revisao-20261028/ANALISE.md não foi localizada neste checkout nem na busca por caminho em scratch nesta retomada; não afirmar que foi consultada aqui. docs/AUDITORIA_ESTOQUE_MOBILE.md está disponível. Recuperar a referência pela origem adequada antes da consolidação do diagnóstico completo.
