import type { Product } from '../types';
import { slugify } from './format';
import { createId } from './id';

/** core: prepares an independent, unpublished catalog draft; never copies operational balances or storage ownership. */
export function createProductCopy(source: Product, catalog: readonly Product[]): Product {
  const names = new Set(catalog.filter((item) => item.storeId === source.storeId).map((item) => item.name.trim().toLocaleLowerCase('pt-BR')));
  const slugs = new Set(catalog.filter((item) => item.storeId === source.storeId).map((item) => item.slug));
  let name = `${source.name} (cópia)`;
  for (let number = 2; names.has(name.toLocaleLowerCase('pt-BR')) || slugs.has(slugify(name)); number += 1) name = `${source.name} (cópia ${number})`;
  return {
    ...structuredClone(source),
    id: createId(),
    name,
    slug: '',
    internalCode: undefined,
    active: false,
    featured: false,
    stockQuantity: source.trackStock ? 0 : undefined,
    stockReservedQuantity: 0,
    stockStatus: source.trackStock ? 'low_stock' : 'available',
    stockLabel: undefined,
    availabilityStatus: 'available',
    imageUrl: '/assets/placeholder-food.svg',
    images: [],
    gallery: [],
    // buildProducts already converts legacy variants/addons into editable groups.
    variations: [],
    addons: [],
    optionGroups: source.optionGroups.map((group) => {
      const id = createId();
      return {
        ...structuredClone(group), id,
        items: group.items.map((item) => ({ ...item, id: createId(), groupId: id })),
      };
    }),
  };
}
