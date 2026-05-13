import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle, Loader2, RefreshCcw } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose, title = "Escanear Código" }) => {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'active' | 'error'>('loading');
  const [cameras, setCameras] = useState<any[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (e) {
        console.warn("Stop error", e);
      }
    }
  };

  const startWithIndex = async (index: number, cameraList: any[]) => {
    const scannerId = "qr-reader-element";
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(scannerId);
    }

    try {
      setStatus('loading');
      await stopScanner();

      const cameraId = cameraList[index].id;
      
      const config = { 
        fps: 25,
        qrbox: { width: 350, height: 80 }, // Wider for long ICCIDs
        aspectRatio: 1.777778,
        videoConstraints: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          focusMode: "continuous",
          // Add advanced constraints for flagships like S25 Ultra
          whiteBalanceMode: "continuous",
          exposureMode: "continuous"
        }
      };

      await scannerRef.current.start(
        cameraId,
        config,
        (text) => {
          // Validation: ICCIDs must be 19 digits. Ignore partial or incorrect scans.
          const cleanText = text.replace(/\D/g, '');
          if (cleanText.length < 19) return; 

          if (window.navigator.vibrate) window.navigator.vibrate(100);
          onScan(cleanText);
          stopScanner().then(() => onClose()).catch(() => onClose());
        },
        () => {}
      );

      setStatus('active');
    } catch (err: any) {
      console.error("Switch Camera Error:", err);
      setError("Error al iniciar este lente. Intenta con el botón de cambiar cámara.");
      setStatus('error');
    }
  };

  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);
    startWithIndex(nextIndex, cameras);
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        const backCameras = devices.filter(d => 
          !d.label.toLowerCase().includes('front') && 
          !d.label.toLowerCase().includes('user')
        );

        if (isMounted) {
          setCameras(backCameras);
          if (backCameras.length > 0) {
            // Start with the FIRST back camera (usually the main one)
            // instead of the last one (which on S25 Ultra is a telephoto/macro)
            startWithIndex(0, backCameras);
          } else {
            setError("No se detectaron cámaras traseras.");
            setStatus('error');
          }
        }
      } catch (e: any) {
        if (isMounted) {
          setError("Permiso de cámara denegado o no disponible.");
          setStatus('error');
        }
      }
    };

    setTimeout(init, 500);

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[999] flex flex-col bg-black text-white">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-5 bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-black text-sm uppercase tracking-tighter block">{title}</span>
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">
              Lente {currentCameraIndex + 1} de {cameras.length}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {cameras.length > 1 && (
            <button 
              onClick={handleSwitchCamera}
              className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full transition-all border border-white/20 flex items-center gap-2"
              title="Cambiar Lente"
            >
              <RefreshCcw className="w-6 h-6" />
            </button>
          )}
          <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/20">
            <X className="w-7 h-7" />
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <div id="qr-reader-element" className="w-full h-full"></div>

        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Cambiando Lente...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-10 text-center z-30">
            <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
            <p className="text-red-400 text-xs font-bold mb-8">{error}</p>
            <div className="flex flex-col gap-3 w-full">
              {cameras.length > 1 && (
                <button 
                  onClick={handleSwitchCamera}
                  className="w-full py-4 bg-white/10 text-white rounded-2xl font-black uppercase text-xs border border-white/20"
                >
                  Probar otro lente
                </button>
              )}
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs"
              >
                Recargar
              </button>
            </div>
          </div>
        )}

        {/* Scan Guide */}
        {status === 'active' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[350px] h-[80px] border-2 border-blue-500 rounded-2xl relative shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-400 shadow-[0_0_15px_#3b82f6] animate-laser"></div>
              
              <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-blue-500 rounded-tl-2xl"></div>
              <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-blue-500 rounded-tr-2xl"></div>
              <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-blue-500 rounded-bl-2xl"></div>
              <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-blue-500 rounded-br-2xl"></div>
            </div>
            
            <div className="absolute bottom-1/4 flex flex-col items-center gap-3">
              <span className="px-5 py-2.5 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl">
                Lente Ultra-Nítido Activo
              </span>
              <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest text-center">
                Pulsa el botón de arriba <br />
                si este lente se ve borroso
              </p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes laser {
          0% { top: 10%; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
        .animate-laser {
          animation: laser 2s linear infinite;
        }
        #qr-reader-element video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>
    </div>
  );
};

export default BarcodeScanner;
