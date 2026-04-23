import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { Mail, Lock, Loader2, ArrowRight, ShieldCheck, Smartphone } from 'lucide-react';

const AuthForm: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      // Mensaje de error más amigable para el usuario
      let msg = err.message;
      if (err.message === 'Invalid login credentials') {
        msg = 'Correo o contraseña incorrectos.';
      } else if (err.message.includes('Email not confirmed')) {
        msg = 'Debes confirmar tu correo electrónico antes de entrar. Revisa tu bandeja de entrada.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Validar código
      const { data: codeData, error: codeError } = await supabase
        .from('invitation_codes')
        .select('*')
        .eq('code', invitationCode.toUpperCase())
        .eq('is_used', false)
        .single();

      if (codeError || !codeData) {
        throw new Error("El código de invitación no es válido o ya fue usado.");
      }

      // 2. Crear usuario en Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: codeData.role,
            store_id: codeData.store_id
          }
        }
      });

      if (signUpError) throw signUpError;

      // 3. Marcar código como usado
      await supabase
        .from('invitation_codes')
        .update({ is_used: true })
        .eq('code', invitationCode.toUpperCase());

      setSuccess("¡Cuenta creada correctamente! Ahora puedes iniciar sesión.");
      setMode('login');
      setInvitationCode('');
    } catch (err: any) {
      setError(err.message || "Error al registrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans relative overflow-hidden">

      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-blue-600/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px]"></div>
      </div>

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative z-10">

        <div className="p-8 md:p-10 w-full">
          <div className="text-center mb-8">
            {/* Logo Section Restored to Text/Icon */}
            <div className="flex flex-col items-center justify-center gap-4 mb-6">
              <img src="/pwa-icon.png" alt="Logo" className="w-24 h-24 object-contain drop-shadow-lg rounded-full" />
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Ventas Telcel</h1>
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-2 bg-slate-100 py-1 px-3 rounded-full w-fit mx-auto mb-8">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <p className="text-slate-500 text-xs font-semibold tracking-wide uppercase">
                Acceso Privado
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Correo Electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 text-sm font-medium placeholder:text-slate-300"
                  placeholder="usuario@telcel.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 text-sm font-medium placeholder:text-slate-300"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold border border-red-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600 text-[11px] font-bold border border-emerald-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full ${mode === 'login' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-slate-800 hover:bg-slate-900 shadow-slate-100'} text-white font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] mt-2`}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Entrar al Sistema' : 'Crear Mi Cuenta'}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-slate-100 pt-6">
            <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs mx-auto">
              Esta aplicación es de uso exclusivo interno. Si necesitas una cuenta o has olvidado tu contraseña, contacta al administrador del sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;