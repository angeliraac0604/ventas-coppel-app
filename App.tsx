import React, { useState, useEffect } from 'react';
import { Smartphone, LayoutList, BarChart3, Menu, X, CalendarCheck, Plus, LogOut, User as UserIcon, ChevronRight, Loader2, RefreshCcw, Database, AlertTriangle, Copy, Check, Shield, ShieldAlert, Wand2 } from 'lucide-react';
import SalesForm from './components/SalesForm';
import SalesList from './components/SalesList';
import Dashboard from './components/Dashboard';
import DailyClosings from './components/DailyClosings';
import Warranties from './components/Warranties';
import AuthForm from './components/AuthForm';
import { Sale, DailyClose, Brand, UserProfile, Warranty } from './types';
import { BRAND_CONFIGS } from './constants';
import { supabase } from './services/supabaseClient';
import { deleteImageFromDriveScript } from './services/googleAppsScriptService';

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App State
  // App State
  const [currentView, setCurrentView] = useState<'form' | 'list' | 'dashboard' | 'closings' | 'warranties'>('list');

  useEffect(() => {
    localStorage.setItem('app_current_view', currentView);

    // --- HISTORY API INTEGRATION (Back Gesture) ---
    // Update history when view changes programmatically
    const currentState = window.history.state;
    if (currentState?.view !== currentView) {
      window.history.pushState({ view: currentView }, '');
    }
  }, [currentView]);

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
create table if not exists public.sales (
  id uuid default gen_random_uuid() primary key,
  invoice_number text not null,
  customer_name text not null,
  price numeric not null,
  brand text not null,
  date text not null,
  ticket_image text,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.daily_closings (
  id text primary key,
  date text not null unique,
  total_sales numeric not null,
  total_revenue numeric not null,
  closed_at text not null,
  top_brand text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. SISTEMA DE USUARIOS Y ROLES
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  role text default 'seller', -- 'admin' or 'seller'
  full_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Trigger para crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (new.id, new.email, 'seller', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- Eliminar trigger si existe para recrearlo (evita duplicados en re-runs)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. SEGURIDAD (RLS)
alter table public.sales enable row level security;
alter table public.daily_closings enable row level security;
alter table public.profiles enable row level security;

-- Limpiar políticas viejas (para evitar conflictos)
drop policy if exists "Public read sales" on public.sales;
drop policy if exists "Public insert sales" on public.sales;
drop policy if exists "Public delete sales" on public.sales;
drop policy if exists "Admins can delete sales" on public.sales;
drop policy if exists "Public read closings" on public.daily_closings;

drop policy if exists "Authenticated users can view sales" on public.sales;
drop policy if exists "Authenticated users can insert sales" on public.sales;
drop policy if exists "Users can delete own sales" on public.sales;

drop policy if exists "Authenticated users can view closings" on public.daily_closings;
drop policy if exists "Authenticated users can insert closings" on public.daily_closings;
drop policy if exists "Authenticated users can update closings" on public.daily_closings;

-- Nuevas Políticas de Ventas
create policy "Authenticated users can view sales" on public.sales for select to authenticated using (true);
create policy "Authenticated users can insert sales" on public.sales for insert to authenticated with check (auth.uid() = created_by);

-- Permitir borrar si eres el creador O si eres admin
create policy "Users can delete own sales" on public.sales for delete to authenticated using (
  auth.uid() = created_by OR 
  public.is_admin()
);

-- UPDATE FOR VIEWER ROLE (Run this if you have Viewers)
-- 1. Create Policy to restrict Insert/Update for Viewers if needed (Optional, UI hides it)
-- To be strict: You would update the "insert" policies to exclude role = 'viewer'.

-- Permitir editar si eres el creador O si eres admin (NECESARIO PARA NORMALIZAR FACTURAS)
drop policy if exists "Authenticated users can update sales" on public.sales;
create policy "Authenticated users can update sales" on public.sales for update to authenticated using (
  auth.uid() = created_by OR
  public.is_admin()
);

-- Nuevas Políticas de Cierres
create policy "Authenticated users can view closings" on public.daily_closings for select to authenticated using (true);
create policy "Authenticated users can insert closings" on public.daily_closings for insert to authenticated with check (true);
create policy "Authenticated users can update closings" on public.daily_closings for update to authenticated using (true);
create policy "Authenticated users can delete closings" on public.daily_closings for delete to authenticated using (true);

-- Políticas de Perfiles
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;

create policy "Users can view own profile" on public.profiles for select to authenticated using (auth.uid() = id);
-- Helper para evitar recursión infinita en políticas
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

create policy "Admins can view all profiles" on public.profiles for select to authenticated using (
  public.is_admin()
);

-- 4. ALMACENAMIENTO (STORAGE)
-- Insertar bucket si no existe
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Políticas de Storage (Eliminar anteriores para evitar errores)
drop policy if exists "Public Access Receipts" on storage.objects;
drop policy if exists "Auth Upload Receipts" on storage.objects;

-- Permitir ver imágenes a cualquiera (para que se vean en la app)
create policy "Public Access Receipts" on storage.objects for select
using ( bucket_id = 'receipts' );

-- Permitir subir imágenes solo a usuarios autenticados
create policy "Auth Upload Receipts" on storage.objects for insert
with check ( bucket_id = 'receipts' and auth.role() = 'authenticated' );

-- 5. METAS MENSUALES
create table if not exists public.monthly_goals (
  month text primary key,
  revenue_goal numeric not null,
  devices_goal numeric not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.monthly_goals enable row level security;

-- Todos pueden ver las metas
drop policy if exists "Authenticated users can view goals" on public.monthly_goals;
create policy "Authenticated users can view goals" on public.monthly_goals for select to authenticated using (true);

-- Solo admins pueden modificar (aunque por simplicidad técnica permitimos auth update, idealmente restringido)
-- Usamos is_admin() si está ya definido, si no, fallback a authenticated para permitir upsert si la función falla o no existe aun.
drop policy if exists "Authenticated users can upsert goals" on public.monthly_goals;
create policy "Authenticated users can upsert goals" on public.monthly_goals for all to authenticated using (true) with check (true);
create policy "Authenticated users can upsert goals" on public.monthly_goals for all to authenticated using (true) with check (true);

-- 6. GARANTÍAS
create table if not exists public.warranties (
  id uuid default gen_random_uuid() primary key,
  reception_date text not null,
  invoice_number text not null, -- Nuevo
  brand text not null,
  model text not null,
  imei text,
  issue_description text not null,
  accessories text, -- Nuevo
  physical_condition text not null,
  contact_number text not null,
  ticket_image text,
  possible_entry_date text, -- Nuevo
  status text not null default 'received', -- received, sent_to_provider, in_store, delivered
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.warranties enable row level security;

-- Policies for Warranties
drop policy if exists "Admins can do everything on warranties" on public.warranties;
-- Allow admins full access, and perhaps sellers read/write access too if needed later. 
-- For now, to be safe and functional:
create policy "Authenticated users can do everything on warranties" on public.warranties for all to authenticated using (true) with check (true);
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
        .single();

      if (data) {
        setUserProfile(data as UserProfile);
      } else if (error && error.code === 'PGRST116') {
        console.warn("Profile not found, waiting for trigger or manual creation");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleLogout = async () => {
    // Limpiamos el rastreador de fecha al salir manualmente
    localStorage.removeItem('sales_app_session_date');
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
      const storedDate = localStorage.getItem(SESSION_DATE_KEY);

      if (!storedDate) {
        // Si no hay fecha guardada (primer login del día o recarga), guardamos la actual
        localStorage.setItem(SESSION_DATE_KEY, currentDateStr);
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

  // --- AUTOMATIC CLOSE LOGIC (9 PM) ---
  useEffect(() => {
    if (!session || sales.length === 0) return;

    const checkAutoClose = async () => {
      const now = new Date();
      // Si son las 9 PM (21) o más
      if (now.getHours() >= 21) {
        // Construir string de hoy YYYY-MM-DD
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

        // Verificar si YA existe corte hoy
        const exists = closings.find(c => c.date === todayStr);
        if (!exists) {
          console.log("⏰ 9 PM Detectado: Ejecutando corte automático...");

          // CALCULAR DATOS DEL DÍA
          const todaySales = sales.filter(s => s.date === todayStr);
          if (todaySales.length === 0) {
            console.log("No hay ventas hoy, omitiendo corte vacío (o crear corte en ceros si se prefiere).");
            // Opcional: Crear corte en 0 si es política de la empresa.
            return;
          }

          const revenue = todaySales.reduce((sum, s) => sum + s.price, 0);

          // Top Brand logic
          const counts: Record<string, number> = {};
          todaySales.forEach(s => { counts[s.brand] = (counts[s.brand] || 0) + 1; });
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          const topBrand = top ? (top[0] as Brand) : Brand.OTRO;

          // PAYLOAD
          const newClose = {
            id: `close-${todayStr}`,
            date: todayStr,
            total_sales: todaySales.length,
            total_revenue: revenue,
            closed_at: now.toISOString(),
            top_brand: topBrand
          };

          try {
            const { error } = await supabase
              .from('daily_closings')
              .upsert(newClose, { onConflict: 'id' });

            if (error) throw error;

            console.log("✅ Corte automático realizado con éxito.");
            // Actualizar estado local silenciosamente
            const formattedClose: DailyClose = {
              id: newClose.id,
              date: newClose.date,
              totalSales: newClose.total_sales,
              totalRevenue: newClose.total_revenue,
              closedAt: newClose.closed_at,
              topBrand: newClose.top_brand
            };
            setClosings(prev => [formattedClose, ...prev]);

          } catch (err) {
            console.error("Error en corte automático:", err);
          }
        }
      }
    };

    const timer = setInterval(checkAutoClose, 60000); // Check every minute
    checkAutoClose(); // Check on mount/update too

    return () => clearInterval(timer);
  }, [session, sales, closings]);

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
      // 1. Fetch Sales
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .order('date', { ascending: false });

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
        createdBy: row.created_by
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
        topBrand: row.top_brand
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
          possibleEntryDate: row.possible_entry_date, // Nuevo
          status: row.status
        }));
        setWarranties(formattedWarranties);
      } else {
        setWarranties([]);
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
                createdBy: payload.new.created_by
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
      const dbPayload = {
        invoice_number: newSaleData.invoiceNumber,
        customer_name: newSaleData.customerName,
        price: newSaleData.price,
        brand: newSaleData.brand,
        date: newSaleData.date,
        ticket_image: newSaleData.ticketImage || null,
        created_by: session.user.id // Link to user
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
          createdBy: row.created_by
        };
        setSales(prev => [newSale, ...prev]);
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
        ticket_image: updatedSale.ticketImage // Can be null or URL
      };

      const { error } = await supabase
        .from('sales')
        .update(dbPayload)
        .eq('id', updatedSale.id);

      if (error) throw error;

      setSales(prev => prev.map(s => s.id === updatedSale.id ? updatedSale : s));
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

      const dbPayload = {
        id: `close-${newClose.date}`,
        date: newClose.date,
        total_sales: newClose.totalSales,
        total_revenue: newClose.totalRevenue,
        closed_at: newClose.closedAt,
        top_brand: newClose.topBrand
      };

      const { error } = await supabase
        .from('daily_closings')
        .upsert(dbPayload, { onConflict: 'id' });

      if (error) throw error;

      setClosings(prev => {
        // Remove existing if any, then add new one
        const filtered = prev.filter(c => c.date !== newClose.date);
        return [newClose, ...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      alert("Cierre de día actualizado correctamente.");

    } catch (error: any) {
      console.error('Error closing day:', error);
      alert(`Error al realizar el corte del día: ${formatError(error)}`);
    }
  };

  const handleAddWarranty = async (newWarranty: Omit<Warranty, 'id'>) => {
    if (!session) return;
    setIsLoading(true);
    try {
      const dbPayload = {
        reception_date: newWarranty.receptionDate,
        invoice_number: newWarranty.invoiceNumber, // Nuevo
        brand: newWarranty.brand,
        model: newWarranty.model,
        imei: newWarranty.imei,
        issue_description: newWarranty.issueDescription,
        accessories: newWarranty.accessories, // Nuevo
        physical_condition: newWarranty.physicalCondition,
        contact_number: newWarranty.contactNumber,
        ticket_image: newWarranty.ticketImage,
        possible_entry_date: newWarranty.possibleEntryDate, // Nuevo
        status: newWarranty.status
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
          status: row.status
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

  const NavButton = ({ view, icon: Icon, label }: { view: 'form' | 'list' | 'dashboard' | 'closings' | 'warranties', icon: any, label: string }) => {
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
        {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
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
        <div className="flex-1 px-4 space-y-2 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-500 px-4 py-2 uppercase tracking-wider">Menú Principal</div>
          <NavButton view="list" icon={LayoutList} label="Registro de Ventas" />
          <NavButton view="dashboard" icon={BarChart3} label="Estadísticas" />
          <NavButton view="closings" icon={CalendarCheck} label="Cierre de Venta" />
          {(userProfile?.role === 'admin' || userProfile?.email === 'jeissonjessy@gmail.com' || userProfile?.id === 'b4ba233c-afa9-42fc-9bed-afa0e9be3f8c') && (
            <NavButton view="warranties" icon={ShieldAlert} label="Garantías" />
          )}
        </div>

        {/* User Profile Section */}
        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-xl p-3 flex items-center gap-3 border border-slate-700/50 hover:border-slate-600 transition-colors group">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {userProfile?.email?.split('@')[0] || 'Usuario'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Shield className={`w-3 h-3 ${userProfile?.role === 'admin' ? 'text-yellow-400' : 'text-slate-500'}`} />
                <p className="text-slate-500 text-[10px] uppercase font-bold truncate">
                  {userProfile?.role === 'admin' ? 'Administrador' : userProfile?.role === 'viewer' ? 'Visualizador' : 'Vendedor'}
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
                {isLoading && <Loader2 className="w-6 h-6 animate-spin text-blue-600" />}
              </h1>
              <p className="text-slate-500 mt-1 font-medium">
                {currentView === 'list' && 'Gestiona y consulta el historial de transacciones en la nube.'}
                {currentView === 'form' && 'Completa los detalles de la venta del dispositivo.'}
                {currentView === 'dashboard' && 'Visualiza métricas clave y cumplimiento de metas.'}
                {currentView === 'closings' && 'Realiza cortes y revisa ingresos acumulados.'}
                {currentView === 'warranties' && 'Administra equipos enviados a taller y su estado.'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Refresh button removed per user request */}

              {currentView === 'list' && userProfile?.role !== 'viewer' && (
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
            {currentView === 'list' && (
              <SalesList
                sales={sales}
                onDelete={handleDeleteSale}
                onEdit={(sale) => {
                  setSaleToEdit(sale);
                  setCurrentView('form');
                }}
                onAdd={() => {
                  setSaleToEdit(null);
                  setCurrentView('form');
                }}
                role={userProfile?.role}
              />
            )}
            {currentView === 'form' && (
              <SalesForm
                onAddSale={handleAddSale}
                onUpdateSale={handleUpdateSale}
                initialData={saleToEdit}
                role={userProfile?.role}
                onCancel={() => {
                  setSaleToEdit(null);
                  setCurrentView('list');
                }}
              />
            )}
            {currentView === 'dashboard' && (
              <Dashboard sales={sales} closings={closings} role={userProfile?.role} />
            )}
            {currentView === 'closings' && (
              <DailyClosings
                sales={sales}
                closings={closings}
                onCloseDay={handleCloseDay}
                role={userProfile?.role}
              />
            )}
            {currentView === 'warranties' && (
              <Warranties
                warranties={warranties}
                onAddWarranty={handleAddWarranty}
                onUpdateStatus={handleUpdateWarrantyStatus}
                onDeleteWarranty={handleDeleteWarranty}
                brandConfigs={BRAND_CONFIGS}
                isAdmin={userProfile?.role === 'admin'}
              />
            )}
          </div>

        </div>
      </main>

      {/* Floating Action Button (Mobile Only for List View) */}
      {currentView === 'list' && userProfile?.role !== 'viewer' && (
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