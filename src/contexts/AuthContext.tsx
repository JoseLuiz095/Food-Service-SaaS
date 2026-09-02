import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isDemoMode } from '../lib/config';
import { getSupabaseClient, supabaseClientOrNull } from '../lib/supabase';
import { restFetch, updateAuthenticatedPassword } from '../lib/supabaseRest';
import type { AuthUser, PlatformAdmin, Role } from '../types';

const DEMO_AUTH_KEY = 'foodservice_demo_auth_v1';
const STORE_SELECTION_KEY = 'foodservice.admin.selected-store.v1';
export const DEMO_CREDENTIALS = { email: 'admin@foodservice.demo', password: 'Food@2026' };

export type SignInScope = 'any' | 'store' | 'platform';
export type Membership = { id: string; storeId: string; role: Role; active: boolean; storeName?: string; mustChangePassword: boolean };
type StoreUserRow = { id: string; store_id: string; user_id: string; role: Role; active: boolean; must_change_password?: boolean };
type StoreRow = { id: string; name: string; active: boolean; access_status?: 'online' | 'suspended' };
type PlatformAdminRow = { id: string; user_id: string; name: string; active: boolean };
type LoadedAccess = { memberships: Membership[]; membership: Membership | null; platformAdmin: PlatformAdmin | null };
export type MfaLevel = 'aal1' | 'aal2' | null;

type AuthContextValue = {
  user: AuthUser | null;
  membership: Membership | null;
  memberships: Membership[];
  platformAdmin: PlatformAdmin | null;
  loading: boolean;
  error: string;
  mode: 'demo' | 'supabase';
  mfaLevel: MfaLevel;
  signIn: (email: string, password: string, scope?: SignInScope) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  refreshMfaLevel: () => Promise<MfaLevel>;
  selectStore: (storeId: string) => void;
  completeTemporaryPasswordChange: (currentPassword: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const readDemoAuth = () => { try { return localStorage.getItem(DEMO_AUTH_KEY) === '1'; } catch { return false; } };
const selectedStoreKey = (userId: string) => `${STORE_SELECTION_KEY}:${userId}`;
const readSelectedStore = (userId: string) => { try { return localStorage.getItem(selectedStoreKey(userId)) || ''; } catch { return ''; } };
const saveSelectedStore = (userId: string, storeId: string) => { try { localStorage.setItem(selectedStoreKey(userId), storeId); } catch { /* storage indisponível */ } };
const mapAuthUser = (user: { id: string; email?: string | null }): AuthUser => ({ id: user.id, email: user.email ?? '' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const demoAuthenticated = isDemoMode && readDemoAuth();
  const [user, setUser] = useState<AuthUser | null>(demoAuthenticated ? { id: 'demo-user', email: DEMO_CREDENTIALS.email } : null);
  const [membership, setMembership] = useState<Membership | null>(demoAuthenticated ? { id: 'demo-membership', storeId: '00000000-0000-4000-8000-000000000001', role: 'owner', active: true, storeName: 'Central Food', mustChangePassword: false } : null);
  const [memberships, setMemberships] = useState<Membership[]>(demoAuthenticated && membership ? [membership] : []);
  const [platformAdmin, setPlatformAdmin] = useState<PlatformAdmin | null>(demoAuthenticated ? { id: 'demo-platform-admin', userId: 'demo-user', name: 'Administrador da plataforma', active: true } : null);
  const [mfaLevel, setMfaLevel] = useState<MfaLevel>(demoAuthenticated ? 'aal2' : null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState('');

  const clearAccess = useCallback(() => {
    setUser(null);
    setMembership(null);
    setMemberships([]);
    setPlatformAdmin(null);
    setMfaLevel(null);
  }, []);

  const refreshMfaLevel = useCallback(async (): Promise<MfaLevel> => {
    if (isDemoMode) { setMfaLevel('aal2'); return 'aal2'; }
    const { data, error: mfaError } = await getSupabaseClient().auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError) throw mfaError;
    const next: MfaLevel = data.currentLevel === 'aal2' ? 'aal2' : data.currentLevel === 'aal1' ? 'aal1' : null;
    setMfaLevel(next);
    return next;
  }, []);

  const loadAccess = useCallback(async (authUser: AuthUser, preferredStoreId = ''): Promise<LoadedAccess> => {
    const [adminRows, memberRows] = await Promise.all([
      restFetch<PlatformAdminRow[]>(`food_platform_admins?select=*&user_id=eq.${encodeURIComponent(authUser.id)}&active=eq.true&limit=1`),
      restFetch<StoreUserRow[]>(`food_store_users?select=*&user_id=eq.${encodeURIComponent(authUser.id)}&active=eq.true&order=id.asc`),
    ]);

    const adminRow = adminRows[0];
    const nextPlatformAdmin: PlatformAdmin | null = adminRow
      ? { id: adminRow.id, userId: adminRow.user_id, name: adminRow.name, active: adminRow.active }
      : null;
    setPlatformAdmin(nextPlatformAdmin);

    const eligibleRows = memberRows.filter((row) => ['owner', 'admin'].includes(row.role));
    let nextMemberships: Membership[] = [];
    if (eligibleRows.length) {
      const ids = eligibleRows.map((row) => row.store_id).join(',');
      const stores = await restFetch<StoreRow[]>(`food_stores?select=id,name,active,access_status&id=in.(${ids})&order=name.asc`);
      const byId = new Map(stores.map((store) => [store.id, store]));
      nextMemberships = eligibleRows.flatMap((row) => {
        const store = byId.get(row.store_id);
        if (!store?.active || (store.access_status ?? 'online') !== 'online') return [];
        return [{
          id: row.id,
          storeId: row.store_id,
          role: row.role,
          active: row.active,
          storeName: store.name,
          mustChangePassword: Boolean(row.must_change_password),
        }];
      }).sort((a, b) => (a.storeName || '').localeCompare(b.storeName || '', 'pt-BR'));
    }

    const storedStoreId = preferredStoreId || readSelectedStore(authUser.id);
    const nextMembership = nextMemberships.find((item) => item.storeId === storedStoreId) ?? nextMemberships[0] ?? null;
    if (nextMembership) saveSelectedStore(authUser.id, nextMembership.storeId);
    setMemberships(nextMemberships);
    setMembership(nextMembership);

    if (nextPlatformAdmin) await refreshMfaLevel();
    else setMfaLevel(null);

    return { memberships: nextMemberships, membership: nextMembership, platformAdmin: nextPlatformAdmin };
  }, [refreshMfaLevel]);

  const refreshAccess = useCallback(async () => {
    if (!user) { setMembership(null); setMemberships([]); setPlatformAdmin(null); setMfaLevel(null); return; }
    if (isDemoMode) return;
    await loadAccess(user, membership?.storeId);
  }, [user, membership?.storeId, loadAccess]);

  const selectStore = useCallback((storeId: string) => {
    if (!user) return;
    const next = memberships.find((item) => item.storeId === storeId);
    if (!next) return;
    saveSelectedStore(user.id, storeId);
    setMembership(next);
  }, [memberships, user]);

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return; }
    const supabase = supabaseClientOrNull();
    if (!supabase) { setLoading(false); return; }
    let active = true;

    const hydrate = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;
        if (!data.session?.user) { clearAccess(); return; }
        const authUser = mapAuthUser(data.session.user);
        setUser(authUser);
        const access = await loadAccess(authUser);
        if (!access.platformAdmin && !access.membership && active) setError('Usuário autenticado, mas sem acesso ativo à plataforma.');
      } catch (e) {
        if (active) { clearAccess(); setError(e instanceof Error ? e.message : 'Falha ao carregar acesso.'); }
      } finally {
        if (active) setLoading(false);
      }
    };
    void hydrate();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        clearAccess();
        setLoading(false);
        return;
      }
      const authUser = mapAuthUser(session.user);
      setUser(authUser);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        queueMicrotask(() => { if (active) void loadAccess(authUser).catch((e) => setError(e instanceof Error ? e.message : 'Falha ao atualizar acesso.')); });
      }
    });

    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [clearAccess, loadAccess]);

  const signIn = useCallback(async (email: string, password: string, scope: SignInScope = 'any') => {
    setError(''); setLoading(true);
    try {
      if (isDemoMode) {
        if (email.trim().toLowerCase() !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
          setError('Usuário ou senha inválidos.');
          return false;
        }
        localStorage.setItem(DEMO_AUTH_KEY, '1');
        const demoUser = { id: 'demo-user', email: DEMO_CREDENTIALS.email };
        const demoMembership: Membership = { id: 'demo-membership', storeId: '00000000-0000-4000-8000-000000000001', role: 'owner', active: true, storeName: 'Central Food', mustChangePassword: false };
        const demoPlatformAdmin = { id: 'demo-platform-admin', userId: 'demo-user', name: 'Administrador da plataforma', active: true };
        setUser(demoUser); setMembership(demoMembership); setMemberships([demoMembership]); setPlatformAdmin(demoPlatformAdmin); setMfaLevel('aal2');
        return true;
      }

      const supabase = getSupabaseClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      if (!data.user) throw new Error('Supabase não retornou o usuário autenticado.');
      const authUser = mapAuthUser(data.user);
      setUser(authUser);
      const access = await loadAccess(authUser);

      if (scope === 'platform' && !access.platformAdmin) throw new Error('Este usuário não está cadastrado como Administrador Master da plataforma.');
      if (scope === 'store' && !access.membership) throw new Error('Este usuário não possui acesso ativo a uma loja. A loja pode estar suspensa ou o vínculo está inativo.');
      if (scope === 'any' && !access.platformAdmin && !access.membership) throw new Error('Usuário autenticado, mas sem acesso ativo à plataforma.');
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível entrar.';
      setError(message);
      if (!isDemoMode) await getSupabaseClient().auth.signOut().catch(() => undefined);
      clearAccess();
      return false;
    } finally { setLoading(false); }
  }, [clearAccess, loadAccess]);

  const signOut = useCallback(async () => {
    if (isDemoMode) localStorage.removeItem(DEMO_AUTH_KEY);
    else await getSupabaseClient().auth.signOut();
    clearAccess();
    setError('');
  }, [clearAccess]);

  const completeTemporaryPasswordChange = useCallback(async (currentPassword: string, newPassword: string) => {
    if (isDemoMode) throw new Error('Troca de senha temporária disponível apenas com Supabase ativo.');
    if (!membership) throw new Error('Vínculo da loja não encontrado.');
    await updateAuthenticatedPassword(currentPassword, newPassword);
    await restFetch<unknown>(`food_store_users?id=eq.${encodeURIComponent(membership.id)}`, { method:'PATCH', body:{ must_change_password:false } });
    await refreshAccess();
  }, [membership, refreshAccess]);

  const value = useMemo<AuthContextValue>(() => ({
    user, membership, memberships, platformAdmin, loading, error, mode: isDemoMode ? 'demo' : 'supabase', mfaLevel,
    signIn, signOut, refreshAccess, refreshMfaLevel, selectStore, completeTemporaryPasswordChange,
  }), [user, membership, memberships, platformAdmin, loading, error, mfaLevel, signIn, signOut, refreshAccess, refreshMfaLevel, selectStore, completeTemporaryPasswordChange]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return value;
};
