import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Store, UserProfile, AttendanceRecord } from '../types';
import { Calendar, CheckCircle, AlertCircle, Coffee, Loader2, User, X } from 'lucide-react';

interface AttendanceSummaryProps {
  stores: Store[];
  profiles: UserProfile[];
  selectedStoreId: string;
}

const AttendanceSummary: React.FC<AttendanceSummaryProps> = ({ stores, profiles, selectedStoreId }) => {
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [viewingAbsences, setViewingAbsences] = useState<{ profile: UserProfile, dates: string[] } | null>(null);

  useEffect(() => {
    const fetchMonthlyData = async () => {
      setLoading(true);
      try {
        const startDate = `${month}-01`;
        // Calculate end date
        const [year, m] = month.split('-');
        const endDate = new Date(parseInt(year), parseInt(m), 0).toISOString().split('T')[0];

        let query = supabase.from('attendance')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate);

        if (selectedStoreId !== 'all') {
          query = query.eq('store_id', selectedStoreId);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        setRecords(data.map((r: any) => ({
          ...r,
          userId: r.user_id,
          storeId: r.store_id,
          type: r.type,
        })));
      } catch (err) {
        console.error('Error fetching monthly summary:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyData();
  }, [month, selectedStoreId]);

  const summaryData = React.useMemo(() => {
    if (loading) return [];
    
    const [year, m] = month.split('-').map(Number);
    const daysInMonth = new Date(year, m, 0).getDate();
    
    // Max date to evaluate absences is either today or end of the selected month
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    let maxEvalDay = daysInMonth;
    
    if (year === currentYear && m === currentMonth) {
      maxEvalDay = today.getDate();
    } else if (year > currentYear || (year === currentYear && m > currentMonth)) {
      maxEvalDay = 0; // Future month
    }

    let filteredProfiles = profiles.filter(p => p.role !== 'viewer');
    if (selectedStoreId !== 'all') {
      filteredProfiles = filteredProfiles.filter(p => p.storeId === selectedStoreId);
    }

    return filteredProfiles.map(profile => {
      let worked = 0;
      let excused = 0;
      let restDays = 0;
      let vacations = 0;
      let absences = 0;
      let absenceDates: string[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = new Date(year, m - 1, day).getDay();

        // Check records for this user and this date
        const dayRecords = records.filter(r => r.userId === profile.id && r.date === dateStr);
        const hasEntry = dayRecords.some(r => r.type === 'entry');
        const hasExcused = dayRecords.some(r => r.type === 'excused');

        const isRestDay = profile.restDays?.includes(dayOfWeek);
        const isVacation = profile.vacationDates?.includes(dateStr);

        if (hasEntry) {
          worked++;
        } else if (hasExcused) {
          excused++;
        } else if (isVacation) {
          vacations++;
        } else if (isRestDay) {
          restDays++;
        } else {
          // If none of the above, and the day is in the past or today, it's an absence
          if (day <= maxEvalDay) {
            absences++;
            absenceDates.push(dateStr);
          }
        }
      }

      return {
        profile,
        worked,
        excused,
        restDays,
        vacations,
        absences,
        absenceDates,
        total: worked + excused + restDays + vacations + absences
      };
    }).sort((a, b) => (a.profile.fullName || '').localeCompare(b.profile.fullName || ''));
  }, [records, profiles, month, selectedStoreId, loading]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <p className="text-slate-400 font-bold animate-pulse">Calculando resumen mensual...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Resumen General</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Estadísticas de Asistencia Mensual</p>
          </div>
        </div>
        <div>
          <input 
            type="month" 
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 font-black text-sm px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 overflow-hidden border border-slate-50">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                <th className="px-6 py-5 text-[10px] font-black text-indigo-500 uppercase tracking-widest text-center">Trabajados</th>
                <th className="px-6 py-5 text-[10px] font-black text-emerald-500 uppercase tracking-widest text-center">Permisos</th>
                <th className="px-6 py-5 text-[10px] font-black text-red-500 uppercase tracking-widest text-center">Faltas</th>
                <th className="px-6 py-5 text-[10px] font-black text-blue-500 uppercase tracking-widest text-center">Descansos</th>
                <th className="px-6 py-5 text-[10px] font-black text-orange-500 uppercase tracking-widest text-center">Vacaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {summaryData.length > 0 ? (
                summaryData.map(({ profile, worked, excused, absences, absenceDates, restDays, vacations }) => (
                  <tr key={profile.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-6">
                      <div className="font-black text-slate-800 text-sm uppercase tracking-tight">{profile.fullName || profile.email.split('@')[0]}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">{stores.find(s => s.id === profile.storeId)?.name || 'GLOBAL'}</div>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black ring-1 ring-indigo-100">{worked} Días</span>
                    </td>
                    <td className="px-6 py-6 text-center">
                      {excused > 0 ? (
                        <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-black ring-1 ring-emerald-100">{excused} Días</span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-6 py-6 text-center">
                      {absences > 0 ? (
                        <button 
                          onClick={() => setViewingAbsences({ profile, dates: absenceDates })}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-black ring-1 ring-red-100 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                          title="Ver días que faltó"
                        >
                          {absences} Días <AlertCircle className="w-3 h-3" />
                        </button>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-6 py-6 text-center">
                      {restDays > 0 ? (
                        <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-black ring-1 ring-blue-100">{restDays} Días</span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-6 py-6 text-center">
                      {vacations > 0 ? (
                        <span className="inline-block px-3 py-1 bg-orange-50 text-orange-600 rounded-lg text-xs font-black ring-1 ring-orange-100">{vacations} Días</span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-400 italic text-sm">
                    No se encontraron empleados para esta vista.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal Detalles de Faltas - Calendario Visual */}
      {viewingAbsences && (() => {
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr);
        const m = parseInt(monthStr) - 1; // JS months are 0-indexed
        
        const firstDay = new Date(year, m, 1).getDay(); // 0 = Sun
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        
        const monthName = new Date(year, m, 1).toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
        
        // Convert absenceDates to a Set of numbers for fast lookup
        const absenceSet = new Set(viewingAbsences.dates.map(d => parseInt(d.split('-')[2])));

        return (
          <div className="fixed inset-0 z-[60] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
                {/* Header / Title */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                   <div>
                     <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Registro de Faltas</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase">{viewingAbsences.profile.fullName || viewingAbsences.profile.email.split('@')[0]}</p>
                   </div>
                   <button onClick={() => setViewingAbsences(null)} className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200">
                     <X className="w-5 h-5" />
                   </button>
                </div>

                {/* Calendar Container */}
                <div className="p-8">
                   <div className="bg-white border border-[#B38C52]/20 rounded-2xl overflow-hidden shadow-sm">
                      {/* Calendar Top Header */}
                      <div className="bg-[#6B2032] px-5 py-3 flex justify-between items-center">
                        <span className="text-white font-black tracking-widest text-sm">{monthName}</span>
                        <span className="text-white font-black text-sm">{year}</span>
                      </div>
                      
                      {/* Days of week */}
                      <div className="grid grid-cols-7 bg-[#B38C52]">
                        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, i) => (
                          <div key={i} className="py-2 text-center text-white font-black text-[10px]">
                            {day}
                          </div>
                        ))}
                      </div>
                      
                      {/* Calendar Grid */}
                      <div className="grid grid-cols-7 p-3 gap-y-2">
                        {Array.from({ length: firstDay }).map((_, i) => (
                          <div key={`empty-${i}`} className="p-2"></div>
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const isAbsent = absenceSet.has(day);
                          return (
                            <div key={day} className="flex items-center justify-center">
                              <div className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-all ${
                                isAbsent 
                                  ? 'bg-[#E393A7] text-white font-black ring-2 ring-[#E393A7] ring-offset-1 shadow-sm' 
                                  : 'text-slate-600 font-medium'
                              }`}>
                                {day}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                   </div>
                   
                   <div className="mt-6 flex items-center justify-center gap-2">
                     <div className="w-3 h-3 rounded-full bg-[#E393A7] shadow-sm"></div>
                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Días con falta registrada</span>
                   </div>
                </div>
             </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AttendanceSummary;
