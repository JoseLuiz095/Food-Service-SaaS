import type {Product} from '../types';

/** Availability at the selected point takes priority over the store-wide balance. */
export function storefrontAvailabilityRank(product:Product, pointAvailable?:number|null):number {
  if(product.availabilityStatus!=='available'||product.stockStatus==='unavailable')return 2;
  if(!product.trackStock)return 0;
  if(pointAvailable===null)return 1;
  const available=pointAvailable??Number(product.stockQuantity||0)-Number(product.stockReservedQuantity||0);
  return available>0?0:1;
}
