import React, { useState, useRef, useEffect } from 'react';
import { Plus, Camera, Loader2, Save, X, Trash2, Smartphone, Edit2, Eye, Share2, FolderOpen, Wand2 } from 'lucide-react'; // Added Eye and Share2 icons
import { Brand, Sale } from '../types';
import { BRAND_CONFIGS } from '../constants';
import { supabase } from '../services/supabaseClient';
import { uploadImageToDriveScript, deleteImageFromDriveScript } from '../services/googleAppsScriptService';
import { uploadToSupabaseStorage, smartImageUpload } from '../services/storageService';
import { analyzeTicketImage } from '../services/geminiService';

interface SalesFormProps {
  onAddSale: (sale: Omit<Sale, 'id'>) => Promise<void>;
  onUpdateSale?: (sale: Sale) => Promise<void>;
  initialData?: Sale | null;
  onCancel: () => void;
  role?: string;
  userProfile?: any;
  stores?: any[];
  activeStoreId?: string;
}

interface SaleItem {
  tempId: number;
  brand: Brand;
  price: string;
  error?: string;
}

const SalesForm: React.FC<SalesFormProps> = ({ onAddSale, onUpdateSale, initialData, onCancel, role, userProfile, stores, activeStoreId }) => {
  // Construct local YYYY-MM-DD for default date to avoid UTC issues
  const localDate = new Date();
  const defaultDateStr = localDate.getFullYear() + '-' +
    String(localDate.getMonth() + 1).padStart(2, '0') + '-' +
    String(localDate.getDate()).padStart(2, '0');

  // Helper to ensure #1053- prefix format (Strict)
  const formatInvoice = (val: string) => {
    if (!val) return '#1053-';

    // Clean to alphanumeric/dash only, removing existing hashes to normalize
    let clean = val.replace(/#/g, '').trim();

    // If starts with 1053-
    if (/^1053-\d+$/.test(clean)) {
      return '#' + clean;
    }

    // Check if it starts with 1053 but no dash (e.g. 1053123)
    if (/^1053\d+$/.test(clean)) {
      // Insert dash? Users might just type 1053123. 
      // We'll normalize to #1053-123
      return '#1053-' + clean.substring(4);
    }

    // Just digits? Add #1053-
    // But remove 1053 prefix if user blindly typed it without dash?
    // Let's use simple logic: Remove 1053 if present at start, then prepend strict prefix.
    clean = clean.replace(/[^0-9-]/g, ''); // Keep dash

    // If user typed '1053-' manually
    if (clean.startsWith('1053-')) {
      return '#' + clean;
    }

    // If just digits
    const digits = clean.replace(/\D/g, '');
    if (digits.startsWith('1053') && digits.length > 4) {
      return '#1053-' + digits.substring(4);
    }

    return '#1053-' + digits;
  };

  // Common fields for the whole ticket
  const [commonData, setCommonData] = useState({
    invoiceNumber: initialData?.invoiceNumber ? formatInvoice(initialData.invoiceNumber) : '#1053-',
    customerName: initialData?.customerName || '',
    date: initialData?.date || defaultDateStr,
  });

  // List of devices in this ticket
  const [items, setItems] = useState<SaleItem[]>(
    initialData
      ? [{ tempId: Date.now(), brand: initialData.brand, price: initialData.price.toString() }]
      : [{ tempId: Date.now(), brand: Brand.SAMSUNG, price: '' }]
  );

  const [ticketImage, setTicketImage] = useState<string | null>(initialData?.ticketImage || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showFullImage, setShowFullImage] = useState(false); // New state for modal

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // --- DRAFT PERSISTENCE ---
  const clearDraft = () => localStorage.removeItem('sales_form_draft');

  // Load draft on mount
  useEffect(() => {
    if (!initialData) {
      const draft = localStorage.getItem('sales_form_draft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          // Simple validation before hydrating
          if (parsed.commonData) setCommonData(parsed.commonData);
          if (parsed.items && Array.isArray(parsed.items)) setItems(parsed.items);
          if (parsed.ticketImage) setTicketImage(parsed.ticketImage);
        } catch (e) {
          console.error("Error loading draft", e);
        }
      }
    }
  }, []);

  // Save draft on change
  useEffect(() => {
    if (!initialData) {
      const draft = { commonData, items, ticketImage };
      const timeoutId = setTimeout(() => {
        try {
          localStorage.setItem('sales_form_draft', JSON.stringify(draft));
        } catch (e) {
          // Silent fail (usually quota exceeded for large images)
        }
      }, 500); // Debounce saves
      return () => clearTimeout(timeoutId);
    }
  }, [commonData, items, ticketImage, initialData]);
  // -------------------------

  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const val = parseFloat(item.price);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  };

  const validatePrice = (value: string): { isValid: boolean, error?: string } => {
    if (!value) return { isValid: false, error: "Requerido" };
    const validFormat = /^\d+(\.\d{1,2})?$/;
    const numericValue = parseFloat(value);
    if (isNaN(numericValue) || numericValue <= 0) return { isValid: false, error: "> 0" };
    if (!validFormat.test(value)) return { isValid: false, error: "Formato inválido" };
    return { isValid: true };
  };

  const handleCommonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Validation: Prefix 1053- logic
    if (name === 'invoiceNumber') {
      // Remove 1053- prefix if present to get just the user input part
      let inputVal = value;

      // If user tries to delete the prefix, enforce it back
      if (!inputVal.startsWith('1053-')) {
        // Check if they deleted the dash or part of 1053
        const digits = inputVal.replace(/\D/g, ''); // all digits
        // If they have less than 4 digits, it means they deleted part of '1053'. Reset to '1053-'
        // But we also want to capture if they pasted '1053800'
        if (digits.startsWith('1053') && digits.length >= 4) {
          inputVal = '1053-' + digits.slice(4);
        } else {
          // Just reconstruct from whatever digits are after the imaginary prefix
          // This is tricky. simpler: get everything after '1053-'?
          // If the user selects all and types '6', value is '6'. 
          // We want '1053-6'.
          inputVal = '1053-' + digits.replace(/^1053/, '');
        }
      }

      // Extract suffix (everything after 1053-)
      let suffix = inputVal.replace(/^1053-/, '').replace(/\D/g, '');

      // Limit to 6 digits
      if (suffix.length > 6) suffix = suffix.slice(0, 6);

      setCommonData(prev => ({ ...prev, [name]: '1053-' + suffix }));
      return;
    }

    setCommonData(prev => ({ ...prev, [name]: value }));
  };

  // Item management
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      { tempId: Date.now(), brand: Brand.SAMSUNG, price: '' }
    ]);
  };

  const handleRemoveItem = (tempId: number) => {
    if (items.length > 1) {
      setItems(prev => prev.filter(i => i.tempId !== tempId));
    }
  };

  const handleItemChange = (tempId: number, field: keyof SaleItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;

      const updated = { ...item, [field]: value };

      // Clear error if typing price
      if (field === 'price' && item.error) {
        updated.error = undefined;
      }
      return updated;
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file); // Keep track that a file was selected

      // Compress image
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDimension = 1000;

          // Resize logic
          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress to JPEG 0.7 quality (good balance)
          // This significantly reduces size for upload
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          setTicketImage(compressedBase64);

          // Trigger AI Analysis
          // handleAnalyzeTicket(compressedBase64); // DISABLED: User wants manual trigger only
        };
      };
    }
  };

  const handleAnalyzeTicket = async (base64Image: string) => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeTicketImage(base64Image);

      // Update fields if we got results
      if (result) {
        setCommonData(prev => ({
          ...prev,
          invoiceNumber: result.invoiceNumber ? formatInvoice(result.invoiceNumber) : prev.invoiceNumber,
          date: result.date || prev.date,
          customerName: result.customerName ? result.customerName.toUpperCase() : prev.customerName
        }));

        if (result.items && result.items.length > 0) {
          setItems(result.items.map((item, index) => ({
            tempId: Date.now() + index,
            brand: item.brand,
            price: item.price !== undefined ? item.price.toString() : '',
            error: undefined
          })));
          // alert("✅ ¡Datos extraídos con éxito!\n\nVerifica que la información sea correcta antes de guardar."); // REMOVED
        } else {
          console.warn("La IA leyó el ticket pero no encontró equipos móviles claros.");
          // alert("⚠️ La IA leyó el ticket pero no encontró equipos móviles claros.\n\nVerifica la foto o llena los datos manualmente."); // REMOVED
        }
      }
    } catch (error: any) {
      console.error("Error analyzing ticket:", error);
      alert(`⚠️ No se pudo analizar el ticket.\n\nDetalle: ${error.message || "Error desconocido"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate Common Fields
    if (!commonData.invoiceNumber.trim() || !commonData.customerName.trim()) {
      alert("Por favor complete los campos obligatorios: Número de Factura y Nombre del Cliente.");
      return;
    }

    // Validate Items
    let allValid = true;
    const validatedItems = items.map(item => {
      const validation = validatePrice(item.price);
      if (!validation.isValid) {
        allValid = false;
        return { ...item, error: validation.error };
      }
      return item;
    });

    if (!allValid) {
      setItems(validatedItems);
      alert("Por favor ingrese un precio válido para todos los equipos.");
      return;
    }

    // Photo check...
    if (!ticketImage && role !== 'admin') {
      alert("⚠️ La foto del ticket es obligatoria para concluir la venta.");
      return;
    }

    // DATE CHECK (Alert if not today)
    const now = new Date();
    const todayStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    if (commonData.date !== todayStr) {
      const confirmDate = window.confirm(
        `⚠️ ATENCIÓN: La fecha de la venta (${commonData.date}) NO es hoy (${todayStr}).\n\n` +
        `¿Estás seguro de que la fecha es correcta?`
      );
      if (!confirmDate) return;
    }

    setIsSubmitting(true);

    // --- DUPLICATE CHECK ---
    try {
      // Check if invoice exists (exclude current ID if editing)
      let query = supabase.from('sales').select('id, customer_name').eq('invoice_number', commonData.invoiceNumber).limit(1);

      if (initialData) {
        query = query.neq('id', initialData.id);
      }

      const { data: existing, error: checkError } = await query;

      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        const confirm = window.confirm(
          `⚠️ ATENCIÓN: La factura #${commonData.invoiceNumber} ya existe (Cliente: ${existing[0].customer_name}).\n\n` +
          `¿Es parte de una venta múltiple con varios equipos?\n` +
          `[Aceptar] SÍ, agregar a la factura existente.\n` +
          `[Cancelar] NO, corregir el número de factura.`
        );

        if (!confirm) {
          setIsSubmitting(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Could not verify duplicates:", err);
      // Proceed cautiously even if check fails, or stop?
      // Let's proceed to avoid blocking offline usage (though Supabase client handles offline somewhat? No, standard client doesn't).
      // If offline, this check might fail. We should probably let it pass or warn.
    }
    // -----------------------
    let finalImageUrl: string | undefined = ticketImage || undefined;

    // 📸 NEW ROBUST UPLOAD LOGIC (Supabase + Background Drive Sync)
    if (ticketImage && ticketImage.startsWith('data:')) {
      try {
        const storeIdToUse = activeStoreId || userProfile?.storeId;
        const storeName = stores?.find((s: any) => s.id === storeIdToUse)?.name || 'Sucursal Desconocida';
        const filename = `Ticket Factura #${commonData.invoiceNumber} - ${commonData.customerName.toUpperCase()}`;
        
        // Month Formatting: Only Name (e.g. "Abril")
        const [y, m, d] = commonData.date.split('-');
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const monthIndex = parseInt(m) - 1;
        const formattedMonth = monthNames[monthIndex];
        
        // Set global hint for background sync
        (window as any)._customMonthName = formattedMonth;

        finalImageUrl = await smartImageUpload(ticketImage, filename, commonData.date, storeName, 'sales');
      } catch (error) {
        console.error("Error crítico en guardado de foto:", error);
        alert("⚠️ No se pudo guardar la foto en el servidor. Verifica tu conexión.");
        setIsSubmitting(false);
        return;
      }
    }

    // Submit logic
    try {
      if (initialData && onUpdateSale) {
        // EDIT MODE: Update single item
        await onUpdateSale({
          id: initialData.id,
          invoiceNumber: (() => {
            let c = commonData.invoiceNumber.replace(/[^0-9]/g, '');
            if (c.startsWith('1053') && c.length > 4) c = c.substring(4);
            return `#1053-${c}`;
          })(),
          customerName: commonData.customerName.toUpperCase(),
          date: commonData.date,
          price: parseFloat(items[0].price),
          brand: items[0].brand,
          ticketImage: finalImageUrl || initialData.ticketImage, // Keep old if no new one, or use new one
          createdBy: initialData.createdBy
        });
      } else {
        // CREATE MODE: Submit all items
        // We process sequentially or parallel. Parallel is fine.
        await Promise.all(validatedItems.map(item => {
          return onAddSale({
            invoiceNumber: (() => {
              let c = commonData.invoiceNumber.replace(/[^0-9]/g, '');
              if (c.startsWith('1053') && c.length > 4) c = c.substring(4);
              return `#1053-${c}`;
            })(),
            customerName: commonData.customerName.toUpperCase(),
            date: commonData.date,
            price: parseFloat(item.price),
            brand: item.brand,
            ticketImage: finalImageUrl
          });
        }));
        clearDraft(); // Success! Clear saved state
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 max-w-3xl mx-auto border border-slate-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          {initialData ? <Edit2 className="w-6 h-6 text-blue-600" /> : <Plus className="w-6 h-6 text-blue-600" />}
          {initialData ? 'Editar Venta' : 'Nueva Venta'}
        </h2>

        <button onClick={() => { clearDraft(); onCancel(); }} className="text-slate-400 hover:text-slate-600">
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* SECTION 1: COMMON DATA */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            Datos Generales del Ticket
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                Número de Factura <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                name="invoiceNumber"
                value={commonData.invoiceNumber}
                onChange={handleCommonChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                placeholder="1053-XXXXXX"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                Nombre del Cliente <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="customerName"
                value={commonData.customerName}
                onChange={(e) => setCommonData(prev => ({ ...prev, customerName: e.target.value }))}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900 uppercase placeholder:normal-case"
                placeholder="Nombre completo"
                required
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-sm font-medium text-slate-700">
                Fecha <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="date"
                value={commonData.date}
                onChange={handleCommonChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                required
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: ITEMS LIST */}
        <div>
          <div className="flex justify-between items-end mb-2">
            <label className="block text-sm font-bold text-slate-700">Equipos Vendidos ({items.length})</label>
            <div className="text-sm text-slate-500 font-medium bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              Total Factura: <span className="text-slate-900 font-bold">${calculateTotal().toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {items.map((item, index) => (
              <div
                key={item.tempId}
                className={`p-4 flex flex-col md:flex-row gap-4 items-start md:items-center bg-white animate-in fade-in slide-in-from-left-2 duration-300 ${index !== 0 ? 'border-t border-slate-100' : ''}`}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-sm font-bold shrink-0">
                  {index + 1}
                </div>

                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Brand Selector */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-500 mb-1 md:hidden">Marca</label>
                    <select
                      value={item.brand}
                      onChange={(e) => handleItemChange(item.tempId, 'brand', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900 cursor-pointer text-sm"
                    >
                      {Object.values(Brand).map((brand) => (
                        <option key={brand} value={brand}>
                          {BRAND_CONFIGS[brand].label}
                        </option>
                      ))}
                    </select>
                    {/* Brand Color Indicator */}
                    <div
                      className={`absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${BRAND_CONFIGS[item.brand].colorClass.split(' ')[0]} md:mt-0 mt-3`}
                      style={{ backgroundColor: BRAND_CONFIGS[item.brand].hex }}
                    />
                  </div>

                  {/* Price Input */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-500 mb-1 md:hidden">
                      Precio <span className="text-red-500">*</span>
                    </label>
                    <span className="absolute left-3 top-2 md:top-2 text-slate-500 text-sm hidden md:block">$</span>
                    <span className="absolute left-3 top-8 text-slate-500 text-sm md:hidden">$</span>
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => handleItemChange(item.tempId, 'price', e.target.value)}
                      className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-2 outline-none text-sm transition-all bg-white text-slate-900 placeholder:text-slate-400 ${item.error
                        ? 'border-red-500 bg-red-50 focus:ring-red-200'
                        : 'border-slate-300 focus:ring-blue-500'
                        }`}
                      placeholder="0.00"
                      step="0.01"
                      required
                    />
                    {item.error && (
                      <span className="absolute right-3 top-2 text-red-500 text-xs font-bold md:block hidden">{item.error}</span>
                    )}
                    {item.error && (
                      <span className="text-red-500 text-xs font-bold md:hidden block mt-1">{item.error}</span>
                    )}
                  </div>
                </div>

                {/* Remove Button */}
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.tempId)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end md:self-auto"
                    title="Quitar equipo"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            disabled={!!initialData} // Disable adding items in Edit Mode
            className={`mt-4 flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg transition-colors border border-dashed w-full md:w-auto justify-center ${initialData ? 'text-slate-400 border-slate-200 cursor-not-allowed' : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200'}`}
          >
            <Plus className="w-4 h-4" />
            {initialData ? 'Edición de un solo item' : 'Agregar otro equipo al ticket'}
          </button>
        </div>

        {/* SECTION 3: TICKET IMAGE */}
        <div className="space-y-2 pt-4 border-t border-slate-100">
          <label className="block text-sm font-medium text-slate-700 flex justify-between items-center">
            <span>Foto del Ticket <span className="text-blue-600 font-bold">(Autocompletado con IA)</span></span>
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 uppercase tracking-wider font-bold">Recomendado</span>
          </label>
          <div className="flex flex-col md:flex-row items-start gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <div
                  className={`
                    relative w-32 h-32 rounded-lg border-2 border-dashed flex flex-col items-center justify-center overflow-hidden bg-white shrink-0
                    ${ticketImage ? 'border-blue-500' : 'border-slate-300'}
                  `}
                >
                  {ticketImage ? (
                    ticketImage.includes('google.com') || ticketImage.includes('drive.google') ? (
                      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-xs text-center p-2 relative group">
                        <span className="font-bold">Foto en la nube</span>
                        <button
                          type="button"
                          className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); setShowFullImage(true); }}
                        >
                          <Eye className="w-6 h-6 mb-1" />
                          <span className="text-[10px] uppercase tracking-wider">Ver Foto</span>
                        </button>
                      </div>
                    ) : (
                      <div className="relative w-full h-full group">
                        <img src={ticketImage} alt="Ticket preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setShowFullImage(true)}
                        >
                          <Eye className="w-6 h-6 mb-1" />
                          <span className="text-[10px]">Ampliar</span>
                        </button>
                      </div>
                    )
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-500 text-center px-1">Sin foto</span>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors border border-slate-200"
                  >
                    {ticketImage ? 'Cambiar Foto' : 'Tomar Foto'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (ticketImage) {
                        handleAnalyzeTicket(ticketImage);
                      } else {
                        alert("📸 Primero debes tomar una foto del ticket para poder escanearlo.");
                        // Optional: fileInputRef.current?.click(); // We don't do this to strictly follow "No abra la cámara"
                      }
                    }}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Wand2 className={`w-4 h-4 text-yellow-300 ${isAnalyzing ? 'animate-spin' : ''}`} />
                    {isAnalyzing ? 'Analizando...' : 'Escanear / Autocompletar'}
                  </button>
                  {ticketImage && (ticketImage.includes('google.com') || ticketImage.includes('drive.google')) && (
                    <p className="text-[10px] text-slate-400 max-w-[150px] leading-tight">
                      La foto actual está guardada en la nube. Puedes cambiarla si lo deseas.
                    </p>
                  )}

                  {role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors border border-slate-200 flex items-center justify-center gap-2"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Desde Archivos
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Toma una foto clara del ticket. La imagen se guardará de forma segura en la nube.
              </p>
              {isAnalyzing && (
                <div className="flex items-center gap-2 text-blue-600 text-xs font-bold animate-pulse">
                  <Wand2 className="w-3 h-3" />
                  Analizando ticket con IA...
                </div>
              )}
            </div>
          </div>

        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => { clearDraft(); onCancel(); }}
            disabled={isSubmitting}
            className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors bg-white border border-slate-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all flex items-center gap-2 shadow-md shadow-blue-200 disabled:opacity-70 disabled:cursor-wait"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSubmitting ? (selectedFile ? "Subiendo imagen..." : "Guardando...") : (initialData ? "Actualizar Venta" : `Guardar Venta (${items.length})`)}
          </button>
        </div>
      </form>

      {/* Full Image Modal */}
      {showFullImage && ticketImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/95 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowFullImage(false)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 right-0 p-4 flex gap-3 pointer-events-none z-50">
              {ticketImage && (
                <button
                  className="pointer-events-auto bg-slate-900 text-white p-3 rounded-full hover:bg-slate-800 transition-colors shadow-xl border border-slate-700"
                  onClick={async () => {
                    try {
                      if (!navigator.share) {
                        alert("Función no disponible en este dispositivo");
                        return;
                      }

                      // Try to share as file if possible (Base64)
                      if (ticketImage.startsWith('data:')) {
                        const res = await fetch(ticketImage);
                        const blob = await res.blob();
                        const file = new File([blob], `ticket-${commonData.invoiceNumber || 'venta'}.jpg`, { type: 'image/jpeg' });

                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                          await navigator.share({
                            files: [file],
                            title: 'Ticket de Venta',
                            text: `Factura #${commonData.invoiceNumber}`
                          });
                          return;
                        }
                      }

                      // Fallback: Share URL (Drive links or if file share fails)
                      await navigator.share({
                        title: 'Ticket de Venta',
                        text: `Factura #${commonData.invoiceNumber}`,
                        url: ticketImage
                      });

                    } catch (err) {
                      console.error("Error al compartir:", err);
                    }
                  }}
                >
                  <Share2 className="w-6 h-6" />
                </button>
              )}
              <button
                className="pointer-events-auto bg-slate-900 text-white p-3 rounded-full hover:bg-slate-800 transition-colors shadow-xl border border-slate-700"
                onClick={() => setShowFullImage(false)}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {ticketImage.includes('google.com') || ticketImage.includes('drive.google') ? (
              <iframe
                src={ticketImage.replace('uc?export=view&id=', 'file/d/').replace('/view', '/preview').includes('/preview') ? ticketImage : ticketImage.includes('file/d/') ? ticketImage.split('/view')[0] + '/preview' : `https://drive.google.com/file/d/${ticketImage.split('id=')[1]}/preview`}
                className="w-full h-[80vh] rounded-xl shadow-2xl bg-white"
                allow="autoplay"
                title="Ticket Preview"
              ></iframe>
            ) : (
              <img src={ticketImage} alt="Full Ticket" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesForm;