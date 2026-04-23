import React, { useState, useEffect } from 'react';
import { Clock, Calendar, User, Search, Filter, ArrowRight, CheckCircle, AlertCircle, Coffee, LogOut, Loader2, Building, Eye, MapPin, Smartphone, X, Camera } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { AttendanceRecord, UserProfile, Store, AttendanceType } from '../types';

interface AttendanceReportProps {
  selectedStoreId: string;
  stores: Store[];
}

interface GroupedAttendance {
  userId: string;
  userName: string;
  userEmail: string;
  storeName: string;
  date: string;
  entry?: string;
  lunchStart?: string;
  lunchEnd?: string;
  exit?: string;
  // Verification details for entry
  entryImage?: string;
  entryScreenshot?: string;
  entryLocation?: string;
  // Verification details for exit
  exitImage?: string;
  exitScreenshot?: string;
  exitLocation?: string;
}

const AttendanceReport: React.FC<AttendanceReportProps> = ({ selectedStoreId, stores }) => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string, type: string, user: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Profiles to get names
      const { data: profilesData } = await supabase.from('profiles').select('*');
      if (profilesData) setProfiles(profilesData);

      // 2. Fetch Attendance Records for the selected date
      let query = supabase.from('attendance')
        .select('*')
        .eq('date', filterDate)
        .order('timestamp', { ascending: true });

      if (selectedStoreId !== 'all') {
        query = query.eq('store_id', selectedStoreId);
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
        locationCoords: r.location_coords
      }));

      setRecords(formatted);
    } catch (err) {
      console.error('Error fetching attendance report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedStoreId, filterDate]);

  // Transform records into a tabular format (one row per user per day)
  const groupedData = React.useMemo(() => {
    const groups: Record<string, GroupedAttendance> = {};

    records.forEach(record => {
      const profile = profiles.find(p => p.id === record.userId);
      const store = stores.find(s => s.id === record.storeId);
      const key = `${record.userId}-${record.date}`;

      if (!groups[key]) {
        // Map database fields correctly
        const mappedProfile = profile ? {
          ...profile,
          fullName: (profile as any).full_name || profile.fullName
        } : null;

        groups[key] = {
          userId: record.userId,
          userName: mappedProfile?.fullName || profile?.email?.split('@')[0] || 'Usuario',
          userEmail: profile?.email || '',
          storeName: store?.name || 'Desconocida',
          date: record.date
        };
      }

      const time = new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (record.type === 'entry') {
        groups[key].entry = time;
        groups[key].entryImage = record.imageUrl;
        groups[key].entryScreenshot = record.screenshotUrl;
        groups[key].entryLocation = record.locationCoords;
      }
      if (record.type === 'lunch_start') groups[key].lunchStart = time;
      if (record.type === 'lunch_end') groups[key].lunchEnd = time;
      if (record.type === 'exit') {
        groups[key].exit = time;
        groups[key].exitImage = record.imageUrl;
        groups[key].exitScreenshot = record.screenshotUrl;
        groups[key].exitLocation = record.locationCoords;
      }
    });

    return Object.values(groups).filter(g => 
      g.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      g.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [records, profiles, stores, searchTerm]);

  const stats = React.useMemo(() => {
    const present = new Set(records.map(r => r.userId)).size;
    const inLunch = new Set(records.filter(r => r.type === 'lunch_start').map(r => r.userId)).size - 
                    new Set(records.filter(r => r.type === 'lunch_end').map(r => r.userId)).size;
    const exited = new Set(records.filter(r => r.type === 'exit').map(r => r.userId)).size;

    return { present, inLunch: Math.max(0, inLunch), exited };
  }, [records]);

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
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <input 
              type="date" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase">En Comida</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.inLunch} Empleados</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-4 bg-slate-50 text-slate-600 rounded-2xl">
            <LogOut className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase">Salida Marcada</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.exited} Empleados</h3>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado / Sucursal</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Entrada</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Salida Comida</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Regreso Comida</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Salida</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
                    <p className="text-xs font-black text-slate-400 uppercase">Cargando registros...</p>
                  </td>
                </tr>
              ) : groupedData.length > 0 ? (
                groupedData.map((row) => (
                  <tr key={`${row.userId}-${row.date}`} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                          {row.userName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800 uppercase leading-none mb-1">{row.userName}</p>
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <Building className="w-3 h-3" />
                            <p className="text-[10px] font-bold uppercase">{row.storeName}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      {row.entry ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-black ring-1 ring-emerald-100">{row.entry}</span>
                          <div className="flex items-center gap-1">
                            {row.entryImage && (
                              <button 
                                onClick={() => setSelectedPhoto({ url: row.entryImage!, type: 'Selfie Entrada', user: row.userName })}
                                className="p-1 hover:bg-slate-100 rounded text-indigo-500 transition-colors"
                                title="Ver Selfie"
                              >
                                <Camera className="w-3 h-3" />
                              </button>
                            )}
                            {row.entryScreenshot && (
                              <button 
                                onClick={() => setSelectedPhoto({ url: row.entryScreenshot!, type: 'Screenshot Entrada', user: row.userName })}
                                className="p-1 hover:bg-slate-100 rounded text-blue-500 transition-colors"
                                title="Ver App Externa"
                              >
                                <Smartphone className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300">--:--</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center">
                      {row.lunchStart ? (
                        <span className="text-xs font-bold text-slate-600">{row.lunchStart}</span>
                      ) : (
                        <span className="text-slate-300 text-xs">--:--</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center">
                      {row.lunchEnd ? (
                        <span className="text-xs font-bold text-slate-600">{row.lunchEnd}</span>
                      ) : (
                        <span className="text-slate-300 text-xs">--:--</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center">
                      {row.exit ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-black ring-1 ring-blue-100">{row.exit}</span>
                          <div className="flex items-center gap-1">
                            {row.exitImage && (
                              <button 
                                onClick={() => setSelectedPhoto({ url: row.exitImage!, type: 'Selfie Salida', user: row.userName })}
                                className="p-1 hover:bg-slate-100 rounded text-indigo-500 transition-colors"
                                title="Ver Selfie"
                              >
                                <Camera className="w-3 h-3" />
                              </button>
                            )}
                            {row.exitScreenshot && (
                              <button 
                                onClick={() => setSelectedPhoto({ url: row.exitScreenshot!, type: 'Screenshot Salida', user: row.userName })}
                                className="p-1 hover:bg-slate-100 rounded text-blue-500 transition-colors"
                                title="Ver App Externa"
                              >
                                <Smartphone className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300">--:--</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                       {!row.entry ? (
                         <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-[9px] font-black uppercase tracking-tighter">
                           <AlertCircle className="w-3 h-3" /> Ausente
                         </span>
                       ) : (row.entry && !row.exit) ? (
                         <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-tighter">
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

        {/* Photo Viewer Modal */}
        {selectedPhoto && (
          <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                         {selectedPhoto.type.includes('Selfie') ? <Camera className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}
                      </div>
                      <div>
                         <h3 className="font-black text-slate-800 uppercase tracking-tight">{selectedPhoto.type}</h3>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedPhoto.user}</p>
                      </div>
                   </div>
                   <button onClick={() => setSelectedPhoto(null)} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
                      <X className="w-6 h-6 text-slate-500" />
                   </button>
                </div>
                <div className="p-2 bg-slate-100 flex-1 flex items-center justify-center overflow-hidden min-h-[400px]">
                   <img src={selectedPhoto.url} alt="Evidencia" className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-xl" />
                </div>
                <div className="p-6 bg-white border-t border-slate-100 text-center">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sello de evidencia digital - Ventas Coppel POS</p>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceReport;
