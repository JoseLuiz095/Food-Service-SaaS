import { isDemoMode } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';

// shared_future: a lista de pedidos do painel é limitada; totais vêm do banco.
export type DashboardMetrics = {
  timezone: string;
  asOf: string;
  ordersTotal: number;
  cancelledOrders: number;
  ordersToday: number;
  pendingPayments: number;
  pendingAmount: number;
  processingOrders: number;
  scheduledToday: number;
  paidOrders: number;
  totalReceived: number;
  receivedToday: number;
  receivedTodayCount: number;
};

const numericFields: Array<keyof Omit<DashboardMetrics, 'timezone' | 'asOf'>> = [
  'ordersTotal', 'cancelledOrders', 'ordersToday', 'pendingPayments', 'pendingAmount',
  'processingOrders', 'scheduledToday', 'paidOrders', 'totalReceived', 'receivedToday', 'receivedTodayCount',
];

export const dashboardApi = {
  async getMetrics(storeId: string): Promise<DashboardMetrics> {
    if (isDemoMode) throw new Error('Indicadores financeiros exigem dados reais do servidor.');
    const payload = await restFetch<DashboardMetrics>('rpc/food_dashboard_metrics_v1', {
      method: 'POST', body: { p_store_id: storeId },
    });
    if (!payload || typeof payload.timezone !== 'string' || !payload.timezone ||
        typeof payload.asOf !== 'string' || !Number.isFinite(Date.parse(payload.asOf)) ||
        numericFields.some((field) => typeof payload[field] !== 'number' || !Number.isFinite(payload[field]) || payload[field] < 0)) {
      throw new Error('O servidor retornou indicadores incompletos; tente atualizar o painel.');
    }
    return payload;
  },
};
