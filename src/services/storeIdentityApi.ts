import { isDemoMode } from '../lib/config';
import { restFetch, SupabaseHttpError } from '../lib/supabaseRest';
import { cleanStoreName, STORE_NAME_TAKEN, storeNameValidation } from '../utils/storeName';

export async function checkStoreName(storeId: string, name: string): Promise<boolean> {
  const invalid = storeNameValidation(name);
  if (invalid) throw new Error(invalid);
  if (isDemoMode) return true; // Demonstração local não consulta um diretório real.
  try {
    const available = await restFetch<boolean>('rpc/food_check_store_name_v1', {
      method: 'POST', body: { p_store_id: storeId, p_name: cleanStoreName(name) },
    });
    if (typeof available !== 'boolean') throw new Error('Resposta de validação inválida.');
    return available;
  } catch (error) {
    if (error instanceof SupabaseHttpError && error.status === 404) {
      throw new Error('A validação de nomes ainda não está disponível. Tente novamente mais tarde.');
    }
    throw new Error('Não foi possível validar o nome. Confira sua conexão e tente novamente.');
  }
}
export async function assertStoreNameAvailable(storeId: string, name: string): Promise<void> {
  if (!await checkStoreName(storeId, name)) throw new Error(STORE_NAME_TAKEN);
}
