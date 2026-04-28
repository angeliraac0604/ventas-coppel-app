import React, { useState, useEffect } from 'react';
import { Clock, Calendar, User, Search, Filter, ArrowRight, CheckCircle, AlertCircle, Coffee, LogOut, Loader2, Building, Eye, MapPin, Smartphone, X, Camera, Edit2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { AttendanceRecord, UserProfile, Store, AttendanceType } from '../types';
import AttendanceSummary from './AttendanceSummary';

interface AttendanceReportProps {
  selectedStoreId: string;
  stores: Store[];
  userProfile: UserProfile | null;
  onRefreshStores?: () => void;
}

interface GroupedAttendance {
  userId: string;
  userName: string;
  userEmail: string;
  storeName: string;
  date: string;
  // Event times
  entry?: string;
  lunchStart?: string;
  lunchEnd?: string;
  exit?: string;
  // Event images and locations
  images: Record<AttendanceType, { selfie?: string, screenshot?: string, location?: string }>;
  // Alerts
  isLate?: boolean;
  isLunchOver?: boolean;
  isAbsence?: boolean;
  isExcused?: boolean;
  excusedNotes?: string;
  storeConfig?: Store;
}

const AttendanceReport: React.FC<AttendanceReportProps> = ({ selectedStoreId, stores, userProfile, onRefreshStores }) => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedUser, setSelectedUser] = useState<GroupedAttendance | null>(null);
  const [activeEventType, setActiveEventType] = useState<AttendanceType>('entry');
  const [zoomedImage, setZoomedImage] = useState<{ url: string, title: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'daily' | 'schedules' | 'summary'>('daily');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [targetRestDays, setTargetRestDays] = useState<number[]>([]);
  const [targetVacationStart, setTargetVacationStart] = useState<string>('');
  const [targetVacationEnd, setTargetVacationEnd] = useState<string>('');
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editStoreEntry, setEditStoreEntry] = useState('');
  const [editStoreExit, setEditStoreExit] = useState('');
  const [editStoreLunchHours, setEditStoreLunchHours] = useState(1);
  const [localStores, setLocalStores] = useState<Store[]>(stores);
  const [localStoreFilter, setLocalStoreFilter] = useState<string>('all');
  const [justifyingAbsence, setJustifyingAbsence] = useState<GroupedAttendance | null>(null);
  const [absenceNotes, setAbsenceNotes] = useState('');

  // Sync localStores when props change
  useEffect(() => {
    setLocalStores(stores);
  }, [stores]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Profiles to get names
      const { data: profilesData } = await supabase.from('profiles').select('*');
      if (profilesData) {
        let filteredProfiles = profilesData.filter((p: any) => 
          (p.role !== 'supervisor' && p.role !== 'admin') || 
          p.email === 'angeliraac@gmail.com'
        );
        
        // Filter by assignedStores if the current viewer is a supervisor with limited area
        if (userProfile?.role === 'supervisor' && userProfile.assignedStores && userProfile.assignedStores.length > 0) {
          filteredProfiles = filteredProfiles.filter((p: any) => userProfile.assignedStores?.includes(p.store_id));
        }

        setProfiles(filteredProfiles.map((p: any) => ({
            id: p.id,
            email: p.email,
            role: p.role,
            fullName: p.full_name,
            storeId: p.store_id,
            restDays: p.rest_days || [],
            vacationDates: p.vacation_dates || [],
            canJustifyAbsences: p.can_justify_absences
          })));
      }

      // 2. Fetch Attendance Records for the selected date
      let query = supabase.from('attendance')
        .select('*')
        .eq('date', filterDate)
        .order('timestamp', { ascending: true });

      if (selectedStoreId !== 'all') {
        query = query.eq('store_id', selectedStoreId);
      } else if (userProfile?.role === 'supervisor' && userProfile.assignedStores && userProfile.assignedStores.length > 0) {
        query = query.in('store_id', userProfile.assignedStores);
      }

      const { data: attendanceData, error } = await query;
      if (error) throw error;
      
      const formatted: AttendanceRecord[] = (attendanceData || []).map(r => ({
        id: r.id,
        userId: r.user_id,
        storeId: r.store_id,
        type: r.type as AttendanceType,
        timestamp: r.timestamp,
        date: r.date,
        imageUrl: r.image_url,
        screenshotUrl: r.screenshot_url,
        locationCoords: r.location_coords,
        notes: r.notes
      }));

      setRecords(formatted);
    } catch (err) {
      console.error('Error fetching attendance report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSchedule = async (userId: string) => {
    try {
      let datesArray: string[] = [];
      if (targetVacationStart && targetVacationEnd) {
        let currentDate = new Date(targetVacationStart);
        const endDate = new Date(targetVacationEnd);
        while (currentDate <= endDate) {
          datesArray.push(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      const { error } = await supabase.from('profiles').update({
        rest_days: targetRestDays,
        vacation_dates: datesArray
      }).eq('id', userId);
      
      if (error) throw error;
      setEditingProfileId(null);
      fetchData();
    } catch (err: any) {
      alert('Error al actualizar horario: ' + err.message);
    }
  };

  const handleJustifyAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justifyingAbsence) return;
    try {
      const { error } = await supabase.from('attendance').insert({
        user_id: justifyingAbsence.userId,
        store_id: profiles.find(p => p.id === justifyingAbsence.userId)?.storeId || null,
        type: 'excused',
        date: justifyingAbsence.date,
        timestamp: new Date().toISOString(),
        notes: absenceNotes
      });
      if (error) throw error;
      setJustifyingAbsence(null);
      setAbsenceNotes('');
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleUpdateStoreSchedule = async (storeId: string) => {
    try {
      const lunchMins = Math.round(editStoreLunchHours * 60);
      const { error } = await supabase.from('stores').update({
        entry_time: editStoreEntry,
        exit_time: editStoreExit,
        lunch_duration_minutes: lunchMins
      }).eq('id', storeId);
      
      if (error) throw error;
      setEditingStoreId(null);
      setLocalStores(prev => prev.map(s => s.id === storeId ? { ...s, entryTime: editStoreEntry, exitTime: editStoreExit, lunchDurationMinutes: lunchMins } : s));
      if (onRefreshStores) onRefreshStores();
      fetchData();
    } catch (err: any) {
      alert('Error al actualizar tienda: ' + err.message);
    }
  };

  useEffect(() => {
    setLocalStores(stores);
  }, [stores]);

  useEffect(() => {
    fetchData();
  }, [selectedStoreId, filterDate]);

  // Transform records into a tabular format (one row per user per day)
  const groupedData = React.useMemo(() => {
    const groups: Record<string, GroupedAttendance> = {};

    records.forEach(record => {
      const profile = profiles.find(p => p.id === record.userId);
      const store = localStores.find(s => s.id === record.storeId);
      const key = `${record.userId}-${record.date}`;

      if (!groups[key]) {
        const mappedProfile = profile ? {
          ...profile,
          fullName: (profile as any).full_name || profile.fullName
        } : null;

        groups[key] = {
          userId: record.userId,
          userName: mappedProfile?.fullName || profile?.email?.split('@')[0] || 'Usuario',
          userEmail: profile?.email || '',
          storeName: store?.name || 'Desconocida',
          date: record.date,
          images: {
            entry: {},
            lunch_start: {},
            lunch_end: {},
            exit: {},
            excused: {}
          },
          storeConfig: store
        };
      }

      const timestamp = new Date(record.timestamp);
      const timeStr = timestamp.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      if (record.type === 'entry') groups[key].entry = timeStr;
      if (record.type === 'lunch_start') groups[key].lunchStart = timeStr;
      if (record.type === 'lunch_end') groups[key].lunchEnd = timeStr;
      if (record.type === 'exit') groups[key].exit = timeStr;
      if (record.type === 'excused') {
        groups[key].isExcused = true;
        groups[key].excusedNotes = record.notes;
      }

      // Store evidence for this specific type
      if (record.type !== 'excused') {
        groups[key].images[record.type as AttendanceType] = {
          selfie: record.imageUrl,
          screenshot: record.screenshotUrl,
          location: record.locationCoords
        };
      }
    });

    // --- SMART VIGILANCE LOGIC ---
    Object.values(groups).forEach(group => {
      // 1. Check Late Entry
      if (group.entry && group.storeConfig?.entryTime) {
        const [targetH, targetM] = group.storeConfig.entryTime.split(':').map(Number);
        const [entryH, entryM] = group.entry.split(':').map(Number);
        
        if (entryH > targetH || (entryH === targetH && entryM > targetM)) {
          group.isLate = true;
        }
      }

      // 2. Check Extended Lunch
      if (group.lunchStart && group.lunchEnd && group.storeConfig?.lunchDurationMinutes) {
        const [sH, sM] = group.lunchStart.split(':').map(Number);
        const [eH, eM] = group.lunchEnd.split(':').map(Number);
        const duration = (eH * 60 + eM) - (sH * 60 + sM);
        if (duration > group.storeConfig.lunchDurationMinutes) {
          group.isLunchOver = true;
        }
      }
    });

    // 3. Absence Detection
    if (filterDate) {
      const dayOfWeek = new Date(filterDate).getDay(); // 0-6
      profiles.forEach(p => {
        const key = `${p.id}-${filterDate}`;
        if (groups[key]) return; // Already has records

        // Check if user belongs to the selected store (if filtered)
        if (selectedStoreId !== 'all' && p.storeId !== selectedStoreId) return;
        
        // Skip admins/viewers usually, or only sellers/supervisors
        if (p.role === 'viewer') return;

        // Check Rest Day
        if (p.restDays?.includes(dayOfWeek)) return;

        // Check Vacation
        if (p.vacationDates?.includes(filterDate)) return;

        // It's an absence!
        const store = localStores.find(s => s.id === p.storeId);
        groups[key] = {
          userId: p.id,
          userName: p.fullName || p.email.split('@')[0],
          userEmail: p.email,
          storeName: store?.name || 'N/A',
          date: filterDate,
          images: { entry: {}, lunch_start: {}, lunch_end: {}, exit: {}, excused: {} },
          isAbsence: true
        };
      });
    }

    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date)).filter(g => 
      (g.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      g.userEmail.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (localStoreFilter === 'all' || g.storeConfig?.id === localStoreFilter)
    );
  }, [records, profiles, localStores, searchTerm, filterDate, selectedStoreId, localStoreFilter]);

  const stats = React.useMemo(() => {
    let expected = 0;
    if (filterDate) {
      const dayOfWeek = new Date(filterDate).getDay(); // 0-6
      expected = profiles.filter(p => {
        if (p.role === 'viewer') return false;
        if (selectedStoreId !== 'all' && p.storeId !== selectedStoreId) return false;
        if (localStoreFilter !== 'all' && p.storeId !== localStoreFilter) return false;
        if (p.restDays?.includes(dayOfWeek)) return false;
        if (p.vacationDates?.includes(filterDate)) return false;
        return true;
      }).length;
    }

    const filteredRecords = records.filter(r => {
      if (localStoreFilter === 'all') return true;
      return r.storeId === localStoreFilter;
    });

    const present = new Set(filteredRecords.map(r => r.userId)).size;
    const absent = Math.max(0, expected - present);
    const inLunch = new Set(filteredRecords.filter(r => r.type === 'lunch_start').map(r => r.userId)).size - 
                    new Set(filteredRecords.filter(r => r.type === 'lunch_end').map(r => r.userId)).size;
    const exited = new Set(filteredRecords.filter(r => r.type === 'exit').map(r => r.userId)).size;

    return { expected, present, absent, inLunch: Math.max(0, inLunch), exited };
  }, [records, profiles, filterDate, selectedStoreId, localStoreFilter]);

  const getStatusLabel = (type: AttendanceType) => {
    switch (type) {
      case 'entry': return 'Entrada';
      case 'lunch_start': return 'Salida a Comer';
      case 'lunch_end': return 'Regreso de Comida';
      case 'exit': return 'Salida Final';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Filters Bar */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">Reporte de Asistencias</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Supervisión de personal en tiempo real</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input 
               type="text" 
               placeholder="Buscar vendedor..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
             />
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div className="flex items-center gap-4">
              <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
                 <Calendar className="w-5 h-5 text-indigo-600" />
                 <input 
                   type="date" 
                   value={filterDate}
                   onChange={(e) => setFilterDate(e.target.value)}
                   className="bg-transparent text-sm font-black text-slate-800 outline-none"
                 />
              </div>
              <div className="flex gap-2">
                {activeTab === 'daily' && selectedStoreId === 'all' && (
                  <select
                    value={localStoreFilter}
                    onChange={(e) => setLocalStoreFilter(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-800 font-black text-xs px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Todas las Tiendas</option>
                    {localStores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
                <button 
                  onClick={() => setActiveTab('daily')}
                  className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                    activeTab === 'daily' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Diario
                </button>
                <button 
                  onClick={() => setActiveTab('schedules')}
                  className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                    activeTab === 'schedules' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Horarios
                </button>
                <button 
                  onClick={() => setActiveTab('summary')}
                  className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                    activeTab === 'summary' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Resumen
                </button>
              </div>
           </div>
          </div>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
            <User className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase">Empleados Esperados</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.expected} Empleados</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase">Presentes Hoy</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.present} Empleados</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-4 bg-red-50 text-red-600 rounded-2xl">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase">Faltas Injustificadas</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.absent} Empleados</h3>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
        {activeTab === 'schedules' ? (
          <div className="space-y-6">
            {/* Store Config Section */}
            {selectedStoreId !== 'all' && (
              <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 p-8 border border-indigo-50">
                 <div className="flex items-center justify-between mb-6">
                    <div>
                       <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                         Configuración: {localStores.find(s => s.id === selectedStoreId)?.name || 'Tienda'}
                       </h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Establece el horario de entrada y comida para esta sucursal</p>
                    </div>
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                       <Building className="w-6 h-6" />
                    </div>
                 </div>

                 {editingStoreId === selectedStoreId ? (
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Entrada</label>
                         <input 
                           type="time" 
                           value={editStoreEntry} 
                           onChange={(e) => setEditStoreEntry(e.target.value)} 
                           className="w-full bg-slate-50 border border-indigo-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-200 transition-all" 
                         />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Salida</label>
                         <input 
                           type="time" 
                           value={editStoreExit} 
                           onChange={(e) => setEditStoreExit(e.target.value)} 
                           className="w-full bg-slate-50 border border-indigo-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-200 transition-all" 
                         />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Comida (Horas)</label>
                         <input 
                           type="number"
                           step="0.5"
                           min="0"
                           value={editStoreLunchHours} 
                           onChange={(e) => setEditStoreLunchHours(parseFloat(e.target.value))} 
                           className="w-full bg-slate-50 border border-indigo-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-200 transition-all" 
                         />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleUpdateStoreSchedule(selectedStoreId)} className="flex-1 bg-emerald-500 text-white font-black py-3 rounded-2xl text-xs uppercase tracking-widest shadow-lg shadow-emerald-200 hover:scale-[1.02] active:scale-95 transition-all">Guardar</button>
                        <button onClick={() => setEditingStoreId(null)} className="flex-1 bg-slate-100 text-slate-400 font-black py-3 rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">X</button>
                      </div>
                   </div>
                 ) : (
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="p-5 bg-slate-50/50 rounded-[1.5rem] border border-slate-100 flex items-center gap-4">
                         <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-600"><Clock className="w-5 h-5" /></div>
                         <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entrada</p>
                            <p className="text-sm font-black text-slate-700 uppercase">{localStores.find(s => s.id === selectedStoreId)?.entryTime || '09:00'}</p>
                         </div>
                      </div>
                      <div className="p-5 bg-slate-50/50 rounded-[1.5rem] border border-slate-100 flex items-center gap-4">
                         <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-rose-600"><Clock className="w-5 h-5" /></div>
                         <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Salida</p>
                            <p className="text-sm font-black text-slate-700 uppercase">{localStores.find(s => s.id === selectedStoreId)?.exitTime || '18:00'}</p>
                         </div>
                      </div>
                      <div className="p-5 bg-slate-50/50 rounded-[1.5rem] border border-slate-100 flex items-center gap-4">
                         <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-amber-600"><Coffee className="w-5 h-5" /></div>
                         <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Comida</p>
                            <p className="text-sm font-black text-slate-700 uppercase">{localStores.find(s => s.id === selectedStoreId)?.lunchDurationMinutes || 60} Min</p>
                         </div>
                      </div>
                      <button 
                        onClick={() => {
                          setEditingStoreId(selectedStoreId);
                          setEditStoreEntry(localStores.find(s => s.id === selectedStoreId)?.entryTime || '09:00');
                          setEditStoreExit(localStores.find(s => s.id === selectedStoreId)?.exitTime || '18:00');
                          setEditStoreLunchHours((localStores.find(s => s.id === selectedStoreId)?.lunchDurationMinutes || 60) / 60);
                        }}
                        className="p-5 bg-white border-2 border-dashed border-slate-200 rounded-[1.5rem] text-slate-400 font-black text-xs uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                      >
                         <Edit2 className="w-4 h-4" /> Configurar
                      </button>
                   </div>
                 )}
              </div>
            )}

            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 overflow-hidden border border-slate-50">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sucursal</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Días de Descanso</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {profiles
                  .filter(p => p.role !== 'viewer')
                  .filter(p => selectedStoreId === 'all' || p.storeId === selectedStoreId)
                  .filter(p => p.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || p.email.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(profile => (
                  <tr key={profile.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                       <div className="font-black text-slate-800 text-sm uppercase">{profile.fullName || profile.email.split('@')[0]}</div>
                       <div className="text-[10px] text-slate-400 font-bold">{profile.email}</div>
                    </td>
                    <td className="px-8 py-6">
                       <span className="text-xs font-black text-slate-600 uppercase">
                         {stores.find(s => s.id === profile.storeId)?.name || 'GLOBAL'}
                       </span>
                    </td>
                    <td className="px-8 py-6">
                       {editingProfileId === profile.id ? (
                         <div className="space-y-4">
                           <div className="flex flex-wrap gap-1.5">
                             {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, idx) => (
                               <button
                                 key={idx}
                                 type="button"
                                 onClick={() => {
                                   if (targetRestDays.includes(idx)) setTargetRestDays(targetRestDays.filter(d => d !== idx));
                                   else setTargetRestDays([...targetRestDays, idx]);
                                 }}
                                 className={`w-7 h-7 rounded-lg text-[10px] font-black transition-all border ${
                                   targetRestDays.includes(idx) 
                                     ? 'bg-blue-600 text-white border-blue-700 shadow-sm' 
                                     : 'bg-white text-slate-400 border-slate-200 hover:border-blue-300'
                                 }`}
                               >
                                 {day}
                               </button>
                             ))}
                           </div>
                           <div className="space-y-1">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Rango de Vacaciones</label>
                             <div className="flex gap-2">
                               <input 
                                 type="date" 
                                 value={targetVacationStart} 
                                 onChange={(e) => setTargetVacationStart(e.target.value)} 
                                 className="bg-white border border-indigo-100 rounded-xl px-3 py-2 text-[10px] font-bold w-full outline-none focus:ring-2 focus:ring-indigo-100 transition-all" 
                               />
                               <span className="text-slate-300 self-center">-</span>
                               <input 
                                 type="date" 
                                 value={targetVacationEnd} 
                                 onChange={(e) => setTargetVacationEnd(e.target.value)} 
                                 className="bg-white border border-indigo-100 rounded-xl px-3 py-2 text-[10px] font-bold w-full outline-none focus:ring-2 focus:ring-indigo-100 transition-all" 
                               />
                             </div>
                           </div>
                         </div>
                       ) : (
                         <div className="space-y-2">
                            {(profile.restDays?.length || 0) > 0 ? (
                              <div className="flex items-center gap-1">
                                {profile.restDays?.map(d => (
                                  <span key={d} className="text-[9px] font-black text-blue-600 bg-blue-50 w-5 h-5 flex items-center justify-center rounded-lg border border-blue-100">
                                    {['D', 'L', 'M', 'M', 'J', 'V', 'S'][d]}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-300 italic font-bold">Sin días asignados</span>
                            )}
                            {(profile.vacationDates?.length || 0) > 0 && (
                              <div className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                                {profile.vacationDates?.length} días de vacaciones
                              </div>
                            )}
                         </div>
                       )}
                    </td>
                    <td className="px-8 py-6 text-right">
                       {editingProfileId === profile.id ? (
                         <div className="flex justify-end gap-2">
                           <button onClick={() => handleUpdateSchedule(profile.id)} className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-lg hover:bg-emerald-600 transition-colors"><CheckCircle className="w-5 h-5" /></button>
                           <button onClick={() => setEditingProfileId(null)} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200"><X className="w-5 h-5" /></button>
                         </div>
                       ) : (
                         <button 
                           onClick={() => {
                             setEditingProfileId(profile.id);
                             setTargetRestDays(profile.restDays || []);
                             const vDates = profile.vacationDates || [];
                             if (vDates.length > 0) {
                               const sortedDates = [...vDates].sort();
                               setTargetVacationStart(sortedDates[0]);
                               setTargetVacationEnd(sortedDates[sortedDates.length - 1]);
                             } else {
                               setTargetVacationStart('');
                               setTargetVacationEnd('');
                             }
                           }}
                           className="p-3 bg-white text-slate-300 hover:text-indigo-600 rounded-xl border border-slate-100 shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                         >
                           <Clock className="w-5 h-5" />
                         </button>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : activeTab === 'daily' ? (
          <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 overflow-hidden border border-slate-50">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Entrada</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Inic. Comida</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Fin Comida</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Salida</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {groupedData.length > 0 ? (
                  groupedData.map((row) => (
                    <tr key={`${row.userId}-${row.date}`} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => !row.isAbsence && setSelectedUser(row)}>
                      <td className="px-8 py-6">
                        <div className="font-black text-slate-800 text-sm uppercase tracking-tight leading-tight">{row.userName}</div>
                        <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">{row.storeName}</div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        {row.entry ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black ring-1 ring-indigo-100">{row.entry}</span>
                            {row.isLate && (
                              <span className="text-[8px] font-black text-red-500 uppercase bg-red-50 px-1.5 py-0.5 rounded ring-1 ring-red-100 animate-pulse">LLEGADA TARDE</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[10px]">Sin Registro</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`${row.lunchStart ? 'bg-amber-50 text-amber-600 ring-amber-100' : 'bg-slate-50 text-slate-300 ring-slate-100'} inline-block px-3 py-1 rounded-lg text-xs font-black ring-1`}>
                            {row.lunchStart || '--:--'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        {row.lunchEnd ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="inline-block px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-black ring-1 ring-amber-100">{row.lunchEnd}</span>
                            {row.isLunchOver && (
                              <span className="text-[8px] font-black text-orange-500 uppercase bg-orange-50 px-1.5 py-0.5 rounded ring-1 ring-orange-100">Exceso Comida</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[10px]">Sin Registro</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-center">
                        {row.exit ? (
                          <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-black ring-1 ring-blue-100">{row.exit}</span>
                        ) : (
                          <span className="text-slate-300">--:--</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        {row.isExcused ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase tracking-tighter shadow-lg shadow-emerald-200" title={row.excusedNotes}>
                            <CheckCircle className="w-3 h-3" /> PERMISO
                          </span>
                        ) : row.isAbsence ? (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (userProfile?.role === 'supervisor' && !userProfile.canJustifyAbsences) {
                                alert("No tienes autorización para justificar faltas. Solicita el permiso al administrador.");
                                return;
                              }
                              setJustifyingAbsence(row); 
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter shadow-lg transition-colors ${
                              (userProfile?.role === 'supervisor' && !userProfile.canJustifyAbsences)
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                                : 'bg-red-600 text-white shadow-red-200 hover:bg-red-700'
                            }`}
                            title="Click para justificar (Añadir Permiso)"
                          >
                            <AlertCircle className="w-3 h-3" /> Falta Injustificada
                          </button>
                        ) : (row.entry && !row.exit) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500 text-white rounded-full text-[9px] font-black uppercase tracking-tighter shadow-lg shadow-indigo-200">
                            <CheckCircle className="w-3 h-3" /> Trabajando
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[9px] font-black uppercase tracking-tighter">
                            Jornada Completa
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-slate-400 italic text-sm">
                      No se encontraron registros para esta fecha.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'summary' ? (
          <AttendanceSummary stores={stores} profiles={profiles} selectedStoreId={selectedStoreId} />
        ) : null}

        {/* Modal Justificar Falta */}
        {justifyingAbsence && (
          <div className="fixed inset-0 z-[60] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 p-6">
                <div className="flex justify-between items-center mb-6">
                   <div>
                     <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Justificar Falta</h3>
                     <p className="text-xs font-bold text-slate-400">Convertir a permiso / Falta justificada</p>
                   </div>
                   <button onClick={() => setJustifyingAbsence(null)} className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200">
                     <X className="w-5 h-5" />
                   </button>
                </div>

                <form onSubmit={handleJustifyAbsence} className="space-y-4">
                   <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-black">
                         {justifyingAbsence.userName.charAt(0)}
                      </div>
                      <div>
                         <p className="font-black text-sm text-slate-800 uppercase">{justifyingAbsence.userName}</p>
                         <p className="text-[10px] font-bold text-slate-400">{justifyingAbsence.date}</p>
                      </div>
                   </div>

                   <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Comentario / Motivo</label>
                     <textarea
                       value={absenceNotes}
                       onChange={(e) => setAbsenceNotes(e.target.value)}
                       required
                       className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                       placeholder="Ej: Avisó que iría al médico..."
                     />
                   </div>

                   <button type="submit" className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-colors">
                      Guardar Permiso
                   </button>
                </form>
             </div>
          </div>
        )}

        {/* Detailed User Summary Modal */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
             <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 my-auto">
                {/* Modal Header */}
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                   <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-black shadow-xl shadow-indigo-200">
                         {selectedUser.userName.charAt(0)}
                      </div>
                      <div>
                         <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none mb-2">{selectedUser.userName}</h3>
                         <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase">
                               <Building className="w-3.5 h-3.5 text-indigo-500" /> {selectedUser.storeName}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase">
                               <Calendar className="w-3.5 h-3.5 text-indigo-500" /> {selectedUser.date}
                            </span>
                         </div>
                      </div>
                   </div>
                   <button onClick={() => setSelectedUser(null)} className="p-4 hover:bg-slate-200 rounded-full transition-colors">
                      <X className="w-8 h-8 text-slate-500" />
                   </button>
                </div>

                {/* Modal Content */}
                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                   {/* Left side: Evidence Photos */}
                   <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selfie de Verificación</label>
                            <div 
                              onClick={() => selectedUser.images[activeEventType].selfie && setZoomedImage({ url: selectedUser.images[activeEventType].selfie!, title: `Selfie ${getStatusLabel(activeEventType)}` })}
                              className={`aspect-[3/4] bg-slate-100 rounded-[2rem] overflow-hidden border-2 border-slate-50 shadow-inner group relative ${selectedUser.images[activeEventType].selfie ? 'cursor-zoom-in' : ''}`}
                            >
                               {selectedUser.images[activeEventType].selfie ? (
                                 <img src={selectedUser.images[activeEventType].selfie} alt="Selfie" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                               ) : (
                                 <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 italic p-6 text-center">
                                    <Camera className="w-8 h-8 mb-2 opacity-20" />
                                    <p className="text-[10px] font-bold uppercase">Sin fotografía</p>
                                 </div>
                               )}
                               <div className="absolute top-4 left-4">
                                  <span className="px-3 py-1 bg-white/20 backdrop-blur-md text-white text-[10px] font-black rounded-lg border border-white/30 uppercase">
                                    {getStatusLabel(activeEventType)}
                                  </span>
                               </div>
                               {selectedUser.images[activeEventType].selfie && (
                                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <Eye className="w-8 h-8 text-white" />
                                 </div>
                               )}
                            </div>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">App de Portabilidad</label>
                            <div 
                              onClick={() => selectedUser.images[activeEventType].screenshot && setZoomedImage({ url: selectedUser.images[activeEventType].screenshot!, title: `Screenshot ${getStatusLabel(activeEventType)}` })}
                              className={`aspect-[3/4] bg-slate-100 rounded-[2rem] overflow-hidden border-2 border-slate-50 shadow-inner group relative ${selectedUser.images[activeEventType].screenshot ? 'cursor-zoom-in' : ''}`}
                            >
                               {selectedUser.images[activeEventType].screenshot ? (
                                 <img src={selectedUser.images[activeEventType].screenshot} alt="Screenshot" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                               ) : (
                                 <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 italic p-6 text-center">
                                    <Smartphone className="w-8 h-8 mb-2 opacity-20" />
                                    <p className="text-[10px] font-bold uppercase">Sin captura</p>
                                 </div>
                               )}
                               <div className="absolute top-4 left-4">
                                  <span className="px-3 py-1 bg-white/20 backdrop-blur-md text-white text-[10px] font-black rounded-lg border border-white/30 uppercase">Check-in</span>
                               </div>
                               {selectedUser.images[activeEventType].screenshot && (
                                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <Eye className="w-8 h-8 text-white" />
                                 </div>
                               )}
                            </div>
                         </div>
                      </div>
                      
                      {selectedUser.images[activeEventType].location && (
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                           <MapPin className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                           <div>
                              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Ubicación para {getStatusLabel(activeEventType)}</p>
                              <p className="text-xs font-bold text-blue-900 leading-relaxed">{selectedUser.images[activeEventType].location}</p>
                           </div>
                        </div>
                      )}
                   </div>

                   {/* Right side: Timeline & Stats */}
                   <div className="space-y-6">
                      <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                         <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-500" /> Línea del Tiempo (Selecciona un evento)
                         </h4>
                         
                         <div className="space-y-6 relative ml-4 border-l-2 border-slate-200 pl-8">
                            {(['entry', 'lunch_start', 'lunch_end', 'exit'] as AttendanceType[]).map((type) => {
                               const time = type === 'entry' ? selectedUser.entry : 
                                            type === 'lunch_start' ? selectedUser.lunchStart : 
                                            type === 'lunch_end' ? selectedUser.lunchEnd : 
                                            selectedUser.exit;
                               const isActive = activeEventType === type;
                               const hasData = !!time;
                               const label = getStatusLabel(type);
                               
                               return (
                                 <button 
                                   key={type}
                                   onClick={() => setActiveEventType(type)}
                                   className={`relative w-full text-left transition-all duration-300 group ${isActive ? 'scale-105' : 'hover:scale-102'}`}
                                 >
                                    <div className={`
                                      absolute -left-[41px] top-0 w-6 h-6 rounded-full border-4 border-white shadow-md transition-all duration-300
                                      ${isActive ? 'bg-indigo-600 scale-125 z-10' : hasData ? 'bg-emerald-500' : 'bg-slate-200'}
                                    `}></div>
                                    <div className={`
                                      p-3 rounded-2xl transition-all duration-300 border
                                      ${isActive ? 'bg-white border-indigo-200 shadow-lg' : 'bg-transparent border-transparent'}
                                    `}>
                                       <p className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</p>
                                       <p className={`text-lg font-black ${isActive ? 'text-slate-800' : hasData ? 'text-slate-600' : 'text-slate-300'}`}>
                                          {time || 'Pendiente'}
                                       </p>
                                    </div>
                                 </button>
                               );
                            })}
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                         <div className="p-4 bg-slate-900 rounded-2xl text-white text-center">
                            <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Evidencia Digital</p>
                            <p className="text-xs font-black uppercase text-indigo-400">Verificada</p>
                         </div>
                         <div className="p-4 bg-emerald-500 rounded-2xl text-white text-center">
                            <p className="text-[9px] font-bold uppercase text-emerald-100 mb-1">Integridad</p>
                            <p className="text-xs font-black uppercase">100% Confiable</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Haz clic en los eventos de la izquierda para ver sus fotos correspondientes</p>
                </div>
             </div>
          </div>
        )}

        {/* Zoomed Image Overlay */}
        {zoomedImage && (
          <div 
            className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-300"
            onClick={() => setZoomedImage(null)}
          >
             <div className="absolute top-8 left-8 flex items-center gap-4 text-white">
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                   <Camera className="w-6 h-6" />
                </div>
                <div>
                   <h3 className="text-xl font-black uppercase tracking-tight">{zoomedImage.title}</h3>
                   <p className="text-xs font-bold text-white/50 uppercase tracking-widest">{selectedUser?.userName}</p>
                </div>
             </div>
             <button className="absolute top-8 right-8 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md">
                <X className="w-8 h-8" />
             </button>
             <img src={zoomedImage.url} alt="Full size" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-500" />
          </div>
        )}
      </div>
  );
};

export default AttendanceReport;
