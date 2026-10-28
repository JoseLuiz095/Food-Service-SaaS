# Compartilhamento de Pix — incremento de 28/10/2026

## Pedido e resultado

O administrador precisa enviar uma cobrança fácil de copiar no celular. Foi adicionada a ação **Compartilhar só o código Pix**, nas cobranças de pedido existente e de venda avulsa. A mensagem contém exclusivamente o payload: o cliente pode copiar a mensagem inteira sem retirar número do pedido, valor ou instruções do texto.

O botão **Copiar código Pix** continua disponível. Quando não existe compartilhamento nativo, a nova ação copia apenas o código e informa para colar na conversa com o cliente. Cancelar a folha de compartilhamento não copia texto silenciosamente nem confirma pagamento. Se a cópia for bloqueada, o controle mantém o conteúdo selecionável, seleciona o campo e orienta a cópia manual, sem anunciar sucesso.

Quando a API de links estiver habilitada e responder corretamente, o administrador também tem o botão **Copiar link de pagamento**, além de compartilhar o link. Esse link abre a página isolada de pagamento com valor/recebedor e cópia do Pix em um toque. A página explica o caminho no aplicativo bancário: copiar → abrir o banco de preferência → Pix Copia e Cola → conferir e confirmar. Os estados pago/cancelado/expirado mantêm o comportamento existente de impedir a exibição de instruções vencidas durante reconsulta.

## Fatos e limites

- Na implementação, main em `72b20a2`. Antes da publicação, main reconsultada em `737ae4a7d09df92fe6cc078153bc656b2a432420`, após integração do #100. Esta branch recebeu a main por merge, sem conflito e sem reescrever histórico.
- Este incremento usa branch/worktree independente, `codex/pix-compartilhar-facil-20261028`, baseada na main. O commit anterior de reserva/local continua preservado na própria branch.
- O link de pagamento já existia no código, condicionado a `VITE_PIX_PAYMENT_LINK_ENABLED` e à Edge Function `food-order-payment`. Esta alteração não habilita a flag, não publica a função e não certifica sua disponibilidade remota. A preparação/homologação consta de `docs/MOBILE_PIX_JOURNEY.md`.
- Compartilhar o código funciona com a flag de links desativada. Copiar/compartilhar não confirma pagamento, não altera estoque e não inicia uma transferência bancária.
- O link cifrado existente continua no fragmento da URL; não contém Pix bruto, contato ou endereço do cliente. O compartilhamento do código é uma ação explícita e separada, sem arquivo ou informações pessoais anexados.
- Sem migration, RLS, função remota, schema, dados reais ou dependência nova. `sources/` e a plataforma FloriWeb não foram alterados.

## Abrir o banco e preencher a transação

**Decisão técnica pendente de integração:** oferecer a seleção do banco e redirecionar uma transação já preparada exige a jornada de iniciação de pagamento por uma instituição/provedor integrado ao Open Finance. O Banco Central descreve a seleção da instituição, o redirecionamento e a autenticação/confirmação bancária. A documentação do ecossistema descreve a ITP configurando o Pix, a escolha da instituição e a confirmação pelo cliente.

Este incremento não implementa essa integração e não apresenta um seletor de banco sem função. Não foi assumido um esquema de URL universal capaz de colar automaticamente um Pix em qualquer banco. Antes dessa etapa, escolher um provedor compatível, verificar contrato/custos, credenciais somente no servidor, consentimento, idempotência, confirmação verificável, fronteiras de tenant e validação em sandbox. A escolha de provedor não foi feita silenciosamente.

Referências primárias consultadas em 28/10/2026:

- [Banco Central: como fazer um Pix](https://www.bcb.gov.br/meubc/faqs/p/como-fazer-um-pix).
- [Banco Central: jornada de iniciação com redirecionamento, IN BCB 760](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=760&tipo=Instru%C3%A7%C3%A3o+Normativa+BCB).
- [Open Finance Brasil: Pix via hybrid flow](https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/2147651733/v.24.00.00%2BPix%2Bvia%2Bhybrid%2Bflow).

## Arquivos e revisão

| Situação | Arquivo | Finalidade |
| --- | --- | --- |
| Novo | `src/components/CopyableText.tsx` | Cópia compartilhada por código/chave/link; estados acessíveis e proteção contra retorno de tentativa antiga |
| Modificado | `src/components/PixCopyButton.tsx` | Usa o controle compartilhado, preservando rótulos de código e chave |
| Modificado | `src/pages/admin/Orders.tsx` | Compartilhar somente o código; botão para copiar o link nas duas cobranças |
| Modificado | `src/pages/store/OrderPayment.tsx` | Instruções curtas para pagar no banco de preferência |
| Modificado | `src/pages/store/order-payment.css` | Alvos de toque e leitura das instruções |
| Novo | `qa/pix-sharing.config.ts` | Servidor local exclusivo e alvo Supabase fictício explícito |
| Novo | `qa/tests/modules/pix-sharing.spec.ts` | Mobile/desktop, teclado, mensagens sem dados extras, cancelamento e cópia negada |
| Novo | `docs/PIX_COMPARTILHAMENTO_20261028.md` | Escopo, evidência, riscos e reversão deste incremento |

Nenhum arquivo removido. Sem migrations ou novas dependências. Não altera a geração/validação do payload nem a emissão/resolução do token no servidor.

## Validação

- Playwright com links habilitados: 17 cenários aprovados; o caso exclusivo de flag desativada foi pulado nessa configuração.
- Verificação axe adicional nos controles novos: rótulos, nomes de botões e atributos ARIA aprovados. Não representa auditoria WCAG completa da tela.
- Playwright com links desativados: dois cenários aprovados, cobrindo código disponível sem emissão de link e fallback de cópia sem Web Share.
- Larguras: 320, 360, 390, 768 e 1366 px. Cópia do link por teclado, área de toque de pelo menos 44 px e ausência de overflow nos casos novos.
- Regressões existentes cobrem código copiado exatamente, clipboard negado, link expirado/falha, pago/cancelado e reconsulta após retorno do banco. Compartilhamento nativo foi simulado; não houve envio para pessoas nem transação real.
- Typecheck aprovado. Build com alvo fictício explícito, smoke (177), testes de handler (12, incluindo tenant e adulteração do token) e fluxo crítico (122): aprovados.

## Risco e rollback

Risco principal: diferenças de suporte a clipboard/Web Share e a rejeição de uso fora de uma ação do usuário pelos navegadores. Os botões mantêm seleção manual como alternativa; o código pode ser compartilhado sem depender da imagem do QR. Testes em Android/iOS reais e aplicativos bancários permanecem necessários antes de afirmar compatibilidade nesses dispositivos.

Rollback: reverter somente o commit deste incremento, preservando o commit de reserva/local. A flag de links não foi alterada. Como não há alteração de banco/pagamento/estoque, não existe compensação de dados a executar. A cópia já realizada pelo cliente permanece em sua área de transferência, como no fluxo anterior.

O usuário autorizou a publicação das branches e abertura dos PRs em rascunho, incluindo os previews automáticos do Cloudflare. Não autorizou merge, migrations ou publicação de funções/banco em produção. Esta mudança não exige migration nem alteração remota do banco.
