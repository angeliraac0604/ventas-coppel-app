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
  ArrowRight
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Store, UserProfile, UserRole } from '../types';

interface AdminPanelProps {
  role?: UserRole;
  onRefresh?: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ role, onRefresh }) => {
  const [activeModal, setActiveModal] = useState<'none' | 'store' | 'invite' | 'direct' | 'stores-list'>('none');
  const [isLoading, setIsLoading] = useState(false);
  const [isDirectLoading, setIsDirectLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [stores, setStores] = useState<Store[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<any[]>([]);

  // Store Form
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreLocation, setNewStoreLocation] = useState('');

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('seller' as UserRole);
  const [inviteStoreId, setInviteStoreId] = useState('');

  // Direct Create Form
  const [directEmail, setDirectEmail] = useState('');
  const [directPassword, setDirectPassword] = useState('');
  const [directFullName, setDirectFullName] = useState('');
  const [directRole, setDirectRole] = useState('seller' as UserRole);
  const [directStoreId, setDirectStoreId] = useState('');

  // Edit State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [targetFullName, setTargetFullName] = useState('');
  const [targetRole, setTargetRole] = useState<UserRole>('seller');
  const [targetStoreId, setTargetStoreId] = useState('');
  const [targetAssignedStores, setTargetAssignedStores] = useState<string[]>([]);
  const [targetCanJustifyAbsences, setTargetCanJustifyAbsences] = useState(false);
  const [directCanJustifyAbsences, setDirectCanJustifyAbsences] = useState(false);
  const [directAssignedStores, setDirectAssignedStores] = useState<string[]>([]);
  
  // Store Edit State
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editStoreName, setEditStoreName] = useState('');
  const [editStoreLocation, setEditStoreLocation] = useState('');

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');

  useEffect(() => {
    fetchAllData();
  }, []);

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
          lunchDurationMinutes: s.lunch_duration_minutes
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
          canJustifyAbsences: p.can_justify_absences || false
        })));
      }

      // 3. Fetch Invites
      const { data: invitesData } = await supabase.from('pending_invitations').select('*, stores(name)');
      if (invitesData) setInvites(invitesData);

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
      const { error } = await supabase.from('stores').insert([
        { name: newStoreName.toUpperCase(), location: newStoreLocation.toUpperCase() }
      ]);
      if (error) throw error;
      setNewStoreName('');
      setNewStoreLocation('');
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
      const { error } = await supabase.from('pending_invitations').insert([
        { 
          email: inviteEmail.toLowerCase(), 
          role: inviteRole, 
          store_id: inviteStoreId || null,
          invited_by: (await supabase.auth.getUser()).data.user?.id
        }
      ]);
      if (error) throw error;
      
      // Enviar correo de invitación
      const targetStore = stores.find(s => s.id === inviteStoreId)?.name || 'Global';
      sendInviteEmailScript(inviteEmail, inviteRole, targetStore);

      setInviteEmail('');
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
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No se pudo crear el usuario');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: directFullName.toUpperCase(),
          role: directRole,
          store_id: directStoreId || null,
          can_justify_absences: directCanJustifyAbsences,
          assigned_stores: (directRole === 'supervisor' || directRole === 'viewer') ? directAssignedStores : null
        })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;

      alert('Usuario creado correctamente.');
      setDirectEmail('');
      setDirectPassword('');
      setDirectFullName('');
      setActiveModal('none');
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsDirectLoading(false);
    }
  };

  const handleUpdateProfile = async (userId: string) => {
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: targetFullName.toUpperCase(),
        role: targetRole,
        store_id: targetStoreId || null,
        assigned_stores: (targetRole === 'supervisor' || targetRole === 'viewer') ? targetAssignedStores : null,
        can_justify_absences: targetCanJustifyAbsences
      }).eq('id', userId);

      if (error) throw error;
      setEditingUserId(null);
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      fetchAllData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleCancelInvite = async (email: string) => {
    try {
      await supabase.from('pending_invitations').delete().eq('email', email);
      fetchAllData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStore = async (storeId: string) => {
    try {
      const { error } = await supabase.from('stores').update({
        name: editStoreName.toUpperCase(),
        location: editStoreLocation.toUpperCase()
      }).eq('id', storeId);
      if (error) throw error;
      setEditingStoreId(null);
      fetchAllData();
      if (onRefresh) onRefresh();
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

      {/* Main Management Area */}
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
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Colaborador</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Rol / Nivel</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sucursal Asignada</div>
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
            
            {/* FILTERED PROFILES */}
            {profiles
              .filter(profile => (storeFilter === 'all' || profile.storeId === storeFilter))
              .filter(profile => (
                profile.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                profile.email.toLowerCase().includes(searchQuery.toLowerCase())
              ))
              .map(profile => (
              <div key={profile.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1.5fr_1fr] hover:bg-slate-50/80 group transition-colors px-6 md:px-10 py-6 gap-4 items-center">
                {/* Colaborador */}
                <div className="flex flex-col">
                  <span className="md:hidden text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Colaborador</span>
                  {editingUserId === profile.id ? (
                    <input type="text" value={targetFullName} onChange={(e) => setTargetFullName(e.target.value.toUpperCase())} className="bg-white border border-indigo-200 rounded-xl px-4 py-2.5 text-sm font-black w-full uppercase outline-none focus:ring-4 focus:ring-indigo-50" />
                  ) : (
                    <div>
                      <div className="font-black text-slate-800 text-sm uppercase tracking-tight">{profile.fullName || 'INCOMPLETO'}</div>
                      <div className="text-[10px] text-slate-400 font-bold">{profile.email}</div>
                    </div>
                  )}
                </div>

                {/* Rol / Nivel */}
                <div className="flex flex-col">
                  <span className="md:hidden text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Rol / Nivel</span>
                  <div className="flex">
                    {editingUserId === profile.id ? (
                      <select value={targetRole} onChange={(e) => setTargetRole(e.target.value as UserRole)} className="bg-white border border-indigo-200 rounded-xl px-4 py-2.5 text-xs font-black uppercase outline-none w-full">
                        <option value="seller">VENDEDOR</option>
                        <option value="supervisor">SUPERVISOR</option>
                        <option value="admin">ADMINISTRADOR</option>
                        <option value="viewer">LECTOR</option>
                      </select>
                    ) : (
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
                    )}
                  </div>
                </div>

                {/* Sucursal Asignada */}
                <div className="flex flex-col">
                  <span className="md:hidden text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Sucursal Asignada</span>
                  {editingUserId === profile.id ? (
                    <div className="space-y-3">
                      <select value={targetStoreId} onChange={(e) => setTargetStoreId(e.target.value)} className="bg-white border border-indigo-200 rounded-xl px-4 py-2.5 text-xs font-black uppercase outline-none w-full">
                        <option value="">TIENDA GLOBAL</option>
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      
                      {(targetRole === 'supervisor' || targetRole === 'viewer') && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">Selección de Tiendas</p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase mb-3 px-1 leading-tight">Si no seleccionas ninguna, tendrá acceso GLOBAL (todas las actuales y futuras)</p>
                          <div className="max-h-32 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                            {stores.map(s => (
                              <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-100 group">
                                <input 
                                  type="checkbox" 
                                  checked={targetAssignedStores.includes(s.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) setTargetAssignedStores([...targetAssignedStores, s.id]);
                                    else setTargetAssignedStores(targetAssignedStores.filter(id => id !== s.id));
                                  }}
                                  className="w-4 h-4 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-[10px] font-black text-slate-600 uppercase group-hover:text-indigo-600">{s.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {targetRole === 'supervisor' && (
                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                          <label className="flex items-center gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={targetCanJustifyAbsences}
                              onChange={(e) => setTargetCanJustifyAbsences(e.target.checked)}
                              className="w-4 h-4 rounded-lg border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-emerald-700 uppercase">Autorizar Justificar Faltas</span>
                              <span className="text-[8px] text-emerald-600/70 font-bold uppercase">Permite al supervisor marcar faltas como permiso</span>
                            </div>
                          </label>
                        </div>
                      )}
                      </div>
                    ) : (
                    <div className="space-y-2">
                      <span className="text-xs font-black text-slate-700 uppercase flex items-center gap-2">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        {stores.find(s => s.id === profile.storeId)?.name || 'TIENDA GLOBAL'}
                      </span>
                      {profile.assignedStores && profile.assignedStores.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {profile.assignedStores.map(sid => (
                            <span key={sid} className="text-[8px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-full font-black uppercase border border-indigo-100">
                              {stores.find(s => s.id === sid)?.name || '?'}
                            </span>
                          ))}
                        </div>
                      )}
                      {profile.role === 'supervisor' && profile.canJustifyAbsences && (
                         <div className="flex items-center gap-1.5 mt-1 text-emerald-600">
                           <CheckCircle className="w-3 h-3" />
                           <span className="text-[8px] font-black uppercase">Autorizado para justificar</span>
                         </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex justify-end items-center">
                  {editingUserId === profile.id ? (
                    <div className="flex justify-end gap-2 w-full md:w-auto">
                      <button onClick={() => handleUpdateProfile(profile.id)} className="flex-1 md:flex-none p-3 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-200 hover:scale-[1.05] active:scale-95 transition-all flex items-center justify-center"><Save className="w-5 h-5" /></button>
                      <button onClick={() => setEditingUserId(null)} className="flex-1 md:flex-none p-3 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center"><X className="w-5 h-5" /></button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                      <button onClick={() => { 
                        setEditingUserId(profile.id); 
                        setTargetFullName(profile.fullName || ''); 
                        setTargetRole(profile.role); 
                        setTargetStoreId(profile.storeId || ''); 
                        setTargetAssignedStores(profile.assignedStores || []);
                        setTargetCanJustifyAbsences(profile.canJustifyAbsences || false);
                      }} className="p-3 hover:bg-indigo-50 text-slate-300 hover:text-indigo-600 rounded-xl transition-all"><Edit2 className="w-5 h-5" /></button>
                      <button onClick={() => handleDeleteUser(profile.id)} className="p-3 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODALS */}
      {activeModal !== 'none' && (
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

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nombre Completo</label>
                        <input type="text" value={directFullName} onChange={(e) => setDirectFullName(e.target.value.toUpperCase())} placeholder="EJ. JOSÉ LUIS MENDOZA" className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-8 py-6 text-lg font-black uppercase outline-none focus:ring-8 focus:ring-indigo-50 transition-all" required />
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
                          <select value={directStoreId} onChange={(e) => setDirectStoreId(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-black w-full uppercase" required>
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
                            <option value="viewer">LECTOR</option>
                          </select>
                        </div>
                      </div>

                      {(directRole === 'supervisor' || directRole === 'viewer') && (
                        <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-100">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">Seleccionar Área (Tiendas)</p>
                           <p className="text-[8px] text-slate-400 font-bold uppercase mb-4 px-1 leading-tight">Deja vacío para Supervisor General (todas las tiendas)</p>
                           <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                              {stores.map(s => (
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
                        <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[1.2rem] flex items-center gap-4">
                          <input 
                            type="checkbox" 
                            id="directJustify"
                            checked={directCanJustifyAbsences}
                            onChange={(e) => setDirectCanJustifyAbsences(e.target.checked)}
                            className="w-5 h-5 rounded-lg border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <label htmlFor="directJustify" className="flex-1 cursor-pointer">
                             <p className="text-[10px] font-black text-emerald-700 uppercase">Autorizar Justificar Faltas</p>
                             <p className="text-[9px] text-emerald-600/70 font-bold uppercase leading-none mt-1">Este supervisor podrá autorizar permisos en las asistencias.</p>
                          </label>
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
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Sucursal</label>
                           <select value={inviteStoreId} onChange={(e) => setInviteStoreId(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-black w-full uppercase" required>
                             <option value="">GLOBAL / NINGUNA</option>
                             {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Rol</label>
                           <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)} className="bg-slate-50 border border-slate-200 rounded-[1.2rem] px-6 py-5 text-sm font-black w-full uppercase">
                             <option value="seller">VENDEDOR</option>
                             <option value="supervisor">SUPERVISOR</option>
                             <option value="admin">ADMINISTRADOR</option>
                             <option value="viewer">LECTOR</option>
                           </select>
                        </div>
                      </div>
                      <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-7 rounded-[1.5rem] shadow-2xl shadow-blue-200 uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all">Enviar Invitación</button>
                   </form>
                 )}

                 {activeModal === 'stores-list' && (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-2">Sucursales del Sistema</p>
                       {stores.map(store => (
                          <div key={store.id} className="p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex justify-between items-center group transition-all hover:bg-white hover:shadow-xl hover:shadow-slate-100">
                             {editingStoreId === store.id ? (
                               <div className="flex-1 flex gap-3">
                                 <input type="text" value={editStoreName} onChange={(e) => setEditStoreName(e.target.value.toUpperCase())} className="flex-1 bg-white border border-indigo-200 rounded-xl px-5 py-3 text-sm font-black uppercase outline-none" />
                                 <button onClick={() => handleUpdateStore(store.id)} className="bg-emerald-500 text-white p-3.5 rounded-2xl shadow-lg shadow-emerald-100 hover:scale-105 active:scale-95 transition-all"><Save className="w-6 h-6" /></button>
                                 <button onClick={() => setEditingStoreId(null)} className="p-3.5 bg-slate-200 text-slate-500 rounded-2xl hover:bg-slate-300 transition-all"><X className="w-6 h-6" /></button>
                               </div>
                             ) : (
                               <>
                                 <div>
                                   <div className="font-black text-slate-800 uppercase text-xl tracking-tight leading-none mb-2">{store.name}</div>
                                   <div className="flex items-center gap-2">
                                      <Building className="w-3.5 h-3.5 text-slate-400" />
                                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{store.location || 'UBICACIÓN NO ESPECIFICADA'}</span>
                                   </div>
                                 </div>
                                 <button onClick={() => { setEditingStoreId(store.id); setEditStoreName(store.name); setEditStoreLocation(store.location || ''); }} className="p-4 bg-white text-slate-300 hover:text-indigo-600 rounded-2xl border border-slate-100 shadow-sm opacity-0 group-hover:opacity-100 transition-all hover:scale-110"><Edit2 className="w-5 h-5" /></button>
                               </>
                             )}
                          </div>
                        ))}
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default AdminPanel;
