import React, { useState, useEffect } from 'react';
import { Smartphone, Info, X, Apple, Chrome, ExternalLink } from 'lucide-react';

const PWAInstallBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    // 1. Check if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');

    // 2. Check if user dismissed it before
    const isDismissed = localStorage.getItem('pwa_banner_dismissed_v2') === 'true';

    // Show only if NOT standalone and NOT dismissed
    if (!isStandalone && !isDismissed) {
      setShowBanner(true);
    }

    // 3. Detect Platform
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/android/.test(ua)) {
      setPlatform('android');
    }
  }, []);

  const dismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem('pwa_banner_dismissed_v2', 'true');
  };

  if (!showBanner) return null;

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">Versión de Escritorio Detectada</h4>
            <p className="text-xs text-slate-500 font-medium">Instala esta app en tu celular para una mejor experiencia.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            Ver Instrucciones
          </button>
          <button 
            onClick={dismissBanner}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Instructions Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-blue-600" />
                Guía de Instalación
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <p className="text-sm text-slate-600">Abre esta página en el navegador de tu celular.</p>
              </div>

              {platform === 'ios' ? (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-800 flex items-center gap-1">
                      <Apple className="w-4 h-4" /> iPhone (Safari)
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Toca el botón de <span className="font-bold text-blue-600">Compartir</span> (el cuadrado con la flecha hacia arriba) y selecciona <span className="font-bold text-blue-600">"Añadir a pantalla de inicio"</span>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-800 flex items-center gap-1">
                      <Chrome className="w-4 h-4" /> Android (Chrome)
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Toca los <span className="font-bold text-blue-600">tres puntos (⋮)</span> en la esquina superior y selecciona <span className="font-bold text-blue-600">"Instalar aplicación"</span>.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <p className="text-sm text-slate-600">¡Listo! Ahora tendrás el icono de la app en tu menú principal.</p>
              </div>
            </div>

            <div className="p-6 bg-slate-50">
              <button 
                onClick={() => setShowModal(false)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-200"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallBanner;

