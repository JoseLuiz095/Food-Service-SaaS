import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordRecoveryError } from '../src/utils/passwordRecovery.ts';
test('mensagens de recuperação orientam sem expor dados internos', () => {
  assert.match(passwordRecoveryError(new Error('captcha protection: request disallowed (no captcha_token found)')), /verificação de segurança/);
  assert.match(passwordRecoveryError({status:429}), /Aguarde/);
  assert.match(passwordRecoveryError(new Error('For security purposes, you can only request this after 60 seconds')), /Aguarde/);
  assert.match(passwordRecoveryError(new Error('Failed to fetch')), /internet/);
  assert.doesNotMatch(passwordRecoveryError(new Error('User not found: synthetic@example.invalid')), /not found|example.invalid/);
  assert.match(passwordRecoveryError(null), /Não foi possível/);
});
