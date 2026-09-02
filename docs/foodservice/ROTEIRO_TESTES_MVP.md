# Testes críticos do MVP

## Automatizados locais

```bash
npm run smoke
npm run test:critical
npm run typecheck
npm run build
```

## Banco / RLS

- Loja A não seleciona nem altera dados B.
- `products(category_id,store_id)` rejeita categoria de outra loja.
- `product_option_groups` rejeita grupo/produto de lojas distintas.
- Admin sem associação não atualiza pedido.
- Master sem AAL2 não executa operação protegida.

## Checkout adversarial

- Trocar preço no payload não altera total.
- Enviar opção inativa falha.
- Enviar opção de outro produto falha.
- Omitir grupo obrigatório falha.
- Exceder `max_choices` falha.
- Duplicar option item falha.
- Zona de outra loja falha.
- Loja fechada falha quando não agendado.
- Agendamento fora do expediente falha.
- RequestId repetido não cria segundo pedido.

## UX

Validar 390x844, 768–1024 e 1366x768, sem scroll horizontal e sem CTA cobrindo Turnstile/campos.
