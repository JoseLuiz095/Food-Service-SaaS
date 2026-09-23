import { restFetch } from '../lib/supabaseRest';

export type LandingStore = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
  city: string;
  state: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  minimumOrder: number;
  preparationMin: number;
  preparationMax: number;
};

export type LandingPlan = {
  id: string;
  code: string;
  name: string;
  monthlyPrice: number;
  featureCodes: string[];
  marketingBenefits: string[];
};

type LandingRpcStore = {
  id:string; slug:string; name:string; description?:string|null; logo_url?:string|null; cover_url?:string|null;
  city?:string|null; state?:string|null; delivery_enabled?:boolean; pickup_enabled?:boolean; minimum_order?:number|string|null;
  average_preparation_min?:number|null; average_preparation_max?:number|null;
};
type LandingRpcPlan = { id:string; code:string; name:string; monthly_price?:number|string|null; feature_codes?:string[]|null; marketing_benefits?:string[]|null };
type LandingRpc = {
  stores?:LandingRpcStore[];
  plans?:LandingRpcPlan[];
  demo_store_slug?:string|null;
  demo_enabled?:boolean|null;
  demo_duration_days?:number|null;
  contact_protected?:boolean|null;
};

export type PublicLanding = {
  stores:LandingStore[];
  plans:LandingPlan[];
  demoStoreSlug:string;
  demoEnabled:boolean;
  demoDurationDays:number;
  contactProtected:boolean;
};
const n=(value:number|string|null|undefined)=>Number(value||0);
let landingPromise:Promise<PublicLanding>|null=null;

const fetchLanding=async():Promise<PublicLanding>=>{
  const payload=await restFetch<LandingRpc>('rpc/food_get_public_landing_v1',{method:'POST',body:{}});
  const stores=(payload.stores||[]).map((row)=>({
    id:row.id,slug:row.slug,name:row.name,description:row.description||'Pedidos online de forma simples e profissional.',logoUrl:row.logo_url||'/assets/food-logo.svg',coverUrl:row.cover_url||'',city:row.city||'',state:row.state||'',deliveryEnabled:row.delivery_enabled??true,pickupEnabled:row.pickup_enabled??true,minimumOrder:n(row.minimum_order),preparationMin:Math.max(0,row.average_preparation_min??30),preparationMax:Math.max(0,row.average_preparation_max??45),
  }));
  const plans=(payload.plans||[]).map((row)=>({id:row.id,code:row.code,name:row.name,monthlyPrice:n(row.monthly_price),featureCodes:Array.isArray(row.feature_codes)?row.feature_codes:[],marketingBenefits:Array.isArray(row.marketing_benefits)?row.marketing_benefits.filter(Boolean):[]}));
  return {
    stores,
    plans,
    demoStoreSlug:payload.demo_store_slug||stores[0]?.slug||'central-food-demo',
    demoEnabled:payload.demo_enabled!==false,
    demoDurationDays:Math.max(1,Number(payload.demo_duration_days||30)),
    contactProtected:payload.contact_protected!==false,
  };
};

export function loadPublicLanding(options:{refresh?:boolean}={}):Promise<PublicLanding>{
  if(options.refresh||!landingPromise) landingPromise=fetchLanding().catch((error)=>{landingPromise=null;throw error});
  return landingPromise;
}
