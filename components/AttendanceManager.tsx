import React, { useState, useEffect } from 'react';
import { Clock, Coffee, LogOut, LogIn, Calendar, CheckCircle2, History, Camera, MapPin, Upload, X, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { AttendanceRecord, AttendanceType, UserProfile } from '../types';
import { smartImageUpload } from '../services/storageService';

interface AttendanceManagerProps {
  user: UserProfile;
}

const AttendanceManager: React.FC<AttendanceManagerProps> = ({ user }) => {
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [todayRecords, setTodayRecords] = useState<AttendanceType[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  
  // Camera & Verification States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [pendingType, setPendingType] = useState<AttendanceType | null>(null);
  const [location, setLocation] = useState<string>('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [storeConfig, setStoreConfig] = useState<any>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const fetchAttendance = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      
      const formatted = data.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        storeId: r.store_id,
        type: r.type as AttendanceType,
        timestamp: r.timestamp,
        date: r.date
      }));

      setHistory(formatted);
      setTodayRecords(formatted.filter(r => r.date === todayStr).map(r => r.type));
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
    
    const fetchStore = async () => {
      if (user.storeId) {
        const { data } = await supabase.from('stores').select('*').eq('id', user.storeId).single();
        if (data) setStoreConfig(data);
      }
    };
    fetchStore();
  }, [user.id, user.storeId]);

  const handleRegister = async (type: AttendanceType, imageBase64?: string, screenshotBase64?: string, locationStr?: string) => {
    setIsLoading(true);
    try {
      let finalImageUrl = '';
      let finalScreenshotUrl = '';

      const storeName = (window as any)._activeStoreName || 'Sucursal';
      
      // 1. Upload Selfie
      if (imageBase64) {
        finalImageUrl = await smartImageUpload(
          imageBase64, 
          `Selfie_${type}`, 
          todayStr, 
          storeName, 
          'attendance',
          user.fullName || user.email
        );
      }

      // 2. Upload Screenshot
      if (screenshotBase64) {
        finalScreenshotUrl = await smartImageUpload(
          screenshotBase64, 
          `Screenshot_${type}`, 
          todayStr, 
          storeName, 
          'attendance',
          user.fullName || user.email
        );
      }

      const { error } = await supabase.from('attendance').insert({
        user_id: user.id,
        store_id: user.storeId,
        type,
        date: todayStr,
        timestamp: new Date().toISOString(),
        image_url: finalImageUrl,
        screenshot_url: finalScreenshotUrl,
        location_coords: locationStr
      });

      if (error) throw error;

      // --- SMART ALERT LOGIC ---
      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

      if (type === 'entry' && storeConfig?.entry_time) {
        const [targetH, targetM] = storeConfig.entry_time.split(':').map(Number);
        const entryH = now.getHours();
        const entryM = now.getMinutes();
        
        if (entryH > targetH || (entryH === targetH && entryM > targetM)) {
          await supabase.from('attendance_alerts').insert({
            user_id: user.id,
            store_id: user.storeId,
            date: todayStr,
            type: 'late_entry',
            details: `Llegada tarde registrada a las ${timeStr} (Horario esperado: ${storeConfig.entry_time})`
          });
        }
      }

      if (type === 'lunch_end' && storeConfig?.lunch_duration_minutes) {
        const startRecord = history.find(r => r.date === todayStr && r.type === 'lunch_start');
        if (startRecord) {
          const startTime = new Date(startRecord.timestamp);
          const durationMins = Math.round((now.getTime() - startTime.getTime()) / 60000);
          
          if (durationMins > storeConfig.lunch_duration_minutes) {
            await supabase.from('attendance_alerts').insert({
              user_id: user.id,
              store_id: user.storeId,
              date: todayStr,
              type: 'extended_lunch',
              details: `Tiempo de comida excedido: ${durationMins} min (Máximo: ${storeConfig.lunch_duration_minutes} min)`
            });
          }
        }
      }
      
      // Reset and Refresh
      await fetchAttendance();
      setIsCameraOpen(false);
      setPendingType(null);
      setCapturedImage(null);
      setScreenshot(null);
      setLocation('');
      
      await fetchAttendance();
      alert(`Registro de ${type === 'entry' ? 'Entrada' : type === 'exit' ? 'Salida' : 'Comida'} exitoso.`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const startCamera = async (type: AttendanceType) => {
    setPendingType(type);
    setIsCameraOpen(true);
    setLocation('Obteniendo ubicación...');
    
    // Get Location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
          setLocation(coords); // Fallback to coords initially

          try {
            // Reverse Geocoding (Nominatim - OpenStreetMap)
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
            const data = await res.json();
            if (data.display_name) {
              setLocation(data.display_name);
            }
          } catch (err) {
            console.error("Reverse geocoding failed:", err);
          }
        },
        () => setLocation('Ubicación no disponible')
      );
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("No se pudo acceder a la cámara frontal.");
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Set canvas dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Add Watermark Text with Shadow (No background overlay)
    context.fillStyle = 'white';
    context.font = 'bold 18px sans-serif';
    
    // Shadow for legibility
    context.shadowColor = 'black';
    context.shadowBlur = 4;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;
    
    const time = new Date().toLocaleString('es-MX', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true 
    });

    // Helper for wrapping text
    const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
      const words = text.split(' ');
      let line = '';
      let currentY = y;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line, x, currentY);
          line = words[n] + ' ';
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, currentY);
      return currentY;
    };

    // Draw Info (Usuario, Fecha y Hora, then Ubicación)
    let yPos = canvas.height - 130; // Start higher up
    context.fillText(`USUARIO: ${user.fullName || user.email}`, 20, yPos);
    
    yPos += 30;
    context.fillText(`FECHA Y HORA: ${time}`, 20, yPos);
    
    yPos += 30;
    context.font = 'bold 16px sans-serif'; // Slightly smaller for long address
    wrapText(context, `UBICACIÓN: ${location}`, 20, yPos, canvas.width - 40, 22);

    // Reset shadow for subsequent draws if any
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(dataUrl);

    // Stop stream
    const stream = video.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  };

  const getStatusConfig = (type: AttendanceType) => {
    switch (type) {
      case 'entry': return { label: 'Entrada', color: 'bg-emerald-500', icon: LogIn };
      case 'lunch_start': return { label: 'Inicio Comida', color: 'bg-orange-500', icon: Coffee };
      case 'lunch_end': return { label: 'Fin Comida', color: 'bg-amber-500', icon: Coffee };
      case 'exit': return { label: 'Salida', color: 'bg-red-500', icon: LogOut };
    }
  };
  const isActionDisabled = (type: AttendanceType) => {
    if (todayRecords.includes(type)) return true;
    
    // Logic: can't exit if no entry, etc.
    if (type === 'exit' && !todayRecords.includes('entry')) return true;
    if (type === 'lunch_start' && !todayRecords.includes('entry')) return true;
    if (type === 'lunch_end' && !todayRecords.includes('lunch_start')) return true;
    
    return false;
  };

  // Group history by date
  const groupedHistory = React.useMemo(() => {
    const groups: Record<string, Record<AttendanceType, AttendanceRecord>> = {};
    
    history.forEach(record => {
      if (!groups[record.date]) {
        groups[record.date] = {} as Record<AttendanceType, AttendanceRecord>;
      }
      // Keep only one record per type per day (the most recent if duplicates exist)
      if (!groups[record.date][record.type]) {
        groups[record.date][record.type] = record;
      }
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Card */}
      <div className="bg-slate-900 rounded-3xl p-8 shadow-xl relative overflow-hidden text-white border border-slate-800">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-[100px] opacity-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <Clock className="w-10 h-10 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Registro de Asistencia</h1>
              <p className="text-slate-400 font-medium">Control de horarios y sucursal</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black text-white leading-none tabular-nums">
              {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-blue-400 font-bold uppercase tracking-widest text-xs mt-2 mt-2 flex items-center justify-center md:justify-end gap-2">
              <Calendar className="w-3 h-3" />
              {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['entry', 'lunch_start', 'lunch_end', 'exit'] as AttendanceType[]).map((type) => {
          const config = getStatusConfig(type);
          const Icon = config.icon;
          const disabled = isActionDisabled(type);
          const completed = todayRecords.includes(type);

          return (
            <button
              key={type}
              onClick={() => startCamera(type)}
              disabled={disabled || isLoading}
              className={`
                relative p-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-4 group
                ${completed 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 opacity-100' 
                  : disabled
                    ? 'bg-slate-50 border-slate-100 text-slate-300 grayscale opacity-50'
                    : `bg-white border-slate-100 text-slate-700 hover:border-${config.color.split('-')[1]}-400 hover:shadow-xl hover:-translate-y-1 shadow-sm`
                }
              `}
            >
              <div className={`p-3 rounded-xl ${completed ? 'bg-emerald-100' : 'bg-slate-100 group-hover:' + config.color + '/10'} transition-colors`}>
                <Icon className={`w-8 h-8 ${completed ? 'text-emerald-600' : 'text-slate-600 group-hover:text-blue-600'}`} />
              </div>
              <div className="text-center">
                <span className="block font-black text-xs uppercase tracking-widest mb-1 opacity-50">Registrar</span>
                <span className="text-lg font-bold">{config.label}</span>
              </div>
              {completed && (
                <div className="absolute top-3 right-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Camera & Verification Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto custom-scrollbar overscroll-none">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 my-auto">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <Camera className="w-5 h-5" />
                 </div>
                 <div>
                    <h3 className="font-black text-slate-800 uppercase text-sm">
                      Verificación de {pendingType ? getStatusConfig(pendingType).label : 'Evento'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                       <MapPin className="w-3 h-3 text-blue-500" /> {location}
                    </p>
                 </div>
              </div>
              <button onClick={() => {
                const stream = videoRef.current?.srcObject as MediaStream;
                stream?.getTracks().forEach(t => t.stop());
                setIsCameraOpen(false);
                setCapturedImage(null);
                setScreenshot(null);
              }} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
               {/* 1. Selfie Section */}
               <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">1. Fotografía Frontal (Con Ubicación)</label>
                  {!capturedImage ? (
                    <div className="relative w-full bg-slate-900 rounded-3xl overflow-hidden shadow-inner ring-4 ring-slate-100 flex items-center justify-center min-h-[320px]">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain mirror bg-black" />
                      <div className="absolute inset-x-0 bottom-6 flex justify-center">
                        <button 
                          onClick={capturePhoto}
                          disabled={location === 'Obteniendo ubicación...'}
                          className={`
                            border-2 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2
                            ${location === 'Obteniendo ubicación...' 
                              ? 'bg-slate-800/50 border-slate-700 cursor-wait' 
                              : 'bg-white/20 backdrop-blur-md border-white hover:bg-white hover:text-slate-900'
                            }
                          `}
                        >
                          <Camera className="w-4 h-4" /> 
                          {location === 'Obteniendo ubicación...' ? 'Esperando GPS...' : 'Tomar Foto'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative w-full rounded-3xl overflow-hidden ring-4 ring-emerald-500/30 flex items-center justify-center bg-black min-h-[320px]">
                      <img src={capturedImage} alt="Selfie" className="w-full h-auto max-h-[60vh] object-contain" />
                      <button 
                        onClick={() => {
                          setCapturedImage(null);
                          startCamera(pendingType!);
                        }}
                        className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
               </div>

               {/* 2. External App Screenshot Section */}
               {(pendingType === 'entry' || pendingType === 'exit') && (
                 <div className="space-y-3 pt-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">2. Captura del Check de Portabilidad (Obligatoria)</label>
                  {!screenshot ? (
                    <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-200 rounded-3xl hover:bg-slate-50 hover:border-blue-400 transition-all cursor-pointer group">
                      <div className="p-3 bg-slate-100 text-slate-400 rounded-xl group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                         <span className="text-xs font-bold text-slate-600">Subir Screenshot</span>
                         <p className="text-[9px] text-slate-400 font-medium mt-1 uppercase">Imagen de la app de check-in</p>
                      </div>
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  ) : (
                    <div className="relative h-24 w-full bg-slate-50 rounded-2xl border border-slate-200 flex items-center p-3 gap-4">
                       <img src={screenshot} alt="Screenshot" className="h-full aspect-square object-cover rounded-lg shadow-sm" />
                       <div className="flex-1">
                          <p className="text-[10px] font-black text-slate-800 uppercase">Screenshot cargado</p>
                          <p className="text-[9px] text-slate-400 font-bold">List para enviar</p>
                       </div>
                       <button onClick={() => setScreenshot(null)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                       </button>
                    </div>
                  )}
               </div>
               )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
               <button 
                 disabled={!capturedImage || ((pendingType === 'entry' || pendingType === 'exit') && !screenshot) || isLoading}
                 onClick={() => handleRegister(pendingType!, capturedImage!, screenshot!, location)}
                 className={`
                    w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg
                    ${(!capturedImage || ((pendingType === 'entry' || pendingType === 'exit') && !screenshot) || isLoading)
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-900/20'
                    }
                 `}
               >
                 {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
                 ) : (
                    <><CheckCircle2 className="w-4 h-4" /> 
                      {pendingType === 'entry' ? 'Confirmar Entrada' :
                       pendingType === 'lunch_start' ? 'Confirmar Salida a Comer' :
                       pendingType === 'lunch_end' ? 'Confirmar Regreso de Comida' :
                       'Confirmar Salida'}
                    </>
                 )}
               </button>
               
               <button 
                 onClick={() => {
                   const stream = videoRef.current?.srcObject as MediaStream;
                   stream?.getTracks().forEach(t => t.stop());
                   setIsCameraOpen(false);
                   setCapturedImage(null);
                   setScreenshot(null);
                 }}
                 className="w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
               >
                 Cancelar Registro
               </button>

               <p className="text-[9px] text-center text-slate-400 font-bold uppercase">Todos los datos serán registrados con sello de tiempo y GPS</p>
            </div>
          </div>
        </div>
      )}

      {/* History List */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-800">Historial de Asistencia</h3>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Organizado por día</span>
        </div>
        
        <div className="p-4 space-y-3">
          {groupedHistory.length > 0 ? (
            groupedHistory.map(([date, events]) => {
              const isExpanded = expandedDate === date;
              const hasEntry = events.entry;
              const hasExit = events.exit;
              
              return (
                <div key={date} className="border border-slate-100 rounded-[2rem] overflow-hidden transition-all duration-300">
                   <button 
                     onClick={() => setExpandedDate(isExpanded ? null : date)}
                     className={`w-full px-6 py-5 flex items-center justify-between transition-colors ${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}
                   >
                      <div className="flex items-center gap-4">
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${date === todayStr ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-500'}`}>
                            {date === todayStr ? 'Hoy' : date.split('-')[2]}
                         </div>
                         <div className="text-left">
                            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                              {new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                               {events.entry && (
                                 <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                                   <LogIn className="w-2.5 h-2.5" /> {new Date(events.entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                 </span>
                               )}
                               {events.exit && (
                                 <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                                   <LogOut className="w-2.5 h-2.5" /> {new Date(events.exit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                 </span>
                               )}
                               {!events.entry && !events.exit && <span className="text-[10px] font-bold text-slate-300 uppercase italic tracking-widest">Sin registros</span>}
                            </div>
                         </div>
                      </div>
                      <ArrowRight className={`w-5 h-5 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-90 text-blue-500' : ''}`} />
                   </button>

                   {isExpanded && (
                     <div className="px-6 py-6 bg-white grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-50 animate-in slide-in-from-top-2 duration-300">
                        {(['entry', 'lunch_start', 'lunch_end', 'exit'] as AttendanceType[]).map(type => {
                           const event = events[type];
                           const config = getStatusConfig(type);
                           const Icon = config.icon;
                           
                           return (
                             <div key={type} className={`p-4 rounded-2xl border ${event ? 'bg-slate-50 border-slate-100' : 'bg-white border-dashed border-slate-100'}`}>
                                <div className="flex items-center gap-2 mb-2">
                                   <Icon className={`w-3.5 h-3.5 ${event ? 'text-blue-500' : 'text-slate-300'}`} />
                                   <span className={`text-[10px] font-black uppercase tracking-widest ${event ? 'text-slate-800' : 'text-slate-300'}`}>
                                     {config.label}
                                   </span>
                                </div>
                                {event ? (
                                  <p className="text-sm font-bold text-slate-700 tabular-nums">
                                    {new Date(event.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                ) : (
                                  <p className="text-xs font-bold text-slate-300 italic">--:--</p>
                                )}
                             </div>
                           );
                        })}
                     </div>
                   )}
                </div>
              );
            })
          ) : (
            <div className="py-20 text-center">
               <History className="w-12 h-12 text-slate-100 mx-auto mb-4" />
               <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">No hay registros disponibles</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceManager;
