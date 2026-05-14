import React, { useState, useEffect } from 'react';
import { sendInviteEmailScript } from '../services/googleAppsScriptService';
import { 
  Users, 
  Store as StoreIcon, 
  Trash2, 
  UserPlus, 
  Mail, 
  Shield, 
  Search, 
  Filter, 
  ChevronRight, 
  X, 
  Check, 
  AlertCircle,
  CheckCircle,
  Save,
  Edit2,
  Building,
  Plus,
  ArrowRight,
  Clock,
  TrendingUp,
  Calendar,
  Loader2,
  LayoutDashboard,
  Bell,
  MessageSquare,
  Undo2,
  ShieldCheck,
  ArrowUpDown
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Store, UserProfile, UserRole } from '../types';

interface AdminPanelProps {
  userProfile?: UserProfile | null;
  onRefresh?: () => void;
  onViewRequests?: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ userProfile, onRefresh, onViewRequests }) => {
  const role = userProfile?.role;
  const [activeModal, setActiveModal] = useState<'none' | 'store' | 'invite' | 'direct' | 'stores-list' | 'profile-edit'>('none');
  const [isLoading, setIsLoading] = useState(false);
  const [isDirectLoading, setIsDirectLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'role' | 'store', direction: 'asc' | 'desc' } | null>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<any[]>([]);

  const ROLE_HIERARCHY: Record<string, number> = {
    admin: 1,
    supervisor: 2,
    seller: 3,
    viewer: 4
  };

  const handleSort = (key: 'name' | 'role' | 'store') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedProfiles = () => {
    let items = [...profiles];
    
    // First apply existing filters (search and store)
    items = items.filter(profile => (storeFilter === 'all' || profile.storeId === storeFilter))
                 .filter(profile => (
                   profile.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                   profile.email.toLowerCase().includes(searchQuery.toLowerCase())
                 ));

    if (sortConfig) {
      items.sort((a, b) => {
        if (sortConfig.key === 'name') {
          const nameA = (a.fullName || '').toLowerCase();
          const nameB = (b.fullName || '').toLowerCase();
          if (nameA === nameB) return 0;
          const result = nameA.localeCompare(nameB);
          return sortConfig.direction === 'asc' ? result : -result;
        }
        
        if (sortConfig.key === 'role') {
          const rankA = ROLE_HIERARCHY[a.role] || 99;
          const rankB = ROLE_HIERARCHY[b.role] || 99;
          if (rankA === rankB) return 0;
          return sortConfig.direction === 'asc' ? rankA - rankB : rankB - rankA;
        }

        if (sortConfig.key === 'store') {
          const storeA = stores.find(s => s.id === a.storeId)?.name || 'GLOBAL';
          const storeB = stores.find(s => s.id === b.storeId)?.name || 'GLOBAL';
          if (storeA === storeB) return 0;
          const result = storeA.localeCompare(storeB);
          return sortConfig.direction === 'asc' ? result : -result;
        }

        return 0;
      });
    }
    
    return items;
  };

  // Store Form
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreLocation, setNewStoreLocation] = useState('');
  const [newStoreType, setNewStoreType] = useState('Coppel');
  const [newStorePrefix, setNewStorePrefix] = useState('');

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('seller' as UserRole);
  const [inviteStoreId, setInviteStoreId] = useState('');
  const [inviteAssignedStores, setInviteAssignedStores] = useState<string[]>([]);
  const [inviteCanJustifyAbsences, setInviteCanJustifyAbsences] = useState(false);
  const [inviteCanManageRestDays, setInviteCanManageRestDays] = useState(false);
  const [inviteCanForceAttendance, setInviteCanForceAttendance] = useState(false);
  const [inviteCanSetSchedules, setInviteCanSetSchedules] = useState(false);
  const [inviteCanSellKit, setInviteCanSellKit] = useState(true);
  const [inviteCanSellChip0, setInviteCanSellChip0] = useState(false);
  const [inviteCanSellPortability, setInviteCanSellPortability] = useState(false);
  const [inviteCanSellChipExpress, setInviteCanSellChipExpress] = useState(false);

  // Direct Create Form
  const [directEmail, setDirectEmail] = useState('');
  const [directPassword, setDirectPassword] = useState('');
  const [directFirstName, setDirectFirstName] = useState('');
  const [directLastName, setDirectLastName] = useState('');
  const [directRole, setDirectRole] = useState('seller' as UserRole);
  const [directStoreId, setDirectStoreId] = useState('');

  // Edit State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [targetFullName, setTargetFullName] = useState('');
  const [targetRole, setTargetRole] = useState<UserRole>('seller');
  const [targetStoreId, setTargetStoreId] = useState('');
  const [targetAssignedStores, setTargetAssignedStores] = useState<string[]>([]);
  const [targetCanJustifyAbsences, setTargetCanJustifyAbsences] = useState(false);
  const [targetCanManageRestDays, setTargetCanManageRestDays] = useState(false);
  const [targetCanForceAttendance, setTargetCanForceAttendance] = useState(false);
  const [targetCanSetSchedules, setTargetCanSetSchedules] = useState(false);
  const [targetCanSellKit, setTargetCanSellKit] = useState(true);
  const [targetCanSellChip0, setTargetCanSellChip0] = useState(false);
  const [targetCanSellPortability, setTargetCanSellPortability] = useState(false);
  const [targetCanSellChipExpress, setTargetCanSellChipExpress] = useState(false);
  const [directCanJustifyAbsences, setDirectCanJustifyAbsences] = useState(false);
  const [directCanManageRestDays, setDirectCanManageRestDays] = useState(false);
  const [directCanForceAttendance, setDirectCanForceAttendance] = useState(false);
  const [directCanSetSchedules, setDirectCanSetSchedules] = useState(false);
  const [directCanSellKit, setDirectCanSellKit] = useState(true);
  const [directCanSellChip0, setDirectCanSellChip0] = useState(false);
  const [directCanSellPortability, setDirectCanSellPortability] = useState(false);
  const [directCanSellChipExpress, setDirectCanSellChipExpress] = useState(false);
  const [directAssignedStores, setDirectAssignedStores] = useState<string[]>([]);
  
  // Store Edit State
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editStoreName, setEditStoreName] = useState('');
  const [editStoreLocation, setEditStoreLocation] = useState('');
  const [editStoreType, setEditStoreType] = useState('Coppel');
  const [editStorePrefix, setEditStorePrefix] = useState('');

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [attendanceStoreFilter, setAttendanceStoreFilter] = useState('all');
  const [performanceStoreFilter, setPerformanceStoreFilter] = useState('all');

  useEffect(() => {
    fetchAllData();
  }, []);


  const getAvailableStores = () => {
    const user = profiles.find(p => p.id === (supabase.auth.getUser() as any).data?.user?.id);
    if (!user || user.role === 'admin') return stores;
    if (user.assignedStores && user.assignedStores.length > 0) {
      return stores.filter(s => user.assignedStores.includes(s.id));
    }
    return stores; // Global supervisor fallback
  };

  const fetchAllData = async () => {
    setDataLoading(true);
    try {
      // 1. Fetch Stores
      const { data: storesData } = await supabase.from('stores').select('*').order('name');
      if (storesData) {
        setStores(storesData.map((s: any) => ({
          id: s.id,
          name: s.name,
          location: s.location,
          entryTime: s.entry_time,
          exitTime: s.exit_time,
          lunchDurationMinutes: s.lunch_duration_minutes,
          type: s.type,
          prefix: s.prefix
        })));
      }

      // 2. Fetch Profiles
      const { data: profilesData } = await supabase.from('profiles').select('*');
      if (profilesData) {
        setProfiles(profilesData.map((p: any) => ({
          id: p.id,
          email: p.email,
          role: p.role,
          fullName: p.full_name,
          storeId: p.store_id,
          assignedStores: p.assigned_stores || [],
          canJustifyAbsences: p.can_justify_absences || false,
          canManageRestDays: p.can_manage_rest_days || false,
          canForceAttendance: p.can_force_attendance || false,
          canSetSchedules: p.can_set_schedules || false,
          canSellKit: p.can_sell_kit ?? true,
          canSellChip0: p.can_sell_chip_0 || false,
          canSellPortability: p.can_sell_portability || false,
          canSellChipExpress: p.can_sell_chip_express || false
        })));
      }

      // 3. Fetch Pending Invites (Filter out those who already have a profile)
      const { data: invitesData } = await supabase.from('pending_invitations').select('*, stores(name)');
      if (invitesData) {
        // Clean up invites for emails that already have a profile
        const activeEmails = new Set(profilesData?.map(p => p.email.toLowerCase()));
        const filteredInvites = invitesData.filter(inv => !activeEmails.has(inv.email.toLowerCase()));
        
        // Auto-delete redundant invites from DB asynchronously (Safely check for ID)
        const redundantInvites = invitesData.filter(inv => activeEmails.has(inv.email.toLowerCase()));
        if (redundantInvites.length > 0) {
          Promise.all(redundantInvites.map(inv => {
            if (inv.id) return supabase.from('pending_invitations').delete().eq('id', inv.id);
            return Promise.resolve();
          })).catch(err => console.error("Error cleaning up invites:", err));
        }

        setInvites(filteredInvites);
      }

    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const dbPayload = { 
        name: newStoreName.toUpperCase(), 
        location: newStoreLocation.toUpperCase(),
        type: newStoreType,
        prefix: newStorePrefix
      };
      
      const { error } = await supabase.from('stores').insert([dbPayload]);
      if (error) throw error;
      setNewStoreName('');
      setNewStoreLocation('');
      setNewStoreType('Coppel');
      setNewStorePrefix('');
      setActiveModal('none');
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const emailLower = inviteEmail.toLowerCase().trim();

      // INTELIGENTE: Verificar si ya existe en perfiles o invitaciones
      const emailExistsInProfiles = profiles.some(p => p.email.toLowerCase() === emailLower);
      const emailExistsInInvites = invites.some(inv => inv.email.toLowerCase() === emailLower);

      if (emailExistsInProfiles) {
        alert('⚠️ Este usuario ya cuenta con un registro activo en el sistema.');
        setIsLoading(false);
        return;
      }

      if (emailExistsInInvites) {
        alert('⚠️ Ya existe una invitación pendiente enviada a este correo.');
        setIsLoading(false);
        return;
      }

      // LIMPIEZA AUTOMÁTICA: Si el usuario no tiene perfil pero existe en Auth (huérfano),
      // lo eliminamos para que su registro sea exitoso.
      await supabase.rpc('delete_user_by_email', { target_email: emailLower });

      const { error } = await supabase.from('pending_invitations').insert([
        { 
          email: emailLower, 
          role: inviteRole, 
          store_id: inviteStoreId || null,
          invited_by: (await supabase.auth.getUser()).data.user?.id,
          assigned_stores: (inviteRole === 'supervisor' || inviteRole === 'viewer') ? inviteAssignedStores : null,
          can_justify_absences: inviteCanJustifyAbsences,
          can_manage_rest_days: inviteCanManageRestDays,
          can_force_attendance: inviteCanForceAttendance,
          can_set_schedules: inviteCanSetSchedules,
          can_sell_kit: inviteCanSellKit,
          can_sell_chip_0: inviteCanSellChip0,
          can_sell_portability: inviteCanSellPortability,
          can_sell_chip_express: inviteCanSellChipExpress
        }
      ]);
      if (error) throw error;
      
      // Enviar correo de invitación
      const targetStore = stores.find(s => s.id === inviteStoreId)?.name || 'Global';
      await sendInviteEmailScript(emailLower, inviteRole, targetStore);

      setInviteEmail('');
      setInviteAssignedStores([]);
      setInviteCanJustifyAbsences(false);
      setInviteCanManageRestDays(false);
      setInviteCanForceAttendance(false);
      setInviteCanSetSchedules(false);
      setActiveModal('none');
      fetchAllData();
    } catch (err: any) {
      alert('Error al invitar: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUserDirectly = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDirectLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: directEmail,
        password: directPassword,
        options: {
          data: {
            full_name: `${directFirstName} ${directLastName}`.trim().toUpperCase(),
            role: directRole,
            store_id: directStoreId || null,
            can_justify_absences: directCanJustifyAbsences,
            can_manage_rest_days: directCanManageRestDays,
            can_force_attendance: directCanForceAttendance,
            can_set_schedules: directCanSetSchedules,
            can_sell_kit: directCanSellKit,
            can_sell_chip_0: directCanSellChip0,
            can_sell_portability: directCanSellPortability,
            can_sell_chip_express: directCanSellChipExpress,
            assigned_stores: (directRole === 'supervisor' || directRole === 'viewer') ? directAssignedStores : null
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No se pudo crear el usuario');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: `${directFirstName.trim()} ${directLastName.trim()}`.toUpperCase(),
          role: directRole,
          store_id: directStoreId || null,
          can_justify_absences: directCanJustifyAbsences,
          can_manage_rest_days: directCanManageRestDays,
          can_force_attendance: directCanForceAttendance,
          can_set_schedules: directCanSetSchedules,
          can_sell_kit: directCanSellKit,
          can_sell_chip_0: directCanSellChip0,
          can_sell_portability: directCanSellPortability,
          can_sell_chip_express: directCanSellChipExpress,
          assigned_stores: (directRole === 'supervisor' || directRole === 'viewer') ? directAssignedStores : null
        })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;

      alert('Usuario creado correctamente.');
      setDirectEmail('');
      setDirectPassword('');
      setDirectFirstName('');
      setDirectLastName('');
      setActiveModal('none');
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (err.status === 422 || err.message?.includes('already registered')) {
        alert('⚠️ Este correo ya está registrado en el sistema. El usuario debe iniciar sesión directamente.');
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      setIsDirectLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editingUserId) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: targetFullName.toUpperCase(),
        role: targetRole,
        store_id: targetStoreId || null,
        assigned_stores: (targetRole === 'supervisor' || targetRole === 'viewer') ? targetAssignedStores : null,
        can_justify_absences: targetCanJustifyAbsences,
        can_manage_rest_days: targetCanManageRestDays,
        can_force_attendance: targetCanForceAttendance,
        can_set_schedules: targetCanSetSchedules,
        can_sell_kit: targetCanSellKit,
        can_sell_chip_0: targetCanSellChip0,
        can_sell_portability: targetCanSellPortability,
        can_sell_chip_express: targetCanSellChipExpress
      }).eq('id', editingUserId);

      if (error) throw error;
      setEditingUserId(null);
      setActiveModal('none');
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
      const { error } = await supabase.rpc('delete_user_entirely', { target_user_id: userId });
      if (error) throw error;
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };
  
  const handleUpdateStore = async (storeId: string) => {
    try {
      const { error } = await supabase.from('stores').update({
        name: editStoreName.toUpperCase(),
        location: editStoreLocation.toUpperCase(),
        type: editStoreType,
        prefix: editStorePrefix
      }).eq('id', storeId);

      if (error) throw error;
      setEditingStoreId(null);
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteStore = async (storeId: string, storeName: string) => {
    if (storeName.includes('CÁRDENAS') && storeName.includes('1053')) {
      alert('⚠️ Esta sucursal es crítica para el sistema y no puede ser eliminada.');
      return;
    }
    if (!confirm('¿Estás seguro de eliminar esta sucursal?')) return;
    try {
      const { error } = await supabase.from('stores').delete().eq('id', storeId);
      if (error) throw error;
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleCancelInvite = async (email: string) => {
    if (!confirm(`¿Estás seguro de cancelar la invitación y eliminar por completo el acceso de ${email}?`)) return;
    try {
      const { error } = await supabase.rpc('delete_user_by_email', { target_email: email });
      if (error) throw error;
      fetchAllData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  if (dataLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-pulse">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
           <Shield className="w-8 h-8 text-indigo-200 animate-spin" />
        </div>
        <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Cargando Administración...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header with Stats Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-50 flex items-center justify-between group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="relative z-10">
            <h2 className="text-4xl font-black text-slate-800 tracking-tighter mb-2">Panel Admin</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Gestión de sucursales y personal</p>
          </div>
          <div className="relative z-10 flex gap-3">
             <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase">Usuarios</p>
                <p className="text-2xl font-black text-slate-800">{profiles.length}</p>
             </div>
             <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <Shield className="w-6 h-6" />
             </div>
          </div>
        </div>


        <button onClick={() => setActiveModal('invite')} className="bg-white p-8 rounded-[2.5rem] shadow-lg shadow-slate-100 border border-slate-50 flex flex-col items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all group">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
            <Mail className="w-7 h-7" />
          </div>
          <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Invitar Usuario</p>
        </button>

        <button onClick={() => setActiveModal('direct')} className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl shadow-indigo-200 flex flex-col items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all group">
          <div className="w-14 h-14 bg-white/20 text-white rounded-2xl flex items-center justify-center">
            <UserPlus className="w-7 h-7" />
          </div>
          <p className="text-xs font-black text-white uppercase tracking-widest">Alta Directa</p>
        </button>
      </div>

      {/* Contenido de Administración (Personal y Sucursales) */}

        {/* Main Management Area (Personnel) */}
          <div className="bg-white rounded-[3.5rem] shadow-2xl shadow-slate-200/60 overflow-hidden border border-slate-50">
            <div className="p-10 border-b border-slate-50 flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50/30">
          <div className="flex items-center gap-6 w-full md:w-auto">
             <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-indigo-600 border border-slate-100">
                <Users className="w-7 h-7" />
             </div>
             <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Personal Activo</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Administra roles y sucursales</p>
             </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="BUSCAR POR NOMBRE O CORREO..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-indigo-50 transition-all"
              />
            </div>
            
            <select 
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-2xl px-6 py-4 text-xs font-black uppercase outline-none"
            >
              <option value="all">TODAS LAS TIENDAS</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <button onClick={() => setActiveModal('stores-list')} className="p-4 bg-white text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest">
              <Building className="w-4 h-4" /> Tiendas
            </button>
            
            <button onClick={() => setActiveModal('store')} className="p-4 bg-white text-indigo-600 border-2 border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest">
              <Plus className="w-4 h-4" /> Nueva Tienda
            </button>
          </div>
        </div>

        {/* Table/Cards Container */}
        <div className="bg-white">
          {/* Desktop Header (Hidden on Mobile) */}
          <div className="hidden md:grid md:grid-cols-[2fr_1fr_1.5fr_1fr] bg-slate-50/50 border-b border-slate-50 px-10 py-6">
            <button 
              onClick={() => handleSort('name')}
              className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-indigo-600 transition-colors w-fit"
            >
              Colaborador
              <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'name' ? 'text-indigo-600' : 'text-slate-300'}`} />
            </button>
            <button 
              onClick={() => handleSort('role')}
              className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-indigo-600 transition-colors w-fit"
            >
              Rol / Nivel
              <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'role' ? 'text-indigo-600' : 'text-slate-300'}`} />
            </button>
            <button 
              onClick={() => handleSort('store')}
              className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-indigo-600 transition-colors w-fit"
            >
              Sucursal Asignada
              <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'store' ? 'text-indigo-600' : 'text-slate-300'}`} />
            </button>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Acciones</div>
          </div>

          <div className="divide-y divide-slate-50">
            {/* PENDING INVITES */}
            {invites.map(invite => (
              <div key={invite.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1.5fr_1fr] bg-blue-50/20 italic px-6 md:px-10 py-6 gap-4 items-center">
                <div className="flex flex-col">
                  <div className="font-bold text-slate-400 text-sm">{invite.email}</div>
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Pendiente</div>
                </div>
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-[9px] font-black uppercase">{invite.role}</span>
                </div>
                <div className="text-[11px] font-black text-slate-400 uppercase">
                  {invite.stores?.name || 'GLOBAL'}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => handleCancelInvite(invite.email)} className="p-3 text-slate-300 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                </div>
              </div>
            ))}
            
            {/* FILTERED & SORTED PROFILES */}
            {getSortedProfiles().map(profile => (
              <div key={profile.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1.5fr_1fr] hover:bg-slate-50/80 group transition-colors px-6 md:px-10 py-6 gap-4 items-center">
                {/* Colaborador */}
                <div className="flex flex-col">
                  <span className="md:hidden text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Colaborador</span>
                  <div>
                    <div className="font-black text-slate-800 text-sm uppercase tracking-tight">{profile.fullName || 'INCOMPLETO'}</div>
                    <div className="text-[10px] text-slate-400 font-bold">{profile.email}</div>
                  </div>
                </div>

                {/* Rol / Nivel */}
                <div className="flex flex-col">
                  <span className="md:hidden text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Rol / Nivel</span>
                  <div className="flex">
                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                      profile.role === 'admin' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                      profile.role === 'supervisor' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                      profile.role === 'viewer' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                      'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      {profile.role === 'admin' ? 'ADMINISTRADOR' : 
                       profile.role === 'supervisor' ? 'SUPERVISOR' : 
                       profile.role === 'viewer' ? 'LECTOR' : 'VENDEDOR'}
                    </span>
                  </div>
                </div>

                {/* Sucursal Asignada */}
                <div className="flex flex-col">
                  <span className="md:hidden text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Sucursal Asignada</span>
                  <div className="space-y-1">
                    <span className="text-xs font-black text-slate-700 uppercase flex items-center gap-2">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      {stores.find(s => s.id === profile.storeId)?.name || 'TIENDA GLOBAL'}
                    </span>
                    {profile.assignedStores && profile.assignedStores.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {profile.assignedStores.map(id => (
                          <span key={id} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-black uppercase">
                            {stores.find(s => s.id === id)?.name?.split(' ')[0] || 'T'}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Permission Indicators */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {profile.canForceAttendance && (
                         <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                           <CheckCircle className="w-2.5 h-2.5" />
                           <span className="text-[7px] font-black uppercase">Asistencia</span>
                         </div>
                      )}
                      {profile.canJustifyAbsences && (
                         <div className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                           <ShieldCheck className="w-2.5 h-2.5" />
                           <span className="text-[7px] font-black uppercase">Justificar</span>
                         </div>
                      )}
                      {profile.canManageRestDays && (
                         <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                           <Calendar className="w-2.5 h-2.5" />
                           <span className="text-[7px] font-black uppercase">Descansos</span>
                         </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex justify-end items-center">
                  <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                    <button onClick={() => { 
                      setEditingUserId(profile.id); 
                      setTargetFullName(profile.fullName || ''); 
                      setTargetRole(profile.role); 
                      setTargetStoreId(profile.storeId || ''); 
                      setTargetAssignedStores(profile.assignedStores || []);
                      setTargetCanJustifyAbsences(profile.can_justify_absences || profile.canJustifyAbsences || false);
                      setTargetCanManageRestDays(profile.can_manage_rest_days || profile.canManageRestDays || false);
                      setTargetCanForceAttendance(profile.can_force_attendance || profile.canForceAttendance || false);
                      setTargetCanSetSchedules(profile.can_set_schedules || profile.canSetSchedules || false);
                      setTargetCanSellKit(profile.canSellKit ?? true);
                      setTargetCanSellChip0(profile.canSellChip0 || false);
                      setTargetCanSellPortability(profile.canSellPortability || false);
                      setTargetCanSellChipExpress(profile.canSellChipExpress || false);
                      setActiveModal('profile-edit');
                    }} className="p-3 hover:bg-indigo-50 text-slate-300 hover:text-indigo-600 rounded-xl transition-all"><Edit2 className="w-5 h-5" /></button>
                    <button onClick={() => handleDeleteUser(profile.id)} className="p-3 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

      {/* MODALS */}
      {activeModal !== 'none' && activeModal !== 'profile-edit' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
           <div className="absolute inset-0" onClick={() => setActiveModal('none')}></div>
           <div className="bg-white rounded-[3.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] w-full max-w-xl max-h-[90vh] relative z-10 animate-in zoom-in-95 duration-300 flex flex-col overflow-hidden">
              <div className="px-12 pt-12 pb-8 border-b border-slate-50 flex justify-between items-center bg-white/80 backdrop-blur-md shrink-0">
                 <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">
                   {activeModal === 'store' && 'Nueva Sucursal'}
                   {activeModal === 'direct' && 'Alta de Usuario'}
                   {activeModal === 'invite' && 'Invitar Personal'}
                   {activeModal === 'stores-list' && 'Sucursales'}
                 </h3>
                 <button onClick={() => setActiveModal('none')} className="p-4 hover:bg-slate-200 rounded-2xl transition-colors"><X className="w-8 h-8 text-slate-500" /></button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-12">
                 {activeModal === 'store' && (
                   <form onSubmit={handleCreateStore} className="space-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nombre Comercial</label>
                        <input type="text" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value.toUpperCase())} placeholder="EJ. COPPEL CÁRDENAS" className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-8 py-6 text-xl font-black uppercase outline-none focus:ring-8 focus:ring-indigo-50 transition-all" required />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Ubicación / Ciudad</label>
                        <input type="text" value={newStoreLocation} onChange={(e) => setNewStoreLocation(e.target.value.toUpperCase())} placeholder="EJ. VILLAHERMOSA, TABASCO" className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-8 py-6 text-sm font-bold uppercase outline-none focus:ring-8 focus:ring-indigo-50 transition-all" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Tipo de Comercio</label>
                          <select value={newStoreType} onChange={(e) => setNewStoreType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-black uppercase outline-none">
                            <option value="Coppel">Coppel</option>
                            <option value="Elektra">Elektra</option>
                            <option value="Salinas y Rocha">Salinas y Rocha</option>
                            <option value="Chedraui">Chedraui</option>
                            <option value="Bodega Aurrera">Bodega Aurrera</option>
                            <option value="Sam's Club">Sam's Club</option>
                            <option value="Otro">Otro</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Prefijo Folio (Opcional)</label>
                          <input type="text" value={newStorePrefix} onChange={(e) => setNewStorePrefix(e.target.value)} placeholder="Ej. 1053" className="w-full bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-bold outline-none" />
                        </div>
                      </div>
                      <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white font-black py-7 rounded-[1.5rem] shadow-2xl shadow-indigo-200 uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all">Crear Sucursal Ahora</button>
                   </form>
                 )}

                 {activeModal === 'direct' && (
                   <form onSubmit={handleCreateUserDirectly} className="space-y-6">
                      <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-[1.5rem] mb-2 flex items-start gap-4">
                        <Shield className="w-6 h-6 text-indigo-600 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-indigo-900 font-bold leading-relaxed uppercase">
                          ACCESO DIRECTO: El usuario podrá entrar de inmediato con su correo y la clave asignada.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nombre(s)</label>
                          <input type="text" value={directFirstName} onChange={(e) => setDirectFirstName(e.target.value.toUpperCase())} placeholder="EJ. JOSÉ LUIS" className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-8 py-6 text-sm font-black uppercase outline-none focus:ring-8 focus:ring-indigo-50 transition-all" required />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Apellidos</label>
                          <input type="text" value={directLastName} onChange={(e) => setDirectLastName(e.target.value.toUpperCase())} placeholder="EJ. MENDOZA" className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-8 py-6 text-sm font-black uppercase outline-none focus:ring-8 focus:ring-indigo-50 transition-all" required />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Email</label>
                          <input type="email" value={directEmail} onChange={(e) => setDirectEmail(e.target.value)} placeholder="vendedor@mail.com" className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-bold outline-none w-full" required />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Password</label>
                          <input type="password" value={directPassword} onChange={(e) => setDirectPassword(e.target.value)} placeholder="Contraseña" className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-bold outline-none w-full" required minLength={6} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Asignar Tienda</label>
                          <select 
                            value={directStoreId} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setDirectStoreId(val);
                              if (val && val !== '7de1b59d-9b0e-4763-9dfc-08030c158664') {
                                setDirectAssignedStores([val]);
                              }
                            }} 
                            className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-black w-full uppercase"
                          >
                            <option value="">GLOBAL / NINGUNA</option>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nivel de Acceso</label>
                          <select value={directRole} onChange={(e) => {
                             setDirectRole(e.target.value as UserRole);
                             if (e.target.value !== 'supervisor' && e.target.value !== 'viewer') setDirectAssignedStores([]);
                          }} className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-black w-full uppercase">
                            <option value="seller">VENDEDOR</option>
                            <option value="supervisor">SUPERVISOR</option>
                            <option value="admin">ADMINISTRADOR</option>
                            <option value='viewer'>LECTOR</option>
                          </select>
                        </div>
                      </div>

                      {(directRole === 'supervisor' || directRole === 'viewer') && (directStoreId === '' || directStoreId === '7de1b59d-9b0e-4763-9dfc-08030c158664') && (
                        <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-100">
                           <div className="flex items-center justify-between px-1 mb-2">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acceso a Sucursales</p>
                             <label className="flex items-center gap-2 cursor-pointer group/all">
                                <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-indigo-600 transition-colors">Todos</span>
                                <input 
                                  type="checkbox" 
                                  checked={stores.filter(s => s.id !== '7de1b59d-9b0e-4763-9dfc-08030c158664').every(s => directAssignedStores.includes(s.id))}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setDirectAssignedStores(stores.filter(s => s.id !== '7de1b59d-9b0e-4763-9dfc-08030c158664').map(s => s.id));
                                    } else {
                                      setDirectAssignedStores([]);
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </label>
                           </div>
                           <p className="text-[8px] text-slate-400 font-bold uppercase mb-4 px-1 leading-tight">Define el área de trabajo de este supervisor</p>
                           <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                              {stores.filter(s => s.id !== '7de1b59d-9b0e-4763-9dfc-08030c158664').map(s => (
                                <label key={s.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-100 rounded-xl cursor-pointer hover:border-indigo-200 transition-all">
                                   <input 
                                     type="checkbox" 
                                     checked={directAssignedStores.includes(s.id)}
                                     onChange={(e) => {
                                       if (e.target.checked) setDirectAssignedStores([...directAssignedStores, s.id]);
                                       else setDirectAssignedStores(directAssignedStores.filter(id => id !== s.id));
                                     }}
                                     className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                   />
                                   <span className="text-[10px] font-black text-slate-600 uppercase">{s.name}</span>
                                </label>
                              ))}
                           </div>
                        </div>
                      )}

                      {directRole === 'supervisor' && (
                        <div className="space-y-4 border-t border-slate-100 pt-6">
                            <div className="flex items-center justify-between px-1 mb-2">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permisos Especiales</p>
                              <label className="flex items-center gap-2 cursor-pointer group/all">
                                <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-indigo-600 transition-colors">Todos</span>
                                <input 
                                  type="checkbox" 
                                  checked={directCanForceAttendance && directCanJustifyAbsences && directCanManageRestDays && directCanSetSchedules}
                                  onChange={(e) => {
                                    const val = e.target.checked;
                                    setDirectCanForceAttendance(val);
                                    setDirectCanJustifyAbsences(val);
                                    setDirectCanManageRestDays(val);
                                    setDirectCanSetSchedules(val);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </label>
                           </div>
                          <div className="space-y-3">
                            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[1.2rem] flex items-center gap-4">
                              <input 
                                type="checkbox" 
                                id="directForce"
                                checked={directCanForceAttendance}
                                onChange={(e) => setDirectCanForceAttendance(e.target.checked)}
                                className="w-5 h-5 rounded-lg border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <label htmlFor="directForce" className="flex-1 cursor-pointer">
                                 <p className="text-[10px] font-black text-emerald-700 uppercase">Autorizar Asistencia Manual</p>
                                 <p className="text-[9px] text-emerald-600/70 font-bold uppercase leading-none mt-1">Este supervisor podrá marcar días como "Asistió".</p>
                              </label>
                            </div>

                            <div className="bg-slate-900 border border-slate-800 p-5 rounded-[1.2rem] flex items-center gap-4">
                              <input 
                                type="checkbox" 
                                id="directJustify"
                                checked={directCanJustifyAbsences}
                                onChange={(e) => setDirectCanJustifyAbsences(e.target.checked)}
                                className="w-5 h-5 rounded-lg border-slate-700 text-white focus:ring-slate-500 cursor-pointer"
                              />
                              <label htmlFor="directJustify" className="flex-1 cursor-pointer">
                                 <p className="text-[10px] font-black text-white uppercase">Autorizar Justificar Faltas</p>
                                 <p className="text-[9px] text-slate-400 font-bold uppercase leading-none mt-1">Este supervisor podrá autorizar permisos en las asistencias.</p>
                              </label>
                            </div>

                            <div className="bg-blue-50 border border-blue-100 p-5 rounded-[1.2rem] flex items-center gap-4">
                              <input 
                                type="checkbox" 
                                id="directRest"
                                checked={directCanManageRestDays}
                                onChange={(e) => setDirectCanManageRestDays(e.target.checked)}
                                className="w-5 h-5 rounded-lg border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <label htmlFor="directRest" className="flex-1 cursor-pointer">
                                 <p className="text-[10px] font-black text-blue-700 uppercase">Autorizar Gestión de Descansos</p>
                                 <p className="text-[9px] text-blue-600/70 font-bold uppercase leading-none mt-1">Este supervisor podrá asignar días de descanso.</p>
                              </label>
                            </div>

                            <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-[1.2rem] flex items-center gap-4">
                              <input 
                                type="checkbox" 
                                id="directSchedules"
                                checked={directCanSetSchedules}
                                onChange={(e) => setDirectCanSetSchedules(e.target.checked)}
                                className="w-5 h-5 rounded-lg border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <label htmlFor="directSchedules" className="flex-1 cursor-pointer">
                                 <p className="text-[10px] font-black text-indigo-700 uppercase">Autorizar Asignar Horarios</p>
                                 <p className="text-[9px] text-indigo-600/70 font-bold uppercase leading-none mt-1">Este supervisor podrá configurar horas de entrada/salida.</p>
                              </label>
                            </div>
                          </div>
                        </div>
                       )}

                       {directRole === 'seller' && (
                        <div className="space-y-4 border-t border-slate-100 pt-6">
                          <div className="flex items-center justify-between px-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Especialidades de Venta</p>
                            <label className="flex items-center gap-2 cursor-pointer group/all">
                                <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-blue-600 transition-colors">Todos</span>
                                <input 
                                  type="checkbox" 
                                  checked={directCanSellKit && directCanSellChip0 && directCanSellPortability && directCanSellChipExpress}
                                  onChange={(e) => {
                                    const val = e.target.checked;
                                    setDirectCanSellKit(val);
                                    setDirectCanSellChip0(val);
                                    setDirectCanSellPortability(val);
                                    setDirectCanSellChipExpress(val);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </label>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${directCanSellKit ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <span className={`text-[10px] font-black uppercase ${directCanSellKit ? 'text-blue-700' : 'text-slate-500'}`}>Equipos Kit</span>
                               <input type="checkbox" checked={directCanSellKit} onChange={(e) => setDirectCanSellKit(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-blue-600" />
                             </label>
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${directCanSellChip0 ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <span className={`text-[10px] font-black uppercase ${directCanSellChip0 ? 'text-purple-700' : 'text-slate-500'}`}>Chip 0</span>
                               <input type="checkbox" checked={directCanSellChip0} onChange={(e) => setDirectCanSellChip0(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-purple-600" />
                             </label>
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${directCanSellPortability ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <span className={`text-[10px] font-black uppercase ${directCanSellPortability ? 'text-rose-700' : 'text-slate-500'}`}>Portabilidad</span>
                               <input type="checkbox" checked={directCanSellPortability} onChange={(e) => setDirectCanSellPortability(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-rose-600" />
                             </label>
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${directCanSellChipExpress ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <span className={`text-[10px] font-black uppercase ${directCanSellChipExpress ? 'text-orange-700' : 'text-slate-500'}`}>Chip Express</span>
                               <input type="checkbox" checked={directCanSellChipExpress} onChange={(e) => setDirectCanSellChipExpress(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-orange-600" />
                             </label>
                          </div>
                        </div>
                      )}

                      <button type="submit" disabled={isDirectLoading} className="w-full bg-indigo-600 text-white font-black py-7 rounded-[1.5rem] shadow-2xl shadow-indigo-200 uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all">Activar Cuenta</button>
                    </form>
                  )}

                 {activeModal === 'invite' && (
                   <form onSubmit={handleInviteUser} className="space-y-8">
                      <div className="bg-blue-50 border border-blue-100 p-6 rounded-[1.5rem] flex items-start gap-4">
                        <Mail className="w-6 h-6 text-blue-600 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-blue-900 font-bold leading-relaxed uppercase">
                          Invitación por Email: El usuario recibirá un enlace para registrarse y crear su propia contraseña.
                        </p>
                      </div>

                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Email del Invitado</label>
                         <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="ejemplo@correo.com" className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-8 py-6 text-lg font-black outline-none focus:ring-8 focus:ring-blue-50 transition-all" required />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Sucursal Principal</label>
                           <select 
                             value={inviteStoreId} 
                             onChange={(e) => {
                               const val = e.target.value;
                               setInviteStoreId(val);
                               if (val !== '') {
                                 setInviteAssignedStores([val]);
                               }
                             }} 
                             className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-black w-full uppercase"
                           >
                             <option value="">GLOBAL / NINGUNA</option>
                             {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Rol del Usuario</label>
                           <select value={inviteRole} onChange={(e) => {
                             setInviteRole(e.target.value as UserRole);
                             if (e.target.value !== 'supervisor' && e.target.value !== 'viewer') setInviteAssignedStores([]);
                           }} className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-black w-full uppercase">
                             <option value="seller">VENDEDOR</option>
                             <option value="supervisor">SUPERVISOR</option>
                             <option value="admin">ADMINISTRADOR</option>
                             <option value="viewer">LECTOR</option>
                           </select>
                        </div>
                      </div>

                       {inviteRole === 'supervisor' && (
                        <div className="space-y-4 border-t border-slate-100 pt-6">
                           <div className="flex items-center justify-between px-1 mb-2">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permisos de Supervisor</p>
                             <label className="flex items-center gap-2 cursor-pointer group/all">
                                <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-indigo-600 transition-colors">Todos</span>
                                <input 
                                  type="checkbox" 
                                  checked={inviteCanForceAttendance && inviteCanJustifyAbsences && inviteCanManageRestDays && inviteCanSetSchedules}
                                  onChange={(e) => {
                                    const val = e.target.checked;
                                    setInviteCanForceAttendance(val);
                                    setInviteCanJustifyAbsences(val);
                                    setInviteCanManageRestDays(val);
                                    setInviteCanSetSchedules(val);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </label>
                           </div>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${inviteCanForceAttendance ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <div className="flex flex-col">
                                 <span className={`text-[10px] font-black uppercase ${inviteCanForceAttendance ? 'text-emerald-700' : 'text-slate-500'}`}>Asistencia Manual</span>
                                 <span className="text-[8px] font-bold text-slate-400 uppercase">Autorizar registros manuales</span>
                               </div>
                               <input type="checkbox" checked={inviteCanForceAttendance} onChange={(e) => setInviteCanForceAttendance(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-emerald-600" />
                             </label>

                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${inviteCanJustifyAbsences ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <div className="flex flex-col">
                                 <span className={`text-[10px] font-black uppercase ${inviteCanJustifyAbsences ? 'text-indigo-700' : 'text-slate-500'}`}>Justificar Faltas</span>
                                 <span className="text-[8px] font-bold text-slate-400 uppercase">Aprobar retardos e inasistencias</span>
                               </div>
                               <input type="checkbox" checked={inviteCanJustifyAbsences} onChange={(e) => setInviteCanJustifyAbsences(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600" />
                             </label>

                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${inviteCanManageRestDays ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <div className="flex flex-col">
                                 <span className={`text-[10px] font-black uppercase ${inviteCanManageRestDays ? 'text-amber-700' : 'text-slate-500'}`}>Gestionar Descansos</span>
                                 <span className="text-[8px] font-bold text-slate-400 uppercase">Asignar días libres</span>
                               </div>
                               <input type="checkbox" checked={inviteCanManageRestDays} onChange={(e) => setInviteCanManageRestDays(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-amber-600" />
                             </label>
                             
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${inviteCanSetSchedules ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <div className="flex flex-col">
                                 <span className={`text-[10px] font-black uppercase ${inviteCanSetSchedules ? 'text-blue-700' : 'text-slate-500'}`}>Asignar Horarios</span>
                                 <span className="text-[8px] font-bold text-slate-400 uppercase">Configurar horas de entrada/salida</span>
                               </div>
                               <input type="checkbox" checked={inviteCanSetSchedules} onChange={(e) => setInviteCanSetSchedules(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-blue-600" />
                             </label>
                            </div>
                          </div>
                        )} {inviteRole === 'seller' && (
                        <div className="space-y-4 border-t border-slate-100 pt-6">
                          <div className="flex items-center justify-between px-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Especialidades de Venta</p>
                            <label className="flex items-center gap-2 cursor-pointer group/all">
                                <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-blue-600 transition-colors">Todos</span>
                                <input 
                                  type="checkbox" 
                                  checked={inviteCanSellKit && inviteCanSellChip0 && inviteCanSellPortability && inviteCanSellChipExpress}
                                  onChange={(e) => {
                                    const val = e.target.checked;
                                    setInviteCanSellKit(val);
                                    setInviteCanSellChip0(val);
                                    setInviteCanSellPortability(val);
                                    setInviteCanSellChipExpress(val);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </label>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${inviteCanSellKit ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <span className={`text-[10px] font-black uppercase ${inviteCanSellKit ? 'text-blue-700' : 'text-slate-500'}`}>Equipos Kit</span>
                               <input type="checkbox" checked={inviteCanSellKit} onChange={(e) => setInviteCanSellKit(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-blue-600" />
                             </label>
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${inviteCanSellChip0 ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <span className={`text-[10px] font-black uppercase ${inviteCanSellChip0 ? 'text-purple-700' : 'text-slate-500'}`}>Chip 0</span>
                               <input type="checkbox" checked={inviteCanSellChip0} onChange={(e) => setInviteCanSellChip0(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-purple-600" />
                             </label>
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${inviteCanSellPortability ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <span className={`text-[10px] font-black uppercase ${inviteCanSellPortability ? 'text-rose-700' : 'text-slate-500'}`}>Portabilidad</span>
                               <input type="checkbox" checked={inviteCanSellPortability} onChange={(e) => setInviteCanSellPortability(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-rose-600" />
                             </label>
                             <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${inviteCanSellChipExpress ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                               <span className={`text-[10px] font-black uppercase ${inviteCanSellChipExpress ? 'text-orange-700' : 'text-slate-500'}`}>Chip Express</span>
                               <input type="checkbox" checked={inviteCanSellChipExpress} onChange={(e) => setInviteCanSellChipExpress(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-orange-600" />
                             </label>
                           </div>
                        </div>
                      )}

                      {/* Multi-Store Access for Invitation */}
                      {(inviteRole === 'supervisor' || inviteRole === 'viewer') && (inviteStoreId === '' || inviteStoreId === '7de1b59d-9b0e-4763-9dfc-08030c158664') && (
                        <div className="space-y-4 border-t border-slate-100 pt-6">
                           <div className="flex items-center justify-between px-1 mb-2">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acceso a Sucursales</p>
                             <label className="flex items-center gap-2 cursor-pointer group/all">
                                <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-indigo-600 transition-colors">Todos</span>
                                <input 
                                  type="checkbox" 
                                  checked={stores.filter(s => s.id !== '7de1b59d-9b0e-4763-9dfc-08030c158664').every(s => inviteAssignedStores.includes(s.id))}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setInviteAssignedStores(stores.filter(s => s.id !== '7de1b59d-9b0e-4763-9dfc-08030c158664').map(s => s.id));
                                    } else {
                                      setInviteAssignedStores([]);
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </label>
                           </div>
                           <p className="text-[8px] text-slate-400 font-bold uppercase mb-4 px-1 leading-tight">Define el área de trabajo de este supervisor invitado</p>
                           <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                              {stores.filter(s => s.id !== '7de1b59d-9b0e-4763-9dfc-08030c158664').map(s => (
                                <label key={s.id} className={`flex items-center gap-3 px-4 py-3 border rounded-xl cursor-pointer transition-all ${inviteAssignedStores.includes(s.id) ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-indigo-100'}`}>
                                  <input 
                                    type="checkbox" 
                                    checked={inviteAssignedStores.includes(s.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) setInviteAssignedStores([...inviteAssignedStores, s.id]);
                                      else setInviteAssignedStores(inviteAssignedStores.filter(id => id !== s.id));
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className={`text-[9px] font-black uppercase ${inviteAssignedStores.includes(s.id) ? 'text-indigo-700' : 'text-slate-500'}`}>{s.name}</span>
                                </label>
                              ))}
                           </div>
                        </div>
                      )}
                      <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-7 rounded-[1.5rem] shadow-2xl shadow-blue-200 uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all">Enviar Invitación</button>
                   </form>
                 )}

                 {activeModal === 'stores-list' && (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-2">Sucursales del Sistema</p>
                       {stores.map(store => (
                          <div key={store.id} className="p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex flex-col gap-6 group transition-all hover:bg-white hover:shadow-xl hover:shadow-slate-100">
                             {editingStoreId === store.id ? (
                               <div className="space-y-4">
                                 <input type="text" value={editStoreName} onChange={(e) => setEditStoreName(e.target.value.toUpperCase())} className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 text-sm font-black uppercase outline-none" placeholder="Nombre" />
                                 <input type="text" value={editStoreLocation} onChange={(e) => setEditStoreLocation(e.target.value.toUpperCase())} className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none" placeholder="Ubicación" />
                                 <div className="grid grid-cols-2 gap-2">
                                   <select value={editStoreType} onChange={(e) => setEditStoreType(e.target.value)} className="bg-white border border-indigo-200 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none">
                                      <option value="Coppel">Coppel</option>
                                      <option value="Elektra">Elektra</option>
                                      <option value="Salinas y Rocha">Salinas y Rocha</option>
                                      <option value="Chedraui">Chedraui</option>
                                      <option value="Bodega Aurrera">Bodega Aurrera</option>
                                      <option value="Sam's Club">Sam's Club</option>
                                      <option value="Otro">Otro</option>
                                   </select>
                                   <input type="text" value={editStorePrefix} onChange={(e) => setEditStorePrefix(e.target.value)} className="bg-white border border-indigo-200 rounded-xl px-4 py-3 text-xs font-bold outline-none" placeholder="Prefijo" />
                                 </div>
                                 <div className="flex gap-2">
                                   <button onClick={() => handleUpdateStore(store.id)} className="flex-1 bg-emerald-500 text-white p-3 rounded-xl font-black uppercase text-[10px]">Guardar</button>
                                   <button onClick={() => setEditingStoreId(null)} className="flex-1 bg-slate-200 text-slate-500 p-3 rounded-xl font-black uppercase text-[10px]">Cancelar</button>
                                 </div>
                               </div>
                             ) : (
                               <div className="flex justify-between items-center">
                                 <div>
                                   <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-black text-slate-800 uppercase tracking-tight">{store.name}</h4>
                                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[8px] font-black uppercase border border-indigo-100">
                                        {store.type || 'Coppel'}
                                      </span>
                                   </div>
                                   <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-2">
                                     <Building className="w-3 h-3" /> {store.location || 'SIN UBICACIÓN'}
                                     {store.prefix && <span className="ml-2 text-slate-300">| PREFIJO: {store.prefix}</span>}
                                   </p>
                                 </div>
                                 <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                   <button onClick={() => {
                                      setEditingStoreId(store.id);
                                      setEditStoreName(store.name);
                                      setEditStoreLocation(store.location || '');
                                      setEditStoreType(store.type || 'Coppel');
                                      setEditStorePrefix(store.prefix || '');
                                   }} className="p-3 text-slate-300 hover:text-indigo-600 rounded-xl transition-all"><Edit2 className="w-5 h-5" /></button>
                                   
                                   {!(store.name.includes('CÁRDENAS') && store.name.includes('1053')) && (
                                     <button onClick={() => handleDeleteStore(store.id, store.name)} className="p-3 text-slate-300 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                                   )}
                                 </div>
                               </div>
                             )}
                          </div>
                       ))}
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}
      {/* Profile Edit Modal */}
      {activeModal === 'profile-edit' && editingUserId && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                  <Edit2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tight">Editar Perfil</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{targetFullName || 'Usuario'}</p>
                </div>
              </div>
              <button onClick={() => { setActiveModal('none'); setEditingUserId(null); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nombre Completo</label>
                  <input 
                    type="text" 
                    value={targetFullName} 
                    onChange={(e) => setTargetFullName(e.target.value.toUpperCase())} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-200 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Rol / Nivel</label>
                    <select 
                      value={targetRole} 
                      onChange={(e) => {
                        const newRole = e.target.value as UserRole;
                        setTargetRole(newRole);
                        // Reset permissions if not supervisor
                        if (newRole !== 'supervisor') {
                          setTargetCanJustifyAbsences(false);
                          setTargetCanManageRestDays(false);
                          setTargetCanForceAttendance(false);
                        }
                        // Reset multi-store if seller
                        if (newRole === 'seller') {
                          setTargetAssignedStores([]);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all"
                    >
                      <option value="seller">VENDEDOR</option>
                      <option value="supervisor">SUPERVISOR</option>
                      <option value="admin">ADMINISTRADOR</option>
                      <option value="viewer">LECTOR</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Sucursal Base</label>
                    <select 
                      value={targetStoreId} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setTargetStoreId(val);
                        // If a specific store is selected, limit access to only that store
                        if (val !== '' && val !== '7de1b59d-9b0e-4763-9dfc-08030c158664') {
                          setTargetAssignedStores([val]);
                        } else if (val === '' || val === '7de1b59d-9b0e-4763-9dfc-08030c158664') {
                          // If global, keep whatever was there or let them choose
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-black uppercase outline-none focus:ring-4 focus:ring-blue-50 transition-all"
                    >
                      <option value="">TIENDA GLOBAL</option>
                      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Advanced Permissions - ONLY FOR SUPERVISORS */}
              {targetRole === 'supervisor' && (
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permisos Especiales</p>
                    <label className="flex items-center gap-2 cursor-pointer group/all">
                      <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-indigo-600 transition-colors">Todos</span>
                      <input 
                        type="checkbox" 
                        checked={targetCanForceAttendance && targetCanJustifyAbsences && targetCanManageRestDays && targetCanSetSchedules}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setTargetCanForceAttendance(val);
                          setTargetCanJustifyAbsences(val);
                          setTargetCanManageRestDays(val);
                          setTargetCanSetSchedules(val);
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                  
                  <div className="space-y-3">
                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${targetCanForceAttendance ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase ${targetCanForceAttendance ? 'text-emerald-700' : 'text-slate-500'}`}>Asistencia Manual</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Autorizar registros manuales</span>
                      </div>
                      <input type="checkbox" checked={targetCanForceAttendance} onChange={(e) => setTargetCanForceAttendance(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    </label>

                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${targetCanJustifyAbsences ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase ${targetCanJustifyAbsences ? 'text-indigo-700' : 'text-slate-500'}`}>Autorizar/Justificar Faltas</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Configura si puede aprobar retardos e inasistencias</span>
                      </div>
                      <input type="checkbox" checked={targetCanJustifyAbsences} onChange={(e) => setTargetCanJustifyAbsences(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    </label>

                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${targetCanManageRestDays ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase ${targetCanManageRestDays ? 'text-amber-700' : 'text-slate-500'}`}>Gestionar Descansos</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Asignar días libres al personal</span>
                      </div>
                      <input type="checkbox" checked={targetCanManageRestDays} onChange={(e) => setTargetCanManageRestDays(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-amber-600 focus:ring-amber-500" />
                    </label>
                    
                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${targetCanSetSchedules ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase ${targetCanSetSchedules ? 'text-blue-700' : 'text-slate-500'}`}>Asignar Horarios</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Configura horas de entrada, salida y comida</span>
                      </div>
                      <input type="checkbox" checked={targetCanSetSchedules} onChange={(e) => setTargetCanSetSchedules(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500" />
                    </label>
                  </div>
                </div>
              )}

              {targetRole === 'seller' && (
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Especialidades de Venta</p>
                    <label className="flex items-center gap-2 cursor-pointer group/all">
                      <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-blue-600 transition-colors">Todos</span>
                      <input 
                        type="checkbox" 
                        checked={targetCanSellKit && targetCanSellChip0 && targetCanSellPortability && targetCanSellChipExpress}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setTargetCanSellKit(val);
                          setTargetCanSellChip0(val);
                          setTargetCanSellPortability(val);
                          setTargetCanSellChipExpress(val);
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${targetCanSellKit ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <span className={`text-[10px] font-black uppercase ${targetCanSellKit ? 'text-blue-700' : 'text-slate-500'}`}>Equipos Kit</span>
                      <input type="checkbox" checked={targetCanSellKit} onChange={(e) => setTargetCanSellKit(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-blue-600" />
                    </label>
                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${targetCanSellChip0 ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <span className={`text-[10px] font-black uppercase ${targetCanSellChip0 ? 'text-purple-700' : 'text-slate-500'}`}>Chip 0</span>
                      <input type="checkbox" checked={targetCanSellChip0} onChange={(e) => setTargetCanSellChip0(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-purple-600" />
                    </label>
                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${targetCanSellPortability ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <span className={`text-[10px] font-black uppercase ${targetCanSellPortability ? 'text-rose-700' : 'text-slate-500'}`}>Portabilidad</span>
                      <input type="checkbox" checked={targetCanSellPortability} onChange={(e) => setTargetCanSellPortability(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-rose-600" />
                    </label>
                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${targetCanSellChipExpress ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <span className={`text-[10px] font-black uppercase ${targetCanSellChipExpress ? 'text-orange-700' : 'text-slate-500'}`}>Chip Express</span>
                      <input type="checkbox" checked={targetCanSellChipExpress} onChange={(e) => setTargetCanSellChipExpress(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-orange-600" />
                    </label>
                  </div>
                </div>
              )}

              {/* Multi-Store Access (ONLY if Global) */}
              {(targetRole === 'supervisor' || targetRole === 'viewer') && targetStoreId === '' && (
                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <div className="flex flex-col px-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acceso Multi-Tienda</p>
                      <label className="flex items-center gap-2 cursor-pointer group/all">
                        <span className="text-[8px] font-black text-slate-400 uppercase group-hover/all:text-blue-600 transition-colors">Todas</span>
                        <input 
                          type="checkbox" 
                          checked={stores.every(s => targetAssignedStores.includes(s.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTargetAssignedStores(stores.map(s => s.id));
                            } else {
                              setTargetAssignedStores([]);
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </label>
                    </div>
                    <p className="text-[8px] text-slate-400 font-bold uppercase mt-1 leading-tight">Define las sucursales adicionales a las que tendrá acceso</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {stores.map(s => (
                      <label key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${targetAssignedStores.includes(s.id) ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                        <input 
                          type="checkbox" 
                          checked={targetAssignedStores.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) setTargetAssignedStores([...targetAssignedStores, s.id]);
                            else setTargetAssignedStores(targetAssignedStores.filter(id => id !== s.id));
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600"
                        />
                        <span className={`text-[9px] font-black uppercase ${targetAssignedStores.includes(s.id) ? 'text-blue-700' : 'text-slate-500'}`}>{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button 
                onClick={() => { setActiveModal('none'); setEditingUserId(null); }}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-100 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleUpdateProfile}
                disabled={isLoading}
                className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
