import { Bell, CheckCircle2, CircleAlert, Info, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTimeBR } from '../../utils/format';
import { pwaPushStatus, requestPwaNotificationPermission, showPwaNotification, subscribeToPwaPush } from '../../services/pwaNotifications';
import { inventoryApi } from '../../services/inventoryApi';
import type { Order } from '../../types';

const seenReminderKey = (storeId: string, orderId: string, scheduledFor: string) => `foodweb-notification-reminder:${storeId}:${orderId}:${scheduledFor}`;

const playAlertSound = () => {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.26);
    window.setTimeout(() => void context.close(), 400);
  } catch { /* Alguns navegadores bloqueiam áudio sem uma interação prévia. */ }
};

export function AdminNotifications() {
  const { settings, orders, loading, reloadOrders } = useStore();
  const { user, membership } = useAuth();
  const location = useLocation();
  const isOrdersScreen = location.pathname === '/admin/pedidos';
  const initialized = useRef(false);
  const initializedStoreId = useRef('');
  const knownOrderIds = useRef(new Set<string>());
  const knownPaymentStatus = useRef(new Map<string, Order['paymentStatus']>());
  const pushSynced = useRef(false);
  const subscriptionSyncedFor = useRef('');
  const [unread, setUnread] = useState(0);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [pushStatus, setPushStatus] = useState(() => pwaPushStatus());
  const [testing, setTesting] = useState(false);
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [testError, setTestError] = useState('');
  const [testFeedback, setTestFeedback] = useState('');
  const [pushRegistered, setPushRegistered] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scope = `${membership?.storeId || ''}:${user?.id || ''}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const storeReady = !loading && Boolean(settings.id && settings.id === membership?.storeId);

  const refreshNotificationStatus = () => {
    setPermission(typeof Notification === 'undefined' ? null : Notification.permission);
    setPushStatus(pwaPushStatus());
  };

  const sendTestNotification = async () => {
    if (!storeReady || !membership || !user || testing) return;
    const requestedScope = scope;
    setTesting(true);
    setTestError('');
    setTestFeedback('');
    try {
      const nextPermission = await requestPwaNotificationPermission();
      if (currentScope.current !== requestedScope) return;
      setPermission(nextPermission);
      setPushStatus(pwaPushStatus());
      if (nextPermission !== 'granted') {
        setTestError(nextPermission === 'denied'
          ? 'As notificações estão bloqueadas. Permita os avisos nas configurações deste site e tente novamente.'
          : nextPermission === null ? 'Este navegador não oferece notificações.' : 'A permissão não foi concedida. Você pode tentar novamente.');
        return;
      }
      if (settings.notificationsDesktopEnabled && pwaPushStatus() === 'available') {
        await subscribeToPwaPush(membership.storeId, user.id);
        if (currentScope.current !== requestedScope) return;
        pushSynced.current = true;
        subscriptionSyncedFor.current = `${settings.id}:${membership.storeId}:${user.id}`;
        setPushRegistered(true);
      }
      const delivered = await showPwaNotification('Teste de notificações', 'Aviso de teste da VendeWeb.', { tag: `notification-test:${settings.id}` });
      if (currentScope.current !== requestedScope) return;
      if (!delivered) {
        setTestError('O navegador não confirmou o envio. Confira as permissões do sistema e tente novamente.');
        return;
      }
      setTestFeedback('Teste enviado ao navegador. Confira o aviso neste dispositivo.');
      setLastSignalAt(new Date().toISOString());
    } catch {
      if (currentScope.current !== requestedScope) return;
      setPushRegistered(false);
      setTestError('Não foi possível concluir o teste. Confira a conexão e tente novamente.');
      refreshNotificationStatus();
    } finally {
      if (currentScope.current === requestedScope) setTesting(false);
    }
  };

  useEffect(() => {
    setUnread(0); setLastSignalAt(null); setTestError(''); setTestFeedback('');
    setDiagnosticOpen(false); setTesting(false); setPushRegistered(false);
    pushSynced.current = false; subscriptionSyncedFor.current = '';
    initialized.current = false; initializedStoreId.current = '';
    knownOrderIds.current.clear(); knownPaymentStatus.current.clear();
  }, [scope]);

  useEffect(() => {
    if (!diagnosticOpen) return;
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setDiagnosticOpen(false); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [diagnosticOpen]);

  useEffect(() => {
    // Aguarda o primeiro snapshot completo. Antes disso o contexto ainda tem
    // uma lista vazia; tratá-la como base fazia todos os pedidos históricos
    // parecerem novos assim que chegavam do Supabase.
    if (!storeReady) return;
    if (!initialized.current || initializedStoreId.current !== settings.id) {
      initializedStoreId.current = settings.id;
      knownOrderIds.current = new Set(orders.map((order) => order.id));
      knownPaymentStatus.current = new Map(orders.map((order) => [order.id, order.paymentStatus]));
      initialized.current = true;
      return;
    }

    const freshOrders = orders.filter((order) => !knownOrderIds.current.has(order.id));
    const newlyPaidOrders = orders.filter((order) => (
      order.status !== 'cancelled'
      && order.paymentStatus === 'paid'
      && knownPaymentStatus.current.get(order.id) === 'pending'
    ));
    // Atualiza a base com todos os registros, inclusive cancelados, para que
    // uma alteração de status nunca seja interpretada como um novo pedido.
    orders.forEach((order) => {
      knownOrderIds.current.add(order.id);
      knownPaymentStatus.current.set(order.id, order.paymentStatus);
    });
    freshOrders.forEach((order) => {
      // Pedidos cancelados/testes não devem gerar alerta de pedido novo.
      if (order.status === 'cancelled') return;
      if (!settings.notificationsNewOrderEnabled) return;
      const label = `Pedido #${order.orderNumber || order.id.slice(0, 8)}`;
      const detail = `${order.customerName} · R$ ${order.total.toFixed(2).replace('.', ',')}`;
      setUnread((value) => value + 1);
      setLastSignalAt(new Date().toISOString());
      if (settings.notificationsSoundEnabled) playAlertSound();
      if (settings.notificationsDesktopEnabled) void showPwaNotification('Novo pedido na loja', `${label} · ${detail}`, { tag: `new-order:${order.id}` });
    });

    // O recebimento do PIX altera apenas o pagamento do pedido. Ele não cria
    // um novo registro e, por isso, não passava pelo alerta de pedido novo.
    // Detectamos somente a transição pendente -> pago, evitando repetir avisos
    // em cada recarga ou para pedidos já pagos no snapshot inicial.
    newlyPaidOrders.forEach((order) => {
      if (!settings.notificationsDesktopEnabled) return;
      const label = `Pedido #${order.orderNumber || order.id.slice(0, 8)}`;
      const detail = `${order.customerName} · R$ ${order.total.toFixed(2).replace('.', ',')}`;
      setUnread((value) => value + 1);
      setLastSignalAt(new Date().toISOString());
      if (settings.notificationsSoundEnabled) playAlertSound();
      void showPwaNotification('Pagamento confirmado', `${label} · ${detail}`, { tag: `payment-confirmed:${order.id}` });
    });

    if (settings.notificationsScheduledEnabled) {
      const now = Date.now();
      const lead = settings.notificationsScheduledLeadMinutes * 60_000;
      orders.forEach((order) => {
        if (!order.scheduledFor || order.status === 'cancelled') return;
        const scheduled = new Date(order.scheduledFor).getTime();
        if (!Number.isFinite(scheduled) || scheduled <= now || scheduled - now > lead) return;
        const key = seenReminderKey(settings.id, order.id, order.scheduledFor);
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
        const label = `Pedido #${order.orderNumber || order.id.slice(0, 8)}`;
        const detail = `${order.customerName} · ${formatDateTimeBR(order.scheduledFor)}`;
        setUnread((value) => value + 1);
        setLastSignalAt(new Date().toISOString());
        if (settings.notificationsSoundEnabled) playAlertSound();
        if (settings.notificationsDesktopEnabled) void showPwaNotification('Pedido agendado próximo', `${label} · ${detail}`, { tag: `scheduled-order:${order.id}` });
      });
    }
  }, [storeReady, orders, settings]);

  useEffect(() => {
    // Nunca abra o pedido de permissão automaticamente. Em celulares e no
    // navegador interno, isso costuma falhar antes de existir interação e
    // deixa a primeira abertura do painel com uma mensagem confusa. Depois
    // de o lojista optar por ativar no botão abaixo, a assinatura continua
    // sendo sincronizada normalmente nas próximas aberturas.
    if (!storeReady || !membership?.storeId || !user?.id || !settings.notificationsDesktopEnabled) return;
    const syncKey = `${settings.id}:${membership.storeId}:${user.id}`;
    if (subscriptionSyncedFor.current === syncKey) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    subscriptionSyncedFor.current = syncKey;
    pushSynced.current = false;
    let cancelled = false;

    const syncGrantedSubscription = async () => {
      if (cancelled) return;
      const status = pwaPushStatus();
      if (status === 'not_configured' || status === 'unsupported' || status === 'blocked') return;
      if (pushSynced.current) return;
      pushSynced.current = true;
      void subscribeToPwaPush(membership.storeId, user.id).then(() => {
        if (!cancelled) setPushRegistered(true);
      }).catch(() => {
        // O alerta local continua funcionando quando o servidor VAPID ainda
        // não foi configurado ou quando a assinatura antiga foi revogada.
        if (!cancelled) {
          pushSynced.current = false;
          subscriptionSyncedFor.current = '';
          setPushRegistered(false);
        }
      });
    };

    void syncGrantedSubscription();
    return () => { cancelled = true; };
  }, [storeReady, membership?.storeId, settings.id, settings.notificationsDesktopEnabled, user?.id]);

  useEffect(() => {
    // A tela de pedidos já atualiza a lista a cada 15 segundos. Mantemos
    // este ciclo para as demais telas do painel, mas o desligamos naquela
    // rota para não duplicar a mesma consulta ao Supabase.
    if (isOrdersScreen) return;
    if (!storeReady) return;
    let inFlight = false;
    const refresh = () => {
      if (document.visibilityState === 'hidden' || inFlight) return;
      inFlight = true;
      void reloadOrders({ silent: true }).catch(() => undefined).finally(() => { inFlight = false; });
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = window.setInterval(refresh, 60_000);
    return () => { document.removeEventListener('visibilitychange', onVisibilityChange); window.clearInterval(interval); };
  }, [isOrdersScreen, storeReady, reloadOrders, settings.id]);

  useEffect(() => {
    // O painel administrativo também verifica insumos em segundo plano. O
    // estado local evita repetir o mesmo aviso enquanto o saldo continuar
    // abaixo do mínimo configurado.
    if (!storeReady || !settings.notificationsDesktopEnabled) return;
    let cancelled = false;
    const checkLowStock = async () => {
      try {
        const items = await inventoryApi.listLowStock(settings.id);
        if (cancelled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        for (const item of items) {
          const key = `foodweb:low-stock-alert:${settings.id}:${item.id}`;
          let previous = '';
          try { previous = window.localStorage.getItem(key) || ''; } catch { /* segue sem deduplicação local */ }
          if (previous === 'low') continue;
          try { window.localStorage.setItem(key, 'low'); } catch { /* o alerta ainda é útil */ }
          void showPwaNotification('Estoque baixo', `${item.name}: ${item.currentQuantity} ${item.unit} · mínimo ${item.reorderPoint} ${item.unit}`, { tag: `low-stock:${settings.id}:${item.id}`, url: '/admin/estoque' });
        }
      } catch {
        // Instalações antigas sem a migration de estoque continuam usando os
        // demais avisos do painel normalmente.
      }
    };
    void checkLowStock();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void checkLowStock(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [storeReady, settings.id, settings.notificationsDesktopEnabled]);

  useEffect(() => {
    refreshNotificationStatus();
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refreshNotificationStatus(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const permissionLabel = permission === 'granted' ? 'Permitida' : permission === 'denied' ? 'Bloqueada' : permission === 'default' ? 'Aguardando escolha' : 'Indisponível';
  const statusIcon = permission === 'granted' ? <CheckCircle2 size={15}/> : permission === 'denied' ? <CircleAlert size={15}/> : <Info size={15}/>;
  const diagnostic = diagnosticOpen && typeof document !== 'undefined' ? createPortal(
    <section className="admin-notification-diagnostic" id="admin-notification-diagnostic" role="dialog" aria-label="Diagnóstico de notificações">
      <div className="admin-notification-diagnostic__heading"><div><span className="eyebrow">CENTRAL DE AVISOS</span><strong>Notificações do painel</strong></div><button ref={closeButtonRef} type="button" className="icon-button" onClick={() => setDiagnosticOpen(false)} aria-label="Fechar diagnóstico"><X size={16}/></button></div>
      <div className="admin-notification-diagnostic__status"><span>{statusIcon} Permissão do navegador</span><strong className={permission === 'granted' ? 'is-ok' : permission === 'denied' ? 'is-error' : ''}>{permissionLabel}</strong></div>
      <div className="admin-notification-diagnostic__status"><span><Bell size={15}/> Push em segundo plano</span><strong>{pushStatus === 'available' ? pushRegistered ? 'Assinatura registrada' : 'Aguardando ativação' : pushStatus === 'not_configured' ? 'Ainda não configurado' : pushStatus === 'blocked' ? 'Bloqueado' : 'Indisponível'}</strong></div>
      {lastSignalAt && <small className="admin-notification-diagnostic__last">Último sinal recebido nesta sessão: {formatDateTimeBR(lastSignalAt)}</small>}
      <button type="button" className="secondary-button admin-notification-diagnostic__test" onClick={() => void sendTestNotification()} disabled={testing || !storeReady}>{testing ? <Loader2 className="spin" size={15}/> : <Bell size={15}/>} {testing ? 'Enviando teste...' : permission === 'default' ? 'Ativar e testar notificações' : 'Enviar notificação de teste'}</button>
      {testError && <p role="alert">{testError}</p>}
      {testFeedback && <p role="status">{testFeedback}</p>}
      <div className="admin-notification-diagnostic__links"><Link to="/admin/pedidos" onClick={() => setDiagnosticOpen(false)}>Ver pedidos →</Link><Link to="/admin/estoque" onClick={() => setDiagnosticOpen(false)}>Ver estoque →</Link></div>
      <p>Pedidos novos, pagamentos confirmados e agendamentos próximos são verificados ao abrir o painel e enquanto esta aba estiver ativa.</p>
    </section>,
    document.body,
  ) : null;

  return <div className="admin-notification-center">
    <button type="button" className={`admin-notification-badge${unread ? ' has-unread' : ''}`} onClick={() => { setUnread(0); setDiagnosticOpen((value) => !value); refreshNotificationStatus(); }} title="Abrir diagnóstico de notificações" aria-expanded={diagnosticOpen} aria-controls="admin-notification-diagnostic" aria-label={unread ? `${unread} alerta${unread === 1 ? '' : 's'} nova${unread === 1 ? '' : 's'}; abrir diagnóstico` : 'Abrir diagnóstico de notificações'}><Bell size={16}/>{unread ? <span>{unread > 9 ? '9+' : unread}</span> : null}</button>
    {diagnostic}
  </div>;
}
