import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeCsvCell, serializeCsv } from '../src/utils/exportCsv.ts';

test('neutraliza fórmulas em campos textuais inclusive após espaços e controles', () => {
  for (const value of ['=HYPERLINK("x")', '+cmd', '-1+2', '@SUM(A1)', '  =1+1', '\t=1+1', '\r\n@cmd', '\u200b+1', '\ufeff-2']) {
    assert.equal(escapeCsvCell(value).startsWith('"') ? escapeCsvCell(value).startsWith('"\'') : escapeCsvCell(value).startsWith("'"), true, value);
  }
});

test('mantém números, espaços legítimos, separador, aspas e quebras de linha', () => {
  assert.equal(escapeCsvCell(-12.5), '-12.5');
  assert.equal(escapeCsvCell('  Loja do Bairro'), '  Loja do Bairro');
  assert.equal(escapeCsvCell('Produto; "especial"\nnovo'), '"Produto; ""especial""\nnovo"');
  assert.equal(escapeCsvCell(null), '');
  assert.equal(serializeCsv(['Nome', 'Valor'], [['=1+1', -5], ['Comum', '  valor']]), "Nome;Valor\r\n'=1+1;-5\r\nComum;  valor");
});
