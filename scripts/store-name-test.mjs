import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanStoreName,storeNameValidation,isStoreNameConflict,STORE_NAME_TAKEN} from '../src/utils/storeName.ts';
test('limites e normalização de apresentação',()=>{
 assert.equal(cleanStoreName('  Loja\tNova\n '),'Loja Nova');
 assert.equal(cleanStoreName('Ｌｏｊａ Ａ'),'Loja A');
 assert.equal(storeNameValidation('  '),'Use um nome de loja entre 2 e 120 caracteres.');
 assert.notEqual(storeNameValidation('a'), '');assert.notEqual(storeNameValidation('a'.repeat(121)), '');
 assert.equal(storeNameValidation('a'.repeat(120)), '');assert.equal(storeNameValidation('Loja Nova'), '');
});
test('colisão de nome não confunde conflito de outro campo',()=>{
 assert.equal(isStoreNameConflict(new Error('duplicate key value violates unique constraint "food_stores_name_normalized_uidx"')),true);
 assert.equal(isStoreNameConflict(new Error('food_stores_slug_key')),false);
 assert.match(STORE_NAME_TAKEN,/Escolha um nome diferente/);
});
