import { isDemoMode } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';
import type {
  InventoryAdjustmentInput,
  InventoryAdjustmentResult,
  InventoryItem,
  InventoryMovement,
  InventoryPurchaseInput,
  InventoryPurchaseResult,
  ProductRecipe,
  ProductRecipeItem,
  InventoryItemType,
  InventoryUnit,
} from '../types';

export type InventoryItemDraft = {
  name: string;
  itemType: InventoryItemType;
  unit: InventoryUnit;
  reorderPoint: number;
  quantity?: number;
  averageUnitCost?: number;
};

export const inventoryLabels: Record<InventoryItemType, string> = {
  ingredient: 'Ingrediente',
  packaging: 'Embalagem',
  finished_good: 'Produto pronto',
  operating: 'Material operacional',
  other: 'Outro',
};

export const inventoryUnitLabels: Record<InventoryUnit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  un: 'un.',
  pack: 'pacote',
};

type InventoryItemRow = {
  id: string;
  store_id: string;
  product_id: string | null;
  name: string;
  sku: string | null;
  item_type: InventoryItem['itemType'];
  unit: InventoryItem['unit'];
  current_quantity: number | string;
  average_unit_cost: number | string;
  last_unit_cost: number | string | null;
  reorder_point: number | string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type InventoryMovementRow = {
  id: string;
  store_id: string;
  inventory_item_id: string;
  movement_type: InventoryMovement['movementType'];
  quantity_delta: number | string;
  quantity_before: number | string;
  quantity_after: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  source_type: string | null;
  source_id: string | null;
  source_reference: string | null;
  reason: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
};

type RecipeRow = Omit<ProductRecipe, 'storeId' | 'productId' | 'yieldQuantity' | 'yieldUnit' | 'createdAt' | 'updatedAt'> & {
  store_id: string;
  product_id: string;
  yield_quantity: number | string;
  yield_unit: ProductRecipe['yieldUnit'];
  created_at: string;
  updated_at: string;
};

type RecipeItemRow = {
  id: string;
  store_id: string;
  recipe_id: string;
  inventory_item_id: string;
  quantity: number | string;
  unit: ProductRecipeItem['unit'];
  waste_percent: number | string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const numberValue = (value: number | string | null | undefined): number => Number(value ?? 0);

const mapItem = (row: InventoryItemRow): InventoryItem => ({
  id: row.id,
  storeId: row.store_id,
  productId: row.product_id || undefined,
  name: row.name,
  sku: row.sku || undefined,
  itemType: row.item_type,
  kind: row.item_type === 'ingredient' ? 'ingredient' : row.item_type === 'packaging' ? 'packaging' : 'material',
  unit: row.unit,
  currentQuantity: numberValue(row.current_quantity),
  quantity: numberValue(row.current_quantity),
  averageUnitCost: numberValue(row.average_unit_cost),
  lastUnitCost: row.last_unit_cost == null ? undefined : numberValue(row.last_unit_cost),
  reorderPoint: numberValue(row.reorder_point),
  minimumQuantity: numberValue(row.reorder_point),
  active: row.active,
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMovement = (row: InventoryMovementRow): InventoryMovement => ({
  id: row.id,
  storeId: row.store_id,
  inventoryItemId: row.inventory_item_id,
  movementType: row.movement_type,
  quantityDelta: numberValue(row.quantity_delta),
  quantityBefore: numberValue(row.quantity_before),
  quantityAfter: numberValue(row.quantity_after),
  unitCost: numberValue(row.unit_cost),
  totalCost: numberValue(row.total_cost),
  sourceType: row.source_type || undefined,
  sourceId: row.source_id || undefined,
  sourceReference: row.source_reference || undefined,
  reason: row.reason || undefined,
  notes: row.notes || undefined,
  idempotencyKey: row.idempotency_key || undefined,
  createdBy: row.created_by || undefined,
  createdAt: row.created_at,
});

const mapRecipe = (row: RecipeRow): ProductRecipe => ({
  id: row.id,
  storeId: row.store_id,
  productId: row.product_id,
  name: row.name,
  yieldQuantity: numberValue(row.yield_quantity),
  yieldUnit: row.yield_unit,
  active: row.active,
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRecipeItem = (row: RecipeItemRow): ProductRecipeItem => ({
  id: row.id,
  storeId: row.store_id,
  recipeId: row.recipe_id,
  inventoryItemId: row.inventory_item_id,
  quantity: numberValue(row.quantity),
  unit: row.unit,
  wastePercent: numberValue(row.waste_percent),
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rpcResult = <T extends object>(value: T | T[]): T => Array.isArray(value) ? value[0] : value;

export const inventoryApi = {
  async listItems(storeId: string, includeInactive = false): Promise<InventoryItem[]> {
    if (isDemoMode) return [];
    const activeFilter = includeInactive ? '' : '&active=eq.true';
    const rows = await restFetch<InventoryItemRow[]>(`food_inventory_items?select=*&store_id=eq.${encodeURIComponent(storeId)}${activeFilter}&order=item_type.asc,name.asc`);
    return rows.map(mapItem);
  },

  /** Compatibilidade para a tela operacional: carrega apenas o inventário salvo. */
  async seedItems(storeId: string): Promise<InventoryItem[]> {
    return this.listItems(storeId);
  },

  async listMovements(storeId: string, limit = 100): Promise<InventoryMovement[]> {
    if (isDemoMode) return [];
    const boundedLimit = Math.min(Math.max(limit, 1), 500);
    const rows = await restFetch<InventoryMovementRow[]>(`food_inventory_movements?select=*&store_id=eq.${encodeURIComponent(storeId)}&order=created_at.desc&limit=${boundedLimit}`);
    return rows.map(mapMovement);
  },

  async createItem(input: { storeId: string; name: string; itemType: InventoryItemType; unit: InventoryUnit; reorderPoint: number; currentQuantity?: number; averageUnitCost?: number }): Promise<InventoryItem> {
    if (isDemoMode) throw new Error('O cadastro de insumos exige o modo conectado ao Supabase.');
    const rows = await restFetch<InventoryItemRow[]>('food_inventory_items?select=*', {
      method: 'POST',
      body: {
        store_id: input.storeId,
        name: input.name.trim(),
        item_type: input.itemType,
        unit: input.unit,
        reorder_point: Math.max(0, input.reorderPoint),
        // O saldo inicial passa pela RPC de ajuste para manter o livro de movimentos.
        current_quantity: 0,
        average_unit_cost: 0,
        active: true,
      },
      prefer: 'return=representation',
    });
    if (!rows[0]) throw new Error('O insumo não foi criado.');
    if ((input.currentQuantity ?? 0) > 0) {
      await this.adjust({
        storeId: input.storeId,
        inventoryItemId: rows[0].id,
        quantityDelta: input.currentQuantity ?? 0,
        reason: 'Saldo inicial',
        movementType: 'opening_balance',
        unitCost: input.averageUnitCost ?? 0,
      });
      const items = await this.listItems(input.storeId, true);
      const item = items.find((entry) => entry.id === rows[0].id);
      if (item) return item;
    }
    return mapItem(rows[0]);
  },

  async listRecipes(storeId: string): Promise<ProductRecipe[]> {
    if (isDemoMode) return [];
    const rows = await restFetch<RecipeRow[]>(`food_product_recipes?select=*&store_id=eq.${encodeURIComponent(storeId)}&order=product_id.asc`);
    return rows.map(mapRecipe);
  },

  async listRecipeItems(storeId: string, recipeId: string): Promise<ProductRecipeItem[]> {
    if (isDemoMode) return [];
    const rows = await restFetch<RecipeItemRow[]>(`food_product_recipe_items?select=*&store_id=eq.${encodeURIComponent(storeId)}&recipe_id=eq.${encodeURIComponent(recipeId)}&order=sort_order.asc`);
    return rows.map(mapRecipeItem);
  },

  async recordPurchase(input: InventoryPurchaseInput): Promise<InventoryPurchaseResult> {
    if (isDemoMode) throw new Error('O registro de compras de estoque exige o modo conectado ao Supabase.');
    if (!input.items.length) throw new Error('Adicione pelo menos um item à compra.');
    const result = await restFetch<InventoryPurchaseResult | InventoryPurchaseResult[]>('rpc/food_record_inventory_purchase', {
      method: 'POST',
      body: {
        p_store_id: input.storeId,
        p_items: input.items.map((item) => ({
          inventory_item_id: item.inventoryItemId,
          quantity: item.quantity,
          unit_cost: item.unitCost,
          ...(item.notes ? { notes: item.notes } : {}),
        })),
        p_supplier: input.supplier || null,
        p_occurred_on: input.occurredOn || null,
        p_payment_method: input.paymentMethod || null,
        p_document_type: input.documentType || null,
        p_document_number: input.documentNumber || null,
        p_notes: input.notes || null,
        p_idempotency_key: input.idempotencyKey || null,
      },
    });
    const payload = rpcResult(result);
    return {
      purchaseId: String(payload.purchaseId ?? (payload as unknown as { purchase_id?: string }).purchase_id ?? ''),
      totalAmount: Number(payload.totalAmount ?? (payload as unknown as { total_amount?: number }).total_amount ?? 0),
      duplicate: Boolean(payload.duplicate),
    };
  },

  async registerPurchase(storeId: string, inventoryItemId: string, quantity: number, totalCost: number): Promise<InventoryItem> {
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Informe uma quantidade de compra válida.');
    if (!Number.isFinite(totalCost) || totalCost < 0) throw new Error('Informe um custo de compra válido.');
    await this.recordPurchase({
      storeId,
      items: [{ inventoryItemId, quantity, unitCost: totalCost / quantity }],
    });
    const items = await this.listItems(storeId);
    const item = items.find((entry) => entry.id === inventoryItemId);
    if (!item) throw new Error('O insumo foi atualizado, mas não pôde ser recarregado.');
    return item;
  },

  async adjust(input: InventoryAdjustmentInput): Promise<InventoryAdjustmentResult> {
    if (isDemoMode) throw new Error('O ajuste de estoque exige o modo conectado ao Supabase.');
    const result = await restFetch<InventoryAdjustmentResult | InventoryAdjustmentResult[]>('rpc/food_adjust_inventory', {
      method: 'POST',
      body: {
        p_store_id: input.storeId,
        p_inventory_item_id: input.inventoryItemId,
        p_quantity_delta: input.quantityDelta,
        p_reason: input.reason,
        p_notes: input.notes || null,
        p_unit_cost: input.unitCost ?? null,
        p_movement_type: input.movementType || null,
        p_idempotency_key: input.idempotencyKey || null,
      },
    });
    const payload = rpcResult(result) as InventoryAdjustmentResult & { movement_id?: string; quantity_after?: number; average_unit_cost?: number };
    return {
      movementId: String(payload.movementId ?? payload.movement_id ?? ''),
      quantityAfter: Number(payload.quantityAfter ?? payload.quantity_after ?? 0),
      averageUnitCost: Number(payload.averageUnitCost ?? payload.average_unit_cost ?? 0),
      duplicate: Boolean(payload.duplicate),
    };
  },

  async adjustQuantity(storeId: string, inventoryItemId: string, quantityDelta: number): Promise<InventoryItem> {
    await this.adjust({
      storeId,
      inventoryItemId,
      quantityDelta,
      reason: quantityDelta > 0 ? 'Ajuste rápido de entrada' : 'Ajuste rápido de saída',
      movementType: quantityDelta > 0 ? 'adjustment_in' : 'adjustment_out',
    });
    const items = await this.listItems(storeId);
    const item = items.find((entry) => entry.id === inventoryItemId);
    if (!item) throw new Error('O estoque foi atualizado, mas o item não pôde ser recarregado.');
    return item;
  },

  async saveItem(storeId: string, draft: InventoryItemDraft): Promise<InventoryItem> {
    if (isDemoMode) throw new Error('O cadastro de estoque exige o modo conectado ao Supabase.');
    const itemType = draft.itemType;
    const rows = await restFetch<InventoryItemRow[]>('food_inventory_items?select=*', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        store_id: storeId,
        name: draft.name.trim(),
        item_type: itemType,
        unit: draft.unit,
        reorder_point: Math.max(0, draft.reorderPoint || 0),
        current_quantity: 0,
        average_unit_cost: 0,
        active: true,
      },
    });
    const created = rows[0];
    if (!created) throw new Error('O insumo não foi criado.');
    if ((draft.quantity || 0) > 0) {
      await this.adjust({
        storeId,
        inventoryItemId: created.id,
        quantityDelta: draft.quantity || 0,
        reason: 'Saldo inicial',
        movementType: 'opening_balance',
        unitCost: draft.averageUnitCost || 0,
      });
    }
    const items = await this.listItems(storeId, true);
    const item = items.find((entry) => entry.id === created.id);
    if (!item) throw new Error('O insumo foi criado, mas não pôde ser recarregado.');
    return item;
  },
};
