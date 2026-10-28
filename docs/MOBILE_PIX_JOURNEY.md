# Jornada mobile e link Pix — implementação revisável

27/10/2026 (America/Sao_Paulo). Branch `codex/mobile-pix-source-review`. **Implementado e testado localmente; sem merge, deploy de produção, migration, mudança de RLS ou escrita em dados reais.**

## Continuidade e escopo

O link compartilhado da conversa retornou `DisabledError`; seu conteúdo não foi lido. O contexto foi recuperado no código e no trabalho acessível, sem presumir decisões do link. GitHub confirmou #96 e #97 integrados; a `main` consultada é `35ac220`. Foram examinados o inventário, AGENTS.md, telas, serviços, contratos do checkout e pagamento, e PRs recentes. A descrição de um PR não foi usada como prova de funcionamento.

A branch reutiliza integralmente o commit local `69cc08d` de `codex/ux-compra-admin-simples`, que estava à frente da main e sem PR. Esse trabalho foi preservado e revalidado. A branch remota paralela `feat/ux-fast-purchase-admin` em `cec6d49` também foi inventariada; sua implementação diverge da local e não foi sobrescrita nem combinada automaticamente. Não integrar ambas indiscriminadamente. As branches existentes e a main foram preservadas; execução direta, sem subagentes nesta rodada.

O pacote de revisão foi preparado somente com fontes, testes e documentação. A revisão automática bloqueou o envio de uma captura por possível exposição de dados; capturas, métricas auxiliares e relatórios históricos foram omitidos da publicação e permanecem nos commits locais originais e no disco. A revisão automática também bloqueou uma métrica auxiliar de QA. O commit local `613b8ad` e sua branch `codex/mobile-pix-journey` estão preservados. O usuário autorizou a publicação desta branch após a entrega local. A publicação inclui fontes, testes e esta documentação técnica, sem capturas, métricas auxiliares ou relatórios históricos. O Git local não tem credencial de push; a integração GitHub será usada para criar uma branch nova com a mesma árvore de fontes. Os commits locais originais permanecem preservados. O usuário abrirá o PR. Esta autorização não inclui merge, deploy, migration ou mudança de RLS.

## Atritos tratados

| Jornada | Implementação e efeito observável |
| --- | --- |
| Vitrine | Produto simples entra no carrinho em um toque; quantidade no card; busca normaliza acentos; opções obrigatórias preservam personalização. |
| Disponibilidade | Soma das linhas/combinações respeita o limite do produto e do ponto; saldo desconhecido bloqueia compra rápida; vitrine oficial mantém encomendas. O servidor continua responsável pela decisão final. |
| Checkout | Retirada identificada por QR chega selecionada; endereço só na entrega; quantidades editáveis no resumo; contato/endereço retomados na sessão; perfil permanente continua opt-in. Taxa e total são exibidos antes do pedido. |
| Administração | Operação e atalhos primeiro; ferramentas adicionais sob demanda; edição comercial rápida não regrava galeria, opções ou saldos; formulário simples reduz campos iniciais. Erros não confirmam uma gravação inexistente. |
| Pix na confirmação | Quando há payload com valor, copia o código completo também no modo Chave Pix. Antes, esse modo copiava somente a chave, embora houvesse QR com valor. |
| Cópia | Verifica a recusa do clipboard e o resultado do fallback legado. Código permanece selecionável, com instrução manual; feedback não informa sucesso quando ambas as tentativas falham. |
| Compartilhamento do lojista | Ação de link para pedido comum e avulso; tela mantém valor, código e alternativa QR/texto. Link disponível para seleção manual quando Web Share ou clipboard falha. Respostas atrasadas não inserem link de outro modal/tenant. |
| Página do pagamento | Valor, loja, número do pedido, recebedor, botão “Copiar código Pix”, QR local, expiração e consulta de status. Ao voltar do banco, reconsulta; pago/cancelado não mostra código pagável. |

As melhorias de compra/admin anteriores pertencem ao commit reaproveitado; o delta desta rodada concentra-se no Pix, cópia, isolamento da página e regressões. Não há medição de tempo de clientes reais ou taxa de abandono: a redução de passos foi verificada em jornadas sintéticas, sem inventar ganho percentual.

## Por que uma API adicional

A confirmação existente vive no `sessionStorage` do comprador; sua URL não recupera o pedido em outro aparelho. O administrador gerava o Pix no navegador e compartilhava imagem + código bruto. Não há link de cobrança comercial específica reutilizável nesse fluxo. A URL Asaas do acesso Fitness sandbox pertence a outra cobrança e não foi reaproveitada.

Foi preparada somente `food-order-payment`, com duas ações e nenhuma escrita:

- `issue`: verifica JWT via Auth, recusa usuário anônimo, exige MFA quando a conta tem fator verificado, associação ativa sem troca obrigatória de senha e leitura do pedido sob as RLS existentes do usuário. O navegador envia apenas IDs; preço e recebedor vêm do servidor.
- `resolve`: aceita exclusivamente um token AES-GCM autenticado e cifrado; consulta somente o pedido e loja contidos no token. Não permite procurar por ID público. Retorna uma projeção de pagamento, sem nome/telefone/endereço do comprador ou itens do pedido.

Token dura 24 horas, usa IV aleatório e segredo exclusivo de pelo menos 32 caracteres (gerar com fonte criptográfica). Vincula pedido, loja e impressão dos dados Pix/valor. Adulteração, expiração, troca de segredo, mudança de total/chave ou indisponibilidade invalidam o link. Status pago/cancelado bloqueia código e nova emissão. Alterações de nome da loja não mudam o recebedor no banco.

Formato: `https://www.vendeweb.com.br/pagamento/pix#<token-cifrado>`. Sem UUID, contato, chave Pix ou valor legível no endereço. O fragmento não é enviado na requisição HTTP ou no Referer. Consulta usa POST; respostas têm `no-store`, sem logs do token/payload. Metadados e texto de compartilhamento são genéricos. A página não monta os providers de loja/carrinho/Auth nem instala telemetria global. QR é gerado localmente. O módulo é carregado sob demanda.

A expiração é do **link**, não de um Pix estático já copiado ou fotografado. A página explica isso; confirmação financeira continua manual no fluxo existente. Não há criação de cobrança bancária, baixa automática, webhook ou mudança em reservas/estoque/Asaas.

## Validação executada

Todos os cenários abaixo usam fixtures sintéticas/interceptação ou PostgreSQL local. Não demonstram que a API está implantada ou que RLS/Auth externos passaram.

- Build com typecheck: aprovado. Typecheck isolado do handler: aprovado.
- Smoke: 177 verificações; fluxo crítico: 122; disponibilidade de carrinho: 14; segmentos: aprovado; segurança e CSV: aprovados; PWA/cache: 8 testes aprovados.
- Integrações PGlite existentes: 94 verificações de reparo, 44 de guards multi-tenant, 17 de estoque, 37 transacionais e 47 de transferência; aprovadas. Não executam banco remoto.
- API Pix: 12 testes aprovados — emissão autorizada, recusa anônima/outro tenant, token opaco e aleatório, adulteração, expiração, rotação, limite de corpo, origem/método, mudança de valor/chave/modalidade/acesso, pago/cancelado e desabilitação.
- Chromium: **65 cenários distintos aprovados**, sem somar repetições de diagnóstico: catálogo (9), navegação (7), edição de pedido (1), Pix/link (9), compra rápida (8), entrega (1), retirada/QR (10), auditoria admin/clientes/agenda (6), segmentos/configurações (10), acesso Fitness (4).
- Larguras conforme suite: 320/360/375/390/768/1024/1280/1366/1440 px. Sem overflow nas assertions pertinentes; controles de toque e QR/cópia conferidos. Captura de pagamento 390 px também inspecionada visualmente: captura sintética local (não publicada).
- O primeiro Chromium completo abortou antes de abrir a aplicação por restrição de socket. O headless shell instalado funcionou com `PLAYWRIGHT_CHANNEL=''`. As falhas posteriores de labels e seletores foram corrigidas e os cenários afetados passaram na repetição; não foram removidas assertions funcionais.
- `git diff --check`: aprovado.

Com dependências instaladas, reproduzir a API com `npm run test:payment-links` e a UI com `PLAYWRIGHT_CHANNEL='' npm run qa:payment-links`. A configuração de QA habilita a flag **somente no servidor local de testes**, com backend interceptado. O workflow existente passou a executar os testes do handler; não afirmar aprovação do CI antes de consultar sua execução.

## Homologação e ativação pendentes

A função e o botão novo ficam desabilitados por padrão. Nenhum segredo foi criado ou enviado ao remoto. Antes de ativar, validar em ambiente autorizado:

1. Projeto VendeWeb `elttryavkeartoxgdgse` e ambiente real; não usar o Academia/Impulso antigo nem tabelas operacionais FloriWeb. Conferir os campos selecionados e as RLS efetivas de pedidos/associações sem modificá-las para fazer o fluxo passar.
2. Testar emissão com lojista autorizado, funcionário conforme suas permissões, associação inativa, troca de senha obrigatória, outra loja, anônimo e conta que exige MFA. Testes do handler injetam essa fronteira; não substituem Auth e RLS reais. Testar indisponibilidade da API e os CORS dos domínios administrativos usados.
3. Configurar `ORDER_PAYMENT_LINK_SECRET` exclusivo, `ORDER_PAYMENT_ALLOWED_ORIGINS` com origens HTTPS exatas e `ORDER_PAYMENT_LINK_ENABLED=true` no backend de homologação. `SUPABASE_URL`, chave pública e chave privilegiada ficam no servidor conforme o padrão existente. Não enviar segredo ao frontend.
4. Publicar a função somente com autorização específica para o ambiente. Preparar o frontend com `VITE_PIX_PAYMENT_LINK_ENABLED=true` somente depois de a API responder corretamente. Não executar `db push`; esta mudança não exige schema, grants nem RLS novos.
5. Usar pedido/loja de teste isolados: abrir o link em outro aparelho, conferir QR/valor/recebedor, copiar no Android/iOS, negar clipboard, voltar do banco, alterar/cancelar/pagar o pedido no ambiente de teste e observar bloqueios. Web Share foi simulado; o envio pelo WhatsApp nativo e banco real não foram executados.
6. Produção depende de aprovação própria de deploy. Rollback do recurso: desativar flags; rotacionar segredo invalida todos os links emitidos. Não altera pagamentos já feitos. Demais pendências de migrations/RPCs e o defeito de reserva na edição de pedidos registrado no #96 continuam fora deste delta; nenhum dado histórico foi corrigido.
