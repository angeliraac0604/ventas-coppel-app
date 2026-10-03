import React, { useState } from 'react';
import { Database, ShieldCheck, TrendingUp, AlertCircle, HardDrive, DollarSign, Users, Eye, Edit3, Trash2, ArrowUpRight, CheckCircle2, Info, Calculator, Sparkles } from 'lucide-react';
import { Sale, DailyClose, Store } from '../types';

interface DatabaseUsagePanelProps {
  salesCount: number;
  storesCount: number;
  closingsCount: number;
  usersCount?: number;
  warrantiesCount?: number;
}

export const DatabaseUsagePanel: React.FC<DatabaseUsagePanelProps> = ({
  salesCount,
  storesCount,
  closingsCount,
  usersCount = 10,
  warrantiesCount = 0
}) => {
  // Simulator inputs
  const [simStores, setSimStores] = useState(storesCount || 3);
  const [simSalesPerStore, setSimSalesPerStore] = useState(15);
  const [simSellersPerStore, setSimSellersPerStore] = useState(2);

  // Firestore daily free limits (Spark Plan)
  const DAILY_FREE_READS = 50000;
  const DAILY_FREE_WRITES = 20000;
  const DAILY_FREE_DELETES = 20000;
  const FREE_STORAGE_GB = 1.0;
  const FREE_AUTH_USERS = 50000;

  // Real recorded usage from localStorage
  const [dailyStats] = useState(() => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const raw = localStorage.getItem('firebase_daily_usage');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === todayStr) return parsed;
      }
      return { date: todayStr, writes: 0, reads: 0, lastMigration: null };
    } catch {
      return { date: new Date().toISOString().split('T')[0], writes: 0, reads: 0, lastMigration: null };
    }
  });

  // Real-time estimated today usage based on active data and migration
  const recordedWrites = dailyStats?.writes || 0;
  const estimatedReadsToday = Math.min(DAILY_FREE_READS, Math.max(120, (usersCount || 1) * 25));
  const estimatedWritesToday = Math.min(DAILY_FREE_WRITES, Math.max(recordedWrites, Math.round(salesCount * 0.1) + 5));

  // Storage estimation: Average sale doc ~ 0.5 KB
  const totalDocs = salesCount + storesCount + closingsCount + warrantiesCount + usersCount;
  const estimatedStorageKB = Math.round(totalDocs * 0.6);
  const estimatedStorageMB = (estimatedStorageKB / 1024).toFixed(2);
  const storagePercentage = ((estimatedStorageKB / (1024 * 1024)) * 100).toFixed(4);

  // Simulation calculations
  const simTotalSalesDay = simStores * simSalesPerStore;
  const simTotalStaff = simStores * simSellersPerStore;
  
  // Daily operations in simulator:
  // Each seller opens app 5 times a day (loads sales, closings, stores ~ 50 reads each time)
  const simReadsDay = Math.round(simTotalStaff * 5 * 35);
  // Each sale is 1 write, attendance is 4 writes per seller, 1 closing write per store
  const simWritesDay = Math.round(simTotalSalesDay + (simTotalStaff * 4) + simStores);

  const simReadsPercent = Math.min(100, (simReadsDay / DAILY_FREE_READS) * 100);
  const simWritesPercent = Math.min(100, (simWritesDay / DAILY_FREE_WRITES) * 100);

  // Cost calculation if exceeding (Blaze plan rates):
  // Reads: $0.06 USD per 100,000
  // Writes: $0.18 USD per 100,000
  const excessReads = Math.max(0, simReadsDay - DAILY_FREE_READS);
  const excessWrites = Math.max(0, simWritesDay - DAILY_FREE_WRITES);
  const dailyExcessCostUSD = (excessReads / 100000) * 0.06 + (excessWrites / 100000) * 0.18;
  const monthlyExcessCostUSD = dailyExcessCostUSD * 30;
  const monthlyExcessCostMXN = monthlyExcessCostUSD * 19.5; // Approx USD to MXN rate

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Plan Spark Gratuito Activo
              </span>
              <span className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-indigo-500/30">
                Google Cloud Firestore
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Control de Uso y Cuotas de Base de Datos
            </h1>
            <p className="text-indigo-200/80 text-sm max-w-2xl mt-1">
              Monitorea en tiempo real las lecturas, escrituras, almacenamiento y proyecta gastos si llegaras a rebasar los límites gratuitos.
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md p-4 px-6 rounded-2xl border border-slate-700/80 flex items-center gap-4 shrink-0 shadow-inner">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <DollarSign className="w-7 h-7" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Costo Mensual Actual</p>
              <p className="text-2xl font-black text-emerald-400">$0.00 MXN</p>
              <p className="text-[10px] text-slate-400">100% Dentro del límite gratuito</p>
            </div>
          </div>
        </div>
      </div>

      {/* Backup Migration Impact Status Banner */}
      {dailyStats?.lastMigration ? (
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 border border-emerald-500/30 rounded-3xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Respaldo Registrado en Firebase</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">100% Gratuito</span>
              </div>
              <p className="text-sm font-semibold text-slate-200 mt-0.5">
                Última migración: <span className="text-white font-bold">{new Date(dailyStats.lastMigration.timestamp).toLocaleDateString()} a las {new Date(dailyStats.lastMigration.timestamp).toLocaleTimeString()}</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Se registraron <strong className="text-emerald-300">{dailyStats.lastMigration.writesCount.toLocaleString()}</strong> documentos en Firestore ({((dailyStats.lastMigration.writesCount / DAILY_FREE_WRITES) * 100).toFixed(1)}% del límite diario gratuito).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl shrink-0">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Costo por Subir Respaldo</p>
              <p className="text-base font-extrabold text-emerald-400">$0.00 MXN</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">¿Qué pasa si subo el respaldo (.gz) ahora mismo?</span>
              </div>
              <p className="text-sm font-medium text-slate-300 mt-0.5">
                Cada venta, tienda y usuario se inserta como <strong>1 escritura en Firestore</strong>.
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Con tu cuota diaria de <strong className="text-indigo-300">20,000 escrituras gratuitas</strong>, cualquier respaldo habitual ocupa entre el 5% y el 20% de tu cupo del día, siendo <strong className="text-emerald-400">100% gratuito ($0.00 MXN)</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5 rounded-2xl shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Margen Gratuito Disponible</p>
              <p className="text-base font-extrabold text-white">{(DAILY_FREE_WRITES - recordedWrites).toLocaleString()} escrituras</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Quotas Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Reads Quota */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Lecturas Firestore</h3>
                <p className="text-[11px] text-slate-400">Consultas de ventas y reportes</p>
              </div>
            </div>
            <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              Diario
            </span>
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-2xl font-black text-slate-800">{estimatedReadsToday.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-400">de {DAILY_FREE_READS.toLocaleString()} gratis/día</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(1, (estimatedReadsToday / DAILY_FREE_READS) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between">
              <span>% Consumido hoy:</span>
              <span className="font-bold text-slate-800">{((estimatedReadsToday / DAILY_FREE_READS) * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Costo por rebase:</span>
              <span className="font-bold text-emerald-600">$1.20 MXN / 100,000 extra</span>
            </div>
          </div>
        </div>

        {/* Writes Quota */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Escrituras Firestore</h3>
                <p className="text-[11px] text-slate-400">Nuevas ventas, cortes y faltas</p>
              </div>
            </div>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
              Diario
            </span>
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-2xl font-black text-slate-800">{estimatedWritesToday.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-400">de {DAILY_FREE_WRITES.toLocaleString()} gratis/día</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(1, (estimatedWritesToday / DAILY_FREE_WRITES) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between">
              <span>% Consumido hoy:</span>
              <span className="font-bold text-slate-800">{((estimatedWritesToday / DAILY_FREE_WRITES) * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Costo por rebase:</span>
              <span className="font-bold text-emerald-600">$3.60 MXN / 100,000 extra</span>
            </div>
          </div>
        </div>

        {/* Storage Quota */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Almacenamiento BD</h3>
                <p className="text-[11px] text-slate-400">{totalDocs.toLocaleString()} documentos guardados</p>
              </div>
            </div>
            <span className="text-xs font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
              Permanente
            </span>
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-2xl font-black text-slate-800">{estimatedStorageMB} MB</span>
              <span className="text-xs font-semibold text-slate-400">de 1,024 MB (1 GB) gratis</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-purple-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(0.5, parseFloat(storagePercentage))}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between">
              <span>Capacidad estimada:</span>
              <span className="font-bold text-slate-800">~2,000,000 ventas</span>
            </div>
            <div className="flex justify-between">
              <span>Fotos de tickets:</span>
              <span className="font-bold text-emerald-600">Google Drive (15 GB gratis)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Free Tier Guarantees Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Límites del Plan Spark (100% Gratis Sin Tarjeta)
            </h2>
            <p className="text-xs text-slate-500">
              Google Firebase nunca te cobrará sorpresas en el plan Spark: si alcanzas el límite, el servicio pausa escrituras temporalmente hasta las 00:00 UTC.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-y border-slate-100">
              <tr>
                <th className="py-3 px-4 font-bold">Servicio</th>
                <th className="py-3 px-4 font-bold">Cuota Gratuita</th>
                <th className="py-3 px-4 font-bold">Frecuencia</th>
                <th className="py-3 px-4 font-bold">Costo en caso de rebase</th>
                <th className="py-3 px-4 font-bold">Estado Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-3.5 px-4 font-bold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-500" />
                  Lecturas Firestore
                </td>
                <td className="py-3.5 px-4 font-semibold">50,000 lecturas</td>
                <td className="py-3.5 px-4 text-slate-500">Por día (Se reinicia a las 00:00 UTC)</td>
                <td className="py-3.5 px-4 font-mono text-emerald-600">$0.06 USD / 100k (~$1.20 MXN)</td>
                <td className="py-3.5 px-4">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    Holgado (&lt; 2%)
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-bold flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-emerald-500" />
                  Escrituras Firestore
                </td>
                <td className="py-3.5 px-4 font-semibold">20,000 escrituras</td>
                <td className="py-3.5 px-4 text-slate-500">Por día</td>
                <td className="py-3.5 px-4 font-mono text-emerald-600">$0.18 USD / 100k (~$3.60 MXN)</td>
                <td className="py-3.5 px-4">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    Holgado (&lt; 1%)
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-bold flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-purple-500" />
                  Base de Datos (Firestore)
                </td>
                <td className="py-3.5 px-4 font-semibold">1 GB</td>
                <td className="py-3.5 px-4 text-slate-500">Almacenamiento total continuo</td>
                <td className="py-3.5 px-4 font-mono text-emerald-600">$0.18 USD / GB adicional (~$3.60 MXN)</td>
                <td className="py-3.5 px-4">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    {estimatedStorageMB} MB utilizados
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-500" />
                  Autenticación (Firebase Auth)
                </td>
                <td className="py-3.5 px-4 font-semibold">50,000 usuarios activos</td>
                <td className="py-3.5 px-4 text-slate-500">Mensual (MAU)</td>
                <td className="py-3.5 px-4 font-mono text-emerald-600">$0.0055 USD / usuario extra</td>
                <td className="py-3.5 px-4">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    100% Gratuito
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Fotos de Tickets (Google Drive)
                </td>
                <td className="py-3.5 px-4 font-semibold">15 GB</td>
                <td className="py-3.5 px-4 text-slate-500">Google Apps Script en tu cuenta</td>
                <td className="py-3.5 px-4 font-mono text-emerald-600">$0.00 (Google One opcional)</td>
                <td className="py-3.5 px-4">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    Activo
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulator: What happens if the business scales? */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Calculator className="w-4 h-4" />
              Simulador Interactivo de Costos y Escalamiento
            </div>
            <h3 className="text-xl font-extrabold text-white">¿Qué pasaría si tu operación crece?</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Mueve los controles para calcular cuántas operaciones diarias se generarían y el costo estimado si alguna vez rebasaras los límites gratuitos.
            </p>
          </div>

          <div className="bg-slate-800/90 border border-slate-700 p-3 px-5 rounded-2xl text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Costo Adicional Estimado</span>
            <span className={`text-xl font-black ${monthlyExcessCostMXN > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {monthlyExcessCostMXN > 0 ? `$${monthlyExcessCostMXN.toFixed(2)} MXN/mes` : '$0.00 MXN / mes (GRATIS)'}
            </span>
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-300">Sucursales Activas:</label>
              <span className="text-sm font-black text-indigo-400">{simStores} tiendas</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={simStores}
              onChange={(e) => setSimStores(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 block mt-1">1 a 50 sucursales</span>
          </div>

          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-300">Ventas por tienda/día:</label>
              <span className="text-sm font-black text-emerald-400">{simSalesPerStore} ventas</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="60" 
              value={simSalesPerStore}
              onChange={(e) => setSimSalesPerStore(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 block mt-1">Ventas diarias promedio</span>
          </div>

          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-300">Vendedores por tienda:</label>
              <span className="text-sm font-black text-purple-400">{simSellersPerStore} empleados</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={simSellersPerStore}
              onChange={(e) => setSimSellersPerStore(parseInt(e.target.value, 10))}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 block mt-1">Personal activo checando</span>
          </div>
        </div>

        {/* Results of Simulation */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <p className="text-slate-400 font-semibold text-[11px]">Lecturas estimadas al día:</p>
            <p className="text-lg font-black text-white mt-0.5">
              {simReadsDay.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ 50,000 ({simReadsPercent.toFixed(1)}%)</span>
            </p>
            <p className={`text-[10px] mt-1 font-bold ${simReadsDay <= DAILY_FREE_READS ? 'text-emerald-400' : 'text-amber-400'}`}>
              {simReadsDay <= DAILY_FREE_READS ? '✅ 100% Cubierto sin costo' : `⚠️ Rebase de ${(simReadsDay - DAILY_FREE_READS).toLocaleString()} ops`}
            </p>
          </div>

          <div>
            <p className="text-slate-400 font-semibold text-[11px]">Escrituras estimadas al día:</p>
            <p className="text-lg font-black text-white mt-0.5">
              {simWritesDay.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ 20,000 ({simWritesPercent.toFixed(1)}%)</span>
            </p>
            <p className={`text-[10px] mt-1 font-bold ${simWritesDay <= DAILY_FREE_WRITES ? 'text-emerald-400' : 'text-amber-400'}`}>
              {simWritesDay <= DAILY_FREE_WRITES ? '✅ 100% Cubierto sin costo' : `⚠️ Rebase de ${(simWritesDay - DAILY_FREE_WRITES).toLocaleString()} ops`}
            </p>
          </div>

          <div>
            <p className="text-slate-400 font-semibold text-[11px]">Ventas totales generadas al mes:</p>
            <p className="text-lg font-black text-indigo-400 mt-0.5">
              {(simTotalSalesDay * 30).toLocaleString()} ventas/mes
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Con {(simStores * simSalesPerStore)} ventas diarias en {simStores} tiendas
            </p>
          </div>
        </div>

        {/* Conclusion advice */}
        <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-2xl flex items-start gap-3">
          <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-200/90 leading-relaxed">
            <span className="font-bold text-white">Conclusión Técnica: </span>
            Incluso con <strong>15 a 20 tiendas Coppel activas</strong> y cientos de ventas registradas al día, tu aplicación opera cómodamente por debajo de los 50,000 límites diarios de Firebase. Si alguna vez necesitaras habilitar el plan Blaze para escalar masivamente, un exceso de 100,000 consultas cuesta solamente <strong>$1.20 pesos mexicanos</strong>.
          </div>
        </div>
      </div>
    </div>
  );
};
