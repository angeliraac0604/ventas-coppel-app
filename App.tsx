import React, { useState, useEffect } from 'react';
import { Smartphone, LayoutList, BarChart3, Menu, X, CalendarCheck, Plus, LogOut, User as UserIcon, ChevronRight, Loader2, RefreshCcw, Database, AlertTriangle, Copy, Check, Shield, ShieldAlert, Wand2, Clock, Building, TrendingUp, Bell, CheckCircle } from 'lucide-react';
import SalesForm from './components/SalesForm';
import SalesList from './components/SalesList';
import Dashboard from './components/Dashboard';
import DailyClosings from './components/DailyClosings';
import Warranties from './components/Warranties';
import AttendanceManager from './components/AttendanceManager';
import AdminPanel from './components/AdminPanel';
import SupervisionPanel from './components/SupervisionPanel';
import RequestsPanel from './components/RequestsPanel';
import AttendanceReport from './components/AttendanceReport';
import AuthForm from './components/AuthForm';
import CompleteProfile from './components/CompleteProfile';
import { Sale, DailyClose, Brand, UserProfile, Warranty, Store, UserRole } from './types';
import { BRAND_CONFIGS } from './constants';
import posthog from 'posthog-js';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { deleteImageFromDriveScript } from './services/googleAppsScriptService';
import { smartImageUpload } from './services/storageService';
import { RoleSwitcher } from './components/RoleSwitcher';
import { BackupMigration, cleanFirestoreData } from './components/BackupMigration';
import { DatabaseUsagePanel } from './components/DatabaseUsagePanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { db } from './services/firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getInitialSales, getInitialClosings } from './services/initialData';

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingResolutions, setPendingResolutions] = useState<any[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Developer Session State
  const [isDeveloperSession, setIsDeveloperSession] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dev_session') === 'true';
    } catch {
      return false;
    }
  });

  const [simulatedRole, setSimulatedRole] = useState<UserRole>(() => {
    try {
      return (localStorage.getItem('dev_simulated_role') as UserRole) || 'developer';
    } catch {
      return 'developer';
    }
  });

  // Only angeliraac2001@outlook.com or active dev session is developer. angeliraac@gmail.com is regular admin!
  const isDeveloper = isDeveloperSession || userProfile?.role === 'developer' || userProfile?.email === 'angeliraac2001@outlook.com';
  const effectiveRole: UserRole = isDeveloper ? simulatedRole : (userProfile?.role || 'seller');

  const [showAdminNotification, setShowAdminNotification] = useState(() => {
    try {
      // For Admin: Only show once per session
      return sessionStorage.getItem('admin_notified_session') !== 'true';
    } catch {
      return false;
    }
  });

  // App State
  const [currentView, setCurrentView] = useState<'form' | 'list' | 'dashboard' | 'closings' | 'warranties' | 'attendance' | 'attendance-report' | 'admin' | 'supervision' | 'requests' | 'backup-migration' | 'database-usage'>(() => {
    try {
      return (localStorage.getItem('app_current_view') as any) || 'list';
    } catch {
      return 'list';
    }
  });
  const CARDENAS_STORE_ID = 'c90b4652-f98f-472b-acab-0d9bc6b4862e';

  const DEFAULT_STORES: Store[] = [
    {
      id: CARDENAS_STORE_ID,
      name: 'Coppel Cárdenas 1053',
      location: 'Cárdenas, Tabasco',
      prefix: '1053',
      type: 'Coppel',
      entryTime: '09:00',
      exitTime: '19:00',
      lunchDurationMinutes: 60
    },
    {
      id: 'coppel-centro',
      name: 'Coppel Centro',
      location: 'Av. Juárez 100',
      prefix: '1001',
      type: 'Coppel',
      entryTime: '09:00',
      exitTime: '19:00',
      lunchDurationMinutes: 60
    },
    {
      id: 'coppel-plaza',
      name: 'Coppel Plaza Galerías',
      location: 'Plaza Galerías Local 25',
      prefix: '1002',
      type: 'Coppel',
      entryTime: '09:00',
      exitTime: '19:00',
      lunchDurationMinutes: 60
    },
    {
      id: 'coppel-norte',
      name: 'Coppel Norte',
      location: 'Blvd. Norte 820',
      prefix: '1003',
      type: 'Coppel',
      entryTime: '09:00',
      exitTime: '19:00',
      lunchDurationMinutes: 60
    }
  ];

  const [stores, setStores] = useState<Store[]>(() => {
    try {
      const cached = localStorage.getItem('coppel_cached_stores') || localStorage.getItem('app_stores_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_STORES;
  });
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => {
    try {
      return localStorage.getItem('app_selected_store_id') || 'all';
    } catch {
      return 'all';
    }
  });

  const userStore = stores.find(s => s.id === userProfile?.storeId);
  const isCardenas1053 = Boolean(
    userProfile?.storeId === CARDENAS_STORE_ID ||
    userProfile?.assignedStores?.includes(CARDENAS_STORE_ID) ||
    (userStore && (
      userStore.id === CARDENAS_STORE_ID ||
      userStore.name.toLowerCase().includes('cárdenas') ||
      userStore.name.toLowerCase().includes('cardenas') ||
      userStore.name.includes('1053') ||
      userStore.id.toLowerCase().includes('cardenas') ||
      userStore.id.includes('1053')
    ))
  );

  const canAccessWarranties = Boolean(
    effectiveRole === 'admin' || 
    effectiveRole === 'developer' || 
    effectiveRole === 'supervisor' ||
    isCardenas1053
  );

  const isWarrantyAdmin = Boolean(
    effectiveRole === 'admin' || 
    effectiveRole === 'developer' || 
    effectiveRole === 'supervisor' ||
    isCardenas1053
  );

  useEffect(() => {
    // Persistence of view
    try {
      localStorage.setItem('app_current_view', currentView);
    } catch (e) {
      console.warn("Storage access denied:", e);
    }

    // --- HISTORY API INTEGRATION (Back Gesture) ---
    const currentState = window.history.state;
    if (currentState?.view !== currentView) {
      window.history.pushState({ view: currentView }, '');
    }
  }, [currentView]);

  // Persistent Store Selection
  useEffect(() => {
    try {
      localStorage.setItem('app_selected_store_id', selectedStoreId);
    } catch (e) {
      console.warn("Storage access denied:", e);
    }
  }, [selectedStoreId]);

  // Listen for PopState (Back Button)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setCurrentView(event.state.view);
        // Clear edit state if leaving form
        if (event.state.view !== 'form') {
          setSaleToEdit(null);
        }
      } else {
        // Fallback if no state (e.g. initial load)
        setCurrentView('list');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [sales, setSales] = useState<Sale[]>(() => {
    try {
      const cached = localStorage.getItem('coppel_cached_sales') || 
                     localStorage.getItem('app_sales_cache') || 
                     localStorage.getItem('sales');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    const initial = getInitialSales();
    try { localStorage.setItem('coppel_cached_sales', JSON.stringify(initial)); } catch (e) {}
    return initial;
  });
  const [closings, setClosings] = useState<DailyClose[]>(() => {
    try {
      const cached = localStorage.getItem('coppel_cached_closings') || 
                     localStorage.getItem('app_closings_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    const initial = getInitialClosings();
    try { localStorage.setItem('coppel_cached_closings', JSON.stringify(initial)); } catch (e) {}
    return initial;
  });
  const [warranties, setWarranties] = useState<Warranty[]>(() => {
    try {
      const cached = localStorage.getItem('coppel_cached_warranties') || 
                     localStorage.getItem('app_warranties_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);
  const userMapRef = React.useRef<Record<string, { email?: string; fullName?: string }>>({});
  const userProfileRef = React.useRef<UserProfile | null>(userProfile);
  React.useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  // --- SECURITY: Force redirect unauthorized users from admin views ---
  useEffect(() => {
    if (effectiveRole === 'seller' || effectiveRole === 'viewer') {
      const adminViews = ['attendance-report', 'admin', 'supervision', 'requests', 'backup-migration'];
      if (adminViews.includes(currentView)) {
        setCurrentView('list');
      } else if (currentView === 'warranties' && !canAccessWarranties) {
        setCurrentView('list');
      }
    }
  }, [effectiveRole, currentView, canAccessWarranties]);

  // States for Error Handling & Setup
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSetupNeeded, setIsSetupNeeded] = useState(false);

  const [copiedSql, setCopiedSql] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
  const [isDeepSearching, setIsDeepSearching] = useState(false);

  const handleDeepSearch = async (query: string) => {
    if (!query || query.length < 3) return;
    setIsDeepSearching(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          profiles:created_by (
            email,
            full_name
          )
        `)
        .or(`customer_name.ilike.%${query}%,transaction_folio.ilike.%${query}%,invoice_number.ilike.%${query}%`)
        .order('date', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const formatted: Sale[] = data.map((row: any) => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          customerName: row.customer_name,
          price: row.price,
          brand: row.brand as Brand,
          date: row.date,
          ticketImage: row.ticket_image,
          createdBy: row.created_by,
          createdAt: row.created_at,
          createdByEmail: row.profiles?.email,
          createdByName: row.profiles?.full_name,
          storeId: row.store_id,
          transactionFolio: row.transaction_folio,
          category: row.category,
          iccid: row.iccid,
          phoneNumber: row.phone_number,
          portabilityScreenshot: row.portability_screenshot
        }));
        
        setSales(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newItems = formatted.filter(s => !existingIds.has(s.id));
          return [...newItems, ...prev].sort((a, b) => b.date.localeCompare(a.date));
        });
        
        return true; // Found something
      }
      return false; // Nothing found
    } catch (err) {
      console.error("Deep search error:", err);
      return false;
    } finally {
      setIsDeepSearching(false);
    }
  };

  const handleFetchRange = async (start: string, end: string) => {
    if (!start || !end) return;
    setIsDeepSearching(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          profiles:created_by (
            email,
            full_name
          )
        `)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const formatted: Sale[] = data.map((row: any) => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          customerName: row.customer_name,
          price: row.price,
          brand: row.brand as Brand,
          date: row.date,
          ticketImage: row.ticket_image,
          createdBy: row.created_by,
          createdAt: row.created_at,
          createdByEmail: row.profiles?.email,
          createdByName: row.profiles?.full_name,
          storeId: row.store_id,
          transactionFolio: row.transaction_folio,
          category: row.category,
          iccid: row.iccid,
          phoneNumber: row.phone_number,
          portabilityScreenshot: row.portability_screenshot
        }));
        
        setSales(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newItems = formatted.filter(s => !existingIds.has(s.id));
          return [...newItems, ...prev].sort((a, b) => b.date.localeCompare(a.date));
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error("Fetch range error:", err);
      return false;
    } finally {
      setIsDeepSearching(false);
    }
  };

  // --- REAL-TIME NOTIFICATIONS ---
  useEffect(() => {
    if (!session?.user?.id || !userProfile) return;

    // Solo admin recibe alertas de solicitudes
    if (userProfile.role !== 'admin' && userProfile.role !== 'seller') return;

    if (!isSupabaseConfigured) {
      let unsub: (() => void) | undefined;
      try {
        unsub = onSnapshot(collection(db, 'sale_requests'), () => {
          fetchPendingRequestsCount();
        }, (err) => {
          console.warn("Firestore alerts note:", err);
        });
      } catch (e) {
        console.warn("Firestore alerts listener note:", e);
      }
      return () => {
        if (unsub) unsub();
      };
    }

    const channel = supabase
      .channel('sale_requests_alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sale_requests' },
        () => {
          if (userProfile.role === 'admin') {
             fetchPendingRequestsCount();
             if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Nueva Solicitud", { body: "Un vendedor ha enviado una nueva solicitud." });
             }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sale_requests' },
        (payload) => {
           if (payload.new.requester_id === session.user.id || userProfile.role === 'admin') {
              fetchPendingRequestsCount();
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, userProfile?.role]); // Depend on ID and Role to avoid constant re-subs



  // SQL Script Update: Adds Profiles table and stricter policies
  const REQUIRED_SQL = `
-- 1. ESTRUCTURA BÁSICA
create table if not exists public.stores (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  location text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.sales (
  id uuid default gen_random_uuid() primary key,
  invoice_number text not null,
  customer_name text not null,
  price numeric not null,
  brand text not null,
  date text not null,
  ticket_image text,
  created_by uuid references auth.users(id),
  store_id uuid references public.stores(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.daily_closings (
  id uuid default gen_random_uuid() primary key,
  date text not null,
  total_sales numeric not null,
  total_revenue numeric not null,
  closed_at text not null,
  top_brand text not null,
  store_id uuid references public.stores(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(date, store_id)
);

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  role text default 'seller', -- 'admin', 'supervisor', 'seller', 'viewer'
  full_name text,
  store_id uuid references public.stores(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.attendance (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  store_id uuid references public.stores(id),
  type text check (type in ('entry', 'lunch_start', 'lunch_end', 'exit')),
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  date text not null
);

-- 2. SISTEMA DE USUARIOS Y ROLES (TRIGGER)
create or replace function public.handle_new_user()
returns trigger as $$
declare
  assigned_store_id uuid;
  assigned_role text;
begin
  assigned_store_id := (new.raw_user_meta_data->>'store_id')::uuid;
  assigned_role := coalesce(new.raw_user_meta_data->>'role', 'seller');

  insert into public.profiles (id, email, role, full_name, store_id)
  values (
    new.id, 
    new.email, 
    assigned_role, 
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    assigned_store_id
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. SEGURIDAD (RLS)
alter table public.sales enable row level security;
alter table public.daily_closings enable row level security;
alter table public.profiles enable row level security;
alter table public.attendance enable row level security;
alter table public.stores enable row level security;
alter table public.sale_requests enable row level security;
alter table public.monthly_goals enable row level security;
alter table public.warranties enable row level security;

-- Políticas de Cierres (Missing)
create policy "Admins see all closings" on public.daily_closings for select to authenticated using (public.is_admin());
create policy "Supervisors see all closings" on public.daily_closings for select to authenticated using (public.is_supervisor());
create policy "Sellers see store closings" on public.daily_closings for select to authenticated using (store_id = public.get_user_store_id());
create policy "Admins/Supervisors manage closings" on public.daily_closings for all to authenticated using (public.is_admin() or public.is_supervisor());

-- Bloque de Funciones de Ayuda para Políticas
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
end;
$$ language plpgsql security definer;

create or replace function public.get_user_store_id()
returns uuid as $$
declare
  store_id_val uuid;
begin
  select store_id into store_id_val from public.profiles where id = auth.uid();
  return store_id_val;
end;
$$ language plpgsql security definer;

create or replace function public.is_supervisor()
returns boolean as $$
begin
  return exists (select 1 from public.profiles where id = auth.uid() and role in ('supervisor', 'viewer'));
end;
$$ language plpgsql security definer;

-- Políticas de Ventas
create policy "Admins see all sales" on public.sales for select to authenticated using (public.is_admin());
create policy "Supervisors see all sales" on public.sales for select to authenticated using (public.is_supervisor());
create policy "Sellers see their store sales" on public.sales for select to authenticated using (store_id = public.get_user_store_id());
create policy "Sellers insert their store sales" on public.sales for insert to authenticated with check (
  public.is_admin() or (store_id = public.get_user_store_id() and auth.uid() = created_by)
);

-- Políticas de Asistencia
create policy "Admins see all attendance" on public.attendance for select to authenticated using (public.is_admin());
create policy "Users see own attendance" on public.attendance for select to authenticated using (user_id = auth.uid());
create policy "Users insert own attendance" on public.attendance for insert to authenticated with check (user_id = auth.uid());
create policy "Supervisors see attendance" on public.attendance for select to authenticated using (public.is_supervisor());

-- Políticas de Perfiles
create policy "Users see own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Admins see all profiles" on public.profiles for select to authenticated using (public.is_admin());
create policy "Supervisors see all profiles" on public.profiles for select to authenticated using (public.is_supervisor());

-- Políticas de Tiendas
create policy "All authenticated users see stores" on public.stores for select to authenticated using (true);

-- 4. ALMACENAMIENTO (STORAGE)
-- Insertar bucket si no existe
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Políticas de Storage
drop policy if exists "Public Access Receipts" on storage.objects;
drop policy if exists "Auth Upload Receipts" on storage.objects;

create policy "Public Access Receipts" on storage.objects for select using ( bucket_id = 'receipts' );
create policy "Auth Upload Receipts" on storage.objects for insert with check ( bucket_id = 'receipts' and auth.role() = 'authenticated' );

-- 5. METAS MENSUALES
create table if not exists public.monthly_goals (
  month text not null,
  revenue_goal numeric not null,
  devices_goal numeric not null,
  store_id uuid references public.stores(id),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (month, store_id)
);

alter table public.monthly_goals enable row level security;
create policy "Admins see all goals" on public.monthly_goals for select to authenticated using (public.is_admin());
create policy "Supervisors see all goals" on public.monthly_goals for select to authenticated using (public.is_supervisor());
create policy "Sellers see store goals" on public.monthly_goals for select to authenticated using (store_id = public.get_user_store_id());
create policy "Admins upsert goals" on public.monthly_goals for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 6. GARANTÍAS
create table if not exists public.warranties (
  id uuid default gen_random_uuid() primary key,
  reception_date text not null,
  invoice_number text not null,
  brand text not null,
  model text not null,
  imei text,
  issue_description text not null,
  accessories text,
  physical_condition text not null,
  contact_number text not null,
  ticket_image text,
  possible_entry_date text,
  status text not null default 'received',
  store_id uuid references public.stores(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.warranties enable row level security;
create policy "Admins see all warranties" on public.warranties for select to authenticated using (public.is_admin());
create policy "Supervisors see all warranties" on public.warranties for select to authenticated using (public.is_supervisor());
create policy "Sellers see store warranties" on public.warranties for select to authenticated using (store_id = public.get_user_store_id());
create policy "Users insert store warranties" on public.warranties for insert to authenticated with check (store_id = public.get_user_store_id());
create policy "Users update store warranties" on public.warranties for update to authenticated using (store_id = public.get_user_store_id() or public.is_admin() or public.is_supervisor());
create policy "Users delete store warranties" on public.warranties for delete to authenticated using (store_id = public.get_user_store_id() or public.is_admin() or public.is_supervisor());
`;

  const handleDeveloperLogin = () => {
    const devProfile: UserProfile = {
      id: 'dev-isaac-2001',
      email: 'angeliraac2001@outlook.com',
      role: 'developer',
      fullName: 'Ángel Isaac (Desarrollador)',
      storeId: '',
      assignedStores: [],
      canJustifyAbsences: true,
      canManageRestDays: true,
      canForceAttendance: true,
      canSetSchedules: true,
      canSellKit: true,
      canSellChip0: true,
      canSellPortability: true,
      canSellChipExpress: true,
      isDeveloper: true,
      simulatedRole: 'developer'
    };
    setSession({ user: { id: 'dev-isaac-2001', email: 'angeliraac2001@outlook.com' } });
    setUserProfile(devProfile);
    setIsDeveloperSession(true);
    setSimulatedRole('developer');
    setAuthLoading(false);
    try {
      localStorage.setItem('dev_session', 'true');
      localStorage.setItem('dev_simulated_role', 'developer');
    } catch (e) {}
  };

  const handleFirestoreLogin = (fsUser: any) => {
    try {
      localStorage.setItem('firestore_user_session', JSON.stringify(fsUser));
    } catch (e) {}
    setSession({ user: { id: fsUser.id, email: fsUser.email } });
    const effectiveStoreId = fsUser.storeId || fsUser.store_id || CARDENAS_STORE_ID;
    const effectiveAssignedStores = (fsUser.assignedStores && fsUser.assignedStores.length > 0)
      ? fsUser.assignedStores
      : (fsUser.assigned_stores && fsUser.assigned_stores.length > 0)
        ? fsUser.assigned_stores
        : [effectiveStoreId];

    setUserProfile({
      id: fsUser.id,
      email: fsUser.email || '',
      role: fsUser.role || 'seller',
      fullName: fsUser.fullName || fsUser.full_name || fsUser.email?.split('@')[0] || 'COLABORADOR',
      storeId: effectiveStoreId,
      assignedStores: effectiveAssignedStores,
      canJustifyAbsences: !!fsUser.canJustifyAbsences,
      canManageRestDays: !!fsUser.canManageRestDays,
      canForceAttendance: !!fsUser.canForceAttendance,
      canSetSchedules: !!fsUser.canSetSchedules,
      canSellKit: fsUser.canSellKit ?? true,
      canSellChip0: !!fsUser.canSellChip0,
      canSellPortability: !!fsUser.canSellPortability,
      canSellChipExpress: !!fsUser.canSellChipExpress
    });
    setAuthLoading(false);
  };

  // --- AUTH CHECK ---
  useEffect(() => {
    // 1. Revisar si hay sesión de Firestore guardada
    try {
      const fsSessionRaw = localStorage.getItem('firestore_user_session');
      if (fsSessionRaw) {
        const fsUser = JSON.parse(fsSessionRaw);
        if (fsUser && fsUser.id) {
          handleFirestoreLogin(fsUser);
          return;
        }
      }
    } catch (e) {}

    // Si ya hay sesión de desarrollador activa
    if (localStorage.getItem('dev_session') === 'true') {
      handleDeveloperLogin();
      setAuthLoading(false);
      return;
    }

    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    // Safety timeout: If Supabase takes too long (common on slow mobile networks), 
    // force stop loading so user isn't stuck on blue screen.
    const safetyTimeout = setTimeout(() => {
      console.warn("Auth check taking too long, forcing load.");
      setAuthLoading(false);
    }, 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(safetyTimeout);
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      setAuthLoading(false);
    }).catch(() => {
      clearTimeout(safetyTimeout);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (localStorage.getItem('dev_session') === 'true') return;
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setSales([]); // Clear sensitive data on logout
        setClosings([]);
        setWarranties([]);
      }
      setAuthLoading(false);
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  // Safety Auto-fallback: Si hay sesión pero el perfil tarda en responder, autogenerar perfil para evitar pantalla trabada
  useEffect(() => {
    if (session && !userProfile) {
      const timer = setTimeout(() => {
        if (!userProfile) {
          const email = session.user?.email || 'vendedor1053@coppel.com';
          const isDev = email === 'angeliraac2001@outlook.com' || isDeveloperSession;
          setUserProfile({
            id: session.user?.id || 'seller-cardenas-1053',
            email: email,
            role: isDev ? 'developer' : 'seller',
            fullName: isDev ? 'Isaac Ángeles' : (email.split('@')[0]?.toUpperCase() || 'VENDEDOR CÁRDENAS 1053'),
            storeId: CARDENAS_STORE_ID,
            assignedStores: [CARDENAS_STORE_ID],
            canSellKit: true,
            canSellChip0: true,
            canSellPortability: true,
            canSellChipExpress: true
          });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [session, userProfile, isDeveloperSession]);



  const fetchUserProfile = async (userId: string) => {
    try {
      // 1. Obtener el perfil actual
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 2. Buscar si hay una invitación pendiente para este correo
      const { data: invite } = await supabase
        .from('pending_invitations')
        .select('*')
        .eq('email', user.email?.toLowerCase())
        .maybeSingle();

      let finalProfile = profileData;

      if (!profileData) {
        // SI NO EXISTE EL PERFIL: Lo creamos con datos de invitación o metadata
        const metadata = user.user_metadata || {};
        const newProfile = {
          id: user.id,
          email: user.email,
          role: invite?.role || metadata.role || 'seller',
          store_id: invite?.store_id || metadata.store_id || null,
          assigned_stores: invite?.assigned_stores || metadata.assigned_stores || [],
          full_name: metadata.full_name || null,
          can_justify_absences: invite?.can_justify_absences || false,
          can_manage_rest_days: invite?.can_manage_rest_days || false,
          can_force_attendance: invite?.can_force_attendance || false,
          can_set_schedules: invite?.can_set_schedules || false,
          can_sell_kit: invite?.can_sell_kit ?? metadata.can_sell_kit ?? true,
          can_sell_chip_0: invite?.can_sell_chip_0 || metadata.can_sell_chip_0 || false,
          can_sell_portability: invite?.can_sell_portability || metadata.can_sell_portability || false,
          can_sell_chip_express: invite?.can_sell_chip_express || metadata.can_sell_chip_express || false
        };

        const { data: inserted, error: insertError } = await supabase
          .from('profiles')
          .insert([newProfile])
          .select()
          .maybeSingle();
        
        if (!insertError && inserted) {
          finalProfile = inserted;
          // Borrar invitación ya usada
          if (invite && user.email) {
            await supabase.from('pending_invitations').delete().eq('email', user.email.toLowerCase());
          }
        }
      } else if (invite) {
        // SI EL PERFIL YA EXISTE PERO HAY UNA INVITACIÓN: Sincronizamos el rol y la tienda
        // Esto corrige el error cuando el trigger crea el perfil como 'seller' por defecto
        if (profileData.role !== invite.role || profileData.store_id !== invite.store_id) {
          const { data: updated, error: updateError } = await supabase
            .from('profiles')
            .update({
              assigned_stores: invite.assigned_stores || profileData.assigned_stores,
              can_justify_absences: invite.can_justify_absences,
              can_manage_rest_days: invite.can_manage_rest_days,
              can_force_attendance: invite.can_force_attendance,
              can_set_schedules: invite.can_set_schedules,
              can_sell_kit: invite.can_sell_kit,
              can_sell_chip_0: invite.can_sell_chip_0,
              can_sell_portability: invite.can_sell_portability,
              can_sell_chip_express: invite.can_sell_chip_express
            })
            .eq('id', userId)
            .select()
            .maybeSingle();
          
          if (!updateError && updated) {
            finalProfile = updated;
          }
        }
        // Borrar invitación ya usada
        if (user.email) {
          await supabase.from('pending_invitations').delete().eq('email', user.email.toLowerCase());
        }
      }

      if (finalProfile) {
        setUserProfile({
          id: finalProfile.id,
          email: finalProfile.email,
          role: finalProfile.role as UserRole,
          fullName: finalProfile.full_name,
          storeId: finalProfile.store_id,
          assignedStores: finalProfile.assigned_stores || [],
          restDays: finalProfile.rest_days || [],
          vacationDates: finalProfile.vacation_dates || [],
          canJustifyAbsences: finalProfile.can_justify_absences,
          canManageRestDays: finalProfile.can_manage_rest_days,
          canForceAttendance: finalProfile.can_force_attendance,
          canSetSchedules: finalProfile.can_set_schedules,
          canSellKit: finalProfile.can_sell_kit ?? true,
          canSellChip0: finalProfile.can_sell_chip_0 || false,
          canSellPortability: finalProfile.can_sell_portability || false,
          canSellChipExpress: finalProfile.can_sell_chip_express || false
        });

        // Auto-set selectedStoreId if restricted to one store
        const isRestricted = finalProfile.role !== 'admin' && (
           !!finalProfile.store_id || (finalProfile.assigned_stores && finalProfile.assigned_stores.length === 1)
        );
        if (isRestricted) {
           const targetId = finalProfile.store_id || finalProfile.assigned_stores[0];
           setSelectedStoreId(targetId);
        }

        // --- POSTHOG IDENTIFICATION ---
        if (import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN) {
          try {
            posthog.identify(finalProfile.id, {
              email: finalProfile.email,
              name: finalProfile.full_name,
              role: finalProfile.role,
              store: finalProfile.store_id
            });
          } catch (e) {
            console.warn("PostHog identify error:", e);
          }
        }
        
        // --- NOTIFICATION CHECK ---
        checkResolvedRequests(finalProfile.id);
        if (finalProfile.role === 'admin') {
          fetchPendingRequestsCount();
        }
        
        // Redirección inicial según el rol (Solo si no hay una vista guardada previamente)
        const savedView = localStorage.getItem('app_current_view');
        if (!savedView) {
          if (finalProfile.role === 'supervisor') {
            setCurrentView('supervision');
          } else if (finalProfile.role === 'viewer') {
            setCurrentView('dashboard');
          }
        }
      } else {
        // Si después de todo no hay perfil, mostramos error
        setConnectionError("No se pudo cargar o crear tu perfil de usuario. Contacta al administrador.");
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      setConnectionError(`Error de servidor: ${error.message || '403 Forbidden'}`);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('sales_app_session_date');
      localStorage.removeItem('app_current_view');
      localStorage.removeItem('dev_session');
      localStorage.removeItem('dev_simulated_role');
      localStorage.removeItem('firestore_user_session');
    } catch (e) {}
    setIsDeveloperSession(false);
    setSession(null);
    setUserProfile(null);
    setSales([]);
    setClosings([]);
    setWarranties([]);
    try {
      await supabase.auth.signOut();
    } catch (e) {}
  };

  // --- AUTOMATIC MIDNIGHT LOGOUT LOGIC ---
  useEffect(() => {
    if (!session) return;

    const SESSION_DATE_KEY = 'sales_app_session_date';
    
    // Al montar (justo después del login), forzamos que la fecha sea la de hoy
    // para evitar el bucle de logout si había una fecha de ayer guardada.
    const todayStr = new Date().toDateString();
    try {
      localStorage.setItem(SESSION_DATE_KEY, todayStr);
    } catch (e) {}

    const checkMidnight = () => {
      const now = new Date();
      const currentDateStr = now.toDateString();
      let storedDate = null;
      try {
        storedDate = localStorage.getItem(SESSION_DATE_KEY);
      } catch (e) {}

      if (storedDate && storedDate !== currentDateStr) {
        // Solo cerramos sesión si la fecha cambia mientras el usuario ya está activo
        console.log("Cierre de sesión automático: Cambio de día detectado.");
        handleLogout();
      }
    };

    const intervalId = setInterval(checkMidnight, 60000);
    return () => clearInterval(intervalId);
  }, [!!session]); // Se dispara cuando cambia el estado de la sesión

  // --- AUTOMATIC RECOVERY & CLOSE LOGIC ---
  const processingDatesRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session || sales.length === 0 || isLoading) return;

    const runAutomaticClosings = async () => {
      const now = new Date();
      const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const hour = now.getHours();

      // 1. Encontrar todos los días con ventas que NO tienen corte (ordenados por fecha)
      const uniqueSaleDates = Array.from(new Set(sales.map(s => s.date))).sort();
      
      const missingDates = uniqueSaleDates.filter(date => {
        // Ya se está procesando en esta ejecución
        if (processingDatesRef.current.has(date)) return false;

        // No tiene corte registrado en el estado local para MI TIENDA
        const hasClosing = closings.some(c => c.date === date && c.storeId === userProfile?.storeId);
        if (hasClosing) return false;

        // SOLO cerrar automáticamente días PASADOS (Esto hace que el reinicio sea a las 00:00)
        return date < todayStr;
      });

      if (missingDates.length === 0) return;

      console.log(`[Cierre Automático] Se detectaron ${missingDates.length} días sin corte. Iniciando...`);

      for (const date of missingDates) {
        if (processingDatesRef.current.has(date)) continue;
        processingDatesRef.current.add(date);

        try {
          const daySales = sales.filter(s => s.date === date && s.storeId === userProfile?.storeId);
          if (daySales.length === 0) {
            processingDatesRef.current.delete(date);
            continue;
          }

          const revenue = daySales.reduce((sum, s) => sum + s.price, 0);
          
          const counts: Record<string, number> = {};
          daySales.forEach(s => { counts[s.brand] = (counts[s.brand] || 0) + 1; });
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          const topBrand = top ? (top[0] as Brand) : Brand.OTRO;

          const newClose = {
            id: `auto-${date}-${userProfile?.storeId}`,
            date: date,
            total_sales: daySales.filter(s => s.category === 'kit' || !s.category).length,
            total_revenue: revenue,
            closed_at: now.toISOString(),
            top_brand: topBrand as Brand,
            store_id: userProfile?.storeId
          };

          if (!isSupabaseConfigured) {
            const formattedClose: DailyClose = {
              id: (newClose as any).id,
              date: (newClose as any).date,
              totalSales: (newClose as any).total_sales,
              totalRevenue: (newClose as any).total_revenue,
              closedAt: (newClose as any).closed_at,
              topBrand: (newClose as any).top_brand,
              storeId: (newClose as any).store_id
            };
            setClosings(prev => {
              const exists = prev.some(c => c.date === formattedClose.date && c.storeId === formattedClose.storeId);
              if (exists) return prev;
              return [formattedClose, ...prev].sort((a, b) => b.date.localeCompare(a.date));
            });
            continue;
          }

          const { error } = await supabase
            .from('daily_closings')
            .upsert(newClose, { onConflict: 'date,store_id' });

          if (error) {
            processingDatesRef.current.delete(date);
            throw error;
          }

          console.log(`✅ Corte automático realizado para: ${date}`);
          
          // Actualización local segura (Evita duplicados)
          const formattedClose: DailyClose = {
            id: (newClose as any).id,
            date: (newClose as any).date,
            totalSales: (newClose as any).total_sales,
            totalRevenue: (newClose as any).total_revenue,
            closedAt: (newClose as any).closed_at,
            topBrand: (newClose as any).top_brand
          };

          setClosings(prev => {
            // Check if this specific store/date combo already exists
            const exists = prev.some(c => c.date === formattedClose.date && c.storeId === formattedClose.storeId);
            if (exists) return prev;
            return [formattedClose, ...prev].sort((a, b) => b.date.localeCompare(a.date));
          });

        } catch (err) {
          console.error(`Error en corte automático para ${date}:`, err);
          processingDatesRef.current.delete(date);
        }
      }
    };

    const timer = setInterval(runAutomaticClosings, 60000); // Revisar cada minuto
    runAutomaticClosings(); // Ejecutar al cargar

    return () => clearInterval(timer);
  }, [session, sales, closings, isLoading]);

  // Helper para mostrar errores legibles
  const formatError = (error: any): string => {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.error_description) return error.error_description;
    return JSON.stringify(error);
  };


  // --- FETCH DATA (FIRESTORE & SUPABASE) ---
  const fetchData = async () => {
    setIsLoading(false);
    setConnectionError(null);
    setIsSetupNeeded(false);

    try {
      if (!isSupabaseConfigured) {
        // En Firestore, intentamos leer datos solo si las colecciones locales están vacías
        try {
          if (stores.length === 0) {
            const fsStoresSnap = await getDocs(collection(db, 'stores'));
            if (!fsStoresSnap.empty) {
              const loadedStores = fsStoresSnap.docs.map(d => ({
                id: d.id,
                name: d.data().name || 'Sucursal',
                location: d.data().location || '',
                createdAt: d.data().createdAt || d.data().created_at || '',
                prefix: d.data().prefix || '',
                entryTime: d.data().entryTime || d.data().entry_time || '09:00',
                exitTime: d.data().exitTime || d.data().exit_time || '19:00',
                lunchDurationMinutes: Number(d.data().lunchDurationMinutes ?? d.data().lunch_duration_minutes ?? 60),
                daySchedules: d.data().daySchedules || d.data().day_schedules || {}
              }));
              setStores(loadedStores);
              try { localStorage.setItem('coppel_cached_stores', JSON.stringify(loadedStores)); } catch (e) {}
            }
          }
        } catch (e: any) {
          if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota') || e?.message?.includes('quota')) {
            setIsQuotaExhausted(true);
          }
        }
        setIsLoading(false);
        return;
      }

      // 1. Fetch Sales (with profiles join for Admin view) from Supabase if active
      if (isSupabaseConfigured) {
        try {
          const oneMonthAgo = new Date();
          oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
          const dateLimit = oneMonthAgo.toISOString().split('T')[0];

          const { data: salesData, error: salesError } = await supabase
            .from('sales')
            .select(`
              *,
              profiles:created_by (
                email,
                full_name
              )
            `)
            .gte('date', dateLimit)
            .order('date', { ascending: false })
            .range(0, 4999); 

          if (!salesError && salesData && salesData.length > 0) {
            const formattedSales: Sale[] = salesData.map((row: any) => ({
              id: row.id,
              invoiceNumber: row.invoice_number,
              customerName: row.customer_name,
              price: row.price,
              brand: row.brand as Brand,
              date: row.date,
              ticketImage: row.ticket_image,
              createdBy: row.created_by,
              createdAt: row.created_at,
              createdByEmail: row.profiles?.email,
              createdByName: row.profiles?.full_name,
              storeId: row.store_id,
              transactionFolio: row.transaction_folio,
              category: row.category,
              iccid: row.iccid,
              phoneNumber: row.phone_number,
              portabilityScreenshot: row.portability_screenshot
            }));
            setSales(prev => {
              const existingIds = new Set(prev.map(s => s.id));
              const newOnes = formattedSales.filter(s => !existingIds.has(s.id));
              return [...prev, ...newOnes];
            });
          }

          // 2. Fetch Closings from Supabase
          const { data: closingsData, error: closingsError } = await supabase
            .from('daily_closings')
            .select('*')
            .order('date', { ascending: false });

          if (!closingsError && closingsData && closingsData.length > 0) {
            const formattedClosings: DailyClose[] = closingsData.map((row: any) => ({
              id: row.id,
              date: row.date,
              totalSales: row.total_sales,
              totalRevenue: row.total_revenue,
              closedAt: row.closed_at,
              topBrand: row.top_brand,
              storeId: row.store_id,
              attSales: row.att_sales
            }));
            setClosings(prev => {
              const existingIds = new Set(prev.map(c => c.id));
              const newOnes = formattedClosings.filter(c => !existingIds.has(c.id));
              return [...prev, ...newOnes];
            });
          }

          // 3. Fetch Warranties from Supabase
          const { data: warrantiesData } = await supabase
            .from('warranties')
            .select('*')
            .order('reception_date', { ascending: false });

          if (warrantiesData && warrantiesData.length > 0) {
            const formattedWarranties: Warranty[] = warrantiesData.map((row: any) => ({
              id: row.id,
              receptionDate: row.reception_date,
              invoiceNumber: row.invoice_number,
              brand: row.brand as Brand,
              model: row.model,
              imei: row.imei,
              issueDescription: row.issue_description,
              accessories: row.accessories,
              physicalCondition: row.physical_condition,
              contactNumber: row.contact_number,
              ticketImage: row.ticket_image,
              phoneDetails: row.phone_details,
              possibleEntryDate: row.possible_entry_date, 
              status: row.status,
              storeId: row.store_id
            }));
            setWarranties(prev => {
              const existingIds = new Set(prev.map(w => w.id));
              const newOnes = formattedWarranties.filter(w => !existingIds.has(w.id));
              return [...prev, ...newOnes];
            });
          }

          // 4. Fetch Stores from Supabase
          const { data: storesData } = await supabase.from('stores').select('*').order('name');
          if (storesData && storesData.length > 0) {
            setStores(storesData.map((s: any) => ({
              id: s.id,
              name: s.name,
              location: s.location,
              createdAt: s.created_at,
              prefix: s.prefix,
              entryTime: s.entry_time,
              exitTime: s.exit_time,
              lunchDurationMinutes: s.lunch_duration_minutes,
              daySchedules: s.day_schedules || {}
            })));
          }
        } catch (sbErr) {
          console.warn("Supabase fetch note:", sbErr);
        }
      }

    } catch (error: any) {
      console.error('Error fetching data:', error);
      if (!isDeveloper && !isSetupNeeded) {
        setConnectionError(formatError(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- FILTERED DATA logic ---
  const getFilteredData = <T extends { storeId?: string }>(data: T[]) => {
    if (!data || data.length === 0) return [];
    if (!userProfile) return data;

    const matchesStoreAlias = (targetStoreId: string, itemStoreId?: string) => {
      if (!itemStoreId) return false;
      if (itemStoreId === targetStoreId) return true;
      const isTargetCardenas = targetStoreId === CARDENAS_STORE_ID || targetStoreId === 'coppel-cardenas-1053' || targetStoreId.toLowerCase().includes('cardenas') || targetStoreId.includes('1053');
      const isItemCardenas = itemStoreId === CARDENAS_STORE_ID || itemStoreId === 'coppel-cardenas-1053' || itemStoreId.toLowerCase().includes('cardenas') || itemStoreId.includes('1053');
      return isTargetCardenas && isItemCardenas;
    };

    // Admins and Developers see everything (or filter by selectedStoreId)
    if (
      effectiveRole === 'admin' || 
      effectiveRole === 'developer' || 
      userProfile?.role === 'admin' || 
      userProfile?.role === 'developer' || 
      isDeveloper
    ) {
      if (!selectedStoreId || selectedStoreId === 'all') {
        return data;
      }
      return data.filter(item => !item.storeId || matchesStoreAlias(selectedStoreId, item.storeId));
    }

    // Supervisors and Viewers: handle "Global" vs "Area" access
    if (effectiveRole === 'supervisor' || effectiveRole === 'viewer' || userProfile?.role === 'supervisor' || userProfile?.role === 'viewer') {
      const storesFromProfile = [
        ...(userProfile.storeId ? [userProfile.storeId] : []),
        ...(userProfile.assignedStores || [])
      ];
      
      const allowedStores = storesFromProfile.length > 0 ? storesFromProfile : null;

      const baseData = allowedStores 
        ? data.filter(item => !item.storeId || allowedStores.some(sId => matchesStoreAlias(sId, item.storeId)))
        : data;

      return (!selectedStoreId || selectedStoreId === 'all') 
        ? baseData 
        : baseData.filter(item => matchesStoreAlias(selectedStoreId, item.storeId));
    }

    // Default (Sellers): show their store or assigned stores, or all if unassigned
    const userStores = [
      ...(userProfile?.storeId ? [userProfile.storeId] : []),
      ...(userProfile?.assignedStores || [])
    ];

    if (userStores.length === 0) return data;

    const sellerMatches = data.filter(item => {
      if (!item.storeId) return true; // Don't discard unassigned records
      return userStores.some(sId => matchesStoreAlias(sId, item.storeId));
    });

    // If strict filter yielded nothing but records exist, show them so user isn't locked out
    return sellerMatches.length > 0 ? sellerMatches : data;
  };

  const filteredSales = getFilteredData(sales);
  const filteredClosings = getFilteredData(closings as any[]) as DailyClose[];
  const filteredWarranties = getFilteredData(warranties);

  // Auto-reset store filter if selected store doesn't exist in loaded stores
  useEffect(() => {
    if (stores.length > 0 && selectedStoreId !== 'all') {
      const exists = stores.some(s => s.id === selectedStoreId);
      if (!exists) {
        console.log(`[Store Filter] Sucursal '${selectedStoreId}' no encontrada en sucursales activas. Restableciendo a 'all'.`);
        setSelectedStoreId('all');
      }
    }
  }, [stores, selectedStoreId]);

  const authSessionId = session?.user?.id || (isDeveloperSession ? 'dev-session' : null);

  useEffect(() => {
    if (!authSessionId) return;

    if (!isSupabaseConfigured) {
      console.log("🔥 [Firestore Realtime] Sincronización en tiempo real activa para ventas, garantías, cortes y sucursales.");

      // 1. Usuarios en tiempo real para nombres y creadores
      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const map: Record<string, { email?: string; fullName?: string }> = {};
        snapshot.docs.forEach(uDoc => {
          const uData = uDoc.data();
          map[uDoc.id] = {
            email: uData.email,
            fullName: uData.fullName || uData.full_name
          };
        });
        userMapRef.current = map;
      }, (err) => console.warn("Realtime users error:", err));

      // 2. Sucursales en tiempo real
      const unsubStores = onSnapshot(collection(db, 'stores'), (snapshot) => {
        if (!snapshot.empty) {
          const liveStores: Store[] = snapshot.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || 'Sucursal',
              location: data.location || '',
              createdAt: data.createdAt || data.created_at || '',
              prefix: data.prefix || '',
              entryTime: data.entryTime || data.entry_time || '09:00',
              exitTime: data.exitTime || data.exit_time || '19:00',
              lunchDurationMinutes: Number(data.lunchDurationMinutes ?? data.lunch_duration_minutes ?? 60),
              daySchedules: data.daySchedules || data.day_schedules || {}
            };
          });
          setStores(liveStores);
          try { localStorage.setItem('coppel_cached_stores', JSON.stringify(liveStores)); } catch (e) {}
        }
      }, (err) => {
        console.warn("Realtime stores error:", err);
        setStores(prev => {
          if (prev && prev.length > 0) return prev;
          try {
            const cached = localStorage.getItem('coppel_cached_stores');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
          } catch (e) {}
          return DEFAULT_STORES;
        });
      });

      // 3. Ventas en tiempo real para todos los usuarios
      const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
        if (snapshot.empty) {
          setSales(prev => {
            if (prev && prev.length > 0) return prev;
            try {
              const cached = localStorage.getItem('coppel_cached_sales');
              if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
              }
            } catch (e) {}
            return getInitialSales();
          });
          setIsLoading(false);
          return;
        }

        const userMap = userMapRef.current;
        const liveSales: Sale[] = snapshot.docs.map(d => {
          const data = d.data();
          const creatorInfo = userMap[data.createdBy || data.created_by] || {};
          return {
            id: d.id,
            invoiceNumber: data.invoiceNumber || data.invoice_number || 'S/N',
            customerName: data.customerName || data.customer_name || 'Cliente',
            price: Number(data.price || 0),
            brand: (data.brand || 'OTRO') as Brand,
            date: data.date || '',
            ticketImage: data.ticketImage || data.ticket_image || '',
            createdBy: data.createdBy || data.created_by || '',
            createdAt: data.createdAt || data.created_at || '',
            createdByEmail: data.createdByEmail || creatorInfo.email || data.profiles?.email || '',
            createdByName: data.createdByName || creatorInfo.fullName || data.profiles?.full_name || '',
            storeId: data.storeId || data.store_id || '',
            transactionFolio: data.transactionFolio || data.transaction_folio || '',
            category: (data.category || 'kit').toLowerCase() as any,
            iccid: data.iccid || '',
            phoneNumber: data.phoneNumber || data.phone_number || '',
            portabilityScreenshot: data.portabilityScreenshot || data.portability_screenshot || ''
          } as Sale;
        });

        // Orden estricto: fecha desc, luego fecha de creación desc, luego id
        const sortedSales = liveSales.sort((a, b) => {
          const dateCmp = (b.date || '').localeCompare(a.date || '');
          if (dateCmp !== 0) return dateCmp;
          const createdCmp = (b.createdAt || '').localeCompare(a.createdAt || '');
          if (createdCmp !== 0) return createdCmp;
          return b.id.localeCompare(a.id);
        });

        setSales(sortedSales);
        try { localStorage.setItem('coppel_cached_sales', JSON.stringify(sortedSales)); } catch (e) {}
        setIsLoading(false);
      }, (err: any) => {
        console.warn("Realtime sales error (operando con datos locales y caché):", err);
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota') || err?.message?.includes('quota')) {
          setIsQuotaExhausted(true);
        }
        setSales(prev => {
          if (prev && prev.length > 0) return prev;
          try {
            const cached = localStorage.getItem('coppel_cached_sales');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
          } catch (e) {}
          return getInitialSales();
        });
        setIsLoading(false);
      });

      // 4. Garantías en tiempo real
      const unsubWarranties = onSnapshot(collection(db, 'warranties'), (snapshot) => {
        if (!snapshot.empty) {
          const liveWarranties: Warranty[] = snapshot.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              receptionDate: data.receptionDate || data.reception_date || '',
              invoiceNumber: data.invoiceNumber || data.invoice_number || '',
              brand: (data.brand || 'OTRO') as Brand,
              model: data.model || '',
              imei: data.imei || '',
              issueDescription: data.issueDescription || data.issue_description || '',
              accessories: data.accessories || '',
              physicalCondition: data.physicalCondition || data.physical_condition || '',
              contactNumber: data.contactNumber || data.contact_number || '',
              ticketImage: data.ticketImage || data.ticket_image || '',
              phoneDetails: data.phoneDetails || data.phone_details || '',
              possibleEntryDate: data.possibleEntryDate || data.possible_entry_date || '',
              status: data.status || 'received',
              storeId: data.storeId || data.store_id || ''
            } as Warranty;
          });
          setWarranties(liveWarranties);
          try { localStorage.setItem('coppel_cached_warranties', JSON.stringify(liveWarranties)); } catch (e) {}
        }
      }, (err) => {
        console.warn("Realtime warranties error:", err);
        setWarranties(prev => {
          if (prev && prev.length > 0) return prev;
          try {
            const cached = localStorage.getItem('coppel_cached_warranties');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
          } catch (e) {}
          return [];
        });
      });

      // 5. Cierres diarios en tiempo real
      const unsubClosings = onSnapshot(collection(db, 'daily_closings'), (snapshot) => {
        if (!snapshot.empty) {
          const liveClosings: DailyClose[] = snapshot.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              date: data.date || '',
              totalSales: Number(data.totalSales ?? data.total_sales ?? 0),
              totalRevenue: Number(data.totalRevenue ?? data.total_revenue ?? 0),
              closedAt: data.closedAt || data.closed_at || '',
              topBrand: data.topBrand || data.top_brand || 'OTRO',
              storeId: data.storeId || data.store_id || '',
              attSales: Number(data.attSales ?? data.att_sales ?? 0),
              kitCount: data.kitCount ?? data.kit_count,
              chip0Count: data.chip0Count ?? data.chip_0_count,
              portabilityCount: data.portabilityCount ?? data.portability_count,
              chipExpressCount: data.chipExpressCount ?? data.chip_express_count
            } as DailyClose;
          });
          const sortedClosings = liveClosings.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          setClosings(sortedClosings);
          try { localStorage.setItem('coppel_cached_closings', JSON.stringify(sortedClosings)); } catch (e) {}
        }
      }, (err) => {
        console.warn("Realtime closings error:", err);
        setClosings(prev => {
          if (prev && prev.length > 0) return prev;
          try {
            const cached = localStorage.getItem('coppel_cached_closings');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
          } catch (e) {}
          return getInitialClosings();
        });
      });

      return () => {
        unsubUsers();
        unsubStores();
        unsubSales();
        unsubWarranties();
        unsubClosings();
      };
    }

    // Realtime Subscription
    fetchData();
    const channel = supabase
      .channel('db_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newSale: Sale = {
              id: payload.new.id,
              invoiceNumber: payload.new.invoice_number,
              customerName: payload.new.customer_name,
              price: payload.new.price,
              brand: payload.new.brand as Brand,
              date: payload.new.date,
              ticketImage: payload.new.ticket_image,
              createdBy: payload.new.created_by,
              createdAt: payload.new.created_at,
              storeId: payload.new.store_id,
              category: payload.new.category,
              iccid: payload.new.iccid,
              phoneNumber: payload.new.phone_number,
              portabilityScreenshot: payload.new.portability_screenshot
            };
            setSales(prev => [newSale, ...prev]);
          } else if (payload.eventType === 'DELETE') {
            setSales(prev => prev.filter(s => s.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setSales(prev => prev.map(s => s.id === payload.new.id ? {
              ...s,
              invoiceNumber: payload.new.invoice_number,
              customerName: payload.new.customer_name,
              price: payload.new.price,
              brand: payload.new.brand as Brand,
              date: payload.new.date,
              ticketImage: payload.new.ticket_image,
              category: payload.new.category,
              iccid: payload.new.iccid,
              phoneNumber: payload.new.phone_number,
              portabilityScreenshot: payload.new.portability_screenshot
            } : s));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_closings' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authSessionId]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(REQUIRED_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  // --- CRUD OPERATIONS ---

  const handleAddSale = async (newSaleData: Omit<Sale, 'id'>) => {
    if (!session) return;
    setIsLoading(true);
    try {
      const finalStoreId = userProfile?.role === 'admin' && selectedStoreId !== 'all' 
        ? selectedStoreId 
        : userProfile?.storeId;

      if (!finalStoreId) {
        alert("Por favor, selecciona una tienda específica antes de agregar una venta.");
        setIsLoading(false);
        return;
      }

      const generatedFolio = `VNT-${newSaleData.date.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      if (!isSupabaseConfigured) {
        const saleId = `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const newSale: Sale = {
          id: saleId,
          invoiceNumber: newSaleData.invoiceNumber,
          customerName: newSaleData.customerName,
          price: newSaleData.price,
          brand: newSaleData.brand,
          date: newSaleData.date,
          ticketImage: newSaleData.ticketImage || '',
          createdBy: session?.user?.id || 'dev-user',
          storeId: finalStoreId,
          category: (newSaleData as any).category || 'kit',
          iccid: (newSaleData as any).iccid || '',
          phoneNumber: (newSaleData as any).phone_number || '',
          portabilityScreenshot: (newSaleData as any).portability_screenshot || '',
          transactionFolio: generatedFolio
        };
        setSales(prev => {
          const updated = [newSale, ...prev];
          try { localStorage.setItem('coppel_cached_sales', JSON.stringify(updated)); } catch (e) {}
          return updated;
        });
        try {
          await setDoc(doc(db, 'sales', saleId), cleanFirestoreData(newSale), { merge: true });
        } catch (fsWriteErr) {
          console.warn("Firestore write sync:", fsWriteErr);
        }
        try {
          const catTab = newSale.category === 'kit' ? 'KIT' : 
                         newSale.category === 'chip_0' ? 'CHIP_0' : 
                         newSale.category === 'portabilidad' ? 'PORTABILITY' : 
                         newSale.category === 'chip_express' ? 'EXPRESS' : 'KIT';
          localStorage.setItem('coppel_sales_active_tab', catTab);
        } catch (e) {}
        setCurrentView('list');
        return;
      }

      const dbPayload = {
        invoice_number: newSaleData.invoiceNumber,
        customer_name: newSaleData.customerName,
        price: newSaleData.price,
        brand: newSaleData.brand,
        date: newSaleData.date,
        ticket_image: newSaleData.ticketImage || null,
        created_by: session.user.id,
        store_id: finalStoreId,
        category: (newSaleData as any).category || 'kit',
        iccid: (newSaleData as any).iccid || null,
        phone_number: (newSaleData as any).phone_number || null,
        portability_screenshot: (newSaleData as any).portability_screenshot || null,
        transaction_folio: generatedFolio
      };

      const { data, error } = await supabase
        .from('sales')
        .insert([dbPayload])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const row = data[0];
        const newSale: Sale = {
          id: row.id,
          invoiceNumber: row.invoice_number,
          customerName: row.customer_name,
          price: row.price,
          brand: row.brand as Brand,
          date: row.date,
          ticketImage: row.ticket_image,
          createdBy: row.created_by,
          storeId: row.store_id,
          category: row.category,
          iccid: row.iccid,
          phoneNumber: row.phone_number,
          portabilityScreenshot: row.portability_screenshot,
          transactionFolio: row.transaction_folio
        };
        // Update local state ONLY if not already added by realtime subscription
        setSales(prev => {
           if (prev.some(s => s.id === newSale.id)) return prev;
           return [newSale, ...prev];
        });
      }
      setCurrentView('list');
    } catch (error: any) {
      console.error('Error saving sale:', error);
      alert(`Error al guardar la venta: ${formatError(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingRequestsCount = async () => {
    try {
      if (!isSupabaseConfigured) {
        try {
          const snap = await getDocs(collection(db, 'sale_requests'));
          const pending = snap.docs.filter(d => d.data().status === 'pending');
          const countValue = pending.length;
          setPendingRequestsCount(countValue);
          if (countValue > 0 && sessionStorage.getItem('admin_notified_session') !== 'true') {
            setShowAdminNotification(true);
          }
        } catch {
          setPendingRequestsCount(0);
        }
        return;
      }

      const { count, error } = await supabase
        .from('sale_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      if (!error) {
        const countValue = count || 0;
        setPendingRequestsCount(countValue);
        
        // Only show notification if there are pending requests AND we haven't shown it this session
        if (countValue > 0 && sessionStorage.getItem('admin_notified_session') !== 'true') {
          setShowAdminNotification(true);
        }
      }
    } catch (err) {
      console.warn("Requests count note:", err);
    }
  };

  useEffect(() => {
    if (showAdminNotification) {
      // Mark as shown for this session
      try {
        sessionStorage.setItem('admin_notified_session', 'true');
      } catch (e) {}

      const timer = setTimeout(() => {
        setShowAdminNotification(false);
      }, 8000); // Slightly longer for better visibility
      return () => clearTimeout(timer);
    }
  }, [showAdminNotification]);

  const checkResolvedRequests = async (userId: string) => {
    try {
      if (!isSupabaseConfigured) {
        try {
          const snap = await getDocs(collection(db, 'sale_requests'));
          const resolved = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter(r => r.requester_id === userId && r.status !== 'pending' && !r.notified);
          if (resolved.length > 0) {
            setPendingResolutions(resolved);
            for (const r of resolved) {
              await updateDoc(doc(db, 'sale_requests', r.id), { notified: true }).catch(() => {});
            }
          }
        } catch {}
        return;
      }

      const { data, error } = await supabase
        .from('sale_requests')
        .select(`
          *,
          sale:sales(invoice_number, customer_name)
        `)
        .eq('requester_id', userId)
        .neq('status', 'pending')
        .eq('notified', false);

      if (error) throw error;
      if (data && data.length > 0) {
        setPendingResolutions(data);
        // Mark as notified in DB immediately so they don't reappear on reload
        const requestIds = data.map(r => r.id);
        await supabase
          .from('sale_requests')
          .update({ notified: true })
          .in('id', requestIds);
      }
    } catch (err) {
      console.warn("Resolutions check note:", err);
    }
  };

  const handleDismissResolution = async (requestId: string) => {
    try {
      if (!isSupabaseConfigured) {
        await updateDoc(doc(db, 'sale_requests', requestId), { notified: true }).catch(() => {});
        setPendingResolutions(prev => prev.filter(r => r.id !== requestId));
        return;
      }

      const { error } = await supabase
        .from('sale_requests')
        .update({ notified: true })
        .eq('id', requestId);
      
      if (error) throw error;
      setPendingResolutions(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      console.warn("Dismiss resolution note:", err);
    }
  };

  const handleUpdateSale = async (updatedSale: Sale) => {
    if (!session) return;
    setIsLoading(true);
    try {
      const finalStoreId = updatedSale.storeId || userProfile?.storeId || '';

      if (!isSupabaseConfigured) {
        const mergedSale = { ...updatedSale, storeId: finalStoreId };
        setSales(prev => {
          const updated = prev.map(s => s.id === updatedSale.id ? mergedSale : s);
          try { localStorage.setItem('coppel_cached_sales', JSON.stringify(updated)); } catch (e) {}
          return updated;
        });
        try {
          await updateDoc(doc(db, 'sales', updatedSale.id), cleanFirestoreData(mergedSale));
        } catch (fsErr) {
          console.warn("Venta actualizada localmente:", fsErr);
        }
        alert("Venta actualizada correctamente.");
        setSaleToEdit(null);
        setCurrentView('list');
        return;
      }

      const dbPayload = {
        invoice_number: updatedSale.invoiceNumber,
        customer_name: updatedSale.customerName,
        price: updatedSale.price,
        brand: updatedSale.brand,
        date: updatedSale.date,
        ticket_image: updatedSale.ticketImage,
        store_id: finalStoreId,
        category: updatedSale.category,
        iccid: updatedSale.iccid,
        phone_number: updatedSale.phoneNumber,
        portability_screenshot: updatedSale.portabilityScreenshot
      };

      const { error } = await supabase
        .from('sales')
        .update(dbPayload)
        .eq('id', updatedSale.id);

      if (error) throw error;

      setSales(prev => prev.map(s => s.id === updatedSale.id ? { ...updatedSale, storeId: dbPayload.store_id } : s));
      alert("Venta actualizada correctamente.");
      setSaleToEdit(null);
      setCurrentView('list');

    } catch (error: any) {
      console.error('Error updating sale:', error);
      alert(`Error al actualizar la venta: ${formatError(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSale = async (id: string) => {
    // Permission Check: Allow if user is logged in (Backend will enforce ownership/admin via RLS)
    if (!session) return;

    if (!window.confirm("¿Estás seguro de que quieres eliminar este registro?")) return;

    try {
      // Find sale to get image URL
      const saleToDelete = sales.find(s => s.id === id);

      if (!isSupabaseConfigured) {
        setSales(prev => {
          const updated = prev.filter(s => s.id !== id);
          try { localStorage.setItem('coppel_cached_sales', JSON.stringify(updated)); } catch (e) {}
          return updated;
        });
        try {
          await deleteDoc(doc(db, 'sales', id));
        } catch (fsErr) {
          console.warn("Venta eliminada localmente:", fsErr);
        }
        return;
      }

      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Delete image from Drive if it exists
      if (saleToDelete?.ticketImage && saleToDelete.ticketImage.includes('google.com')) {
        deleteImageFromDriveScript(saleToDelete.ticketImage).catch(console.error);
      }

      // Actualizar estado local eliminando el item
      setSales(prev => prev.filter(s => s.id !== id));
    } catch (error: any) {
      console.error('Error deleting sale:', error);
      alert(`No se pudo eliminar el registro. ${error.code === '42501' ? 'No tienes permiso para borrar este registro.' : formatError(error)}`);
    }
  };

  const handleCloseDay = async (newClose: DailyClose) => {
    if (!session) return;
    try {
      const exists = closings.find(c => c.date === newClose.date);
      if (exists) {
        if (!window.confirm("Ya existe un cierre para esta fecha. ¿Deseas actualizarlo con los datos actuales?")) {
          return;
        }
      }

      const finalStoreId = userProfile?.role === 'admin' && selectedStoreId !== 'all' 
        ? selectedStoreId 
        : userProfile?.storeId;

      const closeId = `close-${newClose.date}-${finalStoreId}`;

      if (!isSupabaseConfigured) {
        const closeDoc = {
          ...newClose,
          id: closeId,
          storeId: finalStoreId,
          attSales: newClose.attSales || 0
        };
        await setDoc(doc(db, 'daily_closings', closeId), cleanFirestoreData(closeDoc), { merge: true });
        setClosings(prev => {
          const filtered = prev.filter(c => !(c.date === newClose.date && c.storeId === finalStoreId));
          const updated = [newClose, ...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          try { localStorage.setItem('coppel_cached_closings', JSON.stringify(updated)); } catch (e) {}
          return updated;
        });
        alert("Cierre de día actualizado correctamente.");
        return;
      }

      const dbPayload = {
        id: closeId, // Added store ID to ID to avoid collision
        date: newClose.date,
        total_sales: newClose.totalSales,
        total_revenue: newClose.totalRevenue,
        closed_at: newClose.closedAt,
        top_brand: newClose.topBrand,
        store_id: finalStoreId,
        att_sales: newClose.attSales || 0
      };

      const { error } = await supabase
        .from('daily_closings')
        .upsert(dbPayload, { onConflict: 'date,store_id' });

      if (error) throw error;

      setClosings(prev => {
        // Remove existing if any (matching date AND store), then add new one
        const filtered = prev.filter(c => !(c.date === newClose.date && c.storeId === finalStoreId));
        return [newClose, ...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      alert("Cierre de día actualizado correctamente.");

    } catch (error: any) {
      console.error('Error closing day:', error);
      alert(`Error al realizar el corte del día: ${formatError(error)}`);
    }
  };

  const handleDeleteClosing = async (id: string) => {
    if (!session && !userProfile) {
      alert("Debes iniciar sesión para eliminar cierres.");
      return;
    }
    
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured) {
        await deleteDoc(doc(db, 'daily_closings', id));
        setClosings(prev => prev.filter(c => c.id !== id));
        alert("Cierre eliminado correctamente.");
        return;
      }

      const { error } = await supabase
        .from('daily_closings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setClosings(prev => prev.filter(c => c.id !== id));
      alert("Cierre eliminado correctamente.");
    } catch (error: any) {
      console.error('Error deleting closing:', error);
      alert(`Error al eliminar el cierre: ${formatError(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddWarranty = async (newWarranty: Omit<Warranty, 'id'>) => {
    if (!session) return;
    setIsLoading(true);
    try {
      const finalStoreId = (userProfile?.role === 'admin' && selectedStoreId !== 'all') 
        ? selectedStoreId 
        : (userProfile?.storeId || (selectedStoreId !== 'all' ? selectedStoreId : CARDENAS_STORE_ID));
      
      if (!finalStoreId) {
        alert("Por favor, selecciona una tienda específica antes de registrar una garantía.");
        setIsLoading(false);
        return;
      }

      const warrantyId = `warranty-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const addedWarranty: Warranty = {
        id: warrantyId,
        receptionDate: newWarranty.receptionDate,
        invoiceNumber: newWarranty.invoiceNumber,
        brand: newWarranty.brand as Brand,
        model: newWarranty.model,
        imei: newWarranty.imei,
        issueDescription: newWarranty.issueDescription,
        accessories: newWarranty.accessories,
        physicalCondition: newWarranty.physicalCondition,
        contactNumber: newWarranty.contactNumber,
        ticketImage: newWarranty.ticketImage,
        phoneDetails: newWarranty.phoneDetails,
        possibleEntryDate: newWarranty.possibleEntryDate,
        status: newWarranty.status,
        storeId: finalStoreId
      };

      if (!isSupabaseConfigured) {
        await setDoc(doc(db, 'warranties', warrantyId), cleanFirestoreData(addedWarranty), { merge: true });
        setWarranties(prev => [addedWarranty, ...prev]);
        alert("Garantía registrada correctamente.");
        return addedWarranty;
      }

      const dbPayload = {
        reception_date: newWarranty.receptionDate,
        invoice_number: newWarranty.invoiceNumber,
        brand: newWarranty.brand,
        model: newWarranty.model,
        imei: newWarranty.imei,
        issue_description: newWarranty.issueDescription,
        accessories: newWarranty.accessories,
        physical_condition: newWarranty.physicalCondition,
        contact_number: newWarranty.contactNumber,
        ticket_image: newWarranty.ticketImage,
        phone_details: newWarranty.phoneDetails,
        possible_entry_date: newWarranty.possibleEntryDate,
        status: newWarranty.status,
        store_id: finalStoreId
      };

      const { data, error } = await supabase
        .from('warranties')
        .insert([dbPayload])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const row = data[0];
        const insertedWarranty: Warranty = {
          id: row.id,
          receptionDate: row.reception_date,
          invoiceNumber: row.invoice_number,
          brand: row.brand as Brand,
          model: row.model,
          imei: row.imei,
          issueDescription: row.issue_description,
          accessories: row.accessories,
          physicalCondition: row.physical_condition,
          contactNumber: row.contact_number,
          ticketImage: row.ticket_image,
          phoneDetails: row.phone_details,
          possibleEntryDate: row.possible_entry_date,
          status: row.status,
          storeId: row.store_id
        };
        setWarranties(prev => [insertedWarranty, ...prev]);
        alert("Garantía registrada correctamente.");
        return insertedWarranty;
      }
      return null;
    } catch (error: any) {
      console.error('Error adding warranty:', error);
      alert(`Error al registrar garantía: ${formatError(error)}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateWarrantyStatus = async (id: string, newStatus: Warranty['status']) => {
    if (!session) return;
    // Optimistic update
    setWarranties(prev => prev.map(w => w.id === id ? { ...w, status: newStatus } : w));

    try {
      if (!isSupabaseConfigured) {
        await updateDoc(doc(db, 'warranties', id), { status: newStatus });
        return;
      }

      const { error } = await supabase
        .from('warranties')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert(`Error al actualizar estado: ${formatError(error)}`);
      // Rollback
      fetchData();
    }
  };

  const handleDeleteWarranty = async (warranty: Warranty) => {
    if (!userProfile && !session && !isDeveloperSession) return;

    // Optimistic remove
    setWarranties(prev => prev.filter(w => w.id !== warranty.id));

    try {
      // 1. Delete image from Drive if exists
      if (warranty.ticketImage && warranty.ticketImage.includes('drive.google.com')) {
        // Fire and forget image deletion to speed up UI, or await if strict
        deleteImageFromDriveScript(warranty.ticketImage).catch(e => console.error("Drive delete error", e));
      }

      if (!isSupabaseConfigured) {
        await deleteDoc(doc(db, 'warranties', warranty.id));
        return;
      }

      // 2. Delete from Supabase
      const { error } = await supabase.from('warranties').delete().eq('id', warranty.id);
      if (error) throw error;

    } catch (error: any) {
      console.error('Error deleting warranty:', error);
      alert(`Error al eliminar garantía: ${formatError(error)}`);
      fetchData(); // Rollback
    }
  };

  const handleUpdateWarranty = async (updatedWarranty: Warranty) => {
    if (!userProfile && !session && !isDeveloperSession) return;
    setIsLoading(true);
    try {
      setWarranties(prev => prev.map(w => w.id === updatedWarranty.id ? updatedWarranty : w));

      if (!isSupabaseConfigured) {
        await setDoc(doc(db, 'warranties', updatedWarranty.id), cleanFirestoreData(updatedWarranty), { merge: true });
        alert("Garantía actualizada correctamente.");
        setIsLoading(false);
        return;
      }

      const dbPayload = {
        reception_date: updatedWarranty.receptionDate,
        invoice_number: updatedWarranty.invoiceNumber,
        brand: updatedWarranty.brand,
        model: updatedWarranty.model,
        imei: updatedWarranty.imei,
        issue_description: updatedWarranty.issueDescription,
        accessories: updatedWarranty.accessories,
        physical_condition: updatedWarranty.physicalCondition,
        contact_number: updatedWarranty.contactNumber,
        ticket_image: updatedWarranty.ticketImage,
        phone_details: updatedWarranty.phoneDetails,
        possible_entry_date: updatedWarranty.possibleEntryDate,
        status: updatedWarranty.status,
        store_id: updatedWarranty.storeId
      };

      const { error } = await supabase
        .from('warranties')
        .update(dbPayload)
        .eq('id', updatedWarranty.id);

      if (error) throw error;
      alert("Garantía actualizada correctamente.");
    } catch (error: any) {
      console.error('Error updating warranty:', error);
      alert(`Error al actualizar garantía: ${formatError(error)}`);
      fetchData();
    } finally {
      setIsLoading(false);
    }
  };

  const NavButton = ({ view, icon: Icon, label, badge }: { view: 'form' | 'list' | 'dashboard' | 'closings' | 'warranties' | 'admin' | 'attendance' | 'supervision' | 'attendance-report' | 'requests' | 'backup-migration' | 'database-usage', icon: any, label: string, badge?: number }) => {
    const isActive = currentView === view;
    return (
      <button
        onClick={() => {
          setCurrentView(view);
          setIsMobileMenuOpen(false);
        }}
        className={`
          relative flex items-center gap-3 px-4 py-3.5 rounded-xl w-full text-left transition-all duration-200 group
          ${isActive
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }
        `}
      >
        <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} />
        <span className="font-medium text-sm tracking-wide">{label}</span>
        {badge ? (
          <span className="ml-auto bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce shadow-lg shadow-red-900/50">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
      </button>
    );
  };

  // --- RENDER: LOADING ---
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  // --- RENDER: AUTH FORM ---
  if (!session) {
    return <AuthForm onDeveloperLogin={handleDeveloperLogin} onFirestoreLogin={handleFirestoreLogin} />;
  }

  // --- RENDER: PROFILE LOADING GUARD ---
  // Si tenemos sesión pero el perfil aún no carga, mostramos pantalla de carga 
  // para evitar que vean el Dashboard "vacio" por un segundo.
  if (!userProfile && !connectionError && !isSetupNeeded) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">Validando Credenciales...</p>
        </div>
      </div>
    );
  }

  // --- RENDER: COMPLETE PROFILE (For new users from invite) ---
  // BLOQUEO TOTAL: Si no hay nombre completo, NO se pasa de aquí.
  if (!isDeveloper && userProfile && (!userProfile.fullName || userProfile.fullName.trim() === "")) {
    const userStoreName = stores.find(s => s.id === userProfile.storeId)?.name;
    return <CompleteProfile 
      profile={userProfile} 
      storeName={userStoreName}
      onComplete={(updated) => setUserProfile(updated)} 
    />;
  }

  // --- RENDER: SETUP / ERROR SCREEN ---
  if (!isDeveloper && (isSetupNeeded || (connectionError && sales.length === 0 && closings.length === 0))) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 font-sans">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/30">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold">Actualización Necesaria</h1>
            <p className="text-slate-400 max-w-md mx-auto">
              {connectionError
                ? "Ocurrió un error al conectar con Supabase."
                : "Para habilitar el sistema de usuarios y roles, necesitamos actualizar la base de datos."}
            </p>
            {connectionError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-3 rounded-lg text-sm font-mono break-all inline-block max-w-full">
                Error: {connectionError}
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-mono text-slate-400">
                <Database className="w-4 h-4" />
                <span>SQL Update Script</span>
              </div>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors text-white"
              >
                {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedSql ? "¡Copiado!" : "Copiar SQL"}
              </button>
            </div>
            <div className="p-6 overflow-x-auto">
              <pre className="text-xs md:text-sm font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
                {REQUIRED_SQL}
              </pre>
            </div>
            <div className="bg-slate-800 p-6 border-t border-slate-700">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Instrucciones:
              </h3>
              <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside ml-2">
                <li>Ve al Dashboard de tu proyecto en <a href="https://supabase.com/dashboard" target="_blank" className="text-blue-400 hover:underline" rel="noreferrer">Supabase</a>.</li>
                <li>Abre el <strong>SQL Editor</strong> en el menú lateral.</li>
                <li>Haz clic en <strong>New Query</strong>.</li>
                <li>Pega el código de arriba y haz clic en <strong>RUN</strong>.</li>
                <li>Vuelve aquí y presiona "Reintentar Conexión".</li>
              </ol>
              <button
                onClick={fetchData}
                className="mt-6 w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                Reintentar Conexión
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP RENDER ---
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">


      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between shadow-md sticky top-0 z-20">
        <div className="flex items-center gap-3 font-bold text-lg">
          <img src="/pwa-icon.png" alt="Logo" className="w-8 h-8 object-contain drop-shadow-sm rounded-full" />
          <span>Ventas Telcel</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-slate-300 hover:text-white">
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Professional Dark Sidebar */}
      <nav className={`
        fixed inset-0 z-50 bg-[#0f172a] md:static md:w-72 md:h-screen flex flex-col transition-transform duration-300 shadow-2xl
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="p-6 md:p-8 flex items-center justify-between">
          <div className="flex flex-col gap-2 w-full">
            {/* App Logo */}
            <div className="flex items-center gap-3 px-2">
              <img src="/pwa-icon.png" alt="Logo" className="w-12 h-12 object-contain drop-shadow-lg rounded-full" />
              <span className="text-xl font-bold text-white tracking-tight">Ventas Telcel</span>
            </div>
            <p className="text-slate-500 text-[10px] font-bold tracking-widest text-center mt-4">PANEL DE CONTROL</p>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-500"><X /></button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          {effectiveRole !== 'supervisor' && (
            <>
              <div className="text-[10px] font-bold text-slate-500 px-4 py-2 uppercase tracking-wider">Menú Principal</div>
              {effectiveRole !== 'viewer' && (
                <>
                  <NavButton view="list" icon={LayoutList} label="Registro de Ventas" />
                  <NavButton view="attendance" icon={Clock} label="Asistencia" />
                </>
              )}
              <NavButton view="dashboard" icon={BarChart3} label="Estadísticas" />
              <NavButton view="closings" icon={CalendarCheck} label="Cierre de Venta" />
              {canAccessWarranties && (
                <NavButton view="warranties" icon={ShieldAlert} label="Garantías" />
              )}
            </>
          )}
          
          {(effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'developer') && (
            <>
              <div className="text-[10px] font-bold text-slate-500 px-4 py-2 mt-4 uppercase tracking-wider">Administración</div>
              <NavButton 
                view="attendance-report" 
                icon={CalendarCheck} 
                label="Reporte Asistencias" 
                badge={alerts.length > 0 ? alerts.length : undefined}
              />
              {canAccessWarranties && (
                <NavButton view="warranties" icon={ShieldAlert} label="Garantías" />
              )}
              {(effectiveRole === 'admin' || effectiveRole === 'developer') && (
                <>
                  <NavButton view="admin" icon={Shield} label="Administración" />
                  <NavButton view="requests" icon={Bell} label="Solicitudes" badge={pendingRequestsCount > 0 ? pendingRequestsCount : undefined} />
                </>
              )}
              <NavButton view="supervision" icon={TrendingUp} label="Rendimiento" />
            </>
          )}

          {(effectiveRole === 'developer' || effectiveRole === 'admin') && (
            <>
              <div className="text-[10px] font-bold text-purple-400 px-4 py-2 mt-4 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-3 h-3" />
                Base de Datos
              </div>
              <NavButton view="backup-migration" icon={Database} label="Migrar Respaldo (.gz)" />
              <NavButton view="database-usage" icon={TrendingUp} label="Uso y Costos de BD" />
            </>
          )}
        </div>

        {/* User Profile Section */}
        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-xl p-3 flex items-center gap-3 border border-slate-700/50 hover:border-slate-600 transition-colors group">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-colors ${effectiveRole === 'developer' ? 'bg-purple-600' : 'bg-slate-700'}`}>
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">
                {userProfile?.fullName || userProfile?.email?.split('@')[0] || 'Usuario'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Shield className={`w-3 h-3 ${effectiveRole === 'developer' ? 'text-purple-400' : effectiveRole === 'admin' ? 'text-yellow-400' : 'text-slate-500'}`} />
                <p className="text-slate-400 text-[10px] uppercase font-bold truncate">
                  {effectiveRole === 'developer' ? 'Desarrollador' : effectiveRole === 'admin' ? 'Administrador' : effectiveRole === 'supervisor' ? 'Supervisor' : effectiveRole === 'viewer' ? 'Visualizador' : 'Vendedor'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-4 text-center">
            <p className="text-[10px] text-slate-600">v3.3 (Telcel Ed.)</p>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen scroll-smooth bg-slate-100 relative">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                {currentView === 'list' && 'Historial de Ventas'}
                {currentView === 'form' && 'Nuevo Registro'}
                {currentView === 'dashboard' && 'Panel de Rendimiento'}
                {currentView === 'closings' && 'Cierre Diario'}
                {currentView === 'warranties' && 'Gestión de Garantías'}
                {currentView === 'attendance' && 'Control de Asistencia'}
                {currentView === 'attendance-report' && 'Vigilancia de Asistencias'}
                {currentView === 'admin' && 'Administración Maestra'}
                {currentView === 'backup-migration' && 'Migrador de Respaldo Supabase'}
                {currentView === 'database-usage' && 'Control de Uso y Cuotas de BD'}
                {isLoading && <Loader2 className="w-6 h-6 animate-spin text-blue-600" />}
              </h1>
              <p className="text-slate-500 mt-1 font-medium text-xs md:text-sm truncate">
                {currentView === 'list' && 'Gestiona y consulta el historial de transacciones en la nube.'}
                {currentView === 'form' && 'Completa los detalles de la venta del dispositivo.'}
                {currentView === 'dashboard' && 'Visualiza métricas clave y cumplimiento de metas.'}
                {currentView === 'closings' && 'Realiza cortes y revisa ingresos acumulados.'}
                {currentView === 'warranties' && 'Administra equipos enviados a taller y su estado.'}
                {currentView === 'attendance' && 'Registra tus entradas, salidas y horarios de comida.'}
                {currentView === 'attendance-report' && 'Historial detallado y estatus actual de todo el personal.'}
                {currentView === 'admin' && 'Configura sucursales, gestiona permisos y expande el sistema.'}
                {currentView === 'backup-migration' && 'Extrae y transfiere usuarios, sucursales y ventas de tu archivo .gz a Firestore.'}
                {currentView === 'database-usage' && 'Monitoreo diario de operaciones Firestore y simulador de costos por rebase.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              {/* Store Selector Visibility Logic */}
              {(() => {
                const isAdmin = effectiveRole === 'admin' || effectiveRole === 'developer';
                const isRestrictedToOneStore = !isAdmin && (
                  !!userProfile?.storeId || 
                  (userProfile?.assignedStores && userProfile.assignedStores.length === 1)
                );
                const isGlobalAccess = !isAdmin && (
                  !userProfile?.storeId && 
                  (!userProfile?.assignedStores || userProfile.assignedStores.length === 0)
                );

                if (!isAdmin && isRestrictedToOneStore) return null;
                if (!isAdmin && effectiveRole === 'seller') return null;
                if (!isAdmin && !isGlobalAccess && (!userProfile?.assignedStores || userProfile.assignedStores.length <= 1) && !userProfile?.storeId) return null;

                return (
                 <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:bg-slate-50 flex-1 sm:flex-none">
                    <Building className="w-4 h-4 text-blue-600 shrink-0" />
                    <select 
                      value={selectedStoreId}
                      onChange={(e) => setSelectedStoreId(e.target.value)}
                      className="bg-transparent text-[10px] md:text-xs font-black text-slate-800 outline-none cursor-pointer w-full"
                    >
                      <option value="all" disabled={selectedStoreId !== 'all'}>Seleccionar Tienda...</option>
                      {(isAdmin || isGlobalAccess || (userProfile?.assignedStores && userProfile.assignedStores.length > 1)) && (
                        <option value="all">Ver Todas {isAdmin ? '(Global)' : '(Mis Tiendas)'}</option>
                      )}
                      {stores
                        .filter(s => {
                          if (isAdmin) return true;
                          if (effectiveRole === 'supervisor' || effectiveRole === 'viewer') {
                             if (userProfile?.storeId) {
                               return s.id === userProfile.storeId;
                             }
                             if (userProfile?.assignedStores && userProfile.assignedStores?.length > 0) {
                               return userProfile.assignedStores.includes(s.id);
                             }
                             return true;
                          }
                          return s.id === userProfile?.storeId;
                        })
                        .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                 </div>
                );
              })()}

              {currentView === 'list' && (effectiveRole === 'admin' || effectiveRole === 'seller' || effectiveRole === 'developer') && (
                <button
                  onClick={() => {
                    if (selectedStoreId === 'all' && (effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'viewer' || effectiveRole === 'developer')) {
                      alert("⚠️ Por favor, selecciona una sucursal específica antes de agregar una venta.");
                      return;
                    }
                    setCurrentView('form');
                  }}
                  className="hidden md:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5"
                >
                  <Plus className="w-5 h-5" />
                  Nueva Venta
                </button>
              )}
            </div>
          </div>

          {/* QUOTA WARNING / LOCAL CACHE BANNER */}
          {isQuotaExhausted && (
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 p-4 rounded-2xl shadow-lg border border-amber-400 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">Modo de Almacenamiento Local y Caché Activo</h4>
                  <p className="text-[11px] font-semibold text-slate-900/90 mt-0.5">
                    Se alcanzó el límite diario de lecturas gratuitas de Firebase para hoy. La app continúa funcionando con tus datos locales y los nuevos registros se guardan y se sincronizan al servidor.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                <button
                  onClick={() => setCurrentView('backup-migration')}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-amber-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
                >
                  Restaurar Respaldo
                </button>
                <button
                  onClick={() => setIsQuotaExhausted(false)}
                  className="p-2 hover:bg-black/10 rounded-xl text-slate-950 transition-colors"
                  title="Ocultar aviso"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* RESOLUTION NOTIFICATIONS (FOR SELLERS) */}
          {pendingResolutions.length > 0 && (
            <div className="mb-6 space-y-3 animate-in slide-in-from-top-4 duration-500 max-w-3xl mx-auto px-4">
              {pendingResolutions.map((res) => (
                <div key={res.id} className={`p-6 rounded-[2rem] border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${res.status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-red-50 border-red-100 text-red-900'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${res.status === 'approved' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-red-500 text-white border-red-400'}`}>
                      {res.status === 'approved' ? <CheckCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-tight">
                        Solicitud de {res.type === 'edit' ? 'Edición' : 'Eliminación'} {res.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                      </h4>
                      <p className="text-[11px] font-bold opacity-70 uppercase tracking-widest mt-0.5">
                        Ticket: {res.sale?.invoice_number || 'Venta'} - {res.sale?.customer_name || 'Cliente'}
                      </p>
                      {res.status === 'rejected' && res.rejection_reason && (
                        <p className="mt-2 text-[10px] font-black bg-white/40 px-3 py-1.5 rounded-xl border border-red-200/50 inline-block">
                          Motivo: "{res.rejection_reason}"
                        </p>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDismissResolution(res.id)}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${res.status === 'approved' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-red-500 text-white hover:bg-red-600'}`}
                  >
                    Entendido
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ADMIN PENDING REQUESTS NOTIFICATION (TRANSIENT) */}
          {userProfile?.role === 'developer' && showAdminNotification && (
            <div className="fixed top-4 md:top-8 right-0 md:right-8 z-[60] w-full md:max-w-md px-4 md:px-0 animate-in slide-in-from-top-10 md:slide-in-from-right-10 fade-in duration-700">
              <div 
                onClick={() => {
                  setCurrentView('requests');
                  setShowAdminNotification(false);
                }}
                className="bg-indigo-600 p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-2xl shadow-indigo-200/50 flex items-center justify-between gap-4 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all group overflow-hidden relative border border-white/20 backdrop-blur-sm"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 group-hover:scale-125 transition-transform duration-500"></div>
                <div className="flex items-center gap-4 relative z-10">
                   <div className="w-12 h-12 bg-white/20 text-white rounded-2xl flex items-center justify-center animate-bounce">
                      <Bell className="w-6 h-6" />
                   </div>
                   <div className="text-white">
                      <h4 className="text-xs font-black uppercase tracking-tight">¡Nuevas Solicitudes!</h4>
                      <p className="text-[9px] font-bold opacity-80 uppercase tracking-widest mt-0.5">
                        Tienes {pendingRequestsCount} cambios pendientes
                      </p>
                   </div>
                </div>
                <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-xl text-white text-[9px] font-black uppercase tracking-widest relative z-10 group-hover:bg-white/30 transition-colors">
                   VER <ChevronRight className="w-3 h-3" />
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAdminNotification(false);
                  }}
                  className="absolute top-2 right-2 text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

            {/* BACKUP MIGRATION VIEW */}
            {currentView === 'backup-migration' && (
              <ErrorBoundary fallbackTitle="Error al procesar el archivo de respaldo">
                <BackupMigration 
                  userProfile={userProfile}
                  onComplete={() => {
                    setSelectedStoreId('all');
                    try { localStorage.setItem('app_selected_store_id', 'all'); } catch (e) {}
                    fetchData();
                  }} 
                  onNavigateToList={() => {
                    setSelectedStoreId('all');
                    try { localStorage.setItem('app_selected_store_id', 'all'); } catch (e) {}
                    setCurrentView('list');
                    fetchData();
                  }}
                  onNavigateToDashboard={() => {
                    setSelectedStoreId('all');
                    try { localStorage.setItem('app_selected_store_id', 'all'); } catch (e) {}
                    setCurrentView('dashboard');
                    fetchData();
                  }}
                  onNavigateToAdmin={() => {
                    setSelectedStoreId('all');
                    try { localStorage.setItem('app_selected_store_id', 'all'); } catch (e) {}
                    setCurrentView('admin');
                    fetchData();
                  }}
                />
              </ErrorBoundary>
            )}

            {/* DATABASE USAGE & COST TRACKER VIEW */}
            {currentView === 'database-usage' && (
              <DatabaseUsagePanel 
                salesCount={sales.length}
                storesCount={stores.length}
                closingsCount={closings.length}
                warrantiesCount={warranties.length}
              />
            )}

            {currentView === 'list' && effectiveRole !== 'supervisor' && effectiveRole !== 'viewer' && (
              <SalesList
                sales={filteredSales}
                onDelete={handleDeleteSale}
                onEdit={(sale) => {
                  if (effectiveRole === 'admin' || effectiveRole === 'seller' || effectiveRole === 'developer') {
                    setSaleToEdit(sale);
                    setCurrentView('form');
                  }
                }}
                onDeepSearch={handleDeepSearch}
                onFetchRange={handleFetchRange}
                isDeepSearching={isDeepSearching}
                onAdd={() => {
                  if (effectiveRole === 'admin' || effectiveRole === 'seller' || effectiveRole === 'developer') {
                    if (selectedStoreId === 'all' && (effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'viewer' || effectiveRole === 'developer')) {
                      alert("⚠️ Por favor, selecciona una sucursal específica antes de agregar una venta.");
                      return;
                    }
                    setSaleToEdit(null);
                    setCurrentView('form');
                  }
                }}
                role={effectiveRole}
                userProfile={userProfile}
                storeName={(effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'viewer' || effectiveRole === 'developer') 
                  ? (selectedStoreId === 'all' ? 'Todas las Tiendas' : stores.find(s => s.id === selectedStoreId)?.name) 
                  : stores.find(s => s.id === userProfile?.storeId)?.name}
              />
            )}
            {currentView === 'form' && effectiveRole !== 'viewer' && (
              <SalesForm 
                onAddSale={handleAddSale} 
                onUpdateSale={handleUpdateSale}
                initialData={saleToEdit}
                role={effectiveRole}
                userProfile={userProfile}
                stores={stores}
                activeStoreId={(effectiveRole === 'admin' || effectiveRole === 'developer') && selectedStoreId !== 'all' ? selectedStoreId : userProfile?.storeId}
                onCancel={() => {
                  setSaleToEdit(null);
                  setCurrentView('list');
                }}
              />
            )}
            {currentView === 'dashboard' && effectiveRole !== 'supervisor' && (
              <Dashboard 
                sales={filteredSales}
                closings={filteredClosings} 
                role={effectiveRole}
                storeId={(effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'viewer' || effectiveRole === 'developer') ? (selectedStoreId === 'all' ? undefined : selectedStoreId) : userProfile?.storeId}
                userProfile={userProfile}
                storeName={(effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'viewer' || effectiveRole === 'developer') 
                  ? (selectedStoreId === 'all' ? 'Todas las Tiendas' : stores.find(s => s.id === selectedStoreId)?.name) 
                  : stores.find(s => s.id === userProfile?.storeId)?.name}
              />
            )}
            {currentView === 'closings' && effectiveRole !== 'supervisor' && (
              <DailyClosings
                sales={filteredSales}
                closings={filteredClosings}
                onCloseDay={handleCloseDay}
                onDeleteClosing={handleDeleteClosing}
                role={effectiveRole}
                storeName={(effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'viewer' || effectiveRole === 'developer') 
                  ? (selectedStoreId === 'all' ? 'Todas las Tiendas' : stores.find(s => s.id === selectedStoreId)?.name) 
                  : stores.find(s => s.id === userProfile?.storeId)?.name}
                activeStoreId={(effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'viewer' || effectiveRole === 'developer') ? selectedStoreId : userProfile?.storeId}
                stores={stores}
                userProfile={userProfile}
              />
            )}
            {currentView === 'warranties' && canAccessWarranties && (
              <Warranties
                warranties={filteredWarranties}
                onAddWarranty={handleAddWarranty}
                onUpdateWarranty={handleUpdateWarranty}
                onUpdateStatus={handleUpdateWarrantyStatus}
                onDeleteWarranty={handleDeleteWarranty}
                brandConfigs={BRAND_CONFIGS}
                isAdmin={isWarrantyAdmin}
                userProfile={userProfile}
                stores={stores}
              />
            )}
            {currentView === 'attendance' && userProfile && effectiveRole !== 'viewer' && (
              <AttendanceManager 
                user={userProfile} 
                storeName={stores.find(s => s.id === userProfile?.storeId)?.name}
              />
            )}
            {currentView === 'attendance-report' && (effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'developer') && (
              <AttendanceReport 
                selectedStoreId={selectedStoreId}
                stores={stores}
                userProfile={userProfile}
                onRefreshStores={fetchData}
              />
            )}
            {currentView === 'supervision' && (effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'developer') && (
              <SupervisionPanel 
                sales={sales}
                stores={stores}
                selectedStoreId={selectedStoreId}
                userProfile={userProfile}
              />
            )}
            {currentView === 'admin' && (effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'developer') && (
              <AdminPanel 
                userProfile={userProfile}
                onRefresh={() => {
                  fetchData();
                  fetchPendingRequestsCount();
                }} 
                onViewRequests={() => setCurrentView('requests')}
                onOpenDatabaseUsage={() => setCurrentView('database-usage')}
              />
            )}
            {currentView === 'requests' && (effectiveRole === 'admin' || effectiveRole === 'developer') && (
              <RequestsPanel 
                onBack={() => setCurrentView('admin')}
                onRefresh={() => fetchPendingRequestsCount()}
                stores={stores}
              />
            )}
          </div>
      </main>

      {/* Floating Action Button (Mobile Only for List View) */}
      {currentView === 'list' && (effectiveRole === 'admin' || effectiveRole === 'seller' || effectiveRole === 'developer') && (
        <button
          onClick={() => {
            if (selectedStoreId === 'all' && (effectiveRole === 'admin' || effectiveRole === 'supervisor' || effectiveRole === 'viewer' || effectiveRole === 'developer')) {
              alert("⚠️ Por favor, selecciona una sucursal específica antes de agregar una venta.");
              return;
            }
            setSaleToEdit(null);
            setCurrentView('form');
          }}
          className="md:hidden fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-2xl shadow-blue-500/40 hover:bg-blue-700 transition-transform active:scale-95 z-30"
          title="Nueva Venta"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Role Switcher floating widget for Developer */}
      {isDeveloper && (
        <RoleSwitcher
          currentRole={userProfile?.role || 'developer'}
          effectiveRole={effectiveRole}
          onRoleChange={(newRole) => {
            setSimulatedRole(newRole);
            try {
              localStorage.setItem('dev_simulated_role', newRole);
            } catch (e) {}
          }}
          stores={stores}
          selectedStoreId={selectedStoreId}
          onStoreChange={(newStoreId) => setSelectedStoreId(newStoreId)}
          onOpenMigration={() => setCurrentView('backup-migration')}
          onOpenDatabaseUsage={() => setCurrentView('database-usage')}
        />
      )}

    </div>
  );
};

export default App;
