// Deployment Version: 2026-04-11 - Official Identity Configured
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ComposedChart, Line } from 'recharts';
import { Target, Edit2, Check, TrendingUp, Trophy, PartyPopper, DollarSign, Smartphone, Trash2, AlertTriangle, FileDown, Calendar, Calculator } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Sale, Brand, DailyClose } from '../types';
import { BRAND_CONFIGS } from '../constants';
import { supabase } from '../services/supabaseClient';


interface DashboardProps {
  sales: Sale[];
  closings: DailyClose[];
  role?: string;
  storeId?: string;
  storeName?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ sales, closings, role, storeId, storeName }) => {


  const handleFactoryReset = async () => {
    if (window.confirm("⚠️ ¿ESTÁS SEGURO? \n\nEsto borrará TODAS las ventas y EL HISTORIAL DE CIERRES de la base de datos permanentemente.\n\nLa aplicación quedará vacía como nueva.")) {
      const confirm2 = window.prompt("Escribe 'BORRAR' para confirmar la acción:");
      if (confirm2 === 'BORRAR') {
        try {
          // Delete all sales
          const { error: errorSales } = await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (errorSales) throw errorSales;

          // Delete all closings
          const { error: errorClosings } = await supabase.from('daily_closings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (errorClosings) throw errorClosings;

          // Clear Local Storage
          localStorage.clear();

          alert("Aplicación restablecida: Historial de Ventas y Cierres eliminados correctamente.");
          window.location.reload();
        } catch (error: any) {
          console.error("Error reset:", error);
          alert("Error al restablecer: " + error.message);
        }
      }
    }
  };

  // --- GOALS STATE (SYNCED WITH DB) ---
  const [monthlyGoal, setMonthlyGoal] = useState<number>(100000);
  const [devicesGoal, setDevicesGoal] = useState<number>(50);
  // Goals are now "locked" implicitly by being set in DB, but we allow admin to always edit (upsert)

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoal, setTempGoal] = useState(monthlyGoal.toString());

  const [isEditingDevices, setIsEditingDevices] = useState(false);
  const [tempDevicesGoal, setTempDevicesGoal] = useState(devicesGoal.toString());

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [monthlySales, setMonthlySales] = useState<Sale[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsDataLoading(true);
      try {
        const isGlobal = !storeId || storeId === 'all';
        
        // 1. Fetch Goals
        let goalQuery = supabase.from('monthly_goals').select('*').eq('month', selectedMonth);
        if (!isGlobal) goalQuery = goalQuery.eq('store_id', storeId);
        const { data: goalData } = await goalQuery;

        if (goalData && goalData.length > 0) {
          if (isGlobal) {
            setMonthlyGoal(goalData.reduce((sum, g) => sum + Number(g.revenue_goal || 0), 0));
            setDevicesGoal(goalData.reduce((sum, g) => sum + Number(g.devices_goal || 0), 0));
          } else {
            setMonthlyGoal(Number(goalData[0].revenue_goal) || 100000);
            setDevicesGoal(Number(goalData[0].devices_goal) || 50);
          }
        } else {
          setMonthlyGoal(100000);
          setDevicesGoal(50);
        }

        // 2. Fetch Sales for specifically this month to bypass row limits
        let salesQuery = supabase.from('sales').select('*')
          .gte('date', `${selectedMonth}-01`)
          .lte('date', `${selectedMonth}-31`)
          .order('date', { ascending: false });
        
        if (!isGlobal) salesQuery = salesQuery.eq('store_id', storeId);
        
        const { data: salesData } = await salesQuery.range(0, 1999);
        
        if (salesData) {
          const formatted = salesData.map((s: any) => ({
            id: s.id,
            invoiceNumber: s.invoice_number,
            customerName: s.customer_name,
            price: s.price,
            brand: s.brand as Brand,
            date: s.date,
            storeId: s.store_id
          }));
          setMonthlySales(formatted);
        } else {
          setMonthlySales([]);
        }

      } catch (err) {
        console.error("Dashboard fetch error", err);
      } finally {
        setIsDataLoading(false);
      }
    };
    fetchDashboardData();
  }, [selectedMonth, storeId]);


  const {
    totalRevenue,
    currentMonthSales,
    currentMonthRevenue,
    currentMonthCount,
    currentMonthNet,
    revenueProgress,
    revenueRemaining,
    isRevenueGoalMet,
    devicesProgress,
    devicesRemaining,
    isDevicesGoalMet,
    brandData,
    brandDataToday,
    timelineData,
    todayCount,
    todayStr
  } = React.useMemo(() => {
    // 🟠 REAL-TIME MERGE: Combine state from DB fetch with the realtime 'sales' prop
    const combinedSales = Array.isArray(monthlySales) ? [...monthlySales] : [];
    
    if (sales && Array.isArray(sales)) {
        sales.forEach(s => {
            // Add if not already present in the monthly fetch
            if (!combinedSales.find(ms => ms.id === s.id)) {
                // Verify it belongs to currently selected month/store before adding to stats
                const matchesMonth = s.date.startsWith(selectedMonth);
                const matchesStore = !storeId || storeId === 'all' || s.storeId === storeId;
                if (matchesMonth && matchesStore) {
                    combinedSales.push(s);
                }
            }
        });
    }

    const safeSales = combinedSales;
    const totalRev = safeSales.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    
    const today = new Date();
    const tStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    const monthSales = safeSales; // monthlySales is already month-filtered, and we added realtime ones above
    const monthRev = monthSales.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    const monthNet = monthRev / 1.16;
    const monthCount = monthSales.length;

    // Goals Safety
    const safeGoal = (monthlyGoal && monthlyGoal > 0) ? monthlyGoal : 1;
    const safeDevGoal = (devicesGoal && devicesGoal > 0) ? devicesGoal : 1;

    const revProgress = isNaN(monthNet) ? 0 : (monthNet / safeGoal) * 100;
    const devProgress = (monthCount / safeDevGoal) * 100;

    // Brand Mapping Monthly
    const bData = Object.values(Brand).map(brand => {
      const bSales = monthSales.filter(s => s.brand === brand);
      const rev = bSales.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
      const conf = BRAND_CONFIGS[brand] || { label: 'Desconocido', hex: '#ccc' };
      return {
        name: conf.label,
        value: bSales.length,
        revenue: rev,
        color: conf.hex,
        logoUrl: (conf as any).logoUrl
      };
    }).filter(item => item.value > 0);

    // Brand Mapping Today
    const todaySales = safeSales.filter(s => s.date === tStr);
    const bDataToday = Object.values(Brand).map(brand => {
      const bSales = todaySales.filter(s => s.brand === brand);
      const conf = BRAND_CONFIGS[brand] || { label: 'Desconocido', hex: '#ccc' };
      return {
        name: conf.label,
        value: bSales.length,
        color: conf.hex,
        logoUrl: (conf as any).logoUrl
      };
    }).filter(item => item.value > 0);

    // Timeline 7 days
    const tLineData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const dailySales = safeSales.filter(s => s.date === dateStr);
      const dRev = dailySales.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
      return {
        date: dateStr,
        amount: dRev,
        netAmount: dRev / 1.16,
        count: dailySales.length
      };
    });

    return {
      totalRevenue: totalRev,
      currentMonthSales: monthSales,
      currentMonthRevenue: monthRev,
      currentMonthCount: monthCount,
      currentMonthNet: monthNet,
      revenueProgress: revProgress,
      revenueRemaining: Math.max(monthlyGoal - (isNaN(monthNet) ? 0 : monthNet), 0),
      isRevenueGoalMet: monthNet >= monthlyGoal && monthlyGoal > 0,
      devicesProgress: devProgress,
      devicesRemaining: Math.max(devicesGoal - monthCount, 0),
      isDevicesGoalMet: monthCount >= devicesGoal && devicesGoal > 0,
      brandData: bData,
      brandDataToday: bDataToday,
      timelineData: tLineData,
      todayCount: todaySales.length,
      todayStr: tStr
    };
  }, [monthlySales, monthlyGoal, devicesGoal, sales, selectedMonth, storeId]);

  const radius = 40;
  const circumference = 2 * Math.PI * radius; 
  const safeRevProgress = isFinite(revenueProgress) ? Math.min(revenueProgress, 100) : 0;
  const safeDevProgress = isFinite(devicesProgress) ? Math.min(devicesProgress, 100) : 0;
  const strokeDashoffsetRevenue = circumference - (safeRevProgress / 100) * circumference;
  const strokeDashoffsetDevices = circumference - (safeDevProgress / 100) * circumference;

  // --- HANDLERS ---
  const handleSaveGoal = async () => {
    const val = parseFloat(tempGoal);
    if (!isNaN(val) && val > 0) {
      if (!storeId || storeId === 'all') {
        alert("Selecciona una tienda específica para editar sus metas.");
        return;
      }
      setMonthlyGoal(val);
      setIsEditingGoal(false);

      const { error } = await supabase.from('monthly_goals').upsert({
        month: selectedMonth,
        revenue_goal: val,
        devices_goal: devicesGoal,
        store_id: storeId
      }, { onConflict: 'month,store_id' });

      if (error) alert("Error al guardar meta: " + error.message);
    }
  };

  const handleSaveDevicesGoal = async () => {
    const val = parseInt(tempDevicesGoal);
    if (!isNaN(val) && val > 0) {
      if (!storeId || storeId === 'all') {
        alert("Selecciona una tienda específica para editar sus metas.");
        return;
      }
      setDevicesGoal(val);
      setIsEditingDevices(false);

      const { error } = await supabase.from('monthly_goals').upsert({
        month: selectedMonth,
        revenue_goal: monthlyGoal,
        devices_goal: val,
        store_id: storeId
      }, { onConflict: 'month,store_id' });

      if (error) alert("Error al guardar meta: " + error.message);
    }
  };

  const handleDownloadReport = async () => {
    const reportBtn = document.getElementById('report-download-btn');
    if (reportBtn) reportBtn.style.display = 'none';

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let currentY = margin;

      // 1. Professional Header
      pdf.setFillColor(15, 23, 42); // slate-900 (Header)
      pdf.rect(0, 0, pageWidth, 40, 'F');
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(24);
      pdf.setTextColor(255, 255, 255);
      pdf.text('REPORTE DE VENTAS', margin, 25);
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`PERÍODO: ${selectedMonth}`, margin, 33);
      pdf.text(`TOTAL NETO: $${currentMonthNet.toLocaleString('es-MX')}`, pageWidth - margin - 60, 33);
      
      currentY = 50;

      // 2. Summary Stats Section (Text instead of screenshots for better quality)
      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Métricas Principales', margin, currentY);
      currentY += 10;
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      const averageTicket = currentMonthCount > 0 ? currentMonthRevenue / currentMonthCount : 0;
      
      // Categorized and Ordered Stats
      const stats = [
        `Venta Neta (Sin IVA): $${currentMonthNet.toLocaleString('es-MX')}`,
        `Equipos Vendidos: ${currentMonthCount} unidades`,
        `Meta Mensual Venta: $${monthlyGoal.toLocaleString('es-MX')}`,
        `Meta Mensual Equipos: ${devicesGoal} unidades`,
        `Cumplimiento Meta: ${revenueProgress.toFixed(1)}%`,
        `Ticket Promedio: $${averageTicket.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Venta Bruta (Con IVA): $${currentMonthRevenue.toLocaleString('es-MX')}`,
        `Marca Líder del Mes: ${[...brandData].sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}`
      ];
      
      // Side-by-side rendering (related items are next to each other)
      const col1 = [stats[0], stats[2], stats[4], stats[6]]; // Revenue related
      const col2 = [stats[1], stats[3], stats[5], stats[7]]; // Volume/Efficiency/Trends
      
      col1.forEach((stat, i) => {
        pdf.text(stat, margin, currentY);
        if (col2[i]) {
          pdf.text(col2[i], margin + 90, currentY);
        }
        currentY += 7;
      });
      currentY += 10;

      // Helper to add element as high-quality image
      const addContainerToPdf = async (elementId: string, title: string) => {
        const element = document.getElementById(elementId);
        if (!element) return;

        // --- FIX FOR CUTOFF BRANDS/SCROLL ---
        // Save original styles
        const originalStyles = {
          maxHeight: element.style.maxHeight,
          overflow: element.style.overflow,
          width: element.style.width,
          position: element.style.position,
          backgroundColor: element.style.backgroundColor
        };

        // Temporarily expand to full height for capture
        element.style.maxHeight = 'none';
        element.style.overflow = 'visible';
        
        // Force background for dark cards
        if (elementId.includes('goal-card')) {
          element.style.backgroundColor = '#0f172a'; // slate-900
        } else {
          element.style.backgroundColor = '#ffffff';
        }
        const scrollables = element.querySelectorAll('.overflow-y-auto, .custom-scrollbar');
        scrollables.forEach(s => {
          (s as HTMLElement).style.maxHeight = 'none';
          (s as HTMLElement).style.overflow = 'visible';
          (s as HTMLElement).style.height = 'auto'; // Force height auto
        });

        const canvas = await html2canvas(element, {
          scale: 3, // Even higher quality
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        });

        // Restore original styles
        element.style.maxHeight = originalStyles.maxHeight;
        element.style.overflow = originalStyles.overflow;
        scrollables.forEach(s => {
          (s as HTMLElement).style.maxHeight = '250px'; // Matching original Dashboard max-h
          (s as HTMLElement).style.overflow = 'auto';
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - (margin * 2);
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Check if we need a new page
        if (currentY + imgHeight + 15 > pageHeight) {
          pdf.addPage();
          currentY = margin + 10;
        }

        // Draw Section Title
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(71, 85, 105); // slate-600
        pdf.text(title.toUpperCase(), margin, currentY);
        currentY += 5;

        // Draw line separator
        pdf.setDrawColor(226, 232, 240); // slate-200
        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 5;

        pdf.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 15;
      };

      // Page 1: Goals
      await addContainerToPdf('revenue-goal-card', 'Cumplimiento de Meta de Ingresos');
      await addContainerToPdf('devices-goal-card', 'Meta de Equipos (Unidades)');

      // Page 2: Brand Distribution
      pdf.addPage();
      currentY = margin + 10;
      await addContainerToPdf('brand-distribution-monthly-card', 'Distribución de Unidades por Marca');

      // Page 3: Brand Revenue
      pdf.addPage();
      currentY = margin + 10;
      await addContainerToPdf('brand-revenue-monthly-card', 'Ingresos Netos por Marca');

      pdf.save(`Reporte_Ventas_Coppel_${selectedMonth}.pdf`);
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("Error al generar el PDF. Verifica que las gráficas estén visibles en pantalla.");
    } finally {
      if (reportBtn) reportBtn.style.display = 'flex';
    }
  };

  return (
    <div className="space-y-6">
      {/* PERSONALIZED WELCOME BANNER */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 overflow-hidden relative group transition-all hover:bg-slate-50">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700"></div>
        <div className="relative z-10 flex items-center gap-5">
           <div className="p-4 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-lg shadow-blue-200">
             <Smartphone className="w-8 h-8 text-white" />
           </div>
           <div>
             <h2 className="text-2xl font-black text-slate-800 tracking-tight">Bienvenido a {storeName || 'Tu Tienda'}</h2>
             <p className="text-slate-500 font-medium text-sm">Gestiona ventas, metas y revisa el rendimiento operativo.</p>
           </div>
        </div>
      </div>

      {role === 'admin' && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <label htmlFor="month-select" className="text-sm font-bold text-slate-500 uppercase tracking-wider">Período:</label>
            <input
              id="month-select"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
            />
          </div>
          
          <button
            id="report-download-btn"
            onClick={handleDownloadReport}
            className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-slate-800 transition-all w-full sm:w-auto justify-center"
          >
            <FileDown className="w-5 h-5" />
            Descargar Reporte PDF ({selectedMonth})
          </button>
        </div>
      )}


      {/* SUCCESS NOTIFICATION BANNER (Unified) */}
      {(isRevenueGoalMet || isDevicesGoalMet) && (
        <div className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 text-white p-6 rounded-2xl shadow-lg transform transition-all hover:scale-[1.01] animate-in fade-in slide-in-from-top-4 duration-700 relative overflow-hidden border border-orange-400/50">
          <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
            <PartyPopper className="w-40 h-40 transform rotate-12" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
            <div className="bg-white/20 p-4 rounded-full backdrop-blur-sm shadow-inner shrink-0">
              <Trophy className="w-12 h-12 text-yellow-100" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold mb-1 drop-shadow-sm">¡Objetivo Cumplido! 🎉</h2>
              <p className="text-orange-50 font-medium text-lg leading-snug">
                {isRevenueGoalMet && isDevicesGoalMet
                  ? "¡Increíble! Has superado AMBAS metas mensuales. Tu rendimiento es excepcional."
                  : isRevenueGoalMet
                    ? `Has superado tu meta de ingresos de $${monthlyGoal.toLocaleString('es-MX')}.`
                    : `Has vendido más de ${devicesGoal} equipos este mes.`
                }
              </p>
            </div>
          </div>
        </div>
      )}
      {/* GOALS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* CARD 1: REVENUE GOAL */}
        <div id="revenue-goal-card" className="bg-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden text-white group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600 rounded-full blur-[80px] opacity-20 group-hover:opacity-30 transition-opacity"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-600 rounded-full blur-[80px] opacity-10 group-hover:opacity-20 transition-opacity"></div>

          <div className="relative z-10 flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
                <Target className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Meta de Ingresos</h2>
                <p className="text-xs text-slate-400 font-medium">Venta neta Mensual (Sin IVA)</p>
              </div>
            </div>
            {role === 'admin' && !isEditingGoal && (
              <button onClick={() => { setTempGoal(monthlyGoal.toString()); setIsEditingGoal(true); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"><Edit2 className="w-4 h-4" /></button>
            )}
          </div>

          <div className="relative z-10 flex items-end justify-between gap-4">
            <div className="space-y-2 flex-1">
              {isEditingGoal ? (
                <div className="flex items-center gap-2">
                  <input type="number" value={tempGoal} onChange={(e) => setTempGoal(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white font-bold p-2 outline-none" autoFocus />
                  <button onClick={handleSaveGoal} className="p-2 bg-blue-600 rounded-lg"><Check className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <span className="text-4xl font-black text-white leading-none" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                     ${currentMonthNet.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                   </span>
                  <span className="text-xs text-slate-400 font-bold tracking-wide">Meta: ${monthlyGoal.toLocaleString('es-MX')}</span>
                </div>
              )}

              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-3">
                <div className={`h-full rounded-full transition-all duration-1000 ${isRevenueGoalMet ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`} style={{ width: `${Math.min(revenueProgress, 100)}%` }}></div>
              </div>
              <p className="text-xs text-slate-400 pt-1">{revenueRemaining > 0 ? `Faltan $${revenueRemaining.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : '¡Meta Superada!'}</p>
            </div>

            {/* Circular Indicator */}
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeDashoffset={isNaN(strokeDashoffsetRevenue) ? circumference : strokeDashoffsetRevenue} strokeLinecap="round" className={`transition-all duration-1000 ${isRevenueGoalMet ? 'text-green-500' : 'text-blue-500'}`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{isFinite(revenueProgress) ? revenueProgress.toFixed(0) : 0}%</div>
            </div>
          </div>
        </div>

        {/* CARD 2: DEVICES GOAL */}
        <div id="devices-goal-card" className="bg-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden text-white group flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-600 rounded-full blur-[80px] opacity-20 group-hover:opacity-30 transition-opacity"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-600 rounded-full blur-[80px] opacity-10 group-hover:opacity-20 transition-opacity"></div>

          <div className="relative z-10 flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
                <Smartphone className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Meta de Equipos</h2>
                <p className="text-xs text-slate-400 font-medium">Unidades vendidas Mensual</p>
              </div>
            </div>
            {role === 'admin' && !isEditingDevices && (
              <button onClick={() => { setTempDevicesGoal(devicesGoal.toString()); setIsEditingDevices(true); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"><Edit2 className="w-4 h-4" /></button>
            )}
          </div>

          <div className="relative z-10 flex items-end justify-between gap-4">
            <div className="space-y-2 flex-1">
              {isEditingDevices ? (
                <div className="flex items-center gap-2">
                  <input type="number" value={tempDevicesGoal} onChange={(e) => setTempDevicesGoal(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white font-bold p-2 outline-none" autoFocus />
                  <button onClick={handleSaveDevicesGoal} className="p-2 bg-emerald-600 rounded-lg"><Check className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <span className="text-4xl font-black text-white leading-none" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                     {currentMonthCount} <span className="text-lg font-medium text-slate-400">unidades</span>
                   </span>
                  <span className="text-xs text-slate-400 font-bold tracking-wide">Meta: {devicesGoal} equipos</span>
                </div>
              )}

              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-3">
                <div className={`h-full rounded-full transition-all duration-1000 ${isDevicesGoalMet ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-500'}`} style={{ width: `${Math.min(devicesProgress, 100)}%` }}></div>
              </div>
              <p className="text-xs text-slate-400 pt-1">{devicesRemaining > 0 ? `Faltan ${devicesRemaining} equipos` : '¡Meta Superada!'}</p>
            </div>

            {/* Circular Indicator */}
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeDashoffset={isNaN(strokeDashoffsetDevices) ? circumference : strokeDashoffsetDevices} strokeLinecap="round" className={`transition-all duration-1000 ${isDevicesGoalMet ? 'text-green-500' : 'text-emerald-500'}`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{isFinite(devicesProgress) ? devicesProgress.toFixed(0) : 0}%</div>
            </div>
          </div>
        </div>

      </div>

      {/* --- TARGET PER DAY CARD (NEW) --- */}
      <div className="bg-gradient-to-r from-indigo-900 to-blue-900 rounded-2xl p-6 shadow-xl border border-blue-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 p-4 opacity-5">
          <Trophy className="w-48 h-48" />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-xl backdrop-blur-sm border border-blue-400/30">
              <TrendingUp className="w-8 h-8 text-blue-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Objetivo Diario Dinámico</h3>
              <p className="text-blue-200 text-sm max-w-md">
                Calculado en tiempo real según lo que falta para cumplir la meta de ingresos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              {(() => {
                const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                const currentDay = new Date().getDate();
                const remainingDays = Math.max(daysInMonth - currentDay, 0); // Days remaining AFTER today? Or including today if sale not made? Usually "remaining working days". Let's assume inclusive of today if early, or simply days left in month logic.
                // Precise logic: "How much to sell PER REMAINING DAY" implies we divide gap by remaining days.
                // If today is 15th, and month has 30 days. 15 days passed. 15 days remain (16,17...30).
                // Actually usually includes today. Let's use (daysInMonth - currentDay + 1) if we want to include today as a chance.
                // But simpler: "Days Left" = daysInMonth - currentDay.
                // If 0 days left, avoid division by zero.

                const safeRemainingDays = Math.max(daysInMonth - currentDay, 1);
                const netGap = Math.max(monthlyGoal - currentMonthNet, 0);
                const dailyTarget = netGap / safeRemainingDays;

                if (netGap <= 0) {
                  return (
                    <>
                      <p className="text-3xl font-extrabold text-green-400">¡MENTA CUMPLIDA!</p>
                      <p className="text-xs text-green-200">Ya no necesitas vender más para llegar al mínimo.</p>
                    </>
                  );
                }

                return (
                  <>
                    <p className="text-3xl font-extrabold text-white">${dailyTarget.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                    <p className="text-xs text-blue-200">Venta diaria necesaria (Sin IVA) x {safeRemainingDays} días</p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-5 gap-4 md:gap-6">

        {/* TODAY Stats */}
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500 rounded-full blur-[40px] opacity-20"></div>
          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3 relative z-10">
            <div className="p-1.5 md:p-2 bg-orange-50 rounded-lg">
              <PartyPopper className="w-4 h-4 md:w-5 md:h-5 text-orange-600" />
            </div>
            <p className="text-slate-500 text-[10px] md:text-sm font-bold truncate">Ventas Hoy</p>
          </div>
          <h3 className="text-xl md:text-3xl font-extrabold text-slate-800 relative z-10">{todayCount}</h3>
          <p className="text-[9px] md:text-xs text-orange-500 font-medium mt-0.5 md:mt-1 relative z-10 truncate">
            {todayCount > 0 ? "¡Sigue así!" : "Sin ventas aún"}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
            <div className="p-1.5 md:p-2 bg-indigo-50 rounded-lg">
              <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-indigo-600" />
            </div>
            <p className="text-slate-500 text-[10px] md:text-sm font-bold truncate">Ingreso Bruto</p>
          </div>
          <h3 className="text-lg md:text-2xl font-bold text-slate-800 truncate">${currentMonthRevenue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</h3>
          <p className="text-[9px] md:text-xs text-slate-400 mt-0.5 md:mt-1">IVA Incluido</p>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
            <div className="p-1.5 md:p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
            </div>
            <p className="text-slate-500 text-[10px] md:text-sm font-bold truncate">Equipos (Mes)</p>
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-800">{currentMonthCount}</h3>
          <p className="text-[9px] md:text-xs text-slate-400 mt-0.5 md:mt-1">Móviles</p>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
            <div className="p-1.5 md:p-2 bg-emerald-50 rounded-lg">
              <Trophy className="w-4 h-4 md:w-5 md:h-5 text-emerald-600" />
            </div>
            <p className="text-slate-500 text-[10px] md:text-sm font-bold truncate">Marca Líder</p>
          </div>
          <h3 className="text-lg md:text-2xl font-bold text-slate-800 truncate">
            {[...brandData].sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}
          </h3>
          <p className="text-[9px] md:text-xs text-slate-400 mt-0.5 md:mt-1">Volumen</p>
        </div>

        {/* TICKET PROMEDIO CARD */}
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute bottom-0 right-0 w-16 h-16 bg-purple-500 rounded-full blur-[40px] opacity-10"></div>
          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
            <div className="p-1.5 md:p-2 bg-purple-50 rounded-lg">
              <Calculator className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
            </div>
            <p className="text-slate-500 text-[10px] md:text-sm font-bold truncate">Ticket Prom.</p>
          </div>
          <h3 className="text-lg md:text-2xl font-bold text-slate-800 truncate">
            ${(currentMonthCount > 0 ? (currentMonthRevenue / currentMonthCount) : 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
          </h3>
          <p className="text-[9px] md:text-xs text-slate-400 mt-0.5 md:mt-1">Promedio</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* 1. TODAY'S Brand Distribution (Moved to Top) */}
        {role === 'admin' && (
          <div id="brand-distribution-today-card" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px] flex flex-col xl:col-span-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <PartyPopper className="w-32 h-32 text-orange-500 transform rotate-12" />
            </div>
            <div className="flex items-start justify-between mb-4 relative z-10 w-full">
              <div className="flex flex-col">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0"></div>
                  Distribución Hoy
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-medium ml-4 mt-0.5">
                  ({todayCount} equipos)
                </p>
              </div>
              <span className="text-[10px] sm:text-xs font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-full shrink-0 mt-0.5">
                Tiempo Real
              </span>
            </div>

            {todayCount > 0 ? (
              <div className="flex flex-col sm:flex-row flex-1 gap-8 items-center relative z-10 bg-white">
                <div className="w-full sm:w-1/3 h-[200px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%" key={`today-chart-${storeId}-${selectedMonth}`}>
                    <PieChart>
                      <Pie
                        data={brandDataToday}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        labelLine={false}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                          if (percent < 0.05) return null;
                          const RADIAN = Math.PI / 180;
                          const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
                              {brandDataToday[index]?.value || 0}
                            </text>
                          );
                        }}
                      >
                        {brandDataToday.map((entry, index) => (
                          <Cell key={`cell-t-${index}`} fill={entry.color} style={{ outline: 'none' }} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number, name: string, props: any) => [`${value} unidades`, props.payload.name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full">
                  {[...brandDataToday].sort((a, b) => b.value - a.value).map(item => (
                    <div key={item.name} className="flex flex-col p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                      <div className="flex items-center gap-3 mb-2">
                        {item.logoUrl ? (
                          <div className="w-10 h-10 flex items-center justify-center bg-white rounded-full p-1.5 shadow-sm border border-slate-100 shrink-0">
                            <img src={item.logoUrl} alt={item.name} className="w-full h-full object-contain" />
                          </div>
                        ) : (
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        )}
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider truncate break-all">{item.name}</span>
                      </div>
                      <div className="flex items-end justify-between pl-1">
                        <span className="text-xl font-extrabold text-slate-800 leading-none">{item.value}</span>
                        <span className="text-xs font-medium text-slate-400">
                          {Math.round((item.value / todayCount) * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200 m-4">
                <PartyPopper className="w-10 h-10 mb-2 opacity-50" />
                No hay ventas registradas hoy
              </div>
            )}
          </div>
        )}

        {/* 2. Brand Distribution (Monthly) */}
        {role === 'admin' && (
          <div id="brand-distribution-monthly-card" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-800">Marcas (Mes Actual)</h3>
              <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Por Unidades</span>
            </div>

            <div className="flex flex-col sm:flex-row flex-1 gap-6 items-center">
              <div className="w-full sm:w-1/2 h-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%" key={`monthly-dist-${storeId}-${selectedMonth}`}>
                  <PieChart>
                    <Pie
                      data={brandData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                      labelLine={false}
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                        if (percent < 0.08) return null;
                        const RADIAN = Math.PI / 180;
                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
                            {brandData[index]?.value || 0}
                          </text>
                        );
                      }}
                    >
                      {brandData.map((entry, index) => (
                        <Cell key={`cell-g-${index}`} fill={entry.color} style={{ outline: 'none' }} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number, name: string, props: any) => [`${value} unidades`, props.payload.name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto max-h-[250px] w-full pr-2 custom-scrollbar">
                {[...brandData].sort((a, b) => b.value - a.value).map(item => (
                  <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100/50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-[1px]" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-semibold text-slate-700">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{item.value}</span>
                      <span className="text-xs text-slate-400 w-9 text-right">
                        {currentMonthCount > 0 ? Math.round((item.value / currentMonthCount) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Brand Revenue (Global Amount) */}
        {role === 'admin' && (
          <div id="brand-revenue-monthly-card" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-800">Ingresos por Marca</h3>
              <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">Por Dinero</span>
            </div>

            <div className="flex flex-col sm:flex-row flex-1 gap-6 items-center">
              <div className="w-full sm:w-1/2 h-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%" key={`monthly-revenue-${storeId}-${selectedMonth}`}>
                  <PieChart>
                    <Pie
                      data={brandData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="revenue"
                      labelLine={false}
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                        if (percent < 0.1) return null;
                        const RADIAN = Math.PI / 180;
                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold">
                            {brandData[index]?.value || 0}
                          </text>
                        );
                      }}
                    >
                      {brandData.map((entry, index) => (
                        <Cell key={`cell-r-${index}`} fill={entry.color} style={{ outline: 'none' }} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number, name: string, props: any) => [`$${value.toLocaleString('es-MX')}`, props.payload.name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto max-h-[250px] w-full pr-2 custom-scrollbar">
                {[...brandData].sort((a, b) => b.revenue - a.revenue).map(item => (
                  <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100/50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-[1px]" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-semibold text-slate-700">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">${(item.revenue / 1000).toFixed(1)}k</span>
                      <span className="text-xs text-slate-400 w-9 text-right">
                        {currentMonthRevenue > 0 ? Math.round((item.revenue / currentMonthRevenue) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}



        {/* 4. Timeline Bar Chart (Restored) */}
        <div id="revenue-chart-card" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[400px] xl:col-span-2">
          <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-6">Ingresos (Últimos 7 días)</h3>
          <ResponsiveContainer width="100%" height={300} key={`timeline-chart-${storeId}-${selectedMonth}`}>
            <ComposedChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickFormatter={(val) => val.slice(5)} // Show MM-DD
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number, name: string) => {
                  if (name === 'netAmount') return [`$${value.toFixed(2)}`, 'Sin IVA'];
                  return [`$${value}`, 'Total (Con IVA)'];
                }}
              />
              <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
              <Line type="monotone" dataKey="netAmount" stroke="#f97316" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div className="flex justify-center pt-8 pb-4 gap-6">
        <button
          onClick={async () => {
            if (!window.confirm("¿CORREGIR DUPLICADOS Y NORMALIZAR?\n\nEsto arreglará facturas como '#1053-1053...' para dejarlas limpias como '#1053-XXXXXX'.")) return;
            try {
              const { data: allSales, error } = await supabase.from('sales').select('id, invoice_number');
              if (error) throw error;
              let count = 0;
              for (const s of allSales) {
                let raw = (s.invoice_number || '').trim();

                // 1. Remove common separators (# and -) to get raw string
                raw = raw.replace(/[#-]/g, '');

                // 2. Recursively remove '1053' from start to strip usage like '10531053...'
                while (raw.startsWith('1053')) {
                  raw = raw.substring(4);
                }

                // 3. Construct strict format
                const finalInv = `#1053-${raw}`;

                if (s.invoice_number !== finalInv) {
                  await supabase.from('sales').update({ invoice_number: finalInv }).eq('id', s.id);
                  count++;
                }
              }
              alert(`Corrección completada. Se arreglaron ${count} facturas.`);
              window.location.reload();
            } catch (e: any) {
              alert("Error: " + e.message);
            }
          }}
          className="flex items-center gap-2 text-slate-400 hover:text-blue-600 transition-colors text-xs font-bold px-4 py-2 hover:bg-blue-50 rounded-lg group"
        >
          <Edit2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
          Normalizar Facturas (1053)
        </button>

        <button
          onClick={handleFactoryReset}
          className="flex items-center gap-2 text-slate-400 hover:text-red-600 transition-colors text-xs font-bold px-4 py-2 hover:bg-red-50 rounded-lg group"
        >
          <Trash2 className="w-4 h-4 group-hover:animate-pulse" />
          Restablecer Aplicación (Danger Zone)
        </button>
      </div>
    </div>
  );
};

export default Dashboard;