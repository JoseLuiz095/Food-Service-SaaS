try {
  await import('./modules-db-test.mjs');
} catch (error) {
  console.error('Falha nos testes de módulos:', error.message);
  if (error.where) console.error(error.where);
  process.exit(1);
}
