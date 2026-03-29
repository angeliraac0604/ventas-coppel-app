import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ComposedChart, Line } from 'recharts';
import { Target, Edit2, Check, TrendingUp, Trophy, PartyPopper, DollarSign, Smartphone, Trash2, AlertTriangle } from 'lucide-react';
import { Sale, Brand, DailyClose } from '../types';
import { BRAND_CONFIGS } from '../constants';
import { supabase } from '../services/supabaseClient';


interface DashboardProps {
  sales: Sale[];
  closings: DailyClose[];
  role?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ sales, closings, role }) => {


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

  const currentMonthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const { data, error } = await supabase
          .from('monthly_goals')
          .select('*')
          .eq('month', currentMonthPrefix)
          .single();

        if (data) {
          setMonthlyGoal(data.revenue_goal);
          setDevicesGoal(data.devices_goal);
        } else if (error && error.code !== 'PGRST116') {
          console.error("Error fetching goals", error);
        }
      } catch (err) {
        console.error("Fetch goals error", err);
      }
    };
    fetchGoals();
  }, [currentMonthPrefix]);


  // --- CALCULATIONS ---
  // 1. Historical Totals (Keep existing for bottom cards)
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.price, 0);
  const totalSalesCount = sales.length; // Renamed to avoid confusion

  // 2. Current Month Totals (For Goals)
  const todayDate = new Date();

  const currentMonthSales = sales.filter(s => s.date.startsWith(currentMonthPrefix));
  const currentMonthRevenue = currentMonthSales.reduce((sum, sale) => sum + sale.price, 0);
  const currentMonthCount = currentMonthSales.length;
  const currentMonthNet = currentMonthRevenue / 1.16;

  // Goals are implicitly applicable if fetched

  // Revenue Progress (Monthly)
  const revenueProgress = (currentMonthNet / monthlyGoal) * 100;
  const revenueRemaining = Math.max(monthlyGoal - currentMonthNet, 0);
  const isRevenueGoalMet = currentMonthNet >= monthlyGoal;

  // Devices Progress (Monthly)
  const devicesProgress = (currentMonthCount / devicesGoal) * 100;
  const devicesRemaining = Math.max(devicesGoal - currentMonthCount, 0);
  const isDevicesGoalMet = currentMonthCount >= devicesGoal;

  // Circular Chart Helpers
  // We use a viewBox of 0 0 100 100. Center is 50,50.
  // Radius 40 leaves 10 units of padding on each side for the stroke width.
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffsetRevenue = circumference - (Math.min(revenueProgress, 100) / 100) * circumference;
  const strokeDashoffsetDevices = circumference - (Math.min(devicesProgress, 100) / 100) * circumference;

  // --- HANDLERS ---
  // --- HANDLERS ---
  const handleSaveGoal = async () => {
    const val = parseFloat(tempGoal);
    if (!isNaN(val) && val > 0) {
      setMonthlyGoal(val);
      setIsEditingGoal(false);

      // Save to Supabase
      const { error } = await supabase.from('monthly_goals').upsert({
        month: currentMonthPrefix,
        revenue_goal: val,
        devices_goal: devicesGoal // Keep existing device goal
      }, { onConflict: 'month' });

      if (error) alert("Error al guardar meta: " + error.message);
    }
  };

  const handleSaveDevicesGoal = async () => {
    const val = parseInt(tempDevicesGoal);
    if (!isNaN(val) && val > 0) {
      setDevicesGoal(val);
      setIsEditingDevices(false);

      // Save to Supabase
      const { error } = await supabase.from('monthly_goals').upsert({
        month: currentMonthPrefix,
        revenue_goal: monthlyGoal, // Keep existing revenue goal
        devices_goal: val
      }, { onConflict: 'month' });

      if (error) alert("Error al guardar meta: " + error.message);
    }
  };

  // --- CHARTS DATA ---
  const brandData = Object.values(Brand).map(brand => {
    const brandSales = sales.filter(s => s.brand === brand && s.date.startsWith(currentMonthPrefix));
    const revenue = brandSales.reduce((sum, s) => sum + s.price, 0);
    return {
      name: BRAND_CONFIGS[brand].label,
      value: brandSales.length,
      revenue: revenue,
      color: BRAND_CONFIGS[brand].hex,
      logoUrl: BRAND_CONFIGS[brand].logoUrl
    };
  }).filter(item => item.value > 0);

  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const todayCount = sales.filter(s => s.date === todayStr).length;

  const brandDataToday = Object.values(Brand).map(brand => {
    const bSales = sales.filter(s => s.brand === brand && s.date === todayStr);
    return {
      name: BRAND_CONFIGS[brand].label,
      value: bSales.length,
      color: BRAND_CONFIGS[brand].hex,
      logoUrl: BRAND_CONFIGS[brand].logoUrl
    };
  }).filter(item => item.value > 0);

  const timelineData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dailySales = sales.filter(s => s.date === dateStr);
    return {
      date: dateStr,
      amount: dailySales.reduce((sum, s) => sum + s.price, 0),
      netAmount: dailySales.reduce((sum, s) => sum + s.price, 0) / 1.16,
      count: dailySales.length
    };
  });

  return (
    <div className="space-y-6">


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
        <div className="bg-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden text-white group flex flex-col justify-between">
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
                <div className="flex flex-col">
                  <span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300">
                    ${currentMonthNet.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs text-slate-400">Meta: ${monthlyGoal.toLocaleString('es-MX')}</span>
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
                <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffsetRevenue} strokeLinecap="round" className={`transition-all duration-1000 ${isRevenueGoalMet ? 'text-green-500' : 'text-blue-500'}`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{revenueProgress.toFixed(0)}%</div>
            </div>
          </div>
        </div>

        {/* CARD 2: DEVICES GOAL */}
        <div className="bg-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden text-white group flex flex-col justify-between">
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
                <div className="flex flex-col">
                  <span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300">
                    {currentMonthCount} <span className="text-lg font-medium text-slate-400">unidades</span>
                  </span>
                  <span className="text-xs text-slate-400">Meta: {devicesGoal} equipos</span>
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
                <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffsetDevices} strokeLinecap="round" className={`transition-all duration-1000 ${isDevicesGoalMet ? 'text-green-500' : 'text-emerald-500'}`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{devicesProgress.toFixed(0)}%</div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* TODAY Stats */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500 rounded-full blur-[40px] opacity-20"></div>
          <div className="flex items-center gap-3 mb-3 relative z-10">
            <div className="p-2 bg-orange-50 rounded-lg">
              <PartyPopper className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-slate-500 text-sm font-bold">Ventas de Hoy</p>
          </div>
          <h3 className="text-3xl font-extrabold text-slate-800 relative z-10">{todayCount}</h3>
          <p className="text-xs text-orange-500 font-medium mt-1 relative z-10">
            {todayCount > 0 ? "¡Sigue así!" : "Sin ventas aún"}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-slate-500 text-sm font-bold">Venta Bruta (Mes Actual)</p>
          </div>
          <h3 className="text-2xl font-bold text-slate-800">${currentMonthRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</h3>
          <p className="text-xs text-slate-400 mt-1">IVA Incluido</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-slate-500 text-sm font-bold">Equipos (Mes Actual)</p>
          </div>
          <h3 className="text-2xl font-bold text-slate-800">{currentMonthCount}</h3>
          <p className="text-xs text-slate-400 mt-1">Dispositivos móviles</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Trophy className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-slate-500 text-sm font-bold">Marca Líder (Mes Actual)</p>
          </div>
          <h3 className="text-2xl font-bold text-slate-800 truncate">
            {[...brandData].sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Mayor volumen de ventas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* 1. TODAY'S Brand Distribution (Moved to Top) */}
        {role === 'admin' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px] flex flex-col xl:col-span-2 relative overflow-hidden">
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
                  <ResponsiveContainer width="100%" height="100%">
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
                              {brandDataToday[index].value}
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
                        formatter={(value: number, name: string, props: any) => [`${value} un.`, props.payload.name]}
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
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-800">Marcas (Mes Actual)</h3>
              <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Por Unidades</span>
            </div>

            <div className="flex flex-col sm:flex-row flex-1 gap-6 items-center">
              <div className="w-full sm:w-1/2 h-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
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
                            {brandData[index].value}
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
                      formatter={(value: number, name: string, props: any) => [`${value} un.`, props.payload.name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto max-h-[250px] w-full pr-2 custom-scrollbar">
                {[...brandData].sort((a, b) => b.value - a.value).map(item => (
                  <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100/50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
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
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[350px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-800">Ingresos por Marca</h3>
              <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">Por Dinero</span>
            </div>

            <div className="flex flex-col sm:flex-row flex-1 gap-6 items-center">
              <div className="w-full sm:w-1/2 h-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
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
                            {brandData[index].value}
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
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
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
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[400px] xl:col-span-2">
          <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-6">Ingresos (Últimos 7 días)</h3>
          <ResponsiveContainer width="100%" height={300}>
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