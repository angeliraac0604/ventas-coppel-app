import React, { useState, useEffect } from 'react';
import { Store, UserPlus, Building, Users, Save, Shield, LayoutGrid, CheckCircle2, Loader2, Search, Edit2, Trash2, X, Mail, Plus, ChevronDown } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { UserProfile, Store as StoreType, UserRole } from '../types';

interface AdminPanelProps {
  onRefresh?: () => void;
  role?: UserRole;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onRefresh, role }) => {
  const [stores, setStores] = useState<StoreType[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Modal State
  const [activeModal, setActiveModal] = useState<'none' | 'store' | 'direct' | 'invite' | 'stores-list'>('none');

  // Form States
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreLocation, setNewStoreLocation] = useState('');
  
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [targetFullName, setTargetFullName] = useState<string>('');
  const [targetStoreId, setTargetStoreId] = useState<string>('');
  const [targetRole, setTargetRole] = useState<UserRole>('seller');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStoreId, setInviteStoreId] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('seller');

  const [directFullName, setDirectFullName] = useState('');
  const [directEmail, setDirectEmail] = useState('');
  const [directPassword, setDirectPassword] = useState('');
  const [directStoreId, setDirectStoreId] = useState('');
  const [directRole, setDirectRole] = useState<UserRole>('seller');
  const [isDirectLoading, setIsDirectLoading] = useState(false);

  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editStoreName, setEditStoreName] = useState('');
  const [editStoreLocation, setEditStoreLocation] = useState('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Filtering State
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: storesData } = await supabase.from('stores').select('*').order('name');
      if (storesData) {
        setStores(storesData.map((s: any) => ({
          id: s.id,
          name: s.name,
          location: s.location,
          createdAt: s.created_at
        })));
      }

      const { data: profilesData } = await supabase.from('profiles').select('*').order('email');
      if (profilesData) {
        setProfiles(profilesData.map((p: any) => ({
          id: p.id,
          email: p.email,
          role: p.role as UserRole,
          fullName: p.full_name,
          storeId: p.store_id
        })));
      }

      const { data: invitesData } = await supabase.from('pending_invitations').select('*, stores(name)');
      if (invitesData) setPendingInvites(invitesData);

    } catch (err) {
      console.error('Error al cargar datos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('stores').insert({ name: newStoreName, location: newStoreLocation });
      if (error) throw error;
      setNewStoreName('');
      setNewStoreLocation('');
      setActiveModal('none');
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async (userId: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: targetFullName,
        store_id: targetStoreId || null,
        role: targetRole
      }).eq('id', userId);
      if (error) throw error;
      setEditingUserId(null);
      await fetchData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUserDirectly = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDirectLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('crear-empleado-directo', {
        body: {
          email: directEmail.trim(),
          password: directPassword,
          full_name: directFullName,
          store_id: directStoreId,
          role: directRole,
          admin_secret: 'ventas-coppel-2026'
        }
      });
      if (error || data?.error) throw new Error(error?.message || data?.error || 'Error');
      alert(`¡Usuario ${directFullName} creado correctamente!`);
      setDirectEmail(''); setDirectPassword(''); setDirectFullName(''); setDirectStoreId('');
      setActiveModal('none');
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsDirectLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await supabase.from('pending_invitations').upsert({ email: inviteEmail.trim(), store_id: inviteStoreId, role: inviteRole });
      const { error } = await supabase.auth.signInWithOtp({
        email: inviteEmail.trim(),
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      alert(`¡Invitación enviada a ${inviteEmail}!`);
      setInviteEmail('');
      setActiveModal('none');
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelInvite = async (email: string) => {
    if (!window.confirm("¿Cancelar invitación?")) return;
    try {
      await supabase.from('pending_invitations').delete().eq('email', email);
      fetchData();
    } catch (err) { alert("Error"); }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("¿Eliminar usuario?")) return;
    try {
      await supabase.from('profiles').delete().eq('id', userId);
      fetchData();
    } catch (err: any) { alert(err.message); }
  };

  const handleUpdateStore = async (id: string) => {
    try {
      await supabase.from('stores').update({ name: editStoreName, location: editStoreLocation }).eq('id', id);
      setEditingStoreId(null);
      fetchData();
      if (onRefresh) onRefresh();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="space-y-6">
      {/* HEADER & SUMMARY GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Stats */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between group hover:bg-slate-50 transition-all cursor-pointer" onClick={() => setActiveModal('stores-list')}>
          <div>
            <span className="block text-3xl font-black text-slate-800 tracking-tight">{stores.length}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sucursales</span>
          </div>
          <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
            <Building className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <span className="block text-3xl font-black text-slate-800 tracking-tight">{profiles.length}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usuarios</span>
          </div>
          <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
            <Users className="w-6 h-6" />
          </div>
        </div>
        
        {/* Master Actions Buttons */}
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg shadow-slate-100 flex flex-col justify-between group">
          <Shield className="w-6 h-6 text-indigo-400 opacity-60" />
          <div>
            <span className="block text-2xl font-black">{profiles.filter(p => p.role === 'admin').length}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Administradores</span>
          </div>
        </div>
        <button onClick={() => setActiveModal('store')} className="bg-slate-900 hover:bg-slate-800 text-white p-6 rounded-3xl shadow-lg shadow-slate-100 flex flex-col justify-between transition-all hover:-translate-y-1 group border-b-4 border-slate-700">
          <Plus className="w-6 h-6 text-indigo-400 opacity-40 group-hover:opacity-100 transition-opacity" />
          <span className="text-sm font-black text-left mt-4 leading-tight uppercase">Nueva<br/>Tienda</span>
        </button>
      </div>

      {/* USER TABLE AREA */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[500px]">
        <div className="px-8 py-8 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">Personal</h2>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mt-1">Gestión de accesos</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por nombre o email..." 
                className="w-full pl-12 pr-6 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-50 transition-all shadow-inner" 
              />
            </div>

            {/* STORE FILTER DROPDOWN */}
            <div className="relative">
               <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
               <select 
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-wider text-slate-600 outline-none focus:ring-4 focus:ring-indigo-50 appearance-none cursor-pointer shadow-sm min-w-[160px]"
               >
                 <option value="all">Todas las tiendas</option>
                 {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
               </select>
            </div>

            <div className="h-10 w-px bg-slate-200 mx-1 hidden lg:block"></div>
            
            <div className="relative">
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} 
                className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all active:scale-95 border-b-4 border-indigo-800"
              >
                <UserPlus className="w-4 h-4" /> Nuevo usuario <ChevronDown className={`w-3 h-3 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <button 
                      onClick={() => { setActiveModal('direct'); setIsUserMenuOpen(false); }}
                      className="w-full px-5 py-3 text-left hover:bg-slate-50 flex items-center gap-3 group transition-colors"
                    >
                      <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                        <Shield className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-800 uppercase tracking-tight">Alta Directa</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase">Crear cuenta ahora</div>
                      </div>
                    </button>
                    <button 
                      onClick={() => { setActiveModal('invite'); setIsUserMenuOpen(false); }}
                      className="w-full px-5 py-3 text-left hover:bg-slate-50 flex items-center gap-3 group transition-colors"
                    >
                      <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                        <Mail className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-800 uppercase tracking-tight">Invitar</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase">Enviar por email</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/20 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-8 py-6">Identidad</th>
                <th className="px-8 py-6">Rol</th>
                <th className="px-8 py-6">Sucursal</th>
                <th className="px-8 py-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {/* FILTERED PENDING INVITES */}
              {pendingInvites
                .filter(invite => (storeFilter === 'all' || invite.store_id === storeFilter))
                .filter(invite => invite.email.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(invite => (
                <tr key={invite.email} className="bg-blue-50/5">
                  <td className="px-8 py-6 opacity-60">
                    <div className="font-black italic text-sm">Pendiente</div>
                    <div className="text-[11px] font-bold">{invite.email}</div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded text-[9px] font-black uppercase">Espera...</span>
                  </td>
                  <td className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase">
                    {invite.stores?.name}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button onClick={() => handleCancelInvite(invite.email)} className="p-2.5 text-slate-200 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                  </td>
                </tr>
              ))}
              
              {/* FILTERED PROFILES */}
              {profiles
                .filter(profile => (storeFilter === 'all' || profile.storeId === storeFilter))
                .filter(profile => (
                  profile.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  profile.email.toLowerCase().includes(searchQuery.toLowerCase())
                ))
                .map(profile => (
                <tr key={profile.id} className="hover:bg-slate-50/80 group">
                  <td className="px-8 py-6">
                    {editingUserId === profile.id ? (
                      <input type="text" value={targetFullName} onChange={(e) => setTargetFullName(e.target.value.toUpperCase())} className="bg-white border border-indigo-200 rounded-xl px-4 py-2.5 text-sm font-black w-full uppercase" />
                    ) : (
                      <div>
                        <div className="font-black text-slate-800 text-sm">{profile.fullName || 'INCOMPLETO'}</div>
                        <div className="text-[10px] text-slate-400 font-bold">{profile.email}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    {editingUserId === profile.id ? (
                      <select value={targetRole} onChange={(e) => setTargetRole(e.target.value as UserRole)} className="bg-white border border-indigo-100 rounded-xl px-3 py-2 text-xs font-black">
                        <option value="seller">Vendedor</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="admin">Admin</option>
                        <option value="viewer">Lector</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${
                        profile.role === 'admin' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                        profile.role === 'supervisor' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                        'bg-slate-50 text-slate-500 border-slate-100'
                      }`}>
                        {profile.role}
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    {editingUserId === profile.id ? (
                      <select value={targetStoreId} onChange={(e) => setTargetStoreId(e.target.value)} className="bg-white border border-indigo-100 rounded-xl px-3 py-2 text-xs font-black w-full">
                        <option value="">Sin Sucursal</option>
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs font-black text-slate-600 uppercase">
                        {stores.find(s => s.id === profile.storeId)?.name || 'NO ASIGNADO'}
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6 text-right">
                    {editingUserId === profile.id ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleUpdateProfile(profile.id)} className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-lg"><Save className="w-5 h-5" /></button>
                        <button onClick={() => setEditingUserId(null)} className="p-2 text-slate-400"><X className="w-5 h-5" /></button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => { setEditingUserId(profile.id); setTargetFullName(profile.fullName || ''); setTargetRole(profile.role); setTargetStoreId(profile.storeId || ''); }} className="p-2.5 hover:bg-indigo-50 text-slate-300 hover:text-indigo-600 rounded-xl transition-all"><Edit2 className="w-5 h-5" /></button>
                        <button onClick={() => handleDeleteUser(profile.id)} className="p-2.5 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALS */}
      {activeModal !== 'none' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
           <div className="absolute inset-0" onClick={() => setActiveModal('none')}></div>
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden relative z-10 animate-in zoom-in-95 duration-300">
              <div className="px-10 pt-10 pb-8 border-b border-slate-50 flex justify-between items-center">
                 <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
                   {activeModal === 'store' && 'Nueva Tienda'}
                   {activeModal === 'direct' && 'Alta Directa'}
                   {activeModal === 'invite' && 'Invitar'}
                   {activeModal === 'stores-list' && 'Sucursales'}
                 </h3>
                 <button onClick={() => setActiveModal('none')} className="p-2 hover:bg-slate-100 rounded-2xl"><X className="w-6 h-6" /></button>
              </div>

              <div className="p-10">
                 {activeModal === 'store' && (
                   <form onSubmit={handleCreateStore} className="space-y-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nombre Comercial</label>
                        <input type="text" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value.toUpperCase())} placeholder="EJ. COPPEL FEDERAL" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-lg font-black uppercase outline-none focus:ring-8 focus:ring-indigo-50" required />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Ubicación / Referral</label>
                        <input type="text" value={newStoreLocation} onChange={(e) => setNewStoreLocation(e.target.value.toUpperCase())} placeholder="CIUDAD O PLAZA" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-sm font-bold uppercase outline-none focus:ring-8 focus:ring-indigo-50" />
                      </div>
                      <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white font-black py-6 rounded-2xl shadow-xl shadow-indigo-100 uppercase tracking-widest text-xs">Registrar Sucursal</button>
                   </form>
                 )}

                 {activeModal === 'direct' && (
                   <form onSubmit={handleCreateUserDirectly} className="space-y-6">
                      <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl mb-2 flex items-start gap-3">
                        <Shield className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-indigo-900 font-bold leading-relaxed uppercase">
                          Crea una cuenta lista para usar. El usuario podrá entrar con su correo y la clave que asignes ahora.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nombre Completo del Usuario</label>
                        <input type="text" value={directFullName} onChange={(e) => setDirectFullName(e.target.value.toUpperCase())} placeholder="EJ. JUAN PÉREZ" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-base font-black uppercase outline-none focus:ring-8 focus:ring-indigo-50" required />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Correo Electrónico</label>
                          <input type="email" value={directEmail} onChange={(e) => setDirectEmail(e.target.value)} placeholder="email@ejemplo.com" className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold outline-none w-full" required />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Contraseña</label>
                          <input type="password" value={directPassword} onChange={(e) => setDirectPassword(e.target.value)} placeholder="Mín. 6 car." className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold outline-none w-full" required minLength={6} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Sucursal</label>
                          <select value={directStoreId} onChange={(e) => setDirectStoreId(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black w-full" required>
                            <option value="">SELECCIONAR...</option>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Rol</label>
                          <select value={directRole} onChange={(e) => setDirectRole(e.target.value as UserRole)} className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black w-full">
                            <option value="seller">VENDEDOR</option>
                            <option value="supervisor">SUPERVISOR</option>
                            <option value="admin">ADMIN</option>
                            <option value="viewer">LECTOR (SÓLO VER)</option>
                          </select>
                        </div>
                      </div>
                      <button type="submit" disabled={isDirectLoading} className="w-full bg-indigo-600 text-white font-black py-6 rounded-2xl shadow-xl shadow-indigo-100 uppercase tracking-widest text-xs">Crear Cuenta Ahora</button>
                   </form>
                 )}

                 {activeModal === 'invite' && (
                   <form onSubmit={handleInviteUser} className="space-y-6">
                      <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl mb-2 flex items-start gap-3">
                        <Mail className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-blue-900 font-bold leading-relaxed uppercase">
                          Envía una invitación formal. El usuario recibirá un enlace y él mismo definirá su contraseña al registrarse.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Correo del Invitado</label>
                         <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@ejemplo.com" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-base font-black outline-none focus:ring-8 focus:ring-blue-50" required />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Sucursal</label>
                           <select value={inviteStoreId} onChange={(e) => setInviteStoreId(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black w-full" required>
                             <option value="">SELECCIONAR...</option>
                             {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Rol</label>
                           <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)} className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black w-full">
                             <option value="seller">VENDEDOR</option>
                             <option value="supervisor">SUPERVISOR</option>
                             <option value="admin">ADMIN</option>
                             <option value="viewer">LECTOR (SÓLO VER)</option>
                           </select>
                        </div>
                      </div>
                      <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-6 rounded-2xl shadow-xl shadow-blue-100 uppercase tracking-widest text-xs">Enviar Enlace de Invitación</button>
                   </form>
                 )}

                 {activeModal === 'stores-list' && (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Listado de Tiendas en el Sistema</p>
                       {stores.map(store => (
                         <div key={store.id} className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 flex justify-between items-center group">
                            {editingStoreId === store.id ? (
                              <div className="flex-1 flex gap-2">
                                <input type="text" value={editStoreName} onChange={(e) => setEditStoreName(e.target.value.toUpperCase())} className="flex-1 bg-white border border-indigo-200 rounded-xl px-4 py-2 text-sm font-black uppercase" />
                                <button onClick={() => handleUpdateStore(store.id)} className="bg-emerald-500 text-white p-2.5 rounded-xl"><Save className="w-5 h-5" /></button>
                                <button onClick={() => setEditingStoreId(null)} className="p-2.5 bg-slate-200 text-slate-500 rounded-xl"><X className="w-5 h-5" /></button>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <div className="font-black text-slate-800 uppercase text-base">{store.name}</div>
                                  <div className="text-[10px] text-slate-400 font-black uppercase">{store.location || 'GLOBAL'}</div>
                                </div>
                                <button onClick={() => { setEditingStoreId(store.id); setEditStoreName(store.name); setEditStoreLocation(store.location || ''); }} className="p-3 bg-white text-slate-300 hover:text-indigo-600 rounded-xl border border-slate-100 shadow-sm opacity-0 group-hover:opacity-100 transition-all"><Edit2 className="w-5 h-5" /></button>
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
