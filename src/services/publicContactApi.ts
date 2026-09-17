import { invokePublicFunction } from '../lib/supabaseRest';

export type PublicContactIntent = 'trial' | 'commercial';

export async function requestPublicContact(token:string,intent:PublicContactIntent):Promise<string>{
  const payload=await invokePublicFunction<{redirectUrl?:string}>('food-public-contact',{token,intent});
  if(!payload?.redirectUrl)throw new Error('Contato comercial indisponível no momento.');
  return payload.redirectUrl;
}
