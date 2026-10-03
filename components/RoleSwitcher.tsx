import React, { useState } from 'react';
import { UserRole, Store } from '../types';
import { Wrench, Shield, TrendingUp, ShoppingBag, Eye, ChevronDown, Store as StoreIcon, Check } from 'lucide-react';

interface RoleSwitcherProps {
  currentRole: UserRole;
  effectiveRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  stores: Store[];
  selectedStoreId: string;
  onStoreChange: (storeId: string) => void;
  onOpenMigration?: () => void;
  onOpenDatabaseUsage?: () => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  effectiveRole,
  onRoleChange,
  stores,
  selectedStoreId,
  onStoreChange,
  onOpenMigration,
  onOpenDatabaseUsage
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const rolesConfig: { id: UserRole; label: string; icon: any; color: string; desc: string }[] = [
    { id: 'developer', label: 'Desarrollador', icon: Wrench, color: 'bg-purple-600 text-white', desc: 'Acceso total y herramientas de sistema' },
    { id: 'admin', label: 'Administrador', icon: Shield, color: 'bg-amber-600 text-white', desc: 'Control total de tiendas y usuarios' },
    { id: 'supervisor', label: 'Supervisor', icon: TrendingUp, color: 'bg-blue-600 text-white', desc: 'Monitoreo de metas y asistencias' },
    { id: 'seller', label: 'Vendedor', icon: ShoppingBag, color: 'bg-emerald-600 text-white', desc: 'Registro de ventas y checador' },
    { id: 'viewer', label: 'Visualizador', icon: Eye, color: 'bg-slate-600 text-white', desc: 'Solo consulta y reportes' },
  ];

  const currentConfig = rolesConfig.find(r => r.id === effectiveRole) || rolesConfig[0];
  const CurrentIcon = currentConfig.icon;

  return (
    <div className="fixed bottom-4 right-4 z-50 font-sans print:hidden">
      {isOpen && (
        <div className="mb-2 bg-slate-900/95 backdrop-blur-md text-white border border-purple-500/40 rounded-2xl shadow-2xl p-4 w-80 md:w-96 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-purple-400">Panel de Desarrollador</p>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>

          {/* Role selector */}
          <div className="mt-3">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">
              Simular Rol en Tiempo Real:
            </label>
            <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
              {rolesConfig.map(r => {
                const Icon = r.icon;
                const isSelected = effectiveRole === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      onRoleChange(r.id);
                    }}
                    className={`flex items-center justify-between p-2 rounded-xl text-left transition-all border ${
                      isSelected
                        ? 'bg-purple-600/20 border-purple-500 text-white font-bold'
                        : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${r.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold leading-tight">{r.label}</p>
                        <p className="text-[10px] text-slate-400">{r.desc}</p>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-purple-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Store simulation */}
          <div className="mt-3 pt-3 border-t border-slate-800">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <StoreIcon className="w-3.5 h-3.5 text-blue-400" />
              Filtrar Tienda Simulada:
            </label>
            <select
              value={selectedStoreId}
              onChange={(e) => onStoreChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="all">Todas las Tiendas (Global)</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="mt-3 pt-2 space-y-1.5">
            {onOpenMigration && (
              <button
                onClick={() => {
                  onOpenMigration();
                  setIsOpen(false);
                }}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Wrench className="w-3.5 h-3.5" />
                Abrir Migrador de Respaldo (.gz)
              </button>
            )}
            {onOpenDatabaseUsage && (
              <button
                onClick={() => {
                  onOpenDatabaseUsage();
                  setIsOpen(false);
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                Uso y Costos de Base de Datos
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-900 text-white border border-purple-500/50 shadow-xl shadow-purple-900/20 px-3.5 py-2 rounded-full transition-all hover:scale-105 group backdrop-blur-md"
      >
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
        </span>
        <div className={`p-1 rounded-md ${currentConfig.color}`}>
          <CurrentIcon className="w-3 h-3" />
        </div>
        <div className="text-left">
          <span className="text-[10px] text-purple-300 font-bold block uppercase tracking-wider leading-none">Dev Mode</span>
          <span className="text-xs font-extrabold text-white flex items-center gap-1">
            {currentConfig.label}
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </button>
    </div>
  );
};
