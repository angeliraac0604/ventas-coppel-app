import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { Building, Target, TrendingUp, Users, Smartphone, DollarSign, Calendar, Filter, ChevronRight, Award, AlertCircle, Loader2, Save, ShoppingBag } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Store, UserProfile, Brand } from '../types';
import { BRAND_CONFIGS } from '../constants';

interface PerformanceData {
  sellerName: string;
  count: number;
  revenue: number;
}

interface SupervisionPanelProps {
  stores: Store[];
  selectedStoreId: string;
  userProfile: UserProfile;
}

const SupervisionPanel: React.FC<SupervisionPanelProps> = ({ stores, selectedStoreId, userProfile }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Goal Form State
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [revenueGoal, setRevenueGoal] = useState('');
  const [devicesGoal, setDevicesGoal] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: storesData } = await supabase.from('stores').select('*').order('name');
      const { data: profilesData } = await supabase.from('profiles').select('*');
      
      let salesQuery = supabase.from('sales')
        .select('*')
        .gte('date', `${targetMonth}-01`)
        .lte('date', `${targetMonth}-31`)
        .order('date', { ascending: false })
        .range(0, 1999);

      if (selectedStoreId !== 'all') {
        salesQuery = salesQuery.eq('store_id', selectedStoreId);
      } else if (userProfile.role === 'supervisor' || userProfile.role === 'viewer') {
        if (userProfile.assignedStores && userProfile.assignedStores.length > 0) {
          salesQuery = salesQuery.in('store_id', userProfile.assignedStores);
        } else if (userProfile.storeId) {
          salesQuery = salesQuery.eq('store_id', userProfile.storeId);
        }
      }
        
      const { data: salesData } = await salesQuery;
      const { data: goalsData } = await supabase.from('monthly_goals').select('*');

      if (profilesData) setProfiles(profilesData);
      if (salesData) setSales(salesData || []);
      if (goalsData) setGoals(goalsData);

      // Load initial goal values for editing
      const editingGoal = (goalsData || []).find(g => 
        g.month === targetMonth && 
        (selectedStoreId === 'all' ? !g.store_id : g.store_id === selectedStoreId)
      );
      
      if (editingGoal) {
        setRevenueGoal(editingGoal.revenue_goal?.toString() || '');
        setDevicesGoal(editingGoal.devices_goal?.toString() || '');
      } else {
        setRevenueGoal('');
        setDevicesGoal('');
      }

    } catch (err) {
      console.error('Error loading supervision data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedStoreId, targetMonth]);

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGoal(true);
    try {
      const { error } = await supabase.from('monthly_goals').upsert({
        store_id: selectedStoreId === 'all' ? null : selectedStoreId,
        month: targetMonth,
        revenue_goal: parseFloat(revenueGoal) || 0,
        devices_goal: parseInt(devicesGoal) || 0
      }, { onConflict: 'store_id, month' });

      if (error) throw error;
      alert('Meta actualizada correctamente');
      fetchData();
    } catch (err: any) {
      alert('Error al guardar meta: ' + err.message);
    } finally {
      setIsSavingGoal(false);
    }
  };

  // Processing Data
  const currentMonthSales = sales.filter(s => s.date.startsWith(targetMonth));
  const filteredSales = selectedStoreId === 'all' ? currentMonthSales : currentMonthSales.filter(s => s.store_id === selectedStoreId);
  
  const totalRevenue = filteredSales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
  const totalNetRevenue = totalRevenue / 1.16;
  const totalDevices = filteredSales.length;

  // Seller Performance
  const sellerPerformance: PerformanceData[] = profiles
    .filter(p => selectedStoreId === 'all' || p.store_id === selectedStoreId)
    .map(p => {
      const sellerSales = filteredSales.filter(s => s.created_by === p.id);
      return {
        sellerName: p.full_name || p.email?.split('@')[0] || 'Vendedor',
        count: sellerSales.length,
        revenue: sellerSales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0)
      };
    })
    .filter(sp => sp.count > 0 || selectedStoreId !== 'all')
    .sort((a, b) => b.revenue - a.revenue);

  // Brand Performance
  const brandPerformance = Object.values(Brand).map(brand => {
    const brandSales = filteredSales.filter(s => s.brand === brand);
    const rev = brandSales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
    const conf = brand === Brand.REALME 
      ? { label: 'Realme', hex: '#FFC700', logoUrl: 'https://cdn.simpleicons.org/realme/000000' } 
      : (BRAND_CONFIGS[brand] || { label: 'Otro', hex: '#64748b' });
    return {
      name: conf.label,
      brand: brand,
      count: brandSales.length,
      revenue: rev,
      netRevenue: rev / 1.16,
      color: conf.hex,
      logoUrl: (conf as any).logoUrl
    };
  }).filter(b => b.count > 0).sort((a, b) => b.count - a.count);

  // Process Goals: If 'all' selected, sum goals of all stores.
  const relevantGoals = goals.filter(g => g.month === targetMonth);
  const currentGoal = selectedStoreId === 'all' 
    ? {
        revenue_goal: relevantGoals.reduce((sum, g) => sum + Number(g.revenue_goal), 0),
        devices_goal: relevantGoals.reduce((sum, g) => sum + Number(g.devices_goal), 0)
      }
    : goals.find(g => g.month === targetMonth && g.store_id === selectedStoreId);
  
  const revenueGoalNum = Number(currentGoal?.revenue_goal) || 100000;
  const devicesGoalNum = Number(currentGoal?.devices_goal) || 50;
  
  const revenueProgress = (revenueGoalNum > 0) ? (totalNetRevenue / revenueGoalNum) * 100 : 0;
  const devicesProgress = (devicesGoalNum > 0) ? (totalDevices / devicesGoalNum) * 100 : 0;

  // Daily Trend Data
  const daysInMonth = new Date(parseInt(targetMonth.split('-')[0]), parseInt(targetMonth.split('-')[1]), 0).getDate();
  const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = (i + 1).toString().padStart(2, '0');
    const fullDate = `${targetMonth}-${day}`;
    const daySales = filteredSales.filter(s => s.date === fullDate);
    return {
      day: (i + 1).toString(),
      revenue: daySales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0),
      devices: daySales.length
    };
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando Rendimiento...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* FILTER BAR */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
           <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100">
             <TrendingUp className="w-7 h-7 text-white" />
           </div>
           <div>
             <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">Rendimiento Operativo</h2>
             <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Análisis de ventas y metas mensuales</p>
           </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
           <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <input 
                type="month" 
                value={targetMonth} 
                onChange={(e) => setTargetMonth(e.target.value)}
                className="bg-transparent text-sm font-black text-slate-700 outline-none cursor-pointer"
              />
           </div>

           {/* Internal store select removed as it's now controlled by the global header */}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* STATS CARDS & GOALS */}
        <div className="lg:col-span-2 space-y-8">
           
           {/* SUMMARY MINI GRID */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                 <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                       <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                          <DollarSign className="w-6 h-6" />
                       </div>
                     <span className="text-[10px] font-black uppercase text-slate-400">Ventas Netas (Sin IVA)</span>
                    </div>
                    <div className="text-4xl font-black text-slate-800 tracking-tighter mb-2">
                       ${totalNetRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${Math.min(revenueProgress, 100)}%` }}></div>
                       </div>
                       <span className="text-[10px] font-black text-indigo-600">{revenueProgress.toFixed(0)}%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-4">Meta: ${revenueGoalNum.toLocaleString()}</p>
                 </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                 <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                       <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                          <Smartphone className="w-6 h-6" />
                       </div>
                       <span className="text-[10px] font-black uppercase text-slate-400">Celulares (Unid)</span>
                    </div>
                    <div className="text-4xl font-black text-slate-800 tracking-tighter mb-2">
                       {totalDevices}
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.min(devicesProgress, 100)}%` }}></div>
                       </div>
                       <span className="text-[10px] font-black text-emerald-600">{devicesProgress.toFixed(0)}%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-4">Meta: {currentGoal?.devices_goal || 0} equipos</p>
                 </div>
              </div>
           </div>

           {/* MAIN CHARTS SECTION */}
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Tendencia Diaria</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase">Ventas por día en el mes seleccionado</p>
                 </div>
                 <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="h-[300px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData}>
                       <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                             <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                       <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                       <YAxis hide />
                       <Tooltip 
                         contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 'bold' }}
                         cursor={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '5 5' }}
                       />
                       <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                    </AreaChart>
                 </ResponsiveContainer>
              </div>
           </div>

           {/* BRAND DISTRIBUTION CHART */}
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Distribución por Marcas</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase">Preferencia de compra este mes</p>
                 </div>
                 <ShoppingBag className="w-5 h-5 text-indigo-600" />
              </div>
              
              <div className="flex flex-col xl:flex-row items-center gap-8">
                 <div className="h-[250px] w-full xl:w-1/2">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie
                         data={brandPerformance}
                         cx="50%"
                         cy="50%"
                         innerRadius={60}
                         outerRadius={90}
                         paddingAngle={5}
                         dataKey="count"
                       >
                         {brandPerformance.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                         ))}
                       </Pie>
                       <Tooltip 
                         contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                       />
                     </PieChart>
                   </ResponsiveContainer>
                 </div>

                 <div className="flex-1 w-full grid grid-cols-2 min-[1600px]:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {brandPerformance.map((item) => (
                      <div key={item.name} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100/50 hover:bg-white hover:shadow-md transition-all group">
                        {item.logoUrl ? (
                          <img src={item.logoUrl} alt={item.name} className="w-7 h-7 object-contain transition-all" />
                        ) : (
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        )}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <p className="text-[10px] font-black text-slate-800 uppercase mb-1 tracking-tight truncate">{item.name}</p>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-black text-indigo-600 leading-none">
                              {item.count} {item.count === 1 ? 'Equipo' : 'Equipos'}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                              {totalDevices > 0 ? ((item.count / totalDevices) * 100).toFixed(1) : 0}% del total
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
              </div>
           </div>
        </div>

        {/* SIDEBAR: GOAL SETTING & RANKING */}
        <div className="space-y-8">
           
           {/* GOAL ASSIGNMENT FORM */}
           {userProfile.role === 'admin' && (
             <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/20 rounded-full -mr-12 -mt-12"></div>
                <div className="relative z-10">
                   <div className="flex items-center gap-3 mb-6">
                      <Target className="w-5 h-5 text-indigo-400" />
                      <h3 className="text-base font-black uppercase tracking-tight">Asignar Metas</h3>
                   </div>
                   <form onSubmit={handleSaveGoal} className="space-y-5">
                      <div>
                         <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Presupuesto ($)</label>
                         <input 
                           type="number" 
                           value={revenueGoal} 
                           onChange={(e) => setRevenueGoal(e.target.value)}
                           placeholder="0.00"
                           className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-black text-white outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all" 
                         />
                      </div>
                      <div>
                         <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">Equipos (Qty)</label>
                         <input 
                           type="number" 
                           value={devicesGoal} 
                           onChange={(e) => setDevicesGoal(e.target.value)}
                           placeholder="0"
                           className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-black text-white outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all" 
                         />
                      </div>
                      <button 
                        type="submit" 
                        disabled={isSavingGoal}
                        className="w-full bg-indigo-600 hover:bg-white hover:text-indigo-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-900/40 text-[10px] uppercase tracking-widest mt-2 flex items-center justify-center gap-2"
                      >
                        {isSavingGoal ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Actualizar Meta</>}
                      </button>
                   </form>
                </div>
             </div>
           )}

           {/* SELLER RANKING */}
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex-1">
              <div className="flex items-center gap-3 mb-8">
                 <Award className="w-5 h-5 text-amber-500" />
                 <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Top Vendedores</h3>
              </div>
              <div className="space-y-4">
                 {sellerPerformance.map((seller, index) => (
                    <div key={seller.sellerName} className="flex items-center gap-4 group">
                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${
                          index === 0 ? 'bg-amber-100 text-amber-600' :
                          index === 1 ? 'bg-slate-200 text-slate-600' :
                          index === 2 ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'
                       }`}>
                          {index + 1}
                       </div>
                       <div className="hidden min-[1600px]:block">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs ${
                             index === 0 ? 'bg-amber-50 text-amber-600 shadow-sm' : 'bg-slate-50 text-slate-400'
                          }`}>
                            {seller.sellerName.charAt(0)}
                          </div>
                       </div>
                       <div className="flex-1 min-w-0">
                          <div className="text-xs font-black text-slate-800 uppercase tracking-tight truncate leading-tight">{seller.sellerName}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">{seller.count} EQUIPOS</div>
                       </div>
                       <div className="text-right">
                          <div className="text-xs font-black text-slate-800">${seller.revenue.toLocaleString()}</div>
                          <div className="h-1 w-12 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                             <div className="h-full bg-indigo-500" style={{ width: `${(seller.revenue / (sellerPerformance[0]?.revenue || 1)) * 100}%` }}></div>
                          </div>
                       </div>
                    </div>
                 ))}
                 {sellerPerformance.length === 0 && (
                   <div className="py-10 text-center opacity-30 text-[10px] font-black uppercase italic">Sin ventas este mes</div>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SupervisionPanel;
