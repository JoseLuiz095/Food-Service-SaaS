export const STORE_NAME_TAKEN = 'Este nome já está em uso. Escolha um nome diferente para sua loja.';
export const cleanStoreName = (name: string) => name.normalize('NFKC').replace(/\s+/gu, ' ').trim();
export function storeNameValidation(name: string): string {
  const size = [...cleanStoreName(name)].length;
  return size < 2 || size > 120 ? 'Use um nome de loja entre 2 e 120 caracteres.' : '';
}
export function isStoreNameConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('food_stores_name_normalized_uidx');
}
