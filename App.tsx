import React, { useState, useEffect } from 'react';
import { Smartphone, LayoutList, BarChart3, Menu, X, CalendarCheck, Plus, LogOut, User as UserIcon, ChevronRight, Loader2, RefreshCcw, Database, AlertTriangle, Copy, Check, Shield, ShieldAlert, Wand2, Clock, Building, TrendingUp } from 'lucide-react';
import SalesForm from './components/SalesForm';
import SalesList from './components/SalesList';
import Dashboard from './components/Dashboard';
import DailyClosings from './components/DailyClosings';
import Warranties from './components/Warranties';
import AttendanceManager from './components/AttendanceManager';
import AdminPanel from './components/AdminPanel';
import SupervisionPanel from './components/SupervisionPanel';
import AttendanceReport from './components/AttendanceReport';
import AuthForm from './components/AuthForm';
import CompleteProfile from './components/CompleteProfile';
import { Sale, DailyClose, Brand, UserProfile, Warranty, Store, UserRole } from './types';
import { BRAND_CONFIGS } from './constants';
import { supabase } from './services/supabaseClient';
import { deleteImageFromDriveScript } from './services/googleAppsScriptService';
import { smartImageUpload } from './services/storageService';

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App State
  const [currentView, setCurrentView] = useState<'form' | 'list' | 'dashboard' | 'closings' | 'warranties' | 'attendance' | 'attendance-report' | 'admin' | 'supervision'>('list');
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => {
    try {
      return localStorage.getItem('app_selected_store_id') || 'all';
    } catch {
      return 'all';
    }
  });

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
  const [sales, setSales] = useState<Sale[]>([]);
  const [closings, setClosings] = useState<DailyClose[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // States for Error Handling & Setup
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSetupNeeded, setIsSetupNeeded] = useState(false);

  const [copiedSql, setCopiedSql] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);



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

-- Bloque de Funciones de Ayuda para Políticas
create or replace function public.is_admin()
returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer;

create or replace function public.get_user_store_id()
returns uuid as $$
  select store_id from public.profiles where id = auth.uid();
$$ language sql security definer;

create or replace function public.is_supervisor()
returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('supervisor', 'viewer'));
$$ language sql security definer;

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
`;

  // --- AUTH CHECK ---
  useEffect(() => {
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
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
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



  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setUserProfile({
          id: data.id,
          email: data.email,
          role: data.role as UserRole,
          fullName: data.full_name,
          storeId: data.store_id,
          assignedStores: data.assigned_stores || [],
          restDays: data.rest_days || [],
          vacationDates: data.vacation_dates || []
        });
        
        // Ensure supervisors start on their allowed default view
        if (data.role === 'supervisor') {
          setCurrentView('supervision');
        } else if (data.role === 'viewer') {
          setCurrentView('dashboard');
        }
        
        return;
      }

      // SI NO EXISTE EL PERFIL: Intentamos obtenerlo de Invitaciones Pendientes
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Buscamos si hay una invitación pendiente para este correo
        const { data: invite } = await supabase
          .from('pending_invitations')
          .select('*')
          .eq('email', user.email)
          .maybeSingle();

        const metadata = user.user_metadata || {};
        const newProfile = {
          id: user.id,
          email: user.email,
          role: invite?.role || metadata.role || 'seller',
          store_id: invite?.store_id || metadata.store_id || null
        };

        const { error: insertError } = await supabase.from('profiles').insert([newProfile]);
        
        if (!insertError) {
          // Si pudimos crear el perfil, borramos la invitación pendiente
          if (invite) {
            await supabase.from('pending_invitations').delete().eq('email', user.email);
          }

          setUserProfile({
            id: newProfile.id,
            email: newProfile.email || '',
            role: newProfile.role as UserRole,
            fullName: null,
            storeId: newProfile.store_id,
            assignedStores: []
          });
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleLogout = async () => {
    // Limpiamos el rastreador de fecha al salir manualmente
    try {
      localStorage.removeItem('sales_app_session_date');
    } catch (e) {}
    await supabase.auth.signOut();
  };

  // --- AUTOMATIC MIDNIGHT LOGOUT LOGIC ---
  useEffect(() => {
    if (!session) return;

    const SESSION_DATE_KEY = 'sales_app_session_date';

    const checkMidnight = () => {
      const now = new Date();
      // Obtenemos la fecha actual como string único (ej: "Mon Oct 25 2023")
      const currentDateStr = now.toDateString();
      let storedDate = null;
      try {
        storedDate = localStorage.getItem(SESSION_DATE_KEY);
      } catch (e) {}

      if (!storedDate) {
        // Si no hay fecha guardada (primer login del día o recarga), guardamos la actual
        try {
          localStorage.setItem(SESSION_DATE_KEY, currentDateStr);
        } catch (e) {}
      } else if (storedDate !== currentDateStr) {
        // Si la fecha guardada es diferente a la actual, significa que cambió el día (medianoche)
        // Forzamos el cierre de sesión
        console.log("Cierre de sesión automático: Cambio de día detectado.");
        handleLogout();
      }
    };

    // Revisar inmediatamente al cargar
    checkMidnight();

    // Configurar intervalo para revisar cada minuto (60,000 ms)
    const intervalId = setInterval(checkMidnight, 60000);

    return () => clearInterval(intervalId);
  }, [session]);

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

        // Si es hoy, solo cerrar si es después de las 7 PM (19h)
        if (date === todayStr) return hour >= 19;

        // Si es un día pasado, cerrar siempre (Recuperación histórica)
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
            date: date,
            total_sales: daySales.length,
            total_revenue: revenue,
            closed_at: now.toISOString(),
            top_brand: topBrand as Brand,
            store_id: userProfile?.storeId
          };

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

  // --- FETCH DATA FROM SUPABASE ---
  const fetchData = async () => {
    if (!session) return;

    setIsLoading(true);
    setConnectionError(null);
    setIsSetupNeeded(false);

    try {
      // 1. Fetch Sales (with profiles join for Admin view)
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          *,
          profiles:created_by (
            email,
            full_name
          )
        `)
        .order('date', { ascending: false })
        .range(0, 4999); // Increased range to fetch more than 1000 records

      if (salesError) {
        if (salesError.code === '42P01') {
          setIsSetupNeeded(true);
          throw new Error("Tablas no encontradas en Supabase.");
        }
        throw salesError;
      }

      const formattedSales: Sale[] = (salesData || []).map((row: any) => ({
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
        storeId: row.store_id
      }));

      setSales(formattedSales);

      // 2. Fetch Closings
      const { data: closingsData, error: closingsError } = await supabase
        .from('daily_closings')
        .select('*')
        .order('date', { ascending: false });

      if (closingsError) {
        if (closingsError.code === '42P01') {
          setIsSetupNeeded(true);
          throw new Error("Tabla 'daily_closings' no encontrada.");
        }
        throw closingsError;
      }

      const formattedClosings: DailyClose[] = (closingsData || []).map((row: any) => ({
        id: row.id,
        date: row.date,
        totalSales: row.total_sales,
        totalRevenue: row.total_revenue,
        closedAt: row.closed_at,
        topBrand: row.top_brand,
        storeId: row.store_id
      }));

      setClosings(formattedClosings);

      // 3. Fetch Warranties
      const { data: warrantiesData, error: warrantiesError } = await supabase
        .from('warranties')
        .select('*')
        .order('reception_date', { ascending: false });

      if (warrantiesError) {
        // Only warn if table missing, might be strictly optional feature for now
        if (warrantiesError.code === '42P01') {
          console.warn("Table 'warranties' missing. Setup update needed.");
          setIsSetupNeeded(true);
        } else {
          throw warrantiesError;
        }
      }

      if (warrantiesData) {
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
          possibleEntryDate: row.possible_entry_date, 
          status: row.status,
          storeId: row.store_id
        }));
        setWarranties(formattedWarranties);
      } else {
        setWarranties([]);
      }


      // 4. Fetch Stores
      const { data: storesData } = await supabase.from('stores').select('*').order('name');
      if (storesData) {
        setStores(storesData.map((s: any) => ({
          id: s.id,
          name: s.name,
          location: s.location,
          createdAt: s.created_at,
          prefix: s.prefix,
          entryTime: s.entry_time,
          exitTime: s.exit_time,
          lunchDurationMinutes: s.lunch_duration_minutes
        })));
      }

    } catch (error: any) {
      console.error('Error fetching data from Supabase:', error);
      if (!isSetupNeeded) {
        setConnectionError(formatError(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- FILTERED DATA logic ---
  const getFilteredData = <T extends { storeId?: string }>(data: T[]) => {
    if (!userProfile) return [];

    // Admins see everything or filter by selectedStoreId
    if (userProfile.role === 'admin') {
      return selectedStoreId === 'all' ? data : data.filter(item => item.storeId === selectedStoreId);
    }

    // Supervisors and Viewers: handle "Global" vs "Area" access
    if (userProfile.role === 'supervisor' || userProfile.role === 'viewer') {
      const allowedStores = (userProfile.assignedStores && userProfile.assignedStores.length > 0)
        ? userProfile.assignedStores
        : (userProfile.storeId ? [userProfile.storeId] : null);

      const baseData = allowedStores 
        ? data.filter(item => allowedStores.includes(item.storeId || ''))
        : data;

      return selectedStoreId === 'all' 
        ? baseData 
        : baseData.filter(item => item.storeId === selectedStoreId);
    }

    // Default (Sellers): only show their store
    return data.filter(item => item.storeId === userProfile.storeId);
  };

  const filteredSales = getFilteredData(sales);
  const filteredClosings = getFilteredData(closings as any[]) as DailyClose[];
  const filteredWarranties = getFilteredData(warranties);

  useEffect(() => {
    if (session) {
      fetchData();

      // Realtime Subscription
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
                storeId: payload.new.store_id
              };
              setSales(prev => [newSale, ...prev]);
            } else if (payload.eventType === 'DELETE') {
              setSales(prev => prev.filter(s => s.id !== payload.old.id));
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'daily_closings' },
          () => {
            // For closings, we just re-fetch to keep it simple and accurate
            fetchData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session]);

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

      const dbPayload = {
        invoice_number: newSaleData.invoiceNumber,
        customer_name: newSaleData.customerName,
        price: newSaleData.price,
        brand: newSaleData.brand,
        date: newSaleData.date,
        ticket_image: newSaleData.ticketImage || null,
        created_by: session.user.id,
        store_id: finalStoreId
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
          storeId: row.store_id // FIXED: Added storeId
        };
        // Update local state ONLY if not already added by realtime subscription
        setSales(prev => {
           if (prev.some(s => s.id === newSale.id)) return prev;
           return [newSale, ...prev];
        });
        setCurrentView('list');
      }
    } catch (error: any) {
      console.error('Error saving sale:', error);
      alert(`Error al guardar la venta: ${formatError(error)}`);
    } finally {
      setIsLoading(false);
    }

  };

  const handleUpdateSale = async (updatedSale: Sale) => {
    if (!session) return;
    setIsLoading(true);
    try {
      const dbPayload = {
        invoice_number: updatedSale.invoiceNumber,
        customer_name: updatedSale.customerName,
        price: updatedSale.price,
        brand: updatedSale.brand,
        date: updatedSale.date,
        ticket_image: updatedSale.ticketImage, // Can be null or URL
        store_id: updatedSale.storeId || userProfile?.storeId
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

      const dbPayload = {
        id: `close-${newClose.date}-${finalStoreId}`, // Added store ID to ID to avoid collision
        date: newClose.date,
        total_sales: newClose.totalSales,
        total_revenue: newClose.totalRevenue,
        closed_at: newClose.closedAt,
        top_brand: newClose.topBrand,
        store_id: finalStoreId
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
    if (!session || userProfile?.role !== 'admin') {
      alert("Solo el administrador puede eliminar cierres.");
      return;
    }
    if (!window.confirm("¿Estás seguro de que deseas eliminar este cierre? Esta acción no se puede deshacer.")) return;
    
    setIsLoading(true);
    try {
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
      const finalStoreId = userProfile?.role === 'admin' && selectedStoreId !== 'all' 
        ? selectedStoreId 
        : userProfile?.storeId;
      
      if (!finalStoreId) {
        alert("Por favor, selecciona una tienda específica antes de registrar una garantía.");
        setIsLoading(false);
        return;
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
        const addedWarranty: Warranty = {
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
          possibleEntryDate: row.possible_entry_date,
          status: row.status,
          storeId: row.store_id
        };
        setWarranties(prev => [addedWarranty, ...prev]);
        alert("Garantía registrada correctamente.");
      }
    } catch (error: any) {
      console.error('Error adding warranty:', error);
      alert(`Error al registrar garantía: ${formatError(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateWarrantyStatus = async (id: string, newStatus: Warranty['status']) => {
    if (!session) return;
    // Optimistic update
    setWarranties(prev => prev.map(w => w.id === id ? { ...w, status: newStatus } : w));

    try {
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
    if (!window.confirm("¿Estás seguro de eliminar esta garantía PERMANENTEMENTE?")) return;
    if (!session) return;

    // Optimistic remove
    setWarranties(prev => prev.filter(w => w.id !== warranty.id));

    try {
      // 1. Delete image from Drive if exists
      if (warranty.ticketImage && warranty.ticketImage.includes('drive.google.com')) {
        // Fire and forget image deletion to speed up UI, or await if strict
        deleteImageFromDriveScript(warranty.ticketImage).catch(e => console.error("Drive delete error", e));
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

  const NavButton = ({ view, icon: Icon, label, badge }: { view: 'form' | 'list' | 'dashboard' | 'closings' | 'warranties' | 'admin' | 'attendance' | 'supervision' | 'attendance-report', icon: any, label: string, badge?: number }) => {
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
    return <AuthForm />;
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
  if (userProfile && (!userProfile.fullName || userProfile.fullName.trim() === "")) {
    const userStoreName = stores.find(s => s.id === userProfile.storeId)?.name;
    return <CompleteProfile 
      profile={userProfile} 
      storeName={userStoreName}
      onComplete={(updated) => setUserProfile(updated)} 
    />;
  }

  // --- RENDER: SETUP / ERROR SCREEN ---
  if (isSetupNeeded || (connectionError && sales.length === 0 && closings.length === 0)) {
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
          <span className="bg-red-600 text-[10px] px-1.5 py-0.5 rounded-md font-black uppercase text-white animate-pulse">Beta</span>
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
              <span className="bg-red-600 text-[10px] px-1.5 py-0.5 rounded-md font-black uppercase text-white animate-pulse">Beta</span>
            </div>
            <p className="text-slate-500 text-[10px] font-bold tracking-widest text-center mt-4">PANEL DE CONTROL</p>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-500"><X /></button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          {userProfile?.role !== 'supervisor' && (
            <>
              <div className="text-[10px] font-bold text-slate-500 px-4 py-2 uppercase tracking-wider">Menú Principal</div>
              {userProfile?.role !== 'viewer' && (
                <>
                  <NavButton view="list" icon={LayoutList} label="Registro de Ventas" />
                  <NavButton view="attendance" icon={Clock} label="Asistencia" />
                </>
              )}
              <NavButton view="dashboard" icon={BarChart3} label="Estadísticas" />
              {userProfile?.role !== 'viewer' && (
                <NavButton view="closings" icon={CalendarCheck} label="Cierre de Venta" />
              )}
            </>
          )}
          
          {(userProfile?.role === 'admin' || userProfile?.role === 'supervisor' || userProfile?.email === 'jeissonjessy@gmail.com' || userProfile?.id === 'b4ba233c-afa9-42fc-9bed-afa0e9be3f8c') && (
            <>
              <div className="text-[10px] font-bold text-slate-500 px-4 py-2 mt-4 uppercase tracking-wider">Administración</div>
              {userProfile?.role === 'admin' && (
                <NavButton view="warranties" icon={ShieldAlert} label="Garantías" />
              )}
              <NavButton 
                view="attendance-report" 
                icon={CalendarCheck} 
                label="Reporte Asistencias" 
                badge={alerts.length > 0 ? alerts.length : undefined}
              />
              {userProfile?.role === 'admin' && (
                <NavButton view="admin" icon={Shield} label="Administración" />
              )}
              <NavButton view="supervision" icon={TrendingUp} label="Rendimiento" />
            </>
          )}
        </div>

        {/* User Profile Section */}
        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-xl p-3 flex items-center gap-3 border border-slate-700/50 hover:border-slate-600 transition-colors group">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">
                {userProfile?.fullName || userProfile?.email?.split('@')[0] || 'Usuario'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Shield className={`w-3 h-3 ${userProfile?.role === 'admin' ? 'text-yellow-400' : 'text-slate-500'}`} />
                <p className="text-slate-500 text-[10px] uppercase font-bold truncate">
                  {userProfile?.role === 'admin' ? 'Administrador' : userProfile?.role === 'supervisor' ? 'Supervisor' : userProfile?.role === 'viewer' ? 'Visualizador' : 'Vendedor'}
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
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                {currentView === 'list' && 'Historial de Ventas'}
                {currentView === 'form' && 'Nuevo Registro'}
                {currentView === 'dashboard' && 'Panel de Rendimiento'}
                {currentView === 'closings' && 'Cierre Diario'}
                {currentView === 'warranties' && 'Gestión de Garantías'}
                {currentView === 'attendance' && 'Control de Asistencia'}
                {currentView === 'attendance-report' && 'Vigilancia de Asistencias'}
                {currentView === 'admin' && 'Administración Maestra'}
                {isLoading && <Loader2 className="w-6 h-6 animate-spin text-blue-600" />}
              </h1>
              <p className="text-slate-500 mt-1 font-medium">
                {currentView === 'list' && 'Gestiona y consulta el historial de transacciones en la nube.'}
                {currentView === 'form' && 'Completa los detalles de la venta del dispositivo.'}
                {currentView === 'dashboard' && 'Visualiza métricas clave y cumplimiento de metas.'}
                {currentView === 'closings' && 'Realiza cortes y revisa ingresos acumulados.'}
                {currentView === 'warranties' && 'Administra equipos enviados a taller y su estado.'}
                {currentView === 'attendance' && 'Registra tus entradas, salidas y horarios de comida.'}
                {currentView === 'attendance-report' && 'Historial detallado y estatus actual de todo el personal.'}
                {currentView === 'admin' && 'Configura sucursales, gestiona permisos y expande el sistema.'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {(userProfile?.role === 'admin' || userProfile?.role === 'supervisor') && (
                 <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:bg-slate-50">
                    <Building className="w-4 h-4 text-blue-600" />
                    <select 
                      value={selectedStoreId}
                      onChange={(e) => setSelectedStoreId(e.target.value)}
                      className="bg-transparent text-xs font-black text-slate-800 outline-none cursor-pointer"
                    >
                      <option value="all" disabled={selectedStoreId !== 'all'}>Seleccionar Tienda...</option>
                      <option value="all">Ver Todas (Global)</option>
                      {stores
                        .filter(s => {
                          if (userProfile?.role === 'admin') return true;
                          if (userProfile?.role === 'supervisor' || userProfile?.role === 'viewer') {
                             if (userProfile.assignedStores && userProfile.assignedStores.length > 0) {
                               return userProfile.assignedStores.includes(s.id);
                             }
                             return true; // Global Access if no stores assigned
                          }
                          return s.id === userProfile?.storeId;
                        })
                        .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                 </div>
              )}

              {currentView === 'list' && (userProfile?.role === 'admin' || userProfile?.role === 'seller') && (
                <button
                  onClick={() => setCurrentView('form')}
                  className="hidden md:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5"
                >
                  <Plus className="w-5 h-5" />
                  Nueva Venta
                </button>
              )}
            </div>
          </div>

          <div className="fade-in">
            {currentView === 'list' && userProfile?.role !== 'supervisor' && userProfile?.role !== 'viewer' && (
              <SalesList
                sales={filteredSales}
                onDelete={handleDeleteSale}
                onEdit={(sale) => {
                  if (userProfile?.role === 'admin' || userProfile?.role === 'seller') {
                    setSaleToEdit(sale);
                    setCurrentView('form');
                  }
                }}
                onAdd={() => {
                  if (userProfile?.role === 'admin' || userProfile?.role === 'seller') {
                    setSaleToEdit(null);
                    setCurrentView('form');
                  }
                }}
                role={userProfile?.role}
                storeName={userProfile?.role === 'admin' 
                  ? (selectedStoreId === 'all' ? 'Todas las Tiendas' : stores.find(s => s.id === selectedStoreId)?.name) 
                  : stores.find(s => s.id === userProfile?.storeId)?.name}
              />
            )}
            {currentView === 'form' && (
              <SalesForm 
                onAddSale={handleAddSale} 
                onUpdateSale={handleUpdateSale}
                initialData={saleToEdit}
                role={userProfile?.role}
                userProfile={userProfile}
                stores={stores}
                activeStoreId={userProfile?.role === 'admin' && selectedStoreId !== 'all' ? selectedStoreId : userProfile?.storeId}
                onCancel={() => {
                  setSaleToEdit(null);
                  setCurrentView('list');
                }}
              />
            )}
            {currentView === 'dashboard' && userProfile?.role !== 'supervisor' && (
              <Dashboard 
                sales={filteredSales}
                closings={filteredClosings} 
                role={userProfile?.role}
                storeId={userProfile?.role === 'admin' ? (selectedStoreId === 'all' ? undefined : selectedStoreId) : userProfile?.storeId}
                storeName={userProfile?.role === 'admin' 
                  ? (selectedStoreId === 'all' ? 'Todas las Tiendas' : stores.find(s => s.id === selectedStoreId)?.name) 
                  : stores.find(s => s.id === userProfile?.storeId)?.name}
              />
            )}
            {currentView === 'closings' && userProfile?.role !== 'supervisor' && userProfile?.role !== 'viewer' && (
              <DailyClosings
                sales={filteredSales}
                closings={filteredClosings}
                onCloseDay={handleCloseDay}
                onDeleteClosing={handleDeleteClosing}
                role={userProfile?.role}
                storeName={userProfile?.role === 'admin' 
                  ? (selectedStoreId === 'all' ? 'Todas las Tiendas' : stores.find(s => s.id === selectedStoreId)?.name) 
                  : stores.find(s => s.id === userProfile?.storeId)?.name}
                activeStoreId={userProfile?.role === 'admin' ? selectedStoreId : userProfile?.storeId}
              />
            )}
            {currentView === 'warranties' && userProfile?.role !== 'supervisor' && (
              <Warranties
                warranties={filteredWarranties}
                onAddWarranty={handleAddWarranty}
                onUpdateStatus={handleUpdateWarrantyStatus}
                onDeleteWarranty={handleDeleteWarranty}
                brandConfigs={BRAND_CONFIGS}
                isAdmin={userProfile?.role === 'admin' || userProfile?.role === 'supervisor'}
                userProfile={userProfile}
                stores={stores}
              />
            )}
            {currentView === 'attendance' && userProfile && (
              <AttendanceManager 
                user={userProfile} 
                storeName={stores.find(s => s.id === userProfile.storeId)?.name}
              />
            )}
            {currentView === 'attendance-report' && (
              <AttendanceReport 
                selectedStoreId={selectedStoreId}
                stores={stores}
                userProfile={userProfile}
                onRefreshStores={fetchInitialData}
              />
            )}
            {currentView === 'supervision' && (userProfile?.role === 'admin' || userProfile?.role === 'supervisor') && (
              <SupervisionPanel 
                stores={stores}
                selectedStoreId={selectedStoreId}
                userProfile={userProfile}
              />
            )}
            {currentView === 'admin' && (userProfile?.role === 'admin' || userProfile?.role === 'supervisor') && (
              <AdminPanel 
                role={userProfile.role}
                onRefresh={() => {
                  fetchData();
                  if (session) fetchUserProfile(session.user.id);
                }} 
              />
            )}
          </div>

        </div>
      </main>

      {/* Floating Action Button (Mobile Only for List View) */}
      {currentView === 'list' && (userProfile?.role === 'admin' || userProfile?.role === 'seller') && (
        <button
          onClick={() => {
            setSaleToEdit(null);
            setCurrentView('form');
          }}
          className="md:hidden fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-2xl shadow-blue-500/40 hover:bg-blue-700 transition-transform active:scale-95 z-30"
          title="Nueva Venta"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}




    </div>
  );
};

export default App;