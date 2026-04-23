import React, { useState, useMemo, useRef } from 'react';
import { CalendarCheck, DollarSign, ShoppingBag, Clock, ChevronDown, ChevronUp, Lock, Receipt, X, User, Tag, Calendar, Image as ImageIcon, CalendarRange, Layers, Filter, XCircle, ArrowRight, Share2, Trash2 } from 'lucide-react';
import { Sale, DailyClose, Brand } from '../types';
import { BRAND_CONFIGS } from '../constants';

interface DailyClosingsProps {
  sales: Sale[];
  closings: DailyClose[];
  onCloseDay: (close: DailyClose) => void;
  onDeleteClosing?: (id: string) => void;
  role?: string;
  storeName?: string;
}

const DailyClosings: React.FC<DailyClosingsProps> = ({ sales, closings, onCloseDay, onDeleteClosing, role, storeName }) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedDaySummary, setSelectedDaySummary] = useState<{ date: string, sales: Sale[] } | null>(null);

  // Date Filter State
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [monthFilter, setMonthFilter] = useState('');
  const currentMonthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const hasActiveFilter = !!(dateFilter.start || dateFilter.end || monthFilter);

  // MANUAL DATE SELECTION FOR RETROACTIVE CLOSING
  const [manualDate, setManualDate] = useState('');

  // Construct YYYY-MM-DD in local time manually
  const localDate = new Date();
  const todayStr = localDate.getFullYear() + '-' +
    String(localDate.getMonth() + 1).padStart(2, '0') + '-' +
    String(localDate.getDate()).padStart(2, '0');

  // Determine which date we are closing (Default: Today)
  const targetDateStr = manualDate || todayStr;

  // Calculate stats for the TARGET date (Live Preview)
  const targetSales = sales.filter(s => s.date === targetDateStr);
  const targetRevenue = targetSales.reduce((sum, s) => sum + s.price, 0);
  const targetCount = targetSales.length;

  // Find top brand for TARGET date
  const brandCounts = targetSales.reduce((acc, sale) => {
    acc[sale.brand] = (acc[sale.brand] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topBrandToday = Object.entries(brandCounts).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] as Brand | undefined;

  // --- FILTER LOGIC ---
  const filteredClosings = useMemo(() => {
    return closings.filter(close => {
      const closeDate = close.date;

      // 1. Month Filter (Strict)
      if (monthFilter && !closeDate.startsWith(monthFilter)) return false;

      // 2. Range Filter
      if (dateFilter.start || dateFilter.end) {
        if (dateFilter.start && closeDate < dateFilter.start) return false;
        if (dateFilter.end && closeDate > dateFilter.end) return false;
        return true;
      }

      // NO default filter - Show everything (Request: todos los meses)
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [closings, dateFilter, monthFilter]);

  // --- MONTHLY DATA CALCULATION (Based on Filtered Data) ---
  const monthlyData = useMemo(() => {
    const groups: Record<string, {
      monthKey: string;
      label: string;
      totalRevenue: number;
      totalSales: number;
      closings: DailyClose[];
      year: number;
      monthIndex: number;
    }> = {};

    filteredClosings.forEach(close => {
      const date = new Date(close.date);
      // Adjust timezone issues by treating the date string as local parts
      const [year, month] = close.date.split('-').map(Number);
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;

      if (!groups[monthKey]) {
        // Create label (e.g., "Noviembre 2023")
        const dateObj = new Date(year, month - 1, 1);
        const label = dateObj.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

        groups[monthKey] = {
          monthKey,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          totalRevenue: 0,
          totalSales: 0,
          closings: [],
          year,
          monthIndex: month - 1
        };
      }

      groups[monthKey].totalRevenue += close.totalRevenue;
      groups[monthKey].totalSales += close.totalSales;
      groups[monthKey].closings.push(close);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.monthIndex - a.monthIndex;
    });
  }, [filteredClosings]);

  const toggleExpand = (id: string) => {
    const isOpening = expandedId !== id;
    setExpandedId(prev => prev === id ? null : id);

    if (isOpening) {
      setTimeout(() => {
        const element = document.getElementById(`daily-close-${id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  // Helper to get top brand for a whole month
  const getMonthTopBrand = (monthKey: string) => {
    const monthSales = sales.filter(s => {
      const matchesMonth = s.date.startsWith(monthKey);
      if (!matchesMonth) return false;
      if (dateFilter.start && s.date < dateFilter.start) return false;
      if (dateFilter.end && s.date > dateFilter.end) return false;
      return true;
    });

    if (monthSales.length === 0) return null;

    const counts = monthSales.reduce((acc, s) => {
      acc[s.brand] = (acc[s.brand] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const top = Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
    return top ? (top[0] as Brand) : null;
  };

  // Helper to calculate brand breakdown for a list of sales
  const calculateBrandBreakdown = (salesList: Sale[]) => {
    const counts = salesList.reduce((acc, sale) => {
      acc[sale.brand] = (acc[sale.brand] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number));
  };

  const handlePerformClose = () => {
    if (targetCount === 0) {
      alert(`No hay ventas registradas para la fecha ${targetDateStr}.`);
      return;
    }

    if (window.confirm(`¿Estás seguro de que deseas realizar el corte del día ${targetDateStr}?`)) {
      const newClose: DailyClose = {
        id: crypto.randomUUID(),
        date: targetDateStr,
        totalSales: targetCount,
        totalRevenue: targetRevenue,
        closedAt: new Date().toISOString(),
        topBrand: topBrandToday || 'N/A' as any
      };
      onCloseDay(newClose);
      setManualDate(''); // Reset after close
    }
  };



  const toggleMonthExpand = (key: string) => {
    setExpandedMonthKey(prev => prev === key ? null : key);
  };

  const clearFilters = () => {
    setDateFilter({ start: '', end: '' });
    setMonthFilter('');
  };

  return (
    <div className="space-y-8 pb-12">

      {/* Current/Manual Day Panel */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl shadow-xl overflow-hidden text-white relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2"></div>

        <div className="p-6 md:p-8 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <CalendarCheck className="w-6 h-6 text-blue-400" />
                Cierre del Día
                {storeName && (
                  <span className="text-xs bg-white/10 px-3 py-1 rounded-full border border-white/10 text-blue-300 ml-2 font-black uppercase tracking-tighter shadow-inner">
                    {storeName}
                  </span>
                )}
              </h2>
              {/* Admin Date Selector Hidden Control */}
              {role === 'admin' && manualDate && manualDate !== todayStr && (
                <button onClick={() => setManualDate('')} className="text-slate-400 hover:text-white text-xs underline ml-2">
                  Volver a Hoy
                </button>
              )}
            </div>

            {role === 'admin' ? (
              <label className="relative cursor-pointer group select-none">
                <div
                  className={`border px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-2 transition-all ${manualDate
                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-200 group-hover:bg-orange-500/30'
                    : 'bg-blue-600/30 border-blue-500/50 text-blue-100 group-hover:bg-blue-600/40'
                    }`}
                >
                  {manualDate ? targetDateStr : 'HOY'}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </div>
                <input
                  type="date"
                  value={manualDate || todayStr}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ zIndex: 50 }}
                />
              </label>
            ) : (
              <div className="border px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-600/30 border-blue-500/50 text-blue-100 cursor-default">
                HOY
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 md:p-4 border border-white/5 overflow-hidden">
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-1 truncate">Ventas {manualDate ? 'del día' : 'Hoy'}</p>
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="text-xl md:text-3xl font-bold truncate">{targetCount}</span>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 md:p-4 border border-white/5 overflow-hidden">
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-1 truncate">Ingreso Total</p>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-xl md:text-3xl font-bold truncate">
                  ${targetRevenue.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 md:p-4 border border-white/5 overflow-hidden">
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-1 truncate">Total Sin IVA</p>
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-purple-400 shrink-0" />
                <span className="text-lg md:text-2xl font-bold truncate" title={(targetRevenue / 1.16).toLocaleString('es-MX')}>
                  ${(targetRevenue / 1.16).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/5">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Top Marca</p>
              {topBrandToday ? (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg ${BRAND_CONFIGS[topBrandToday].colorClass}`}
                  style={BRAND_CONFIGS[topBrandToday].colorClass.includes('text-black') ? { color: 'black' } : {}}
                >
                  {BRAND_CONFIGS[topBrandToday].label}
                </span>
              ) : (
                <span className="text-slate-500 font-medium text-sm">Sin datos</span>
              )}
            </div>
          </div>

          {role !== 'viewer' && (
            <button
              onClick={handlePerformClose}
              disabled={targetCount === 0}
              className={`
                w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold transition-all shadow-lg
                ${targetCount > 0
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50 hover:shadow-blue-900/70 hover:-translate-y-0.5'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
              `}
            >
              <Lock className="w-4 h-4" />
              Realizar Corte del Día {manualDate ? `(${manualDate})` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Controls: Filter & Tabs */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => setActiveTab('daily')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'daily'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
          >
            <Clock className="w-4 h-4" />
            Diario
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'monthly'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
          >
            <CalendarRange className="w-4 h-4" />
            Mensual
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto p-2 md:p-0">
          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            {/* Month Picker */}
            <div className="flex items-center gap-2 w-full md:w-auto px-3 py-1 bg-blue-50/50 border border-blue-100 rounded-xl">
              <span className="text-[10px] font-bold text-blue-500 uppercase">Mes:</span>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value);
                  // Optional: clear day range when selecting month? usually helpful
                  if (e.target.value) setDateFilter({ start: '', end: '' });
                }}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2 text-sm w-full md:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={dateFilter.start}
              onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
              className="w-full md:w-32 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <input
              type="date"
              value={dateFilter.end}
              onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
              className="w-full md:w-32 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          {hasActiveFilter && (
            <button onClick={clearFilters} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Limpiar filtro">
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>

      {/* MAIN LIST CONTENT */}
      <div className="space-y-4">
        {activeTab === 'daily' ? (
          /* --- DAILY VIEW --- */
          <>
            {filteredClosings.filter(c => hasActiveFilter || c.date.startsWith(currentMonthPrefix)).length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No se encontraron cierres registrados.</p>
              </div>
            ) : (
              filteredClosings
                .filter(c => hasActiveFilter || c.date.startsWith(currentMonthPrefix))
                .map((close) => {
                const isExpanded = expandedId === close.id;
                // Fix timezone issue by parsing parts manually
                const [cYear, cMonth, cDay] = close.date.split('-').map(Number);
                const dateObj = new Date(cYear, cMonth - 1, cDay);
                const daySales = sales.filter(s => s.date === close.date);

                return (
                  <div
                    id={`daily-close-${close.id}`}
                    key={close.id}
                    className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden group ${isExpanded ? 'border-blue-200 shadow-md ring-1 ring-blue-100' : 'border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100'}`}
                  >

                    {/* Header Row - Designed for "Compactedness" & Clarity */}
                    <div
                      onClick={() => toggleExpand(close.id)}
                      className="p-3 flex items-center gap-3 cursor-pointer select-none"
                    >
                      {/* Date Badge - Slim */}
                      <div className="flex flex-col items-center justify-center w-12 h-12 bg-blue-50 rounded-lg border border-blue-100 text-blue-700 shrink-0">
                        <span className="text-xl font-black leading-none">{dateObj.getDate()}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider">{dateObj.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}</span>
                      </div>

                      {/* Main Info Area - Flex-based for tight vertical rhythm */}
                      <div className="flex-1 min-w-0 flex justify-between items-center gap-2">
                        {/* Left Side: Date Info, Sales, Brand */}
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-800 capitalize text-base truncate">
                              {dateObj.toLocaleDateString('es-MX', { weekday: 'long' })}
                            </p>
                            {close.topBrand !== 'N/A' && BRAND_CONFIGS[close.topBrand as Brand] && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white uppercase tracking-wide shrink-0 ${BRAND_CONFIGS[close.topBrand as Brand].colorClass}`}
                                style={BRAND_CONFIGS[close.topBrand as Brand].colorClass.includes('text-black') ? { color: 'black' } : {}}
                              >
                                {BRAND_CONFIGS[close.topBrand as Brand].label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                            <span className="flex items-center gap-1">
                              {new Date(close.closedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="flex items-center gap-1">
                              • {close.totalSales} Ventas
                            </span>
                          </div>
                        </div>

                        {/* Right Side: Money */}
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-bold text-slate-900 text-base">
                            ${close.totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            Neto: ${(close.totalRevenue / 1.16).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 md:ml-2">
                        {role === 'admin' && onDeleteClosing && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteClosing(close.id);
                            }}
                            className="p-1.5 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                            title="Eliminar Cierre"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <div className={`transition-transform duration-200 text-slate-300 ${isExpanded ? 'rotate-180 text-blue-500' : 'rotate-0 group-hover:text-slate-400'}`}>
                          <ChevronDown className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-3 md:p-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                          {/* BRAND STATS SUMMARY */}
                          <div className="p-3 bg-slate-50 border-b border-slate-200">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Estadística por Marcas</h4>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(
                                daySales.reduce((acc, s) => {
                                  acc[s.brand] = (acc[s.brand] || 0) + 1;
                                  return acc;
                                }, {} as Record<string, number>)
                              ).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([brand, count]) => (
                                <div key={brand} className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-100 shadow-sm">
                                  <span className={`w-1.5 h-1.5 rounded-full ${BRAND_CONFIGS[brand as Brand]?.colorClass?.split(' ')[0] || 'bg-slate-500'}`} style={{ backgroundColor: BRAND_CONFIGS[brand as Brand]?.hex }}></span>
                                  <span className="text-[10px] font-bold text-slate-700">{BRAND_CONFIGS[brand as Brand]?.label || brand}</span>
                                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded ml-1">{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* ... (rest of daily expanded table) ... */}
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider">
                              <tr>
                                <th className="px-3 py-2 border-b border-slate-100">Factura</th>
                                <th className="px-3 py-2 border-b border-slate-100">Cliente</th>
                                <th className="px-3 py-2 border-b border-slate-100">Marca</th>
                                <th className="px-3 py-2 border-b border-slate-100 text-right">Precio</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {daySales.map(sale => (
                                <tr
                                  key={sale.id}
                                  onClick={() => setSelectedSale(sale)}
                                  className="hover:bg-blue-50/50 transition-colors cursor-pointer group/row"
                                >
                                  <td className="px-3 py-2">
                                    <span className="text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide flex items-center gap-1 w-fit">
                                      {sale.ticketImage && <ImageIcon className="w-3 h-3 text-blue-400" />}
                                      #{String(sale.invoiceNumber).replace(/[^0-9-]/g, '')}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-700 font-medium truncate max-w-[120px]">{sale.customerName}</td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-sm ${BRAND_CONFIGS[sale.brand].colorClass}`}
                                      style={BRAND_CONFIGS[sale.brand].colorClass.includes('text-black') ? { color: 'black' } : {}}
                                    >
                                      {BRAND_CONFIGS[sale.brand].label}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-slate-700">
                                    ${sale.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        ) : (
          /* --- MONTHLY VIEW --- */
          <>
            {monthlyData.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                <CalendarRange className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No hay datos mensuales disponibles.</p>
              </div>
            ) : (
              monthlyData.map(month => {
                const isExpanded = expandedMonthKey === month.monthKey;
                const monthTopBrand = getMonthTopBrand(month.monthKey);

                // Calculate monthly brand stats
                const monthSales = sales.filter(s => s.date.startsWith(month.monthKey));
                const monthBrandStats = calculateBrandBreakdown(monthSales);

                return (
                  <div key={month.monthKey} className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden group ${isExpanded ? 'border-indigo-200 shadow-md ring-1 ring-indigo-50' : 'border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100'}`}>

                    <div
                      onClick={() => toggleMonthExpand(month.monthKey)}
                      className="p-3 flex items-center gap-3 cursor-pointer bg-gradient-to-r from-transparent to-transparent hover:from-indigo-50/30 select-none"
                    >
                      {/* Month Badge */}
                      <div className="flex flex-col items-center justify-center w-12 h-12 bg-indigo-50 rounded-lg border border-indigo-100 text-indigo-700 shrink-0">
                        <span className="text-lg font-black uppercase leading-none">{month.label.substring(0, 3)}</span>
                        <span className="text-[9px] font-bold text-indigo-400">{month.year}</span>
                      </div>

                      {/* Main Info Area - Flex-based */}
                      <div className="flex-1 min-w-0 flex justify-between items-center gap-2">
                        {/* Left Side: Period Info */}
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <p className="font-bold text-slate-800 text-base truncate">
                            {month.label}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                            <span>{month.closings.length} Cortes</span>
                            <span>• {month.totalSales} Ventas</span>
                            {monthTopBrand && BRAND_CONFIGS[monthTopBrand] && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white uppercase tracking-wide shrink-0 ${BRAND_CONFIGS[monthTopBrand].colorClass}`}
                                style={BRAND_CONFIGS[monthTopBrand].colorClass.includes('text-black') ? { color: 'black' } : {}}
                              >
                                {BRAND_CONFIGS[monthTopBrand].label}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right Side: Money */}
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-bold text-slate-900 text-base">
                            ${month.totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            Neto: ${(month.totalRevenue / 1.16).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      <div className={`transition-transform duration-200 text-slate-300 md:ml-2 ${isExpanded ? 'rotate-180 text-indigo-600' : 'rotate-0 group-hover:text-slate-400'}`}>
                        <ChevronDown className="w-5 h-5" />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-3 md:p-4 animate-in slide-in-from-top-2 duration-200">
                        {/* MONTHLY BRAND STATS - NEWLY ADDED */}
                        <div className="mb-4 bg-white p-3 rounded-lg border border-slate-200">
                          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Layers className="w-3 h-3" />
                            Estadística Mensual por Marca
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {monthBrandStats.map(([brand, count]) => (
                              <div key={brand} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200 shadow-sm">
                                <span className={`w-1.5 h-1.5 rounded-full ${BRAND_CONFIGS[brand as Brand]?.colorClass?.split(' ')[0] || 'bg-slate-500'}`} style={{ backgroundColor: BRAND_CONFIGS[brand as Brand]?.hex }}></span>
                                <span className="text-[10px] font-bold text-slate-700">{BRAND_CONFIGS[brand as Brand]?.label || brand}</span>
                                <span className="text-[10px] font-mono text-slate-400 bg-white border border-slate-100 px-1 rounded ml-1">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <Layers className="w-3 h-3" />
                          Desglose Diario
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {month.closings.map(close => (
                            <div
                              key={close.id}
                              onClick={() => {
                                const daySales = sales.filter(s => s.date === close.date);
                                setSelectedDaySummary({ date: close.date, sales: daySales });
                              }}
                              className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all group/day"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-slate-100 group-hover/day:bg-blue-100 flex items-center justify-center font-bold text-slate-600 group-hover/day:text-blue-600 text-xs transition-colors">
                                  {(() => {
                                    const [dYear, dMonth, dDay] = close.date.split('-').map(Number);
                                    return dDay;
                                  })()}
                                </div>
                                <div>
                                  <p className="font-bold text-xs text-slate-800 group-hover/day:text-blue-700 capitalize">
                                    {(() => {
                                      const [dYear, dMonth, dDay] = close.date.split('-').map(Number);
                                      const dDate = new Date(dYear, dMonth - 1, dDay);
                                      return dDate.toLocaleDateString('es-MX', { weekday: 'short' }) + '.';
                                    })()}
                                  </p>
                                  <p className="text-[10px] text-slate-500">{close.totalSales} ventas</p>
                                </div>
                              </div>
                              <div className="text-right flex flex-col items-end gap-1">
                                {role === 'admin' && onDeleteClosing && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteClosing(close.id);
                                    }}
                                    className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded transition-colors mb-0.5"
                                    title="Eliminar Cierre"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                                <p className="font-bold text-green-600 text-xs">${close.totalRevenue.toLocaleString('es-MX')}</p>
                                <p className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                  Neto: ${(close.totalRevenue / 1.16).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* SALE DETAIL MODAL */}
      {selectedSale && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setSelectedSale(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                Ticket Digital
              </h3>
              <button
                onClick={() => setSelectedSale(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto">
              <div className="text-center mb-6">
                <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Total Pagado</p>
                <p className="text-4xl font-black text-slate-800 tracking-tight">
                  ${selectedSale.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-500">
                  <span className={`w-2 h-2 rounded-full ${BRAND_CONFIGS[selectedSale.brand].colorClass.split(' ')[0]} bg-current`} style={{ color: BRAND_CONFIGS[selectedSale.brand].hex }}></span>
                  {BRAND_CONFIGS[selectedSale.brand].label}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-slate-200/50">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <User className="w-4 h-4" />
                    <span>Cliente</span>
                  </div>
                  <span className="font-semibold text-slate-800">{selectedSale.customerName}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-slate-200/50">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Tag className="w-4 h-4" />
                    <span>Factura</span>
                  </div>
                  <span className="text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wide">#{String(selectedSale.invoiceNumber).replace(/[^0-9-]/g, '')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Calendar className="w-4 h-4" />
                    <span>Fecha</span>
                  </div>
                  <span className="font-semibold text-slate-800">{selectedSale.date}</span>
                </div>
              </div>

              {selectedSale.ticketImage && (
                <div className="mt-6">
                  <h4 className="font-bold text-slate-800 mb-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-blue-500" />
                      Evidencia Adjunta
                    </div>
                    {selectedSale.ticketImage && (selectedSale.ticketImage.includes('http') || selectedSale.ticketImage.includes('google')) && (
                      <button
                        onClick={() => {
                          const url = selectedSale.ticketImage!;
                          if (navigator.share) {
                            navigator.share({
                              title: `Ticket - ${selectedSale.invoiceNumber}`,
                              text: `Ticket de venta para ${selectedSale.customerName}`,
                              url: url
                            }).catch(console.error);
                          } else {
                            navigator.clipboard.writeText(url);
                            alert("Enlace copiado al portapapeles");
                          }
                        }}
                        className="text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg transition-colors"
                        title="Compartir Imagen"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    )}
                  </h4>
                  <div className="bg-slate-100 rounded-xl overflow-hidden p-1">
                    {(() => {
                      const url = selectedSale.ticketImage;
                      const driveIdMatch = url.match(/[-\w]{25,}/);
                      const isDrive = (url.includes('google.com') || url.includes('drive.google')) && driveIdMatch;

                      if (isDrive && driveIdMatch) {
                        return (
                          <iframe
                            src={`https://drive.google.com/file/d/${driveIdMatch[0]}/preview`}
                            className="w-full h-64 md:h-96 rounded-lg object-contain bg-white border-0"
                            allow="autoplay"
                            title="Ticket Preview"
                          ></iframe>
                        );
                      } else {
                        return (
                          <img
                            src={url}
                            alt="Ticket"
                            className="w-full h-auto object-contain rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).parentElement!.innerHTML += '<p class="text-center text-slate-400 text-sm p-4">Error al cargar la imagen</p>';
                            }}
                          />
                        );
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DAY SUMMARY MODAL FROM MONTH VIEW */}
      {selectedDaySummary && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setSelectedDaySummary(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Resumen del Día
                  {storeName && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">
                      {storeName}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500 font-medium">
                  {new Date(selectedDaySummary.date).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => setSelectedDaySummary(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-400 text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Factura</th>
                    <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Cliente</th>
                    <th className="px-6 py-3 border-b border-slate-200 bg-slate-50">Marca</th>
                    <th className="px-6 py-3 border-b border-slate-200 bg-slate-50 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedDaySummary.sales.map(sale => (
                    <tr
                      key={sale.id}
                      onClick={() => {
                        setSelectedSale(sale);
                        // Optional: Keep day summary open or close it? Keeping it open makes sense as parent context.
                        // But z-index handling might be needed. selectedSale modal has z-[60], this one z-[55], so it works.
                      }}
                      className="hover:bg-blue-50/50 transition-colors cursor-pointer group/row"
                    >
                      <td className="px-6 py-4 font-mono text-slate-500 group-hover/row:text-blue-600 font-medium">
                        <span className="text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wide">#{String(sale.invoiceNumber).replace(/[^0-9-]/g, '')}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-medium">{sale.customerName}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm ${BRAND_CONFIGS[sale.brand].colorClass}`}
                          style={BRAND_CONFIGS[sale.brand].colorClass.includes('text-black') ? { color: 'black' } : {}}
                        >
                          {BRAND_CONFIGS[sale.brand].label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-700">
                        ${sale.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {selectedDaySummary.sales.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                        No hay ventas individuales registradas en este corte.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50 font-bold text-slate-800">
                  <tr>
                    <td colSpan={3} className="px-6 py-3 text-right text-xs uppercase tracking-wider text-slate-500">Total del Día</td>
                    <td className="px-6 py-3 text-right text-green-600">
                      ${selectedDaySummary.sales.reduce((sum, s) => sum + s.price, 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyClosings;