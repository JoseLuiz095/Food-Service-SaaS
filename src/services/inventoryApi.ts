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
  LowStockInventoryItem,
} from '../types';

export type InventoryItemDraft = {
  name: string;
  itemType: InventoryItemType;
  unit: InventoryUnit;
  reorderPoint: number;
  quantity?: number;
  averageUnitCost?: number;
  lowStockAlertEnabled?: boolean;
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

const inventoryUnitFamily = (unit: InventoryUnit) => unit === 'g' || unit === 'kg' ? 'mass' : unit === 'ml' || unit === 'l' ? 'volume' : unit;
const inventoryToBase = (quantity: number, unit: InventoryUnit) => unit === 'g' || unit === 'ml' ? quantity / 1000 : quantity;
const inventoryFromBase = (quantity: number, unit: InventoryUnit) => unit === 'g' || unit === 'ml' ? quantity * 1000 : quantity;
const convertInventoryQuantity = (quantity: number, from: InventoryUnit, to: InventoryUnit) => inventoryUnitFamily(from) === inventoryUnitFamily(to) ? inventoryFromBase(inventoryToBase(quantity, from), to) : null;

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
  low_stock_alert_enabled?: boolean | null;
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
  stage?: string | null;
  quantity: number | string;
  unit: ProductRecipeItem['unit'];
  waste_percent: number | string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type LowStockInventoryRow = {
  inventory_item_id: string;
  name: string;
  item_type: InventoryItem['itemType'];
  unit: InventoryUnit;
  current_quantity: number | string;
  reorder_point: number | string;
  average_unit_cost: number | string;
  alert_enabled: boolean;
};

// Respostas enxutas e previsíveis para o painel. Assim, uma coluna nova do
// banco não passa a ser exposta acidentalmente sem entrar no mapeamento.
const INVENTORY_ITEM_SELECT = 'id,store_id,product_id,name,sku,item_type,unit,current_quantity,average_unit_cost,last_unit_cost,reorder_point,low_stock_alert_enabled,active,notes,created_at,updated_at';
const INVENTORY_MOVEMENT_SELECT = 'id,store_id,inventory_item_id,movement_type,quantity_delta,quantity_before,quantity_after,unit_cost,total_cost,source_type,source_id,source_reference,reason,notes,idempotency_key,created_by,created_at';
const RECIPE_SELECT = 'id,store_id,product_id,name,yield_quantity,yield_unit,active,notes,created_at,updated_at';
const RECIPE_ITEM_SELECT = 'id,store_id,recipe_id,inventory_item_id,stage,quantity,unit,waste_percent,sort_order,created_at,updated_at';

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
  lowStockAlertEnabled: row.low_stock_alert_enabled !== false,
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
  stage: row.stage?.trim() || 'Geral',
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
    const rows = await restFetch<InventoryItemRow[]>(`food_inventory_items?select=${INVENTORY_ITEM_SELECT}&store_id=eq.${encodeURIComponent(storeId)}${activeFilter}&order=item_type.asc,name.asc`);
    return rows.map(mapItem);
  },

  /** Compatibilidade para a tela operacional: carrega apenas o inventário salvo. */
  async seedItems(storeId: string): Promise<InventoryItem[]> {
    return this.listItems(storeId);
  },

  async listMovements(storeId: string, limit = 100): Promise<InventoryMovement[]> {
    if (isDemoMode) return [];
    const boundedLimit = Math.min(Math.max(limit, 1), 500);
    const rows = await restFetch<InventoryMovementRow[]>(`food_inventory_movements?select=${INVENTORY_MOVEMENT_SELECT}&store_id=eq.${encodeURIComponent(storeId)}&order=created_at.desc&limit=${boundedLimit}`);
    return rows.map(mapMovement);
  },

  async listLowStock(storeId: string): Promise<LowStockInventoryItem[]> {
    if (isDemoMode) return [];
    const rows = await restFetch<LowStockInventoryRow[] | LowStockInventoryRow>(`rpc/food_list_low_stock_inventory`, {
      method: 'POST',
      body: { p_store_id: storeId },
    });
    const entries = Array.isArray(rows) ? rows : [rows];
    return entries.filter(Boolean).map((row) => ({
      id: row.inventory_item_id,
      name: row.name,
      itemType: row.item_type,
      kind: row.item_type === 'ingredient' ? 'ingredient' : row.item_type === 'packaging' ? 'packaging' : 'material',
      unit: row.unit,
      currentQuantity: numberValue(row.current_quantity),
      quantity: numberValue(row.current_quantity),
      averageUnitCost: numberValue(row.average_unit_cost),
      reorderPoint: numberValue(row.reorder_point),
      minimumQuantity: numberValue(row.reorder_point),
      alertEnabled: row.alert_enabled,
    }));
  },

  async updateItem(storeId: string, itemId: string, input: { name?: string; itemType?: InventoryItemType; reorderPoint?: number; lowStockAlertEnabled?: boolean; notes?: string; active?: boolean }): Promise<InventoryItem> {
    if (isDemoMode) throw new Error('A edição de insumos exige o modo conectado ao Supabase.');
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name.trim();
    if (input.itemType !== undefined) body.item_type = input.itemType;
    if (input.reorderPoint !== undefined) body.reorder_point = Math.max(0, input.reorderPoint);
    if (input.lowStockAlertEnabled !== undefined) body.low_stock_alert_enabled = input.lowStockAlertEnabled;
    if (input.notes !== undefined) body.notes = input.notes.trim() || null;
    if (input.active !== undefined) body.active = input.active;
    if (input.name !== undefined && !String(input.name).trim()) throw new Error('Informe o nome do insumo.');
    const rows = await restFetch<InventoryItemRow[]>(`food_inventory_items?select=${INVENTORY_ITEM_SELECT}&id=eq.${encodeURIComponent(itemId)}&store_id=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      body,
      prefer: 'return=representation',
    });
    if (!rows[0]) throw new Error('O insumo não foi encontrado ou não pôde ser atualizado.');
    return mapItem(rows[0]);
  },

  async changeUnit(storeId: string, itemId: string, unit: InventoryUnit): Promise<InventoryItem> {
    if (isDemoMode) throw new Error('A edição de unidade exige o modo conectado ao Supabase.');
    const result = await restFetch<Record<string, unknown> | Array<Record<string, unknown>>>('rpc/food_convert_inventory_unit', { method: 'POST', body: { p_store_id: storeId, p_inventory_item_id: itemId, p_new_unit: unit } });
    const payload = rpcResult(result);
    if (!payload.item || typeof payload.item !== 'object') throw new Error('A unidade não pôde ser convertida.');
    return mapItem(payload.item as InventoryItemRow);
  },

  /** Arquiva o cadastro sem apagar movimentos, compras ou fichas técnicas históricas. */
  async archiveItem(storeId: string, itemId: string): Promise<InventoryItem> {
    return this.updateItem(storeId, itemId, { active: false });
  },

  async restoreItem(storeId: string, itemId: string): Promise<InventoryItem> {
    return this.updateItem(storeId, itemId, { active: true });
  },

  async createItem(input: { storeId: string; name: string; itemType: InventoryItemType; unit: InventoryUnit; reorderPoint: number; currentQuantity?: number; averageUnitCost?: number }): Promise<InventoryItem> {
    if (isDemoMode) throw new Error('O cadastro de insumos exige o modo conectado ao Supabase.');
    const rows = await restFetch<InventoryItemRow[]>(`food_inventory_items?select=${INVENTORY_ITEM_SELECT}`, {
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
    const rows = await restFetch<RecipeRow[]>(`food_product_recipes?select=${RECIPE_SELECT}&store_id=eq.${encodeURIComponent(storeId)}&active=eq.true&order=product_id.asc`);
    return rows.map(mapRecipe);
  },

  /** Arquiva a ficha sem apagar os movimentos de consumo já registrados. */
  async archiveRecipe(storeId: string, productId: string): Promise<ProductRecipe> {
    if (isDemoMode) throw new Error('A ficha técnica exige o modo conectado ao Supabase.');
    const rows = await restFetch<RecipeRow[]>(`food_product_recipes?select=${RECIPE_SELECT}&store_id=eq.${encodeURIComponent(storeId)}&product_id=eq.${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      body: { active: false },
      prefer: 'return=representation',
    });
    if (!rows[0]) throw new Error('A automação não foi encontrada.');
    return mapRecipe(rows[0]);
  },

  async listRecipeItems(storeId: string, recipeId: string): Promise<ProductRecipeItem[]> {
    if (isDemoMode) return [];
    const rows = await restFetch<RecipeItemRow[]>(`food_product_recipe_items?select=${RECIPE_ITEM_SELECT}&store_id=eq.${encodeURIComponent(storeId)}&recipe_id=eq.${encodeURIComponent(recipeId)}&order=sort_order.asc`);
    return rows.map(mapRecipeItem);
  },

  /** Carrega as linhas de todas as fichas em uma única consulta para os indicadores operacionais. */
  async listAllRecipeItems(storeId: string): Promise<ProductRecipeItem[]> {
    if (isDemoMode) return [];
    const rows = await restFetch<RecipeItemRow[]>(`food_product_recipe_items?select=${RECIPE_ITEM_SELECT}&store_id=eq.${encodeURIComponent(storeId)}&order=recipe_id.asc,sort_order.asc`);
    return rows.map(mapRecipeItem);
  },

  async saveRecipe(input: {
    storeId: string;
    productId: string;
    name?: string;
    yieldQuantity: number;
    yieldUnit: InventoryUnit;
    notes?: string;
    items: Array<{ inventoryItemId: string; stage?: string; quantity: number; unit: InventoryUnit; wastePercent?: number; sortOrder?: number }>;
  }): Promise<ProductRecipe> {
    if (isDemoMode) throw new Error('A ficha técnica exige o modo conectado ao Supabase.');
    if (!Number.isFinite(input.yieldQuantity) || input.yieldQuantity <= 0) throw new Error('Informe um rendimento válido.');
    if (!input.items.length) throw new Error('Adicione pelo menos um insumo à ficha técnica.');
    if (input.items.some((item) => !item.inventoryItemId || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.wastePercent ?? 0) || (item.wastePercent ?? 0) < 0 || (item.wastePercent ?? 0) > 100)) {
      throw new Error('Revise os insumos, quantidades e perdas da ficha técnica.');
    }
    // Normaliza a ficha para a unidade do saldo. Assim, uma receita em
    // gramas para um item comprado em quilos debita o valor correto.
    const inventoryItems = await this.listItems(input.storeId, true);
    const normalizedItems = input.items.map((item) => {
      const inventoryItem = inventoryItems.find((entry) => entry.id === item.inventoryItemId);
      if (!inventoryItem) throw new Error('Um dos insumos selecionados não foi encontrado.');
      const quantity = convertInventoryQuantity(item.quantity, item.unit, inventoryItem.unit);
      if (quantity == null) throw new Error(`A unidade ${inventoryUnitLabels[item.unit]} não pode ser convertida para ${inventoryUnitLabels[inventoryItem.unit]} em “${inventoryItem.name}”.`);
      return { ...item, quantity, unit: inventoryItem.unit };
    });
    const existing = (await restFetch<RecipeRow[]>(`food_product_recipes?select=${RECIPE_SELECT}&store_id=eq.${encodeURIComponent(input.storeId)}&product_id=eq.${encodeURIComponent(input.productId)}`))[0];
    let recipe: RecipeRow;
    if (existing) {
      const updated = await restFetch<RecipeRow[]>(`food_product_recipes?select=${RECIPE_SELECT}&id=eq.${encodeURIComponent(existing.id)}&store_id=eq.${encodeURIComponent(input.storeId)}`, {
        method: 'PATCH', prefer: 'return=representation', body: {
          name: (input.name || 'Receita principal').trim(), yield_quantity: input.yieldQuantity, yield_unit: input.yieldUnit, notes: input.notes?.trim() || null, active: true,
        },
      });
      if (!updated[0]) throw new Error('A ficha técnica não pôde ser atualizada.');
      recipe = updated[0];
      await restFetch(`food_product_recipe_items?recipe_id=eq.${encodeURIComponent(recipe.id)}&store_id=eq.${encodeURIComponent(input.storeId)}`, { method: 'DELETE' });
    } else {
      const created = await restFetch<RecipeRow[]>(`food_product_recipes?select=${RECIPE_SELECT}`, {
        method: 'POST', prefer: 'return=representation', body: {
          store_id: input.storeId, product_id: input.productId, name: (input.name || 'Receita principal').trim(), yield_quantity: input.yieldQuantity, yield_unit: input.yieldUnit, notes: input.notes?.trim() || null, active: true,
        },
      });
      if (!created[0]) throw new Error('A ficha técnica não pôde ser criada.');
      recipe = created[0];
    }
    const rows = await restFetch<RecipeItemRow[]>(`food_product_recipe_items?select=${RECIPE_ITEM_SELECT}`, {
      method: 'POST', prefer: 'return=representation', body: normalizedItems.map((item, index) => ({
        store_id: input.storeId, recipe_id: recipe.id, inventory_item_id: item.inventoryItemId,
        stage: item.stage?.trim() || 'Geral', quantity: item.quantity, unit: item.unit,
        waste_percent: item.wastePercent || 0, sort_order: item.sortOrder ?? index,
      })),
    });
    if (rows.length !== normalizedItems.length) throw new Error('A ficha técnica foi salva, mas alguns insumos não puderam ser vinculados.');
    return mapRecipe(recipe);
  },

  async recordPurchase(input: InventoryPurchaseInput): Promise<InventoryPurchaseResult> {
    if (isDemoMode) throw new Error('O registro de compras de estoque exige o modo conectado ao Supabase.');
    if (!input.items.length) throw new Error('Adicione pelo menos um item à compra.');
    if (input.items.some((item) => !item.inventoryItemId || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      throw new Error('Cada item da compra precisa ter quantidade maior que zero e custo válido.');
    }
    if (new Set(input.items.map((item) => item.inventoryItemId)).size !== input.items.length) {
      throw new Error('O mesmo insumo não pode aparecer duas vezes na mesma compra.');
    }
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
    if (!input.inventoryItemId || !Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
      throw new Error('Informe um ajuste de estoque diferente de zero.');
    }
    if (!input.reason?.trim()) throw new Error('Informe o motivo do ajuste de estoque.');
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

  async commitPhysicalCount(storeId: string, items: Array<{ inventoryItemId: string; countedQuantity: number }>, notes?: string): Promise<{ countId: string; itemsCounted: number; itemsAdjusted: number }> {
    if (isDemoMode) throw new Error('A conferência de estoque exige o modo conectado ao Supabase.');
    if (!items.length || items.some((item) => !item.inventoryItemId || !Number.isFinite(item.countedQuantity) || item.countedQuantity < 0)) {
      throw new Error('Informe saldos físicos válidos para concluir a conferência.');
    }
    const result = await restFetch<Record<string, unknown> | Array<Record<string, unknown>>>('rpc/food_commit_inventory_count', {
      method: 'POST',
      body: {
        p_store_id: storeId,
        p_items: items.map((item) => ({ inventory_item_id: item.inventoryItemId, counted_quantity: item.countedQuantity })),
        p_notes: notes?.trim() || null,
      },
    });
    const payload = rpcResult(result);
    return {
      countId: String(payload.countId ?? payload.count_id ?? ''),
      itemsCounted: Number(payload.itemsCounted ?? payload.items_counted ?? 0),
      itemsAdjusted: Number(payload.itemsAdjusted ?? payload.items_adjusted ?? 0),
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
    if (!draft.name.trim()) throw new Error('Informe o nome do insumo.');
    if (!Number.isFinite(draft.reorderPoint) || draft.reorderPoint < 0) throw new Error('Informe um estoque mínimo válido.');
    if (draft.quantity != null && (!Number.isFinite(draft.quantity) || draft.quantity < 0)) throw new Error('Informe um saldo inicial válido.');
    if (draft.averageUnitCost != null && (!Number.isFinite(draft.averageUnitCost) || draft.averageUnitCost < 0)) throw new Error('Informe um custo médio válido.');
    const itemType = draft.itemType;
    const rows = await restFetch<InventoryItemRow[]>(`food_inventory_items?select=${INVENTORY_ITEM_SELECT}`, {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        store_id: storeId,
        name: draft.name.trim(),
        item_type: itemType,
        unit: draft.unit,
        reorder_point: Math.max(0, draft.reorderPoint || 0),
        low_stock_alert_enabled: draft.lowStockAlertEnabled !== false,
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
