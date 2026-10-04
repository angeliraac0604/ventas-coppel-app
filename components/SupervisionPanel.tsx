import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { Building, Target, TrendingUp, Users, Smartphone, DollarSign, Calendar, Filter, ChevronRight, Award, AlertCircle, Loader2, Save, ShoppingBag, Edit2, Trophy, Cpu, Coins, Sparkles } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { db } from '../services/firebase';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { cleanFirestoreData } from './BackupMigration';
import { Store, UserProfile, Brand } from '../types';
import { BRAND_CONFIGS, calculateCommissionForPrice } from '../constants';

interface PerformanceData {
  sellerName: string;
  count: number;
  revenue: number;
}

interface SupervisionPanelProps {
  sales: any[];
  stores: Store[];
  selectedStoreId: string;
  userProfile: UserProfile;
}

const SupervisionPanel: React.FC<SupervisionPanelProps> = ({ sales: propSales, stores, selectedStoreId, userProfile }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Goal Form State
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [targetMonth, setTargetMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }); // YYYY-MM
  const [revenueGoal, setRevenueGoal] = useState('');
  const [devicesGoal, setDevicesGoal] = useState('');
  const [chip0Goal, setChip0Goal] = useState('');
  const [portaGoal, setPortaGoal] = useState('');
  const [expressGoal, setExpressGoal] = useState('');
  const [showGoalForm, setShowGoalForm] = useState(false);

  const fetchData = async () => {
    try {
      let profilesData: any[] = [];
      let goalsData: any[] = [];

      // 1. Cargar perfiles y usuarios desde Firestore
      try {
        const [usersSnap, profSnap] = await Promise.all([
          getDocs(collection(db, 'users')).catch(() => ({ empty: true, docs: [] } as any)),
          getDocs(collection(db, 'profiles')).catch(() => ({ empty: true, docs: [] } as any))
        ]);

        const profMap = new Map<string, any>();
        if (!usersSnap.empty) {
          usersSnap.docs.forEach((d: any) => profMap.set(d.id, { id: d.id, ...d.data() }));
        }
        if (!profSnap.empty) {
          profSnap.docs.forEach((d: any) => {
            const existing = profMap.get(d.id);
            profMap.set(d.id, { ...(existing || {}), id: d.id, ...d.data() });
          });
        }
        profilesData = Array.from(profMap.values());
      } catch (fsErr) {
        console.warn("Firestore profiles warning:", fsErr);
      }

      // 2. Cargar metas desde Firestore
      try {
        const goalsSnap = await getDocs(collection(db, 'monthly_goals'));
        if (!goalsSnap.empty) {
          goalsData = goalsSnap.docs.map(d => ({
            id: d.id,
            store_id: d.data().storeId || d.data().store_id,
            storeId: d.data().storeId || d.data().store_id,
            month: d.data().month,
            revenue_goal: Number(d.data().revenueGoal ?? d.data().revenue_goal ?? 0),
            devices_goal: Number(d.data().devicesGoal ?? d.data().devices_goal ?? 0),
            chip_0_goal: Number(d.data().chip0Goal ?? d.data().chip_0_goal ?? 0),
            portability_goal: Number(d.data().portabilityGoal ?? d.data().portability_goal ?? 0),
            chip_express_goal: Number(d.data().chipExpressGoal ?? d.data().chip_express_goal ?? 0)
          }));
        }
      } catch (fsErr) {
        console.warn("Firestore goals warning:", fsErr);
      }

      // 3. Fallback a Supabase si está activo
      if (isSupabaseConfigured) {
        try {
          if (profilesData.length === 0) {
            const res = await supabase.from('profiles').select('*');
            if (res.data) profilesData = res.data;
          }
          if (goalsData.length === 0) {
            const res = await supabase.from('monthly_goals').select('*');
            if (res.data) goalsData = res.data;
          }
        } catch (e) {
          console.warn("Supabase load warning:", e);
        }
      }

      if (profilesData) setProfiles(profilesData);
      if (goalsData) {
        setGoals(goalsData);
        // Load initial goal values for editing
        const editingGoal = (goalsData || []).find(g => 
          g.month === targetMonth && 
          (selectedStoreId === 'all' ? (!g.store_id || g.store_id === 'all') : g.store_id === selectedStoreId)
        );
        
        if (editingGoal) {
          setRevenueGoal(editingGoal.revenue_goal?.toString() || '');
          setDevicesGoal(editingGoal.devices_goal?.toString() || '');
          setChip0Goal(editingGoal.chip_0_goal?.toString() || '');
          setPortaGoal(editingGoal.portability_goal?.toString() || '');
          setExpressGoal(editingGoal.chip_express_goal?.toString() || '');
        } else {
          setRevenueGoal('');
          setDevicesGoal('');
          setChip0Goal('');
          setPortaGoal('');
          setExpressGoal('');
        }
      }
    } catch (err) {
      console.error('Error loading supervision data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedStoreId, targetMonth]);

  // Normalize propSales to support both camelCase and snake_case
  const sales = propSales.map(s => ({
    ...s,
    store_id: s.storeId || s.store_id,
    created_by: s.createdBy || s.created_by,
    price: Number(s.price) || 0
  }));

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGoal(true);
    const targetStore = selectedStoreId === 'all' ? (userProfile?.storeId || 'all') : selectedStoreId;
    const docId = `${targetMonth}_${targetStore}`;
    const rGoal = parseFloat(revenueGoal) || 0;
    const dGoal = parseInt(devicesGoal, 10) || 0;
    const c0Goal = parseInt(chip0Goal, 10) || 0;
    const pGoal = parseInt(portaGoal, 10) || 0;
    const eGoal = parseInt(expressGoal, 10) || 0;

    const payload = {
      id: docId,
      month: targetMonth,
      store_id: targetStore,
      storeId: targetStore,
      revenue_goal: rGoal,
      revenueGoal: rGoal,
      devices_goal: dGoal,
      devicesGoal: dGoal,
      chip_0_goal: c0Goal,
      chip0Goal: c0Goal,
      portability_goal: pGoal,
      portabilityGoal: pGoal,
      chip_express_goal: eGoal,
      chipExpressGoal: eGoal,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'monthly_goals', docId), cleanFirestoreData(payload), { merge: true });

      if (isSupabaseConfigured) {
        try {
          await supabase.from('monthly_goals').upsert({
            store_id: targetStore === 'all' ? null : targetStore,
            month: targetMonth,
            revenue_goal: rGoal,
            devices_goal: dGoal,
            chip_0_goal: c0Goal,
            portability_goal: pGoal,
            chip_express_goal: eGoal
          }, { onConflict: 'store_id, month' });
        } catch (sbErr) {}
      }

      alert('Meta actualizada correctamente');
      setShowGoalForm(false);
      await fetchData();
    } catch (err: any) {
      alert('Error al guardar meta: ' + err.message);
    } finally {
      setIsSavingGoal(false);
    }
  };

  // Processing Data
  const currentMonthSales = (sales || []).filter(s => s.date && s.date.startsWith(targetMonth));
  const filteredSales = selectedStoreId === 'all' 
    ? currentMonthSales 
    : currentMonthSales.filter(s => {
        const sStore = s.storeId || s.store_id;
        return sStore === selectedStoreId;
      });
  
  const kitOnlySales = filteredSales.filter(s => s.category === 'kit' || !s.category);
  const totalRevenue = kitOnlySales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
  const totalNetRevenue = totalRevenue / 1.16;
  const totalCommissionMonth = kitOnlySales.reduce((acc, curr) => acc + calculateCommissionForPrice(Number(curr.price) || 0, 'A'), 0);
  
  const totalKits = kitOnlySales.length;
  const totalChip0 = filteredSales.filter(s => s.category === 'chip_0').length;
  const totalPorta = filteredSales.filter(s => s.category === 'portability' || s.category === 'portabilidad').length;
  const totalExpress = filteredSales.filter(s => s.category === 'chip_express').length;
  const totalDevices = totalKits;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todaySales = filteredSales.filter(s => s.date === todayStr);
  const todayKitSales = todaySales.filter(s => s.category === 'kit' || !s.category);
  const todayRevenue = todayKitSales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
  const todayCommission = todayKitSales.reduce((acc, curr) => acc + calculateCommissionForPrice(Number(curr.price) || 0, 'A'), 0);
  
  const todayKits = todayKitSales.length;
  const todayChip0 = todaySales.filter(s => s.category === 'chip_0').length;
  const todayPorta = todaySales.filter(s => s.category === 'portability' || s.category === 'portabilidad').length;
  const todayExpress = todaySales.filter(s => s.category === 'chip_express').length;
  const todayCount = todayKits;
  const todayNetRevenue = todayRevenue / 1.16;

  // Seller Performance (Top Hoy y Top Mes)
  const calculatePerformance = (salesArray: any[]) => {
    const sellerMap = new Map<string, {
      id: string;
      sellerName: string;
      email?: string;
      storeId?: string;
      count: number;
      chip0Count: number;
      portaCount: number;
      expressCount: number;
      revenue: number;
      commission: number;
    }>();

    // 1. Pre-cargar perfiles conocidos
    profiles.forEach(p => {
      const pStore = p.storeId || p.store_id;
      const matchesStore = selectedStoreId === 'all' || pStore === selectedStoreId || (p.assignedStores && p.assignedStores.includes(selectedStoreId));
      if (matchesStore) {
        const id = p.id || p.email || 'desconocido';
        const rawName = p.fullName || p.full_name || p.name || (p.email ? p.email.split('@')[0] : 'Vendedor');
        const sellerName = rawName.toUpperCase();
        
        const entry = {
          id,
          sellerName,
          email: p.email,
          storeId: pStore,
          count: 0,
          chip0Count: 0,
          portaCount: 0,
          expressCount: 0,
          revenue: 0,
          commission: 0
        };

        sellerMap.set(id, entry);
        if (p.email) {
          sellerMap.set(p.email.toLowerCase(), entry);
        }
      }
    });

    // 2. Acumular ventas reales pasadas en salesArray
    salesArray.forEach(s => {
      const creatorId = s.createdBy || s.created_by || s.createdByEmail || s.created_by_email || 'general';
      const creatorEmail = (s.createdByEmail || s.created_by_email || (creatorId.includes('@') ? creatorId : '')).toLowerCase();
      
      let seller = sellerMap.get(creatorId) || (creatorEmail ? sellerMap.get(creatorEmail) : null);
      
      if (!seller) {
        const rawName = s.createdByName || s.created_by_name || (creatorEmail ? creatorEmail.split('@')[0] : `Vendedor (${creatorId.slice(0, 6)})`);
        seller = {
          id: creatorId,
          sellerName: rawName.toUpperCase(),
          email: creatorEmail || creatorId,
          storeId: s.storeId || s.store_id,
          count: 0,
          chip0Count: 0,
          portaCount: 0,
          expressCount: 0,
          revenue: 0,
          commission: 0
        };
        sellerMap.set(creatorId, seller);
        if (creatorEmail) sellerMap.set(creatorEmail, seller);
      }

      const price = Number(s.price) || 0;
      const category = s.category || 'kit';

      if (category === 'kit') {
        seller.count += 1;
        seller.revenue += price;
        seller.commission += calculateCommissionForPrice(price, 'A');
      } else if (category === 'chip_0') {
        seller.chip0Count += 1;
        if (price > 0) {
          seller.revenue += price;
          seller.commission += calculateCommissionForPrice(price, 'A');
        }
      } else if (category === 'portability' || category === 'portabilidad') {
        seller.portaCount += 1;
      } else if (category === 'chip_express') {
        seller.expressCount += 1;
      }
    });

    // Desduplicar referencias
    const uniqueList: any[] = [];
    const seenObjects = new Set();
    sellerMap.forEach(v => {
      if (!seenObjects.has(v)) {
        seenObjects.add(v);
        uniqueList.push(v);
      }
    });

    return uniqueList
      .filter(sp => (sp.count + sp.chip0Count + sp.portaCount + sp.expressCount) > 0 || (selectedStoreId !== 'all' && salesArray.length > 0))
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  };

  const sellerPerformance = calculatePerformance(filteredSales);
  const sellerPerformanceToday = calculatePerformance(todaySales);

  // Brand Performance
  const brandPerformance = Object.values(Brand).map(brand => {
    const brandSales = filteredSales.filter(s => s.brand === brand && (s.category === 'kit' || !s.category));
    const rev = brandSales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
    const conf = brand === Brand.REALME 
      ? { label: 'Realme', hex: '#FFC700', logoUrl: 'https://www.vectorlogo.zone/logos/realme/realme-icon.svg' } 
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

  const brandPerformanceToday = Object.values(Brand).map(brand => {
    const brandSales = todaySales.filter(s => s.brand === brand && (s.category === 'kit' || !s.category));
    const rev = brandSales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
    const conf = brand === Brand.REALME 
      ? { label: 'Realme', hex: '#FFC700', logoUrl: 'https://www.vectorlogo.zone/logos/realme/realme-icon.svg' } 
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
        devices_goal: relevantGoals.reduce((sum, g) => sum + Number(g.devices_goal), 0),
        chip_0_goal: relevantGoals.reduce((sum, g) => sum + Number(g.chip_0_goal || 0), 0),
        portability_goal: relevantGoals.reduce((sum, g) => sum + Number(g.portability_goal || 0), 0),
        chip_express_goal: relevantGoals.reduce((sum, g) => sum + Number(g.chip_express_goal || 0), 0)
      }
    : goals.find(g => g.month === targetMonth && g.store_id === selectedStoreId);
  
  const revenueGoalNum = Number(currentGoal?.revenue_goal) || 0;
  const devicesGoalNum = Number(currentGoal?.devices_goal) || 0;
  const chip0GoalNum = Number(currentGoal?.chip_0_goal) || 0;
  const portaGoalNum = Number(currentGoal?.portability_goal) || 0;
  const expressGoalNum = Number(currentGoal?.chip_express_goal) || 0;
  
  const revenueProgress = (revenueGoalNum > 0) ? (totalNetRevenue / revenueGoalNum) * 100 : 0;
  const devicesProgress = (devicesGoalNum > 0) ? (totalKits / devicesGoalNum) * 100 : 0;
  const chip0Progress = (chip0GoalNum > 0) ? (totalChip0 / chip0GoalNum) * 100 : 0;
  const portaProgress = (portaGoalNum > 0) ? (totalPorta / portaGoalNum) * 100 : 0;
  const expressProgress = (expressGoalNum > 0) ? (totalExpress / expressGoalNum) * 100 : 0;

  // Daily Trend Data
  const nowForTrend = new Date();
  const currentMonthStr = nowForTrend.getFullYear() + '-' + String(nowForTrend.getMonth() + 1).padStart(2, '0');
  const isCurrentMonth = targetMonth === currentMonthStr;
  const currentDay = nowForTrend.getDate();

  const daysInMonth = new Date(parseInt(targetMonth.split('-')[0]), parseInt(targetMonth.split('-')[1]), 0).getDate();
  const daysToShow = isCurrentMonth ? currentDay : daysInMonth;

  const dailyData = Array.from({ length: daysToShow }, (_, i) => {
    const day = (i + 1).toString().padStart(2, '0');
    const fullDate = `${targetMonth}-${day}`;
    const daySales = filteredSales.filter(s => s.date === fullDate);
    
    return {
      day: (i + 1).toString(),
      revenue: daySales.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0),
      kits: daySales.filter(s => s.category === 'kit' || !s.category).length,
      chip0: daySales.filter(s => s.category === 'chip_0').length,
      services: daySales.filter(s => s.category === 'portability' || s.category === 'chip_express').length
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* MAIN COLUMN (LEFT) */}
        <div className="lg:col-span-2 space-y-8">
           
           {/* 1. TODAY STATS GRID */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* REVENUE TODAY */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                          <DollarSign className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-400">Ventas Hoy (Bruto)</span>
                    </div>
                    <div className="text-3xl lg:text-4xl font-black text-slate-800 tracking-tighter mb-1">
                       ${todayRevenue.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                          Neto: ${todayNetRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                       </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-3">Ingreso generado hoy</p>
                  </div>
              </div>

              {/* DEVICES TODAY */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-400">Ventas de Hoy</span>
                    </div>
                    <div className="flex items-end gap-3 mb-2">
                       <div className="text-3xl lg:text-4xl font-black text-slate-800 tracking-tighter">
                          {todayCount}
                       </div>
                       <span className="text-sm font-bold text-slate-400 mb-1.5 uppercase">Equipos</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                       {todayCount > 0 ? "Actividad registrada hoy" : "Sin ventas aún"}
                    </p>
                  </div>
              </div>

              {/* COMMISSIONS TODAY (NEW) */}
              <div className="bg-gradient-to-br from-amber-500 to-yellow-500 p-8 rounded-[2.5rem] shadow-lg text-slate-950 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <div className="p-3 bg-slate-950 text-yellow-400 rounded-2xl shadow-sm">
                          <Coins className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-900/80 tracking-wider">Comisión Hoy</span>
                    </div>
                    <div className="text-3xl lg:text-4xl font-black text-slate-950 tracking-tighter mb-1">
                       ${todayCommission.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-[10px] text-slate-900/80 font-bold uppercase mt-3">
                       Coppel Tienda A ({todayCount} equipos)
                    </p>
                  </div>
              </div>
           </div>

           {/* 2. MONTHLY SUMMARY GRID (ENHANCED GOALS) */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* REVENUE GOAL CARD */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                       <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                          <DollarSign className="w-6 h-6" />
                       </div>
                       <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black uppercase text-slate-400">Progreso de Meta</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase mt-1 ${revenueProgress >= 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                             {revenueProgress >= 100 ? 'Meta Cumplida' : 'En Progreso'}
                          </span>
                       </div>
                    </div>
                    
                    <div className="flex items-baseline gap-2 mb-1">
                       <span className="text-4xl font-black text-slate-800 tracking-tighter">
                          ${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                       </span>
                       <span className="text-sm font-bold text-slate-400 uppercase">Bruto</span>
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                       <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                          Neto (sin IVA): ${totalNetRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                       </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                       <span>$0</span>
                       <span>Meta Neto: ${revenueGoalNum.toLocaleString()}</span>
                    </div>

                    <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden mb-4 shadow-inner">
                       <div 
                         className={`h-full transition-all duration-1000 rounded-full ${revenueProgress >= 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-indigo-500 to-blue-600'}`} 
                         style={{ width: `${Math.min(revenueProgress, 100)}%` }}
                       >
                          {revenueProgress > 15 && (
                            <div className="w-full h-full flex items-center justify-end px-2">
                               <div className="w-1 h-1 bg-white/50 rounded-full animate-pulse"></div>
                            </div>
                          )}
                       </div>
                    </div>

                    <div className="flex justify-between items-center">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-800 uppercase leading-none">{revenueProgress.toFixed(1)}%</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Cumplimiento</span>
                       </div>
                       <div className="text-right">
                          <span className="text-[10px] font-black text-indigo-600 uppercase leading-none">
                             {revenueGoalNum - totalNetRevenue > 0 
                                ? `Faltan $${(revenueGoalNum - totalNetRevenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                : 'Objetivo Superado'}
                          </span>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Para alcanzar la meta</p>
                       </div>
                    </div>
                  </div>
              </div>

              {/* DEVICES GOAL CARD */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                       <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                          <Smartphone className="w-6 h-6" />
                       </div>
                       <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black uppercase text-slate-400">Equipos Kit</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase mt-1 ${devicesProgress >= 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-100 text-emerald-600 animate-pulse'}`}>
                             {devicesProgress >= 100 ? 'Meta Cumplida' : 'Objetivo Mensual'}
                          </span>
                       </div>
                    </div>

                    <div className="flex items-baseline gap-2 mb-1">
                       <span className="text-4xl font-black text-slate-800 tracking-tighter">
                          {totalKits}
                       </span>
                       <span className="text-sm font-bold text-slate-400 uppercase">Equipos</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                       <span>0 un.</span>
                       <span>Meta: {devicesGoalNum} un.</span>
                    </div>

                    <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden mb-4 shadow-inner">
                       <div 
                         className={`h-full transition-all duration-1000 rounded-full ${devicesProgress >= 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600'}`} 
                         style={{ width: `${Math.min(devicesProgress, 100)}%` }}
                       ></div>
                    </div>

                    <div className="flex justify-between items-center">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-800 uppercase leading-none">{devicesProgress.toFixed(1)}%</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Cumplimiento</span>
                       </div>
                       <div className="text-right">
                          <span className="text-[10px] font-black text-emerald-600 uppercase leading-none">
                             {devicesGoalNum - totalKits > 0 
                                ? `Faltan ${devicesGoalNum - totalKits} equipos`
                                : 'Objetivo Superado'}
                          </span>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Para la meta</p>
                       </div>
                    </div>
                  </div>
              </div>

              {/* CHIP 0 GOAL CARD */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                       <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                          <Cpu className="w-6 h-6" />
                       </div>
                       <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black uppercase text-slate-400">Chip 0</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase mt-1 ${chip0Progress >= 100 ? 'bg-purple-100 text-purple-600' : 'bg-purple-100 text-purple-600 animate-pulse'}`}>
                             {chip0Progress >= 100 ? 'Meta Cumplida' : 'Objetivo Mensual'}
                          </span>
                       </div>
                    </div>

                    <div className="flex items-baseline gap-2 mb-1">
                       <span className="text-4xl font-black text-slate-800 tracking-tighter">
                          {totalChip0}
                       </span>
                       <span className="text-sm font-bold text-slate-400 uppercase">Chips</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                       <span>0 un.</span>
                       <span>Meta: {chip0GoalNum} un.</span>
                    </div>

                    <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden mb-4 shadow-inner">
                       <div 
                         className={`h-full transition-all duration-1000 rounded-full ${chip0Progress >= 100 ? 'bg-gradient-to-r from-purple-400 to-purple-600' : 'bg-gradient-to-r from-purple-500 to-indigo-600'}`} 
                         style={{ width: `${Math.min(chip0Progress, 100)}%` }}
                       ></div>
                    </div>

                    <div className="flex justify-between items-center">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-800 uppercase leading-none">{chip0Progress.toFixed(1)}%</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Cumplimiento</span>
                       </div>
                       <div className="text-right">
                          <span className="text-[10px] font-black text-purple-600 uppercase leading-none">
                             {chip0GoalNum - totalChip0 > 0 
                                ? `Faltan ${chip0GoalNum - totalChip0} chips`
                                : 'Objetivo Superado'}
                          </span>
                       </div>
                    </div>
                  </div>
              </div>

              {/* SERVICES GOAL CARD */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                       <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                          <ShoppingBag className="w-6 h-6" />
                       </div>
                       <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black uppercase text-slate-400">Porta & Express</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase mt-1 ${((totalPorta + totalExpress)/(portaGoalNum + expressGoalNum || 1) * 100) >= 100 ? 'bg-orange-100 text-orange-600' : 'bg-orange-100 text-orange-600'}`}>
                             Servicios
                          </span>
                       </div>
                    </div>

                    <div className="flex items-baseline gap-2 mb-1">
                       <span className="text-4xl font-black text-slate-800 tracking-tighter">
                          {totalPorta + totalExpress}
                       </span>
                       <span className="text-sm font-bold text-slate-400 uppercase">Total</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                       <span>P: {totalPorta} | E: {totalExpress}</span>
                       <span>Meta: {portaGoalNum + expressGoalNum}</span>
                    </div>

                    <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden mb-4 shadow-inner">
                       <div 
                         className="h-full transition-all duration-1000 rounded-full bg-gradient-to-r from-orange-400 to-orange-600"
                         style={{ width: `${Math.min(((totalPorta + totalExpress)/(portaGoalNum + expressGoalNum || 1) * 100), 100)}%` }}
                       ></div>
                    </div>

                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                       <span>Porta: {totalPorta}/{portaGoalNum}</span>
                       <span>Express: {totalExpress}/{expressGoalNum}</span>
                    </div>
                  </div>
              </div>

              {/* COMMISSIONS MONTHLY CARD (NEW) */}
              <div className="bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 p-8 rounded-[2.5rem] shadow-xl text-slate-950 relative overflow-hidden group md:col-span-2">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/20 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-slate-950 text-yellow-400 rounded-3xl shadow-lg">
                        <Coins className="w-8 h-8" />
                      </div>
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950/90 text-yellow-300 rounded-full text-[9px] font-black uppercase tracking-widest mb-1.5 shadow-sm">
                          <Sparkles className="w-3 h-3" />
                          Tabulador Oficial Coppel A
                        </div>
                        <h3 className="text-xl font-black text-slate-950 tracking-tight">Comisiones Totales del Mes</h3>
                        <p className="text-xs text-slate-900/80 font-bold">Generadas por {totalKits} equipos celulares vendidos en {targetMonth}</p>
                      </div>
                    </div>

                    <div className="text-left md:text-right bg-slate-950/10 backdrop-blur-sm p-4 rounded-2xl border border-slate-950/10">
                      <span className="text-[10px] font-black uppercase text-slate-900 tracking-wider block mb-0.5">Monto Acumulado</span>
                      <span className="text-3xl md:text-4xl font-black text-slate-950 leading-none">
                        ${totalCommissionMonth.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
              </div>
           </div>

           {/* 3. DAILY TREND CHART */}
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Tendencia Diaria</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase">Ingresos diarios acumulados</p>
                 </div>
                 <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="h-[300px] w-full min-w-0">
                 <ResponsiveContainer width="100%" height="100%" debounce={100}>
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

           {/* 4. TODAY BRAND DISTRIBUTION */}
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
               <div className="flex items-center justify-between mb-8">
                  <div>
                     <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Distribución Hoy</h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase">Ventas por marca registradas hoy</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black bg-orange-100 text-orange-600 px-2 py-1 rounded-lg uppercase">En Vivo</span>
                  </div>
               </div>
               
               {todayCount > 0 ? (
                 <div className="flex flex-col xl:flex-row items-center gap-8">
                    <div className="h-[200px] w-full xl:w-1/3 min-w-0">
                      <ResponsiveContainer width="100%" height="100%" debounce={100}>
                        <PieChart>
                          <Pie
                            data={brandPerformanceToday}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={5}
                            dataKey="count"
                          >
                            {brandPerformanceToday.map((entry, index) => (
                              <Cell key={`cell-today-${index}`} fill={entry.color} stroke="none" />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
                       {brandPerformanceToday.map((item) => (
                         <div key={`today-${item.name}`} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100/50">
                           {item.logoUrl ? (
                             <img src={item.logoUrl} alt={item.name} className="w-6 h-6 object-contain" />
                           ) : (
                             <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                           )}
                           <div className="flex-1 min-w-0">
                             <p className="text-[9px] font-black text-slate-800 uppercase truncate">{item.name}</p>
                             <div className="flex flex-col">
                                <p className="text-[10px] font-black text-indigo-600 leading-none">{item.count} un.</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase leading-tight tracking-tighter mt-0.5">
                                   Neto: ${item.netRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                             </div>
                           </div>
                         </div>
                       ))}
                    </div>
                 </div>
               ) : (
                 <div className="py-12 text-center opacity-30 text-[10px] font-black uppercase italic border-2 border-dashed border-slate-100 rounded-[2rem]">
                    Sin actividad de marcas hoy
                 </div>
               )}
           </div>

           {/* 5. MONTHLY BRAND DISTRIBUTION */}
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
               <div className="flex items-center justify-between mb-8">
                  <div>
                     <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Distribución por Marcas</h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase">Preferencia de compra este mes</p>
                  </div>
                  <ShoppingBag className="w-5 h-5 text-indigo-600" />
               </div>
               
               <div className="flex flex-col xl:flex-row items-center gap-8">
                  <div className="h-[250px] w-full xl:w-1/2 min-w-0">
                    <ResponsiveContainer width="100%" height="100%" debounce={100}>
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
                             <div className="flex items-center gap-2">
                                <span className="text-[11px] font-black text-indigo-600 leading-none">
                                  {item.count} un.
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                  {totalDevices > 0 ? ((item.count / totalDevices) * 100).toFixed(1) : 0}%
                                </span>
                             </div>
                             <span className="text-[9px] font-bold text-slate-500 uppercase leading-tight">
                                Neto: ${item.netRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                             </span>
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
               </div>
           </div>
        </div>

        {/* SIDEBAR (RIGHT) */}
        <div className="space-y-8">
           
           {/* GOAL ASSIGNMENT TOGGLE */}
           {userProfile.role === 'admin' && (
             <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden transition-all duration-500">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/20 rounded-full -mr-12 -mt-12"></div>
                <div className="relative z-10">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <Target className="w-5 h-5 text-indigo-400" />
                         <h3 className="text-base font-black uppercase tracking-tight">Metas</h3>
                      </div>
                      <button 
                        onClick={() => setShowGoalForm(!showGoalForm)}
                        className={`p-2 rounded-xl transition-all ${showGoalForm ? 'bg-white text-indigo-600' : 'bg-white/10 text-white hover:bg-white/20'}`}
                      >
                        {showGoalForm ? <ChevronRight className="w-5 h-5 rotate-90" /> : <Edit2 className="w-4 h-4" />}
                      </button>
                   </div>

                    {showGoalForm ? (
                      <form onSubmit={(e) => { handleSaveGoal(e); setShowGoalForm(false); }} className="space-y-4 mt-6 animate-in slide-in-from-top-4 duration-300">
                         <div className="grid grid-cols-2 gap-3">
                           <div>
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Presupuesto ($)</label>
                              <input type="number" value={revenueGoal} onChange={(e) => setRevenueGoal(e.target.value)} placeholder="0.00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-black text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                           </div>
                           <div>
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Equipos Kit</label>
                              <input type="number" value={devicesGoal} onChange={(e) => setDevicesGoal(e.target.value)} placeholder="0" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-black text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                           </div>
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                           <div>
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Chip 0</label>
                              <input type="number" value={chip0Goal} onChange={(e) => setChip0Goal(e.target.value)} placeholder="0" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs font-black text-white outline-none focus:ring-2 focus:ring-purple-500/50 transition-all" />
                           </div>
                           <div>
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Porta</label>
                              <input type="number" value={portaGoal} onChange={(e) => setPortaGoal(e.target.value)} placeholder="0" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs font-black text-white outline-none focus:ring-2 focus:ring-rose-500/50 transition-all" />
                           </div>
                           <div>
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Express</label>
                              <input type="number" value={expressGoal} onChange={(e) => setExpressGoal(e.target.value)} placeholder="0" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs font-black text-white outline-none focus:ring-2 focus:ring-orange-500/50 transition-all" />
                           </div>
                         </div>
                         <button 
                           type="submit" 
                           disabled={isSavingGoal}
                           className="w-full bg-indigo-600 hover:bg-white hover:text-indigo-600 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-indigo-900/40 text-[9px] uppercase tracking-widest mt-2 flex items-center justify-center gap-2"
                         >
                           {isSavingGoal ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Actualizar Todo</>}
                         </button>
                      </form>
                    ) : (
                      <div className="mt-4 grid grid-cols-2 gap-y-3 gap-x-6">
                         <div className="flex flex-col">
                            <span className="text-[8px] font-bold uppercase text-slate-400">Presupuesto</span>
                            <span className="text-sm font-black text-white">${revenueGoalNum.toLocaleString()}</span>
                         </div>
                         <div className="flex flex-col">
                            <span className="text-[8px] font-bold uppercase text-slate-400">Equipos Kit</span>
                            <span className="text-sm font-black text-white">{devicesGoalNum}</span>
                         </div>
                         <div className="flex flex-col">
                            <span className="text-[8px] font-bold uppercase text-slate-400">Chip 0</span>
                            <span className="text-xs font-black text-purple-300">{chip0GoalNum}</span>
                         </div>
                         <div className="flex flex-col">
                            <span className="text-[8px] font-bold uppercase text-slate-400">Servicios</span>
                            <span className="text-xs font-black text-orange-300">{portaGoalNum + expressGoalNum}</span>
                         </div>
                      </div>
                    )}
                </div>
             </div>
           )}

           {/* TOP SELLERS TODAY */}
           <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
                 <Award className="w-24 h-24 rotate-12" />
              </div>
              <div className="relative z-10">
                 <div className="flex items-center gap-3 mb-6">
                    <Trophy className="w-5 h-5 text-amber-200" />
                    <h3 className="text-base font-black uppercase tracking-tight">Top Hoy</h3>
                 </div>
                 <div className="space-y-4">
                    {sellerPerformanceToday.slice(0, 3).map((seller, index) => (
                       <div key={`today-rank-${seller.id || index}`} className="flex items-center gap-4">
                          <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center text-[10px] font-black">
                             {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                             <div className="text-xs font-black uppercase truncate leading-tight">{seller.sellerName}</div>
                             <div className="text-[9px] font-bold opacity-70 uppercase">{seller.count} EQUIPOS</div>
                          </div>
                          <div className="text-right text-xs font-black">
                             ${seller.revenue.toLocaleString()}
                          </div>
                       </div>
                    ))}
                    {sellerPerformanceToday.length === 0 && (
                       <div className="py-4 text-center opacity-60 text-[9px] font-black uppercase italic">Sin ventas hoy aún</div>
                    )}
                 </div>
              </div>
           </div>

           {/* SELLER RANKING MONTHLY */}
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex-1">
              <div className="flex items-center gap-3 mb-8">
                 <Users className="w-5 h-5 text-indigo-500" />
                 <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Top Mes</h3>
              </div>
              <div className="space-y-4">
                 {sellerPerformance.map((seller, index) => (
                    <div key={`monthly-rank-${seller.id || index}`} className="flex items-center gap-4 group">
                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${
                          index === 0 ? 'bg-amber-100 text-amber-600' :
                          index === 1 ? 'bg-slate-200 text-slate-600' :
                          index === 2 ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'
                       }`}>
                          {index + 1}
                       </div>
                       <div className="flex-1 min-w-0">
                          <div className="text-xs font-black text-slate-800 uppercase tracking-tight truncate leading-tight">{seller.sellerName}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">{seller.count} EQUIPOS</span>
                            <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md uppercase">
                              +${seller.commission.toLocaleString('es-MX')}
                            </span>
                          </div>
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

           {/* SERVICES PERFORMANCE (NEW) */}
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex-1">
              <div className="flex items-center gap-3 mb-8">
                 <Cpu className="w-5 h-5 text-purple-500" />
                 <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Servicios Mes</h3>
              </div>
              <div className="space-y-6">
                 {sellerPerformance.map((seller, index) => (
                   <div key={`services-${seller.id || index}`} className="space-y-3 pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{seller.sellerName}</div>
                      <div className="grid grid-cols-3 gap-2">
                         <div className="bg-purple-50 p-2 rounded-xl border border-purple-100 flex flex-col items-center">
                            <span className="text-[8px] font-black text-purple-400 uppercase tracking-tighter">Chip 0</span>
                            <span className="text-xs font-black text-purple-700">{seller.chip0Count}</span>
                         </div>
                         <div className="bg-rose-50 p-2 rounded-xl border border-rose-100 flex flex-col items-center">
                            <span className="text-[8px] font-black text-rose-400 uppercase tracking-tighter">Porta</span>
                            <span className="text-xs font-black text-rose-700">{seller.portaCount}</span>
                         </div>
                         <div className="bg-orange-50 p-2 rounded-xl border border-orange-100 flex flex-col items-center">
                            <span className="text-[8px] font-black text-orange-400 uppercase tracking-tighter">Express</span>
                            <span className="text-xs font-black text-orange-700">{seller.expressCount}</span>
                         </div>
                      </div>
                   </div>
                 ))}
                 {sellerPerformance.length === 0 && (
                   <div className="py-10 text-center opacity-30 text-[10px] font-black uppercase italic">Sin servicios registrados</div>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SupervisionPanel;
