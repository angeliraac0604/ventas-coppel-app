import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Package, Tag, Calendar, User, Save, X, Loader2, Camera, Image as ImageIcon, Eye, Search, Smartphone as KitIcon, Share2, Phone, Cpu, Wand2, Calculator, Check, AlertCircle, Barcode, ClipboardCheck, Trash2, Edit2 } from 'lucide-react';
import { Brand, Sale, BrandConfig, UserProfile, Store } from '../types';
import { BRAND_CONFIGS } from '../constants';
import { supabase } from '../services/supabaseClient';
import { smartImageUpload } from '../services/storageService';
import { analyzeTicketImage } from '../services/geminiService';
import BarcodeScanner from './BarcodeScanner';

interface SalesFormProps {
  onAddSale: (sale: Omit<Sale, 'id'>) => Promise<void>;
  onUpdateSale: (sale: Sale) => Promise<void>;
  initialData?: Sale | null;
  onCancel: () => void;
  role?: string;
  userProfile?: UserProfile | null;
  stores?: Store[];
  activeStoreId?: string;
}

type SaleCategory = 'kit' | 'chip_0' | 'portabilidad' | 'chip_express';

interface SaleItem {
  tempId: number;
  brand: Brand;
  price: string;
}

const SalesForm: React.FC<SalesFormProps> = ({ 
  onAddSale, 
  onUpdateSale, 
  initialData, 
  onCancel, 
  role, 
  userProfile,
  stores,
  activeStoreId
}) => {
  // 1. Permisos de Categoría
  const availableCategories: SaleCategory[] = React.useMemo(() => {
    const allowed: SaleCategory[] = [];
    
    // Check specific permissions (canSellKit defaults to true if not explicitly false)
    if (userProfile?.canSellKit !== false) allowed.push('kit');
    if (userProfile?.canSellChip0) allowed.push('chip_0');
    if (userProfile?.canSellPortability) allowed.push('portabilidad');
    if (userProfile?.canSellChipExpress) allowed.push('chip_express');
    
    // If absolutely no permissions are found, fallback to 'kit'
    return allowed.length > 0 ? allowed : ['kit'];
  }, [userProfile]);

  // 2. Estado del Formulario
  const todayStr = new Date().toISOString().split('T')[0];

  const [commonData, setCommonData] = useState({
    customerName: initialData?.customerName || '',
    date: initialData?.date || todayStr,
    invoiceNumber: initialData?.invoiceNumber || '',
    category: (initialData?.category as SaleCategory) || (availableCategories.includes('kit') ? 'kit' : availableCategories[0] || 'kit'),
    iccid: initialData?.iccid || '',
    phoneNumber: initialData?.phoneNumber || '',
    portabilityScreenshot: initialData?.portabilityScreenshot || null
  });

  // Body scroll lock and refresh prevention
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none'; // Prevent pull-to-refresh
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.touchAction = 'auto';
    };
  }, []);

  // List of devices in this ticket
  const [items, setItems] = useState<SaleItem[]>(
    initialData
      ? [{ tempId: Date.now(), brand: initialData.brand, price: initialData.price.toString() }]
      : [{ tempId: Date.now(), brand: Brand.OTRO, price: '' }]
  );

  // Sync category if permissions change or load
  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(commonData.category)) {
      setCommonData(prev => ({ ...prev, category: availableCategories[0] }));
    }
  }, [availableCategories, commonData.category]);

  const [ticketImage, setTicketImage] = useState<string | null>(initialData?.ticketImage || null);
  const [portabilityImage, setPortabilityImage] = useState<string | null>(initialData?.portabilityScreenshot || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPortabilityFile, setSelectedPortabilityFile] = useState<File | null>(null);
  const [showFullImage, setShowFullImage] = useState(false); 
  const [showFullPortabilityImage, setShowFullPortabilityImage] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const portabilityFileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Draft persistence for new sales
  useEffect(() => {
    if (!initialData) {
      const draft = localStorage.getItem('sales_form_draft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          setCommonData(prev => ({ ...prev, ...parsed.commonData }));
          if (parsed.items) setItems(parsed.items);
          if (parsed.ticketImage) setTicketImage(parsed.ticketImage);
        } catch (e) {}
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (!initialData) {
      localStorage.setItem('sales_form_draft', JSON.stringify({ commonData, items, ticketImage }));
    }
  }, [commonData, items, ticketImage, initialData]);

  const clearDraft = () => localStorage.removeItem('sales_form_draft');

  const processTicketAI = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      const activeStore = stores?.find(s => s.id === (activeStoreId || userProfile?.storeId));
      const result = await analyzeTicketImage(
        base64, 
        activeStore?.name || 'Sucursal', 
        'Coppel', 
        commonData.category
      );

      if (result) {
        // Para Coppel, solo tomamos los últimos 6 dígitos del número de factura
        let cleanInvoice = result.invoiceNumber || '';
        if (cleanInvoice.length > 6 && (activeStore?.type === 'Coppel' || getCurrentPrefix() === '1053')) {
          cleanInvoice = cleanInvoice.slice(-6);
        }

        setCommonData(prev => ({
          ...prev,
          customerName: result.customerName || prev.customerName,
          invoiceNumber: cleanInvoice || prev.invoiceNumber,
          date: result.date || prev.date
        }));

        if (result.items && result.items.length > 0) {
          setItems(result.items.map((it: any, idx: number) => ({
            tempId: Date.now() + idx,
            brand: it.brand,
            price: it.price.toString()
          })));
        }
      }
    } catch (err) {
      console.error("AI Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setTicketImage(base64);
        
        // Solo auto-escanear si es Kit o Chip 0
        if (commonData.category === 'kit' || commonData.category === 'chip_0') {
          await processTicketAI(base64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePortabilityFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPortabilityFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPortabilityImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { tempId: Date.now(), brand: Brand.OTRO, price: '' }]);
  };

  const handleRemoveItem = (tempId: number) => {
    if (items.length > 1) {
      setItems(items.filter(i => i.tempId !== tempId));
    }
  };

  const handleItemChange = (tempId: number, field: keyof SaleItem, value: any) => {
    setItems(items.map(i => i.tempId === tempId ? { ...i, [field]: value } : i));
  };

  // Helper to get prefix for current store
  const getCurrentPrefix = () => {
    const storeIdToUse = activeStoreId || userProfile?.storeId;
    const store = stores?.find(s => s.id === storeIdToUse);
    return store?.prefix || '1053'; // Default to 1053
  };

  const totalInvoice = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // VALIDATIONS
    if (commonData.category === 'kit') {
      if (!commonData.customerName.trim()) { alert("❌ El nombre del cliente es obligatorio."); return; }
      if (!commonData.invoiceNumber.trim()) { alert("❌ El número de factura es obligatorio."); return; }
      if (!ticketImage && !initialData) { alert("❌ La foto del ticket es obligatoria."); return; }
    }

    if (commonData.category === 'chip_0') {
      if (commonData.iccid.length !== 19) { alert("❌ El ICCID debe tener 19 dígitos."); return; }
    }

    if (commonData.category === 'portabilidad') {
      if (!portabilityImage) { alert("❌ La captura de portabilidad es obligatoria."); return; }
      if (commonData.iccid.length !== 19) { alert("❌ El ICCID debe tener 19 dígitos."); return; }
      if (!commonData.phoneNumber) { alert("❌ El número de teléfono es obligatorio."); return; }
    }

    if (commonData.category === 'chip_express') {
      if (commonData.iccid.length !== 19) { alert("❌ El ICCID debe tener 19 dígitos."); return; }
      if (!commonData.phoneNumber) { alert("❌ El número de teléfono es obligatorio."); return; }
    }

    const validatedItems = items.filter(i => i.price && parseFloat(i.price) >= 0);
    if (validatedItems.length === 0 && (commonData.category === 'kit' || commonData.category === 'chip_0')) {
      alert("❌ Debes agregar al menos un artículo con precio válido.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Upload Ticket Image if changed
      let finalTicketUrl = ticketImage;
      if (selectedFile) {
        const storeIdToUse = activeStoreId || userProfile?.storeId;
        const storeName = stores?.find(s => s.id === storeIdToUse)?.name || 'Tienda';
        const chainName = stores?.find(s => s.id === storeIdToUse)?.type || 'General';
        
        const folder = commonData.category === 'kit' ? 'Ventas Kit' : 
                      commonData.category === 'chip_0' ? 'Chip Cero' : 
                      commonData.category === 'portabilidad' ? 'Portabilidad' : 'Ventas Express';

        finalTicketUrl = await smartImageUpload(
          ticketImage!,
          `Ticket - ${commonData.invoiceNumber || 'SinFactura'} - ${commonData.customerName || 'Express'}`,
          commonData.date,
          storeName,
          (commonData.category === 'portabilidad' ? 'portability' : 'sales'),
          userProfile?.fullName || 'Vendedor',
          chainName,
          folder
        );
      }

      // 2. Upload Portability Screenshot if changed
      let finalPortabilityUrl = portabilityImage;
      if (selectedPortabilityFile) {
        const storeIdToUse = activeStoreId || userProfile?.storeId;
        const storeName = stores?.find(s => s.id === storeIdToUse)?.name || 'Tienda';
        const chainName = stores?.find(s => s.id === storeIdToUse)?.type || 'General';

        finalPortabilityUrl = await smartImageUpload(
          portabilityImage!,
          `Porta - ${commonData.phoneNumber} - ${commonData.customerName || 'Cliente'}`,
          commonData.date,
          storeName,
          'portability',
          userProfile?.fullName || 'Vendedor',
          chainName,
          'Portabilidad'
        );
      }

      // 3. Construct and Submit Data
      if (initialData) {
        // UPDATE MODE
        await onUpdateSale({
          ...initialData,
          customerName: commonData.category === 'chip_express' ? "VENTA EXPRESS" : commonData.customerName.toUpperCase(),
          invoiceNumber: (commonData.category === 'chip_express' || commonData.category === 'portabilidad') ? "" : commonData.invoiceNumber,
          date: commonData.date,
          category: commonData.category,
          iccid: commonData.iccid || null,
          phoneNumber: commonData.phoneNumber || null,
          portabilityScreenshot: finalPortabilityUrl || null,
          ticketImage: finalTicketUrl || undefined,
          brand: validatedItems[0]?.brand || Brand.OTRO,
          price: (commonData.category === 'portabilidad' || commonData.category === 'chip_express') ? 0 : (parseFloat(validatedItems[0]?.price) || 0)
        });
      } else {
        // CREATE MODE
        // Handle multiple items for Kit, or single for others
        const entries = commonData.category === 'kit' ? validatedItems : [ { brand: items[0].brand, price: items[0].price } ];
        
        await Promise.all(entries.map(item => {
          return onAddSale({
            customerName: commonData.category === 'chip_express' ? "VENTA EXPRESS" : commonData.customerName.toUpperCase(),
            invoiceNumber: (commonData.category === 'chip_express' || commonData.category === 'portabilidad') ? "" : commonData.invoiceNumber,
            date: commonData.date,
            category: commonData.category,
            iccid: commonData.iccid || null,
            phoneNumber: commonData.phoneNumber || null,
            portabilityScreenshot: finalPortabilityUrl || null,
            ticketImage: finalTicketUrl || undefined,
            brand: item.brand as Brand,
            price: (commonData.category === 'portabilidad' || commonData.category === 'chip_express') ? 0 : (parseFloat(item.price as string) || 0)
          });
        }));
        clearDraft();
      }
      onCancel();
    } catch (err: any) {
      console.error("Submission error:", err);
      alert("Error al guardar: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
      <div className="bg-white rounded-t-[2.5rem] md:rounded-3xl shadow-2xl w-full max-w-2xl overflow-y-auto min-h-[90vh] md:min-h-0 md:max-h-[95vh] animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-300">
        {/* Header */}
        <div className="bg-slate-900 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
              <Save className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{initialData ? 'Editar Registro' : 'Nuevo Registro de Venta'}</h2>
              <p className="text-blue-300 text-xs font-medium">Sucursal: {stores?.find(s => s.id === (activeStoreId || userProfile?.storeId))?.name || 'Cargando...'}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          {/* Category Selector */}
          <div className="bg-slate-50 p-1.5 rounded-2xl flex flex-wrap gap-1 border border-slate-200">
            {availableCategories.includes('kit') && (
              <button 
                type="button"
                onClick={() => setCommonData(prev => ({ ...prev, category: 'kit' }))}
                className={`flex-1 min-w-[70px] flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${commonData.category === 'kit' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Kit
              </button>
            )}
            {availableCategories.includes('chip_0') && (
              <button 
                type="button"
                onClick={() => setCommonData(prev => ({ ...prev, category: 'chip_0' }))}
                className={`flex-1 min-w-[70px] flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${commonData.category === 'chip_0' ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Cpu className="w-3.5 h-3.5" />
                Cero
              </button>
            )}
            {availableCategories.includes('portabilidad') && (
              <button 
                type="button"
                onClick={() => setCommonData(prev => ({ ...prev, category: 'portabilidad' }))}
                className={`flex-1 min-w-[70px] flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${commonData.category === 'portabilidad' ? 'bg-white text-rose-600 shadow-sm border border-rose-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Share2 className="w-3.5 h-3.5" />
                Porta
              </button>
            )}
            {availableCategories.includes('chip_express') && (
              <button 
                type="button"
                onClick={() => setCommonData(prev => ({ ...prev, category: 'chip_express' }))}
                className={`flex-1 min-w-[70px] flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${commonData.category === 'chip_express' ? 'bg-white text-orange-600 shadow-sm border border-orange-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Cpu className="w-3.5 h-3.5" />
                Express
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="block text-sm font-black text-slate-700 uppercase tracking-tighter flex justify-between items-center">
                  <span>Fecha de Venta <span className="text-red-500">*</span></span>
                  {userProfile?.role !== 'admin' && (
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase">Automático</span>
                  )}
                </label>
                <div className="relative group">
                  <Calendar className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <input
                    type="date"
                    required
                    value={commonData.date}
                    disabled={userProfile?.role !== 'admin'}
                    onChange={(e) => setCommonData(prev => ({ ...prev, date: e.target.value }))}
                    className={`w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all font-medium text-slate-800 ${userProfile?.role !== 'admin' ? 'bg-slate-50 cursor-not-allowed opacity-70' : 'bg-white'}`}
                  />
                </div>
              </div>

              {commonData.category !== 'chip_express' && (
                <div className="space-y-1">
                  <label className="block text-sm font-black text-slate-700 uppercase tracking-tighter">
                    Nombre del Cliente <span className="text-red-500">*</span>
                  </label>
                  <div className="relative group">
                    <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                    <input
                      type="text"
                      placeholder="JUAN PEREZ"
                      value={commonData.customerName}
                      onChange={(e) => setCommonData(prev => ({ ...prev, customerName: e.target.value.toUpperCase() }))}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300"
                    />
                  </div>
                </div>
              )}

              {commonData.category !== 'chip_express' && commonData.category !== 'portabilidad' && (
                <div className="space-y-1">
                  <label className="block text-sm font-black text-slate-700 flex justify-between items-center uppercase tracking-tighter">
                    <span>Número de Factura <span className="text-red-500">*</span></span>
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-bold tracking-widest">{getCurrentPrefix()}</span>
                  </label>
                  <div className="relative group">
                    <Package className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                    <input
                      type="text"
                      required
                      placeholder="123456"
                      value={commonData.invoiceNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        const isCoppel = stores?.find(s => s.id === (activeStoreId || userProfile?.storeId))?.type === 'Coppel' || getCurrentPrefix() === '1053';
                        setCommonData(prev => ({ 
                          ...prev, 
                          invoiceNumber: val.substring(0, isCoppel ? 6 : 10) 
                        }));
                      }}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all font-mono font-bold text-slate-800 placeholder:text-slate-300"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium px-1">Solo ingresa los números finales. El prefijo se añade automáticamente.</p>
                </div>
              )}

              {(commonData.category === 'portabilidad' || commonData.category === 'chip_express' || commonData.category === 'chip_0') && (
                <div className="space-y-1">
                  <label className="block text-sm font-black text-slate-700 flex justify-between items-center uppercase tracking-tighter">
                    <span>Número de ICCID <span className="text-red-500">*</span></span>
                    <button 
                      type="button" 
                      onClick={() => setIsScanning(true)}
                      className="text-blue-600 text-[10px] font-black hover:underline flex items-center gap-1"
                    >
                      <Barcode className="w-3 h-3" /> ESCANEAR BARRA
                    </button>
                  </label>
                  <div className="relative group">
                    <Cpu className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                    <input
                      type="text"
                      required
                      placeholder="8952..."
                      value={commonData.iccid}
                      onChange={(e) => setCommonData(prev => ({ ...prev, iccid: e.target.value.replace(/\D/g, '').substring(0, 19) }))}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all font-mono font-bold text-slate-800 placeholder:text-slate-300"
                    />
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[10px] text-slate-400 font-medium">Debe tener 19 dígitos.</p>
                    <span className={`text-[10px] font-bold ${commonData.iccid.length === 19 ? 'text-green-600' : 'text-slate-400'}`}>
                      {commonData.iccid.length}/19
                    </span>
                  </div>
                </div>
              )}

              {(commonData.category === 'portabilidad' || commonData.category === 'chip_express') && (
                <div className="space-y-1">
                  <label className="block text-sm font-black text-slate-700 uppercase tracking-tighter">Número de Teléfono <span className="text-red-500">*</span></label>
                  <div className="relative group">
                    <Phone className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                    <input
                      type="text"
                      required
                      placeholder="993..."
                      value={commonData.phoneNumber}
                      onChange={(e) => setCommonData(prev => ({ ...prev, phoneNumber: e.target.value.replace(/\D/g, '').substring(0, 10) }))}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium px-1">A 10 dígitos.</p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* Product Info Section */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Equipos ({items.length})
                    </h3>
                    {(commonData.category === 'kit' || commonData.category === 'chip_0') && totalInvoice > 0 && (
                      <div className="flex items-center gap-1.5 bg-blue-600 text-white px-2.5 py-1 rounded-lg shadow-sm shadow-blue-100">
                        <span className="text-[8px] font-bold uppercase opacity-80">Total:</span>
                        <span className="text-[11px] font-black tracking-tight">
                          ${totalInvoice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                  {commonData.category === 'kit' && !initialData && (
                    <button type="button" onClick={handleAddItem} className="text-blue-600 text-[10px] font-black hover:underline uppercase tracking-tight">+ Artículo</button>
                  )}
                </div>
                
                {items.map((item, idx) => (
                  <div key={item.tempId} className="space-y-3 pb-3 border-b border-slate-200 last:border-0 last:pb-0">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Marca <span className="text-red-500">*</span></label>
                        <select
                          value={item.brand}
                          onChange={(e) => handleItemChange(item.tempId, 'brand', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-600 font-bold text-xs"
                        >
                          {Object.values(Brand).map(b => (
                            <option key={b} value={b}>{BRAND_CONFIGS[b].label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">
                          Precio <span className="text-red-500">*</span> {commonData.category === 'kit' && '(Con IVA)'}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-slate-400 font-bold text-xs">$</span>
                          <input
                            type="number"
                            step="0.01"
                            disabled={commonData.category === 'portabilidad' || commonData.category === 'chip_express'}
                            placeholder={commonData.category === 'portabilidad' || commonData.category === 'chip_express' ? "0.00" : "2,999"}
                            value={commonData.category === 'portabilidad' || commonData.category === 'chip_express' ? "" : item.price}
                            onChange={(e) => handleItemChange(item.tempId, 'price', e.target.value)}
                            className="w-full pl-6 pr-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-600 font-bold text-xs"
                          />
                        </div>
                      </div>
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => handleRemoveItem(item.tempId)} className="text-red-500 text-[9px] font-bold uppercase hover:underline">Eliminar artículo</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Photos Section */}
              {commonData.category !== 'chip_express' && commonData.category !== 'portabilidad' && (
                <div className="space-y-3">
                  <label className="block text-sm font-black text-slate-700 flex justify-between items-center uppercase tracking-tighter">
                    <span>Foto del Ticket <span className="text-red-500">*</span></span>
                  </label>
                  <div className="flex gap-3">
                    <div 
                      className={`relative w-24 h-24 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all bg-slate-50 ${ticketImage ? 'border-blue-500' : 'border-slate-300 hover:border-blue-400'}`}
                    >
                      {ticketImage ? (
                        <>
                          <img src={ticketImage} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setTicketImage(null)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setShowFullImage(true)}
                            className="absolute bottom-1 right-1 p-1 bg-white/90 text-blue-600 rounded-full shadow-lg hover:bg-white transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <Camera className="w-8 h-8 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex gap-2 items-stretch">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                        >
                          <Camera className="w-4 h-4" />
                          {ticketImage ? 'Cambiar Foto' : 'Tomar Foto'}
                        </button>
                        
                        {userProfile?.role === 'admin' && (
                          <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            className="flex items-center justify-center w-14 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl hover:bg-slate-50 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm"
                            title="Subir de Galería"
                          >
                            <ImageIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                      
                      {/* BOTÓN DE RE-ESCANEO MANUAL */}
                      {ticketImage && !isAnalyzing && (commonData.category === 'kit' || commonData.category === 'chip_0') && (
                        <button
                          type="button"
                          onClick={() => processTicketAI(ticketImage)}
                          className="flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all group/ai"
                        >
                          <Wand2 className="w-3.5 h-3.5 group-hover/ai:rotate-12 transition-transform" />
                          Re-escanear ticket con IA
                        </button>
                      )}
                      
                      {isAnalyzing && (
                        <div className="flex items-center gap-2 text-[9px] font-black text-blue-600 animate-pulse uppercase tracking-widest bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">
                          <Wand2 className="w-3 h-3 animate-spin" />
                          Analizando ticket con IA...
                        </div>
                      )}
                      
                      <p className="text-[9px] text-slate-400 font-bold leading-tight px-1">
                        {userProfile?.role === 'admin' 
                          ? "Puedes tomar una foto o subir un archivo de la galería." 
                          : "Captura el ticket físico. No se permiten capturas de pantalla ni archivos de la galería."}
                      </p>
                    </div>
                  </div>

                  {/* Hidden Inputs */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    capture={userProfile?.role === 'admin' ? undefined : "environment"}
                    className="hidden"
                  />
                  <input
                    type="file"
                    ref={galleryInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              )}

              {commonData.category === 'portabilidad' && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <label className="block text-sm font-black text-slate-700 uppercase tracking-tighter">Captura de Portabilidad <span className="text-rose-600 font-bold">(OBLIGATORIA)</span></label>
                  <div className="flex gap-3 items-center">
                    <div 
                      className={`relative w-24 h-24 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all bg-slate-50 ${portabilityImage ? 'border-rose-500' : 'border-slate-300 hover:border-rose-400'}`}
                    >
                      {portabilityImage ? (
                        <>
                          <img src={portabilityImage} alt="Porta Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setPortabilityImage(null)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow-lg"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setShowFullPortabilityImage(true)}
                            className="absolute bottom-1 right-1 p-1 bg-white/90 text-rose-600 rounded-full shadow-lg"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <Smartphone className="w-8 h-8 text-slate-300" />
                      )}
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => portabilityFileInputRef.current?.click()}
                        className="flex items-center justify-center gap-2 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                      >
                        <Camera className="w-4 h-4" />
                        {portabilityImage ? 'Cambiar Captura' : 'Tomar Captura'}
                      </button>
                      <p className="text-[9px] text-slate-400 font-bold px-1">
                        Sube la captura de pantalla de la portabilidad exitosa.
                      </p>
                    </div>

                    <input
                      type="file"
                      ref={portabilityFileInputRef}
                      onChange={handlePortabilityFileChange}
                      accept="image/*"
                      capture={userProfile?.role === 'admin' ? undefined : "environment"}
                      className="hidden"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex gap-3">
            <button type="button" onClick={onCancel} className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase text-xs hover:bg-slate-200 transition-all">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="flex-[2] px-6 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {isSubmitting ? 'Guardando...' : (initialData ? 'Actualizar Registro' : `Confirmar Venta (${items.length})`)}
            </button>
          </div>
        </form>
      </div>

      {showFullImage && ticketImage && (
        <div className="fixed inset-0 z-[60] bg-black/90 p-4 flex items-center justify-center" onClick={() => setShowFullImage(false)}>
          <img src={ticketImage} className="max-w-full max-h-full object-contain rounded-xl" alt="Ticket" />
        </div>
      )}

      {isScanning && (
        <BarcodeScanner 
          title="Escanear ICCID" 
          onScan={(code) => {
            const clean = code.replace(/\D/g, '').substring(0, 19);
            setCommonData(prev => ({ ...prev, iccid: clean }));
            setIsScanning(false);
          }}
          onClose={() => setIsScanning(false)}
        />
      )}
    </div>
  );
};

export default SalesForm;