import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Calendar, 
  Store as StoreIcon, 
  User, 
  Award, 
  FileText, 
  Search, 
  Filter, 
  Download, 
  Smartphone, 
  ChevronRight, 
  Layers, 
  CheckCircle2, 
  Sparkles, 
  Percent, 
  BadgeCheck, 
  Building2,
  PieChart as PieChartIcon
} from 'lucide-react';
import { Sale, Store, UserProfile, Brand, StoreTier } from '../types';
import { BRAND_CONFIGS, COMMISSION_TIERS, calculateCommissionForPrice, getCommissionTierInfo } from '../constants';
import { jsPDF } from 'jspdf';

interface CommissionsPanelProps {
  sales: Sale[];
  stores: Store[];
  userProfile?: UserProfile | null;
  selectedStoreId?: string;
  onSelectStore?: (storeId: string) => void;
}

export const CommissionsPanel: React.FC<CommissionsPanelProps> = ({
  sales = [],
  stores = [],
  userProfile,
  selectedStoreId = 'all',
  onSelectStore
}) => {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [storeFilter, setStoreFilter] = useState<string>(selectedStoreId || 'all');
  const [sellerFilter, setSellerFilter] = useState<string>('all');
  const [storeTier, setStoreTier] = useState<StoreTier>('A'); // Coppel A default
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState<number | 'all'>('all');

  const isAdminOrSupervisor = userProfile?.role === 'admin' || userProfile?.role === 'supervisor' || userProfile?.role === 'developer';

  // Sincronizar filtro si cambia desde props
  React.useEffect(() => {
    if (selectedStoreId) {
      setStoreFilter(selectedStoreId);
    }
  }, [selectedStoreId]);

  // Filtrar solo ventas válidas de equipos celulares (Kits o Chip 0 con precio)
  const phoneSales = useMemo(() => {
    return sales.filter(s => {
      const isPhone = s.category === 'kit' || s.category === 'chip_0' || !s.category;
      const hasPrice = Number(s.price) > 0;
      return isPhone && hasPrice;
    });
  }, [sales]);

  // Ventas filtradas por mes, tienda y vendedor
  const filteredSales = useMemo(() => {
    return phoneSales.filter(s => {
      const matchesMonth = s.date && s.date.startsWith(selectedMonth);
      const matchesStore = storeFilter === 'all' || s.storeId === storeFilter;
      const matchesSeller = sellerFilter === 'all' || s.createdBy === sellerFilter;
      const tierInfo = getCommissionTierInfo(Number(s.price));
      const matchesTier = selectedTierFilter === 'all' || (tierInfo && tierInfo.id === selectedTierFilter);

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        (s.customerName || '').toLowerCase().includes(q) ||
        (s.invoiceNumber || '').toLowerCase().includes(q) ||
        (s.transactionFolio || '').toLowerCase().includes(q) ||
        (s.brand || '').toLowerCase().includes(q);

      return matchesMonth && matchesStore && matchesSeller && matchesTier && matchesSearch;
    });
  }, [phoneSales, selectedMonth, storeFilter, sellerFilter, selectedTierFilter, searchQuery]);

  // Métricas y cálculos generales
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCommission = 0;
    let todayCount = 0;
    let todayCommission = 0;
    let todayRevenue = 0;

    const tierStats = {
      1: { count: 0, commission: 0, revenue: 0 },
      2: { count: 0, commission: 0, revenue: 0 },
      3: { count: 0, commission: 0, revenue: 0 },
      4: { count: 0, commission: 0, revenue: 0 }
    };

    const sellerMap = new Map<string, {
      sellerId: string;
      sellerName: string;
      sellerEmail: string;
      storeId: string;
      units: number;
      revenue: number;
      commission: number;
      tier1: number;
      tier2: number;
      tier3: number;
      tier4: number;
    }>();

    filteredSales.forEach(s => {
      const price = Number(s.price) || 0;
      const comm = calculateCommissionForPrice(price, storeTier);
      const tierInfo = getCommissionTierInfo(price);

      totalRevenue += price;
      totalCommission += comm;

      if (tierInfo && tierInfo.id in tierStats) {
        tierStats[tierInfo.id as 1 | 2 | 3 | 4].count += 1;
        tierStats[tierInfo.id as 1 | 2 | 3 | 4].commission += comm;
        tierStats[tierInfo.id as 1 | 2 | 3 | 4].revenue += price;
      }

      if (s.date === todayStr) {
        todayCount += 1;
        todayCommission += comm;
        todayRevenue += price;
      }

      const creatorId = s.createdBy || 'desconocido';
      const creatorName = s.createdByName || (creatorId.includes('@') ? creatorId.split('@')[0] : `Vendedor (${creatorId.slice(0, 6)})`);
      const creatorEmail = s.createdByEmail || creatorId;

      const existing = sellerMap.get(creatorId) || {
        sellerId: creatorId,
        sellerName: creatorName.toUpperCase(),
        sellerEmail: creatorEmail,
        storeId: s.storeId || '',
        units: 0,
        revenue: 0,
        commission: 0,
        tier1: 0,
        tier2: 0,
        tier3: 0,
        tier4: 0
      };

      existing.units += 1;
      existing.revenue += price;
      existing.commission += comm;

      if (tierInfo?.id === 1) existing.tier1 += 1;
      if (tierInfo?.id === 2) existing.tier2 += 1;
      if (tierInfo?.id === 3) existing.tier3 += 1;
      if (tierInfo?.id === 4) existing.tier4 += 1;

      sellerMap.set(creatorId, existing);
    });

    const sellersList = Array.from(sellerMap.values()).sort((a, b) => b.commission - a.commission);
    const avgCommissionPerUnit = filteredSales.length > 0 ? totalCommission / filteredSales.length : 0;

    return {
      totalUnits: filteredSales.length,
      totalRevenue,
      totalCommission,
      todayCount,
      todayCommission,
      todayRevenue,
      avgCommissionPerUnit,
      tierStats,
      sellersList
    };
  }, [filteredSales, storeTier, todayStr]);

  // Lista única de vendedores para el selector
  const availableSellers = useMemo(() => {
    const map = new Map<string, string>();
    phoneSales.forEach(s => {
      if (s.createdBy) {
        const name = s.createdByName || (s.createdBy.includes('@') ? s.createdBy.split('@')[0] : s.createdBy);
        map.set(s.createdBy, name.toUpperCase());
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [phoneSales]);

  // Descarga de reporte PDF de comisiones
  const handleExportPDF = () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      let y = 20;

      // Encabezado
      pdf.setFillColor(15, 23, 42); // slate-900
      pdf.rect(0, 0, pageWidth, 35, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(255, 255, 255);
      pdf.text('REPORTE OFICIAL DE COMISIONES TELCEL', margin, 18);

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Período: ${selectedMonth} | Tienda: ${storeTier === 'A' ? 'Coppel Tienda A' : 'Coppel Canada B'} | Generado: ${new Date().toLocaleDateString('es-MX')}`, margin, 27);

      y = 45;

      // Resumen Global
      pdf.setTextColor(15, 23, 42);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('RESUMEN DE COMISIONES', margin, y);
      y += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Equipos Vendidos: ${metrics.totalUnits} unidades`, margin, y);
      pdf.text(`Total Comisiones Generadas: $${metrics.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, margin + 90, y);
      y += 6;
      pdf.text(`Venta Total (con IVA): $${metrics.totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, margin, y);
      pdf.text(`Promedio por Celular: $${metrics.avgCommissionPerUnit.toFixed(2)}`, margin + 90, y);
      y += 12;

      // Desglose por Tabulador
      pdf.setFont('helvetica', 'bold');
      pdf.text('DESGLOSE POR TABULADOR OFICIAL', margin, y);
      y += 8;

      COMMISSION_TIERS.forEach(t => {
        const stat = metrics.tierStats[t.id as 1 | 2 | 3 | 4];
        const commRate = storeTier === 'A' ? t.commissionCoppelA : t.commissionCoppelCanadaB;
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${t.rangeLabel} ($${commRate}/eq): ${stat.count} equipos = $${stat.commission.toLocaleString('es-MX')}`, margin, y);
        y += 6;
      });

      y += 8;

      // Ranking de Vendedores
      if (metrics.sellersList.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('DESGLOSE POR PROMOTOR / VENDEDOR', margin, y);
        y += 8;

        metrics.sellersList.forEach((seller, idx) => {
          if (y > 270) {
            pdf.addPage();
            y = 20;
          }
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${idx + 1}. ${seller.sellerName}`, margin, y);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`${seller.units} equipos | Total: $${seller.commission.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, margin + 90, y);
          y += 6;
        });
      }

      pdf.save(`Reporte_Comisiones_Coppel_${selectedMonth}.pdf`);
    } catch (e: any) {
      alert("Error al exportar PDF: " + e.message);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* 1. HERO BANNER OFICIAL TELCEL COPPEL */}
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 rounded-3xl p-6 md:p-8 text-slate-900 shadow-xl border border-amber-300">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-white/20 rounded-full blur-2xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-slate-900 text-yellow-400 rounded-3xl shadow-xl shadow-amber-900/20 flex items-center justify-center">
              <DollarSign className="w-10 h-10" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900/90 text-yellow-300 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 shadow-sm">
                <Sparkles className="w-3 h-3" />
                Tabulador Oficial Coppel Telcel
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-950">
                ¡Conoce lo nuevo en Comisiones!
              </h1>
              <p className="text-slate-900/80 font-bold text-xs md:text-sm mt-0.5 max-w-xl">
                Tu comisión por venta de celulares depende del valor del equipo con IVA incluido. Modalidad activa: <span className="font-extrabold underline">{storeTier === 'A' ? 'Coppel Tienda A' : 'Coppel Canada (B)'}</span>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Toggle Tipo de Tienda */}
            <div className="bg-slate-900/90 p-1.5 rounded-2xl flex items-center shadow-lg">
              <button
                type="button"
                onClick={() => setStoreTier('A')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${storeTier === 'A' ? 'bg-yellow-400 text-slate-950 shadow-md' : 'text-slate-300 hover:text-white'}`}
              >
                Coppel (A)
              </button>
              <button
                type="button"
                onClick={() => setStoreTier('B')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${storeTier === 'B' ? 'bg-yellow-400 text-slate-950 shadow-md' : 'text-slate-300 hover:text-white'}`}
              >
                Coppel Canada (B)
              </button>
            </div>

            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg hover:bg-slate-800 transition-all"
            >
              <Download className="w-4 h-4 text-yellow-400" />
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Mes */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700">
            <Calendar className="w-4 h-4 text-amber-500" />
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              className="bg-transparent font-black text-slate-800 outline-none cursor-pointer"
            />
          </div>

          {/* Tienda */}
          {isAdminOrSupervisor && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700">
              <Building2 className="w-4 h-4 text-blue-500" />
              <select
                value={storeFilter}
                onChange={(e) => {
                  setStoreFilter(e.target.value);
                  if (onSelectStore) onSelectStore(e.target.value);
                }}
                className="bg-transparent font-black text-slate-800 outline-none cursor-pointer"
              >
                <option value="all">Todas las Sucursales</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Vendedor */}
          {isAdminOrSupervisor && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700">
              <User className="w-4 h-4 text-purple-500" />
              <select
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
                className="bg-transparent font-black text-slate-800 outline-none cursor-pointer"
              >
                <option value="all">Todos los Promotores</option>
                {availableSellers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Buscador de cliente/factura */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar factura o cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* 3. TARJETAS DE MÉTRICAS PRINCIPALES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Comisión Total Mes */}
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden flex flex-col justify-between border border-slate-800">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl"></div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Comisiones del Mes</span>
            <div className="p-2.5 bg-amber-500/20 text-yellow-400 rounded-2xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-black tracking-tight text-white mb-1">
              ${metrics.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-400 font-bold">
              En {metrics.totalUnits} celulares vendidos en {selectedMonth}
            </p>
          </div>
        </div>

        {/* Comisión de Hoy */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Comisión Ganada Hoy</span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 mb-1">
              ${metrics.todayCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-bold">
              {metrics.todayCount} equipos vendidos hoy ({todayStr})
            </p>
          </div>
        </div>

        {/* Promedio por Equipo */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Promedio por Celular</span>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 mb-1">
              ${metrics.avgCommissionPerUnit.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 font-bold">
              Comisión promedio por cada equipo vendido
            </p>
          </div>
        </div>

        {/* Venta Total Facturada */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Venta Total (Con IVA)</span>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-2xl">
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 mb-1">
              ${metrics.totalRevenue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-slate-500 font-bold">
              Monto total bruto facturado en celulares
            </p>
          </div>
        </div>
      </div>

      {/* 4. TABULADOR OFICIAL - TARJETAS DE NIVELES (TIER 1 A TIER 4) */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                Tabulador de Comisiones Coppel ({storeTier === 'A' ? 'Tienda A' : 'Coppel Canada B'})
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Haz clic en cualquier nivel para filtrar las ventas de ese rango de precio.
            </p>
          </div>

          {selectedTierFilter !== 'all' && (
            <button
              onClick={() => setSelectedTierFilter('all')}
              className="self-start sm:self-auto px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase transition-colors"
            >
              Mostrar Todos los Niveles
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COMMISSION_TIERS.map(tier => {
            const stat = metrics.tierStats[tier.id as 1 | 2 | 3 | 4];
            const isSelected = selectedTierFilter === tier.id;
            const commAmount = storeTier === 'A' ? tier.commissionCoppelA : tier.commissionCoppelCanadaB;

            return (
              <div
                key={tier.id}
                onClick={() => setSelectedTierFilter(isSelected ? 'all' : tier.id)}
                className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                  isSelected 
                    ? 'border-amber-500 bg-amber-50/50 shadow-md ring-2 ring-amber-400/20' 
                    : 'border-slate-200 bg-slate-50/70 hover:border-amber-300 hover:bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Rango Nivel {tier.id}
                    </span>
                    <span className="px-2.5 py-1 bg-amber-500 text-slate-950 rounded-xl text-xs font-black shadow-sm">
                      +${commAmount}.00 / eq
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight mb-2">
                    {tier.rangeLabel}
                  </h3>
                </div>

                <div className="pt-4 border-t border-slate-200/80 mt-2 flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-black text-slate-900 leading-none">
                      {stat.count}
                    </span>
                    <span className="text-xs font-bold text-slate-500 ml-1">equipos</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-400 block uppercase">Acumulado</span>
                    <span className="text-sm font-black text-amber-600">
                      ${stat.commission.toLocaleString('es-MX')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. RENDIMIENTO DE COMISIONES POR VENDEDOR / PROMOTOR */}
      {isAdminOrSupervisor && metrics.sellersList.length > 0 && (
        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                Rendimiento de Comisiones por Promotor
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Desglose detallado de ganancias generadas por cada integrante del equipo
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4 rounded-l-xl">Promotor / Vendedor</th>
                  <th className="py-3 px-4 text-center">Equipos</th>
                  <th className="py-3 px-4 text-center">Nivel 1 ($50)</th>
                  <th className="py-3 px-4 text-center">Nivel 2 ($60)</th>
                  <th className="py-3 px-4 text-center">Nivel 3 ($70)</th>
                  <th className="py-3 px-4 text-center">Nivel 4 ($80)</th>
                  <th className="py-3 px-4 text-right">Venta Total (IVA)</th>
                  <th className="py-3 px-4 text-right rounded-r-xl">Comisión Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold">
                {metrics.sellersList.map((seller, idx) => (
                  <tr key={seller.sellerId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-900 text-yellow-400 text-[10px] font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-extrabold text-slate-900">{seller.sellerName}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{seller.sellerEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-black text-slate-900">{seller.units}</td>
                    <td className="py-4 px-4 text-center text-slate-600">{seller.tier1}</td>
                    <td className="py-4 px-4 text-center text-slate-600">{seller.tier2}</td>
                    <td className="py-4 px-4 text-center text-slate-600">{seller.tier3}</td>
                    <td className="py-4 px-4 text-center text-slate-600">{seller.tier4}</td>
                    <td className="py-4 px-4 text-right text-slate-700">
                      ${seller.revenue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-4 px-4 text-right font-black text-amber-600 text-sm">
                      ${seller.commission.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. LISTADO DETALLADO DE VENTAS Y COMISIÓN INDIVIDUAL */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                Detalle Transaccional de Ventas ({filteredSales.length})
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Comisión calculada individualmente por cada celular vendido
              </p>
            </div>
          </div>
        </div>

        {filteredSales.length === 0 ? (
          <div className="py-12 text-center text-slate-400 font-bold">
            <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
            <p>No se encontraron ventas de celulares con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4 rounded-l-xl">Fecha</th>
                  <th className="py-3 px-4">Factura / Folio</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Marca</th>
                  <th className="py-3 px-4 text-right">Precio Venta (IVA)</th>
                  <th className="py-3 px-4 text-center">Nivel Tabulador</th>
                  <th className="py-3 px-4 text-right rounded-r-xl">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {filteredSales.map(sale => {
                  const price = Number(sale.price) || 0;
                  const comm = calculateCommissionForPrice(price, storeTier);
                  const tierInfo = getCommissionTierInfo(price);
                  const brandConf = BRAND_CONFIGS[sale.brand as Brand] || { label: sale.brand, hex: '#64748b' };

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-700 whitespace-nowrap">{sale.date}</td>
                      <td className="py-3.5 px-4 font-black text-slate-900 whitespace-nowrap">
                        {sale.invoiceNumber || sale.transactionFolio || 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 uppercase max-w-[200px] truncate">
                        {sale.customerName || 'CLIENTE'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span 
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase text-white shadow-sm inline-block"
                          style={{ backgroundColor: brandConf.hex }}
                        >
                          {brandConf.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        ${price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 font-black text-[10px] rounded-full uppercase">
                          Nivel {tierInfo?.id || 1}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-600 text-sm">
                        +${comm.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
