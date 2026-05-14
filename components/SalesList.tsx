import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Search, Image as ImageIcon, Calendar, User, Tag, Trash2, Eye, DollarSign, TrendingUp, Smartphone, MoreHorizontal, Edit2, X, Share2, Clock, Cpu, Phone, Database, Loader2, RefreshCcw } from 'lucide-react';
import { Sale, Brand, UserProfile } from '../types';
import { BRAND_CONFIGS } from '../constants';
import { supabase } from '../services/supabaseClient';
import PWAInstallBanner from './PWAInstallBanner';

interface SalesListProps {
  sales: Sale[];
  onDelete: (id: string) => void;
  onAdd: () => void;
  onEdit: (sale: Sale) => void;
  role?: string;
  storeName?: string;
  userProfile?: UserProfile | null;
  onDeepSearch?: (query: string) => Promise<boolean>;
  onFetchRange?: (start: string, end: string) => Promise<boolean>;
  isDeepSearching?: boolean;
}

const SalesList: React.FC<SalesListProps> = ({ 
  sales, onDelete, onEdit, onAdd, role, storeName, userProfile, onDeepSearch, onFetchRange, isDeepSearching 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState<Brand | 'ALL'>('ALL');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [requestModal, setRequestModal] = useState<{type: 'edit' | 'delete', sale: Sale} | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [suggestedData, setSuggestedData] = useState<Partial<Sale>>({});
  const [activeTab, setActiveTab] = useState<'KIT' | 'CHIP_0' | 'PORTABILITY' | 'EXPRESS'>('KIT');
  const [displayLimit, setDisplayLimit] = useState(50);
  const summaryRef = useRef<HTMLDivElement>(null);

  const handleSendRequest = async () => {
    if (!requestModal || !requestReason.trim()) return;
    setIsRequesting(true);
    try {
      const { error } = await supabase.from('sale_requests').insert([{
        sale_id: requestModal.sale.id,
        requester_id: userProfile?.id,
        type: requestModal.type,
        reason: requestReason,
        suggested_changes: requestModal.type === 'edit' ? suggestedData : null,
        status: 'pending',
        sale_data_snapshot: requestModal.sale // Store current state for history/undo
      }]);

      if (error) throw error;
      alert("✅ Solicitud enviada correctamente al administrador.");
      setRequestModal(null);
      setRequestReason('');
      setSuggestedData({});
    } catch (err: any) {
      alert("Error al enviar solicitud: " + err.message);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleShareSummary = async () => {
    if (!summaryRef.current) return;
    try {
      const canvas = await html2canvas(summaryRef.current, {
        scale: 2,
        backgroundColor: '#0f172a', // Slate-900
        useCORS: true
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `resumen-dia-${new Date().toLocaleDateString().replace(/\//g, '-')}.png`, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Resumen del Día',
              text: 'Ventas de hoy.'
            });
          } catch (e) {
            console.log('Cancelled');
          }
        } else {
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = file.name;
          link.click();
        }
      });
    } catch (err) {
      console.error(err);
      alert("Error al compartir.");
    }
  };

  // Date Filtering State
  const [viewMode, setViewMode] = useState<'today' | 'all' | 'custom'>('today');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // --- PERMISSIONS FILTERED TABS ---
  const getAllowedTabs = () => {
    const tabs = [];
    if (userProfile?.canSellKit !== false) tabs.push({ id: 'KIT', label: 'Equipos Kit', icon: Smartphone });
    if (userProfile?.canSellChip0) tabs.push({ id: 'CHIP_0', label: 'Chip 0', icon: Cpu });
    if (userProfile?.canSellPortability) tabs.push({ id: 'PORTABILITY', label: 'Portabilidad', icon: Share2 });
    if (userProfile?.canSellChipExpress) tabs.push({ id: 'EXPRESS', label: 'Chip Express', icon: Phone });
    
    if (tabs.length === 0) tabs.push({ id: 'KIT', label: 'Equipos Kit', icon: Smartphone });
    return tabs;
  };

  const allowedTabs = getAllowedTabs();

  // Switch tab if current one is not allowed
  React.useEffect(() => {
    if (!allowedTabs.find(t => t.id === activeTab)) {
      setActiveTab(allowedTabs[0].id as any);
    }
  }, [userProfile, allowedTabs, activeTab]);

  // --- TODAY'S STATS CALCULATIONS (BASED ON ACTIVE TAB) ---
  const todayDateObj = new Date();
  const todayStr = todayDateObj.getFullYear() + '-' +
    String(todayDateObj.getMonth() + 1).padStart(2, '0') + '-' +
    String(todayDateObj.getDate()).padStart(2, '0');

  const todaysSales = sales.filter(s => s.date === todayStr);
  
  // Filter by category matching activeTab
  const currentTabSales = todaysSales.filter(s => {
    if (activeTab === 'KIT') return (s.category === 'kit' || !s.category);
    if (activeTab === 'CHIP_0') return (s.category === 'chip_0');
    if (activeTab === 'PORTABILITY') return (s.category === 'portability');
    if (activeTab === 'EXPRESS') return (s.category === 'chip_express');
    return false;
  });

  const todayRevenue = currentTabSales.reduce((sum, s) => sum + s.price, 0);
  const todayCount = currentTabSales.length;
  const todayNet = todayRevenue / 1.16;

  const ActiveTabIcon = allowedTabs.find(t => t.id === activeTab)?.icon || Smartphone;
  const activeTabLabel = allowedTabs.find(t => t.id === activeTab)?.label || 'Ventas';

  // --- FILTER LOGIC ---
  const filteredSales = sales.filter(sale => {
    // 1. Text Search
    const matchesSearch =
      sale.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sale.transactionFolio?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    // 2. Brand Filter
    const matchesBrand = filterBrand === 'ALL' || sale.brand === filterBrand;

    // 3. Date Filter
    let matchesDate = true;
    if (viewMode === 'today') {
      matchesDate = sale.date === todayStr;
    } else if (viewMode === 'custom') {
      if (dateRange.start && sale.date < dateRange.start) matchesDate = false;
      if (dateRange.end && sale.date > dateRange.end) matchesDate = false;
    }

    // Category filtering
    let matchesTab = true;
    if (activeTab === 'KIT') matchesTab = (sale.category === 'kit' || !sale.category);
    else if (activeTab === 'CHIP_0') matchesTab = (sale.category === 'chip_0');
    else if (activeTab === 'PORTABILITY') matchesTab = (sale.category === 'portability');
    else if (activeTab === 'EXPRESS') matchesTab = (sale.category === 'chip_express');

    return matchesSearch && matchesBrand && matchesDate && matchesTab;
  }).sort((a, b) => {
    // 1. Sort by Date Descending first (most recent)
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;

    // 2. Sort by Invoice Sequence Descending
    const getSequence = (inv: string) => {
      // Remove any non-numeric except dash
      const clean = String(inv).replace(/[^0-9-]/g, '');
      // If contains dash, take the part AFTER the last dash (usually the sequence)
      if (clean.includes('-')) {
        const parts = clean.split('-');
        return parseInt(parts[parts.length - 1]);
      }
      return parseInt(clean);
    };

    const seqA = getSequence(a.invoiceNumber);
    const seqB = getSequence(b.invoiceNumber);

    if (!isNaN(seqA) && !isNaN(seqB)) {
      return seqB - seqA;
    }
    // Fallback
    return String(b.invoiceNumber).localeCompare(String(a.invoiceNumber));
  });

  return (
    <div className="space-y-8">
      {/* BANNER DE INSTALACIÓN (Solo visible en navegador) */}
      <PWAInstallBanner />

      {/* --- TODAY'S PERFORMANCE HERO CARD --- */}
      <div ref={summaryRef} className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-xl border border-slate-800">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600 rounded-full blur-[100px] opacity-10 translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="bg-blue-600 w-2 h-6 rounded-full inline-block"></span>
                Resumen del Día
                <button
                  onClick={handleShareSummary}
                  className="ml-2 p-1.5 bg-slate-800/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full transition-colors border border-slate-700"
                  title="Compartir Captura"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </h2>
              <div className="flex items-center gap-2 mt-1 pl-4">
                <span className="text-blue-400 text-xs font-black uppercase tracking-widest">{storeName || 'Sucursal'}</span>
                <span className="text-slate-600 text-[10px]">•</span>
                <p className="text-slate-400 text-xs font-medium">
                  {todayDateObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-700 text-[10px] font-black text-blue-400 uppercase tracking-tighter">
              {storeName || 'Sin asignar'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:divide-x divide-slate-800/80">

            {/* Stat 1: Count */}
            <div className="flex items-center gap-4 px-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                <ActiveTabIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-0.5">{activeTabLabel}</p>
                <p className="text-3xl font-black text-white">{todayCount}</p>
              </div>
            </div>

            {/* Stat 2: Revenue */}
            <div className="flex items-center gap-4 px-2 md:pl-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-0.5">Venta Total</p>
                <p className="text-3xl font-black text-white">${todayRevenue.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </div>
            </div>

            {/* Stat 3: Net */}
            <div className="flex items-center gap-4 px-2 md:pl-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-0.5">Sin IVA (Base)</p>
                <p className="text-3xl font-black text-white">${todayNet.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex overflow-x-auto pb-1 gap-2 scrollbar-hide">
        {allowedTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap border-2 ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-105'
                : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
            }`}
          >
            <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'text-blue-400' : 'text-slate-400'}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* --- LIST HEADER & CONTROLS --- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Transacciones</h3>
            <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{filteredSales.length} registros mostrados</span>
          </div>

          {/* Date Mode Toggles */}
          <div className="flex bg-slate-100 p-1 rounded-xl self-start md:self-center">
            <button
              onClick={() => setViewMode('today')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'today' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Hoy
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'all' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Historial Completo
            </button>
            <button
              onClick={() => setViewMode('custom')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'custom' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Rango
            </button>
          </div>
        </div>

        {/* Custom Date Inputs */}
        {viewMode === 'custom' && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Desde:</span>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Hasta:</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
            
            {dateRange.start && dateRange.end && (
               <button 
                onClick={() => onFetchRange?.(dateRange.start, dateRange.end)}
                disabled={isDeepSearching}
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeepSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                Cargar del Historial
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-3 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar cliente o folio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm font-medium transition-all"
            />
          </div>

          <div className="w-full md:w-auto pr-2">
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value as Brand | 'ALL')}
              className="w-full md:w-auto px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <option value="ALL">Todas las Marcas</option>
              {Object.values(Brand).map(brand => (
                <option key={brand} value={brand}>{BRAND_CONFIGS[brand].label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* --- LIST --- */}
      <div className="grid grid-cols-1 gap-4">
        {filteredSales.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-slate-800 font-bold mb-1">No se encontraron ventas</h3>
            <p className="text-slate-500 text-sm">Mostrando el último mes de actividad.</p>
          </div>
        ) : (
          <>
            {filteredSales.slice(0, displayLimit).map((sale) => (
            <div key={sale.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-100 transition-all group">
              <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                {/* Left: Main Info */}
                <div className="flex-1 space-y-3 w-full">
                  <div className="flex items-center justify-between md:justify-start gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold text-white shadow-sm tracking-wide uppercase ${BRAND_CONFIGS[sale.brand].colorClass}`}
                      style={BRAND_CONFIGS[sale.brand].colorClass.includes('text-black') ? { color: 'black' } : {}}
                    >
                      {BRAND_CONFIGS[sale.brand].label}
                    </span>
                    <span className="text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wide">
                      {sale.invoiceNumber}
                    </span>

                    {/* CATEGORY BADGE */}
                    <div className="flex items-center gap-1.5">
                      <span className={`
                        px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter border flex items-center gap-1
                        ${sale.category === 'chip_0' ? 'bg-purple-100 text-purple-700 border-purple-200' : 
                          sale.category === 'portability' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                          sale.category === 'chip_express' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                          'bg-blue-100 text-blue-700 border-blue-200'}
                      `}>
                        {sale.category === 'chip_0' ? <><Cpu className="w-2.5 h-2.5" /> CHIP 0</> : 
                         sale.category === 'portability' ? <><Phone className="w-2.5 h-2.5" /> PORTA</> :
                         sale.category === 'chip_express' ? <><Cpu className="w-2.5 h-2.5" /> EXPRESS</> : <><Smartphone className="w-2.5 h-2.5" /> KIT</>}
                      </span>

                      {/* EXTRA DATA INDICATORS (ICCID / PHONE) */}
                      {(sale.category === 'portability' || sale.category === 'chip_express' || sale.category === 'chip_0') && (
                        <div className="flex items-center gap-1">
                          {sale.phoneNumber && (
                            <span className="bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                              {sale.phoneNumber}
                            </span>
                          )}
                          {sale.iccid && (
                            <span className="bg-slate-100 text-slate-500 text-[8px] px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                              {sale.iccid.slice(-4)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ETIQUETA DE SUCURSAL */}
                    {sale.storeId && (
                      <span className="ml-auto md:ml-0 text-[9px] font-black text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md uppercase tracking-tighter">
                        {sale.storeId === '00000000-0000-0000-0000-000000000000' ? 'TIENDA PRINCIPAL' : 'SUCURSAL'}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 text-lg leading-tight flex items-center gap-2">
                        {sale.customerName.toUpperCase()}
                        {sale.portabilityScreenshot && (
                          <div className="bg-rose-500 w-1.5 h-1.5 rounded-full animate-pulse" title="Tiene captura de porta" />
                        )}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {sale.date}</span>
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded text-slate-600">
                        <Tag className="w-3 h-3" /> ${sale.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                      
                      {/* Detailed data for chips */}
                      {sale.phoneNumber && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Phone className="w-3 h-3" /> {sale.phoneNumber}
                        </span>
                      )}
                      {sale.iccid && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Cpu className="w-3 h-3" /> ICCID: {sale.iccid}
                        </span>
                      )}
                    </div>
                    {/* Admin only info */}
                    {role === 'admin' && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t border-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-blue-400" />
                          Registrado por: <span className="text-slate-600">{sale.createdByName || sale.createdByEmail || 'N/A'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          Hora: <span className="text-slate-600">
                            {sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Actions & Ticket */}
                <div className="flex items-center justify-end w-full md:w-auto gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-50 mt-2 md:mt-0">
                  {sale.ticketImage ? (
                    <button
                      onClick={() => setSelectedImage(sale.ticketImage!)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Ver Ticket
                    </button>
                  ) : (
                    <span className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 bg-slate-50 select-none">
                      <ImageIcon className="w-4 h-4" />
                      Sin foto
                    </span>
                  )}

                  <div className="w-px h-8 bg-slate-100 mx-1 hidden md:block"></div>

                  <div className="w-px h-8 bg-slate-100 mx-1 hidden md:block"></div>

                  {role === 'admin' && (
                    <>
                      <button
                        onClick={() => onEdit(sale)}
                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar venta"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => onDelete(sale.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar venta"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </>
                  )}

                  {role === 'seller' && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setRequestModal({ type: 'edit', sale });
                          setSuggestedData({
                            customerName: sale.customerName,
                            price: sale.price,
                            brand: sale.brand,
                            invoiceNumber: sale.invoiceNumber
                          });
                        }}
                        className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                        title="Solicitar Edición"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRequestModal({ type: 'delete', sale })}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Solicitar Eliminación"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {filteredSales.length > displayLimit && (
            <button 
              onClick={() => setDisplayLimit(prev => prev + 50)}
              className="mt-4 w-full py-4 bg-white border border-slate-200 rounded-2xl text-blue-600 font-black text-[10px] uppercase tracking-widest hover:bg-blue-50 transition-all shadow-sm"
            >
              Ver más ventas ({filteredSales.length - displayLimit} restantes)
            </button>
          )}
          </>
        )}

        {/* Muestra el botón de búsqueda profunda si no hay resultados locales o si el usuario está buscando algo específico */}
        {searchTerm.length >= 3 && (
          <div className="mt-8 p-6 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 text-center">
            <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-bold mb-2">
              {filteredSales.length === 0 
                ? "No se encontraron resultados en los últimos 30 días." 
                : "¿Buscando algo más antiguo?"}
            </p>
            <p className="text-[10px] text-slate-400 uppercase font-black mb-4">Puedes buscar en el historial completo de la base de datos</p>
            <button 
              onClick={() => onDeepSearch?.(searchTerm)}
              disabled={isDeepSearching}
              className="px-6 py-3 bg-white border border-slate-200 text-blue-600 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-blue-50 transition-all flex items-center gap-2 mx-auto disabled:opacity-50"
            >
              {isDeepSearching ? (
                <> <Loader2 className="w-4 h-4 animate-spin" /> Buscando en archivos... </>
              ) : (
                <> <Search className="w-4 h-4" /> Buscar en historial completo </>
              )}
            </button>
          </div>
        )}
      </div>

       {/* REQUEST MODAL */}
      {requestModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
           <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
              <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                   {requestModal.type === 'edit' ? 'Solicitar Edición' : 'Solicitar Eliminación'}
                 </h3>
                 <button onClick={() => setRequestModal(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-6 h-6 text-slate-400" /></button>
              </div>
              
              <div className="p-8 space-y-6">
                 <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Venta Seleccionada</p>
                    <p className="text-sm font-bold text-slate-800">{requestModal.sale.invoiceNumber} - {requestModal.sale.customerName}</p>
                 </div>

                 {requestModal.type === 'edit' && (
                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-slate-400 uppercase px-2">Nueva Marca</label>
                             <select 
                               value={suggestedData.brand} 
                               onChange={(e) => setSuggestedData({...suggestedData, brand: e.target.value as Brand})}
                               className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none"
                             >
                                {Object.values(Brand).map(b => <option key={b} value={b}>{BRAND_CONFIGS[b].label}</option>)}
                             </select>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-black text-slate-400 uppercase px-2">Nuevo Precio</label>
                             <input 
                               type="number" 
                               value={suggestedData.price} 
                               onChange={(e) => setSuggestedData({...suggestedData, price: parseFloat(e.target.value)})}
                               className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black outline-none"
                             />
                          </div>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase px-2">Nombre Cliente Correcto</label>
                          <input 
                            type="text" 
                            value={suggestedData.customerName} 
                            onChange={(e) => setSuggestedData({...suggestedData, customerName: e.target.value.toUpperCase()})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none"
                          />
                       </div>
                    </div>
                 )}

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                      {requestModal.type === 'edit' ? '¿Qué se debe corregir?' : 'Motivo de la cancelación'}
                    </label>
                    <textarea 
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      placeholder="Explica brevemente al administrador..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-bold outline-none h-24 resize-none"
                      required
                    ></textarea>
                 </div>

                 <button 
                   onClick={handleSendRequest}
                   disabled={isRequesting || !requestReason.trim()}
                   className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                 >
                   {isRequesting ? 'Enviando...' : 'Enviar Solicitud'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 right-0 p-4 flex gap-3 pointer-events-none z-50">
              {selectedImage && (
                <button
                  className="pointer-events-auto bg-slate-900 text-white p-3 rounded-full hover:bg-slate-800 transition-colors shadow-xl border border-slate-700"
                  onClick={async () => {
                    try {
                      if (!navigator.share) {
                        alert("Función no disponible");
                        return;
                      }

                      // Try to share as file if possible
                      if (selectedImage.startsWith('data:')) {
                        const res = await fetch(selectedImage);
                        const blob = await res.blob();
                        const file = new File([blob], 'ticket-venta.jpg', { type: 'image/jpeg' });

                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                          await navigator.share({
                            files: [file],
                            title: 'Ticket',
                            text: 'Ticket de Venta'
                          });
                          return;
                        }
                      }

                      // Fallback URL
                      await navigator.share({
                        title: 'Ticket',
                        url: selectedImage
                      });

                    } catch (err) {
                      console.error(err);
                    }
                  }}
                >
                  <Share2 className="w-6 h-6" />
                </button>
              )}
              <button
                className="pointer-events-auto bg-slate-900 text-white p-3 rounded-full hover:bg-slate-800 transition-colors shadow-xl border border-slate-700"
                onClick={() => setSelectedImage(null)}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {selectedImage.includes('google.com') || selectedImage.includes('drive.google') ? (
              <iframe
                src={(() => {
                  try {
                    let id = '';
                    if (selectedImage.includes('/d/')) {
                      id = selectedImage.split('/d/')[1].split('/')[0];
                    } else if (selectedImage.includes('id=')) {
                      id = selectedImage.split('id=')[1].split('&')[0];
                    }
                    if (id) return `https://drive.google.com/file/d/${id}/preview`;
                    return selectedImage;
                  } catch (e) {
                    return selectedImage;
                  }
                })()}
                className="w-full h-[80vh] rounded-xl shadow-2xl bg-white"
                allow="autoplay"
                title="Ticket Preview"
              ></iframe>
            ) : (
              <img src={selectedImage} alt="Ticket Full" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesList;