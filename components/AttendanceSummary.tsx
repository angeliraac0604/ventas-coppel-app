import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { Store, UserProfile, AttendanceRecord } from '../types';
import { 
  Calendar, 
  AlertCircle, 
  Clock, 
  X, 
  RotateCcw, 
  User, 
  ShieldCheck,
  MapPin
} from 'lucide-react';

interface AttendanceSummaryProps {
  stores: Store[];
  profiles: UserProfile[];
  records: AttendanceRecord[];
  month: string;
  selectedStoreId: string;
  onRefresh?: () => void;
}

const AttendanceSummary: React.FC<AttendanceSummaryProps> = ({ stores, profiles, records, month, selectedStoreId, onRefresh }) => {
  const [viewingAbsences, setViewingAbsences] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<{ day: number, date: string, status: any, records?: AttendanceRecord[] } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const handleMarkRestDay = async (userId: string, storeId: string, dateStr: string) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('attendance').insert({
        user_id: userId,
        store_id: storeId,
        type: 'rest_day',
        date: dateStr,
        timestamp: new Date().toISOString(),
        notes: 'Cambio de descanso autorizado por supervisor'
      });

      if (error) throw error;
      if (onRefresh) onRefresh();
      setSelectedDay(null);
    } catch (err: any) {
      alert('Error al marcar descanso: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveRestDay = async (recordId: string) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('attendance').delete().eq('id', recordId);
      if (error) throw error;
      if (onRefresh) onRefresh();
      setSelectedDay(null);
    } catch (err: any) {
      alert('Error al eliminar registro: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const summaryData = React.useMemo(() => {
    const [year, m] = month.split('-').map(Number);
    const daysInMonth = new Date(year, m, 0).getDate();
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    let maxEvalDay = daysInMonth;
    
    if (year === currentYear && m === currentMonth) {
      maxEvalDay = today.getDate() - 1;
    } else if (year > currentYear || (year === currentYear && m > currentMonth)) {
      maxEvalDay = 0;
    }

    let filteredProfiles = profiles.filter(p => p.role !== 'viewer');
    if (selectedStoreId !== 'all') {
      filteredProfiles = filteredProfiles.filter(p => p.storeId === selectedStoreId);
    }

    return filteredProfiles.map(profile => {
      let worked = 0, excused = 0, restDays = 0, vacations = 0, absences = 0;
      let absenceDates: string[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = new Date(year, m - 1, day).getDay();
        const dayRecords = records.filter(r => r.userId === profile.id && r.date === dateStr);
        
        const hasEntry = dayRecords.some(r => r.type === 'entry');
        const hasRestOverride = dayRecords.some(r => r.type === 'rest_day');
        const isScheduledRest = profile.restDays?.includes(dayOfWeek);
        const isVacation = profile.vacationDates?.includes(dateStr);

        if (hasEntry) {
          worked++;
        } else if (hasRestOverride) {
          restDays++;
        } else if (isVacation && day <= maxEvalDay) {
          vacations++;
        } else if (isScheduledRest && day <= maxEvalDay) {
          restDays++;
        } else if (day <= maxEvalDay) {
          absences++;
          absenceDates.push(dateStr);
        }
      }
      return { profile, worked, excused, restDays, vacations, absences, absenceDates };
    }).sort((a, b) => (a.profile.fullName || '').localeCompare(b.profile.fullName || ''));
  }, [records, profiles, month, selectedStoreId]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 overflow-hidden border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                <th className="px-6 py-5 text-[10px] font-black text-indigo-500 uppercase tracking-widest text-center">Trabajados</th>
                <th className="px-6 py-5 text-[10px] font-black text-red-500 uppercase tracking-widest text-center">Faltas</th>
                <th className="px-6 py-5 text-[10px] font-black text-emerald-500 uppercase tracking-widest text-center">Permisos</th>
                <th className="px-6 py-5 text-[10px] font-black text-blue-500 uppercase tracking-widest text-center">Descansos</th>
                <th className="px-6 py-5 text-[10px] font-black text-orange-500 uppercase tracking-widest text-center">Vacaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {summaryData.map((data) => {
                const { profile, worked, excused, absences, restDays, vacations } = data;
                return (
                  <tr key={profile.id} className="hover:bg-indigo-50/50 transition-all cursor-pointer group" onClick={() => setViewingAbsences(data)}>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-black text-slate-800 text-sm uppercase tracking-tight group-hover:text-indigo-700">{profile.fullName}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">{stores.find(s => s.id === profile.storeId)?.name || 'GLOBAL'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[11px] font-black ring-1 ring-indigo-100">{worked} D</span>
                    </td>
                    <td className="px-6 py-6 text-center">
                      {absences > 0 ? <span className="px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-[11px] font-black ring-1 ring-red-100">{absences} D</span> : <span className="text-slate-200">-</span>}
                    </td>
                    <td className="px-6 py-6 text-center">
                      {excused > 0 ? <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[11px] font-black ring-1 ring-emerald-100">{excused} D</span> : <span className="text-slate-200">-</span>}
                    </td>
                    <td className="px-6 py-6 text-center"><span className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[11px] font-black ring-1 ring-blue-100">{restDays} D</span></td>
                    <td className="px-6 py-6 text-center">
                      {vacations > 0 ? <span className="px-3 py-1.5 bg-orange-50 text-orange-600 rounded-xl text-[11px] font-black ring-1 ring-orange-100">{vacations} D</span> : <span className="text-slate-200">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewingAbsences && (() => {
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr);
        const m = parseInt(monthStr) - 1;
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        const monthName = new Date(year, m, 1).toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
        const absenceSet = new Set(viewingAbsences.absenceDates.map((d: string) => parseInt(d.split('-')[2])));
        const today = new Date();

        const getDayStatus = (day: number) => {
          const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayRecords = records.filter(r => r.userId === viewingAbsences.profile.id && r.date === dateStr);
          const hasEntry = dayRecords.some(r => r.type === 'entry');
          const restDayOverride = dayRecords.find(r => r.type === 'rest_day');
          const isScheduledRest = viewingAbsences.profile.restDays?.includes(new Date(year, m, day).getDay());
          const isToday = day === today.getDate() && year === today.getFullYear() && m === today.getMonth();
          const isFuture = new Date(year, m, day) > today;

          if (hasEntry) return { color: 'bg-emerald-500 text-white', label: 'Asistencia', type: 'attendance' };
          if (restDayOverride) return { color: 'bg-slate-700 text-white font-bold', label: 'C. Descanso', type: 'rest_day_manual', recordId: restDayOverride.id };
          if (dayRecords.some(r => r.type === 'excused')) return { color: 'bg-blue-400 text-white', label: 'Permiso', type: 'excused' };
          if (viewingAbsences.profile.vacationDates?.includes(dateStr)) return { color: 'bg-amber-400 text-white', label: 'Vacaciones', type: 'vacation' };
          if (!isFuture) {
            if (isScheduledRest) return { color: 'bg-slate-200 text-slate-700 font-bold', label: 'Descanso', type: 'rest_day' };
            if (absenceSet.has(day)) return { color: 'bg-rose-500 text-white', label: 'Falta', type: 'absence' };
          }
          if (isToday) return { color: 'bg-indigo-50 text-indigo-700 border-2 border-indigo-200 animate-pulse font-black', label: 'Hoy', type: 'today' };
          if (isFuture) return { color: 'bg-white text-slate-300 border border-slate-100 border-dashed', label: 'Futuro', type: 'future' };
          return { color: 'bg-slate-50 text-slate-400 font-bold', label: 'Sin registro', type: 'none' };
        };

        return (
          <div className="fixed inset-0 z-[60] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
             <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 my-auto">
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                   <div>
                     <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Gestión de Asistencia</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase">{viewingAbsences.profile.fullName}</p>
                   </div>
                   <button onClick={() => { setViewingAbsences(null); setSelectedDay(null); }} className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-8">
                   <div className="bg-white border border-[#B38C52]/20 rounded-3xl overflow-hidden shadow-sm">
                      <div className="bg-[#6B2032] px-5 py-3 flex justify-between items-center">
                        <span className="text-white font-black tracking-widest text-xs">{monthName}</span>
                        <span className="text-white font-black text-xs">{year}</span>
                      </div>
                      <div className="grid grid-cols-7 bg-[#B38C52]">
                        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (<div key={i} className="py-2 text-center text-white font-black text-[10px]">{d}</div>))}
                      </div>
                      <div className="grid grid-cols-7 p-3 gap-1.5">
                        {Array.from({ length: new Date(year, m, 1).getDay() }).map((_, i) => (<div key={`empty-${i}`} className="p-2"></div>))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const status = getDayStatus(day);
                          const dayRecords = records.filter(r => r.userId === viewingAbsences.profile.id && r.date === dateStr);
                          return (
                            <button key={day} onClick={() => setSelectedDay({ day, date: dateStr, status, records: dayRecords })} className={`aspect-square flex items-center justify-center rounded-xl text-[12px] transition-all active:scale-90 shadow-sm ${status.color}`}>
                              {day}
                            </button>
                          );
                        })}
                      </div>
                   </div>
                   <div className="mt-6 grid grid-cols-2 gap-y-3 gap-x-4 px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-100"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Asistencia</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-100"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Falta</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm shadow-blue-100"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Permiso</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-100"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Vacaciones</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-200 shadow-sm"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Descanso</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-700 shadow-sm shadow-slate-200"></div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">C. Descanso</span>
                      </div>
                   </div>
                </div>

                {selectedDay && (
                  <div className="p-6 bg-slate-50 border-t border-slate-100 animate-in slide-in-from-bottom-4 max-h-[380px] overflow-y-auto custom-scrollbar relative">
                    <div className="flex justify-between items-center mb-6 sticky -top-6 bg-slate-50 py-4 z-20 border-b border-slate-100/50">
                      <div className="flex items-center gap-2">
                         <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                            <ShieldCheck className="w-3.5 h-3.5" />
                         </div>
                         <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                           {selectedDay.status.label} — Día {selectedDay.day}
                         </h4>
                      </div>
                      <button onClick={() => setSelectedDay(null)} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>

                    {selectedDay.records && selectedDay.records.length > 0 ? (
                      <div className="space-y-4">
                        {selectedDay.records.map((rec, idx) => (
                          <div key={rec.id || idx} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                             <div className="flex justify-between border-b border-slate-50 pb-2">
                                <span className="text-[9px] font-black text-indigo-600 uppercase">{rec.type === 'entry' ? 'Entrada' : 'Registro'}</span>
                                <span className="text-[10px] font-bold text-slate-400">{new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                             </div>
                             <div className="grid grid-cols-2 gap-2">
                                {rec.imageUrl && <img src={rec.imageUrl} onClick={() => setZoomedImage(rec.imageUrl!)} className="w-full aspect-square object-cover rounded-xl border border-slate-100 cursor-zoom-in" />}
                                {rec.screenshotUrl && <img src={rec.screenshotUrl} onClick={() => setZoomedImage(rec.screenshotUrl!)} className="w-full aspect-square object-cover rounded-xl border border-slate-100 cursor-zoom-in" />}
                             </div>
                             {rec.locationCoords && <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-red-400" /><span className="text-[8px] font-bold text-slate-400 truncate">{rec.locationCoords}</span></div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center space-y-2">
                         <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center ${selectedDay.status.color.replace('text-white', 'text-slate-400 opacity-20')}`}>
                            <Calendar className="w-6 h-6" />
                         </div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-4">
                           {selectedDay.status.type === 'rest_day' || selectedDay.status.type === 'rest_day_manual' 
                             ? 'Este día fue un descanso autorizado'
                             : selectedDay.status.type === 'vacation'
                               ? 'El colaborador se encontraba de vacaciones'
                               : selectedDay.status.type === 'absence'
                                 ? 'No se detectó registro de asistencia en este día'
                                 : 'Sin registros disponibles para esta fecha'}
                         </p>

                         {selectedDay.status.type === 'absence' && (
                           <div className="pt-4 px-2">
                             <button 
                               onClick={() => handleMarkRestDay(viewingAbsences.profile.id, viewingAbsences.profile.storeId, selectedDay.date)}
                               disabled={isUpdating}
                               className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
                             >
                               {isUpdating ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                               Autorizar Cambio de Descanso
                             </button>
                           </div>
                         )}
                      </div>
                    )}
                    {selectedDay.status.type === 'rest_day_manual' && (
                      <button onClick={() => handleRemoveRestDay(selectedDay.status.recordId)} className="w-full py-3 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase mt-4">
                        Revertir Cambio de Descanso
                      </button>
                    )}
                  </div>
                )}
             </div>
          </div>
        );
      })()}

      {zoomedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setZoomedImage(null)}>
           <X className="absolute top-6 right-6 w-8 h-8 text-white cursor-pointer" />
           <img src={zoomedImage} className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
};

export default AttendanceSummary;
