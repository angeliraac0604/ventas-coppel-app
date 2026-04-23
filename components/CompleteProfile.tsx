import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { User, Lock, Save, Loader2, Sparkles, Building } from 'lucide-react';
import { UserProfile } from '../types';

interface CompleteProfileProps {
  profile: UserProfile;
  storeName?: string;
  onComplete: (updatedProfile: UserProfile) => void;
}

const CompleteProfile: React.FC<CompleteProfileProps> = ({ profile, storeName, onComplete }) => {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (fullName.trim().split(' ').length < 2) {
      setError("Por favor, ingresa tu nombre y al menos un apellido.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      // 1. Update Password in Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: password
      });
      if (authError) throw authError;

      // 2. Update Profile Full Name
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: fullName.toUpperCase() })
        .eq('id', profile.id);
      
      if (profileError) throw profileError;

      // 3. Notify Parent
      onComplete({
        ...profile,
        fullName: fullName.toUpperCase()
      });

      alert("¡Registro completado con éxito! Bienvenido al sistema.");
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al guardar tus datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black mb-2 uppercase tracking-tight">¡Bienvenido a Ventas Telcel!</h1>
          <p className="text-blue-100 text-sm font-medium">Solo un paso más para activar tu cuenta.</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nombre y Apellidos</label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="NOMBRE COMPLETO"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold uppercase"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tienda Asignada</label>
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                 <Building className="w-5 h-5 text-blue-600" />
                 <span className="text-xs font-black text-slate-800 uppercase">{storeName || 'TIENDA PRINCIPAL'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 mt-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Crear Contraseña</label>
              <div className="relative mb-3">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="MÍNIMO 6 CARACTERES"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="REPETIR CONTRASEÑA"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 active:scale-95"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> ACTIVAR MI CUENTA</>}
            </button>
          </form>

          <p className="text-center mt-6 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Al activar tu cuenta aceptas las políticas de seguridad de la empresa.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CompleteProfile;
