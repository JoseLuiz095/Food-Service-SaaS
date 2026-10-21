import { restFetch } from '../lib/supabaseRest';
import { selectBusinessSegment, type BusinessSegment } from '../segments/businessSegments';

/** Uses the existing store UPDATE policy; credentials and operational settings are untouched. */
export async function saveNewStorePresentation(storeId: string, segment?: BusinessSegment, includeFood = false): Promise<string | undefined> {
  if (!segment || (segment === 'food' && !includeFood)) return;
  try {
    const rows = await restFetch<{id:string;visual_theme:unknown}[]>(`food_stores?id=eq.${encodeURIComponent(storeId)}&select=id,visual_theme`);
    if (rows.length !== 1) throw new Error('Loja não acessível.');
    const saved = await restFetch<{id:string}[]>(`food_stores?id=eq.${encodeURIComponent(storeId)}&select=id`, {
      method:'PATCH', prefer:'return=representation', body:{visual_theme:selectBusinessSegment(rows[0].visual_theme,segment)},
    });
    if (saved.length !== 1) throw new Error('Configuração não gravada.');
  } catch {
    // Account creation already succeeded: do not invite a duplicate registration on a visual failure.
    return 'O ramo não foi salvo. Selecione o ramo em Configurações para concluir a apresentação da loja.';
  }
}
