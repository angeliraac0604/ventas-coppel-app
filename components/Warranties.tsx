import React, { useState, useEffect } from 'react';
import {
    ShieldAlert,
    Plus,
    Search,
    Smartphone,
    Calendar,
    User,
    FileText,
    Thermometer,
    Phone,
    Truck,
    CheckCircle2,
    PackageCheck,
    X,
    Camera,
    Share2,
    Image as ImageIcon,
    Loader2,
    ExternalLink,
    Trash2,
    Settings,
    Pencil
} from 'lucide-react';
import { Warranty, Brand, BrandConfig } from '../types';
import { uploadImageToDriveScript } from '../services/googleAppsScriptService';
import { smartImageUpload } from '../services/storageService';

interface WarrantiesProps {
    warranties: Warranty[];
    onAddWarranty: (warranty: Omit<Warranty, 'id'>) => Promise<Warranty | null>;
    onUpdateWarranty?: (warranty: Warranty) => Promise<void>;
    onUpdateStatus: (id: string, status: Warranty['status']) => Promise<void>;
    onDeleteWarranty: (warranty: Warranty) => Promise<void>;
    brandConfigs: Record<Brand, BrandConfig>;
    isAdmin: boolean;
    userProfile?: any;
    stores?: any[];
}

const Warranties: React.FC<WarrantiesProps> = ({
    warranties,
    onAddWarranty,
    onUpdateWarranty,
    onUpdateStatus,
    onDeleteWarranty,
    brandConfigs,
    isAdmin,
    userProfile,
    stores = []
}) => {
    // Safety check: if no warranties provided, default to empty array
    const safeWarranties = Array.isArray(warranties) ? warranties : [];
    const safeBrandConfigs = brandConfigs || {} as any;

    console.log("Warranties rendering with:", { 
        count: safeWarranties.length, 
        isAdmin, 
        hasUserProfile: !!userProfile, 
        storesCount: stores.length 
    });

    const [isAdding, setIsAdding] = useState(false);
    const [warrantyToEdit, setWarrantyToEdit] = useState<Warranty | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | Warranty['status']>('all');

    const startEditingWarranty = (warranty: Warranty) => {
        setWarrantyToEdit(warranty);
        setFormData({
            receptionDate: warranty.receptionDate,
            invoiceNumber: warranty.invoiceNumber,
            possibleEntryDate: warranty.possibleEntryDate || '',
            brand: warranty.brand,
            model: warranty.model,
            imei: warranty.imei || '',
            issueDescription: warranty.issueDescription,
            accessories: warranty.accessories || '',
            physicalCondition: warranty.physicalCondition,
            contactNumber: warranty.contactNumber,
            phoneDetails: warranty.phoneDetails || ''
        });
        setIsAdding(true);
    };

    const [whatsappGroupLink, setWhatsappGroupLink] = useState(() => {
        try {
            return localStorage.getItem('coppel_warranty_whatsapp_group') || '';
        } catch {
            return '';
        }
    });
    const [showGroupConfigModal, setShowGroupConfigModal] = useState(false);
    const [tempGroupLink, setTempGroupLink] = useState(whatsappGroupLink);

    const saveGroupLink = (e: React.FormEvent) => {
        e.preventDefault();
        setWhatsappGroupLink(tempGroupLink);
        try {
            localStorage.setItem('coppel_warranty_whatsapp_group', tempGroupLink);
        } catch {}
        setShowGroupConfigModal(false);
        alert("✅ Enlace del grupo de WhatsApp guardado correctamente.");
    };

    const defaultTemplates = {
        received: '¡Hola! Te saludamos de Coppel. 📱 Te confirmamos que hemos recibido tu equipo *{brand} {model}* (IMEI: {imei}) e ingresado formalmente a garantía el día *{date}*. Le daremos seguimiento a su proceso y te avisaremos cualquier novedad. ¡Gracias por tu confianza!',
        sent_to_provider: '¡Hola! Te informamos desde Coppel que tu equipo *{brand} {model}* (IMEI: {imei}) ya ha sido *enviado a centro de servicio / proveedor* para su revisión en garantía. Continuamos al pendiente y te avisaremos en cuanto regrese a tienda.',
        in_store: '¡Hola! Tenemos excelentes noticias de Coppel. 🎉 Tu equipo *{brand} {model}* ya se encuentra de regreso en nuestra sucursal y *listo para que pases a recogerlo*. ¡Te esperamos!',
        delivered: '¡Hola! Te saludamos de Coppel. 🤝 Queremos confirmar la entrega de tu equipo *{brand} {model}* ya reparado/atendido en garantía. Agradecemos tu preferencia y estamos para servirte.',
        group: '*📋 REPORTE DE GARANTÍA - COPPEL*\n--------------------------------\n📅 Fecha: {date}\n📱 Equipo: {brand} {model}\n🔢 IMEI: {imei}\n👤 Teléfono Cliente: {phone}\n🔧 Falla: {issue}\n🔌 Accesorios: {accessories}\n🔍 Estado: {physical}\n⚠️ Detalles del Teléfono: {details}'
    };

    const [templates, setTemplates] = useState(() => {
        try {
            const saved = localStorage.getItem('coppel_warranty_templates');
            return saved ? JSON.parse(saved) : defaultTemplates;
        } catch {
            return defaultTemplates;
        }
    });

    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [tempTemplates, setTempTemplates] = useState(templates);

    const saveTemplates = (e: React.FormEvent) => {
        e.preventDefault();
        setTemplates(tempTemplates);
        try {
            localStorage.setItem('coppel_warranty_templates', JSON.stringify(tempTemplates));
        } catch {}
        setShowTemplateModal(false);
        alert("✅ Plantillas de mensajes actualizadas correctamente.");
    };

    const formatMessage = (template: string, warranty: Warranty) => {
        const brandName = (safeBrandConfigs[warranty.brand]?.label || warranty.brand || 'Equipo').toUpperCase();
        const modelName = warranty.model.toUpperCase();
        return template
            .replace(/\{brand\}/g, brandName)
            .replace(/\{model\}/g, modelName)
            .replace(/\{imei\}/g, warranty.imei || 'N/A')
            .replace(/\{date\}/g, warranty.receptionDate)
            .replace(/\{phone\}/g, warranty.contactNumber || 'N/A')
            .replace(/\{issue\}/g, warranty.issueDescription || 'N/A')
            .replace(/\{accessories\}/g, warranty.accessories || 'Ninguno')
            .replace(/\{physical\}/g, warranty.physicalCondition || 'N/A')
            .replace(/\{details\}/g, warranty.phoneDetails || 'Ninguno');
    };

    const handleSendToGroup = (warranty: Warranty) => {
        const text = formatMessage(templates.group, warranty) + (warranty.ticketImage ? `\n📷 Evidencia: ${warranty.ticketImage}` : '');

        if (!whatsappGroupLink || whatsappGroupLink.trim() === '') {
            alert("⚠️ No has configurado el enlace o número de tu grupo de WhatsApp.\n\nPor favor, haz clic en el botón verde '👥 Grupo WhatsApp' en la parte superior.");
            setShowGroupConfigModal(true);
            return;
        }

        navigator.clipboard.writeText(text).catch(() => {});

        const cleanNum = whatsappGroupLink.replace(/\D/g, '');
        if (whatsappGroupLink.includes('chat.whatsapp.com') || cleanNum.length < 10) {
            alert("📋 ¡Reporte copiado al portapapeles!\n\nSe abrirá tu grupo de WhatsApp. Selecciona el grupo y pega el mensaje (Ctrl+V o Mantén presionado y Pegar).");
            window.open(whatsappGroupLink.startsWith('http') ? whatsappGroupLink : `https://${whatsappGroupLink}`, '_blank');
        } else {
            const targetNum = cleanNum.startsWith('52') ? cleanNum : `52${cleanNum}`;
            alert("📋 ¡Reporte copiado! Abriendo chat del supervisor...");
            const url = `https://wa.me/${targetNum}?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        }
    };

    // Form State
    const [formData, setFormData] = useState<Omit<Warranty, 'id' | 'status'>>({
        receptionDate: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'),
        invoiceNumber: '',
        possibleEntryDate: '',
        brand: Brand.SAMSUNG,
        model: '',
        imei: '',
        issueDescription: '',
        accessories: '',
        physicalCondition: '',
        contactNumber: '',
        phoneDetails: ''
    });

    // --- HANDLERS ---

    const handleNumericInput = (field: keyof typeof formData, value: string, maxLength: number) => {
        const numericValue = value.replace(/\D/g, '').slice(0, maxLength);
        setFormData(prev => ({ ...prev, [field]: numericValue }));
    };

    const validateForm = () => {
        if (!formData.invoiceNumber || !formData.receptionDate || !formData.possibleEntryDate || !formData.brand || !formData.model || !formData.imei || !formData.issueDescription || !formData.accessories || !formData.physicalCondition || !formData.contactNumber || !formData.phoneDetails) {
            alert("⚠️ Todos los campos son obligatorios para registrar la garantía.");
            return false;
        }

        if (formData.imei.length !== 15) {
            alert("⚠️ El IMEI debe tener exactamente 15 dígitos.");
            return false;
        }

        if (formData.contactNumber.length !== 10) {
            alert("⚠️ El número de contacto debe tener 10 dígitos.");
            return false;
        }

        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);

        try {
            if (warrantyToEdit && onUpdateWarranty) {
                await onUpdateWarranty({
                    ...warrantyToEdit,
                    ...formData,
                    status: warrantyToEdit.status
                });
                setIsAdding(false);
                setWarrantyToEdit(null);
            } else {
                const created = await onAddWarranty({
                    ...formData,
                    status: 'received'
                });

                setIsAdding(false);
                setWarrantyToEdit(null);

                if (created && window.confirm("¿Deseas enviar el mensaje de WhatsApp de ingreso al cliente?")) {
                    handleSendCustomerWhatsApp(created, 'received');
                }
            }
            setFormData({
                receptionDate: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'),
                invoiceNumber: '',
                possibleEntryDate: '',
                brand: Brand.SAMSUNG,
                model: '',
                imei: '',
                issueDescription: '',
                accessories: '',
                physicalCondition: '',
                contactNumber: '',
                phoneDetails: ''
            });

        } catch (error) {
            console.error(error);
            alert("Error al guardar garantía.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleShareWhatsApp = async (warranty: Warranty) => {
        const text = formatMessage(templates.group || defaultTemplates.group, warranty);
        
        if (whatsappGroupLink && whatsappGroupLink.includes('chat.whatsapp.com')) {
            try {
                await navigator.clipboard.writeText(text);
                alert("📋 ¡Reporte copiado al portapapeles!\n\nSe abrirá el grupo de WhatsApp. Pega el mensaje (Ctrl+V o Pegar) para enviarlo.");
            } catch (e) {
                console.warn("Clipboard failed", e);
            }
            window.open(whatsappGroupLink, '_blank');
            return;
        }

        let targetPhone = '';
        if (whatsappGroupLink) {
            const clean = whatsappGroupLink.replace(/\D/g, '');
            if (clean.length >= 10) {
                targetPhone = clean.startsWith('52') ? clean : `52${clean}`;
            }
        }

        const url = targetPhone 
            ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`
            : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const handleSendCustomerWhatsApp = async (warranty: Warranty, type: 'received' | 'sent_to_provider' | 'in_store' | 'delivered' | 'general') => {
        let phone = '';
        let msg = '';

        if (type === 'received') {
            phone = warranty.contactNumber ? `52${warranty.contactNumber.replace(/\D/g, '')}` : '';
            msg = formatMessage(templates.received, warranty);
        } else if (type === 'sent_to_provider') {
            phone = warranty.contactNumber ? `52${warranty.contactNumber.replace(/\D/g, '')}` : '';
            msg = formatMessage(templates.sent_to_provider, warranty);
        } else if (type === 'in_store') {
            phone = warranty.contactNumber ? `52${warranty.contactNumber.replace(/\D/g, '')}` : '';
            msg = formatMessage(templates.in_store, warranty);
        } else if (type === 'delivered') {
            phone = warranty.contactNumber ? `52${warranty.contactNumber.replace(/\D/g, '')}` : '';
            msg = formatMessage(templates.delivered, warranty);
        } else {
            // General / Report -> Send to WhatsApp Group if configured!
            msg = formatMessage(templates.group, warranty);

            if (whatsappGroupLink && whatsappGroupLink.includes('chat.whatsapp.com')) {
                try {
                    await navigator.clipboard.writeText(msg);
                    alert("📋 ¡Reporte copiado al portapapeles!\n\nSe abrirá el grupo de WhatsApp. Pega el mensaje (Ctrl+V o Pegar) para enviarlo.");
                } catch (e) {}
                window.open(whatsappGroupLink, '_blank');
                return;
            }

            if (whatsappGroupLink) {
                const clean = whatsappGroupLink.replace(/\D/g, '');
                if (clean.length >= 10) {
                    phone = clean.startsWith('52') ? clean : `52${clean}`;
                }
            }
            if (!phone) {
                phone = warranty.contactNumber ? `52${warranty.contactNumber.replace(/\D/g, '')}` : '';
            }
        }

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    // --- FILTERING ---
    const filteredWarranties = safeWarranties.filter(w => {
        if (!w) return false;
        const matchesSearch =
            (w.model || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (w.contactNumber || '').includes(searchTerm) ||
            (w.imei && w.imei.includes(searchTerm));

        const matchesFilter = filterStatus === 'all' || w.status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    // Sort by Status Priority: received > sent_to_provider > in_store > delivered
    const statusPriority: Record<string, number> = {
        'received': 0,
        'sent_to_provider': 1,
        'in_store': 2,
        'delivered': 3
    };

    const sortedWarranties = [...filteredWarranties].sort((a, b) => {
        if (!a || !b) return 0;
        const priorityA = statusPriority[a.status] ?? 99;
        const priorityB = statusPriority[b.status] ?? 99;
        return priorityA - priorityB;
    });

    const getStatusBadge = (status: Warranty['status']) => {
        switch (status) {
            case 'received':
                return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-yellow-200 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Recibido</span>;
            case 'sent_to_provider':
                return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-blue-200 flex items-center gap-1"><Truck className="w-3 h-3" /> Enviado</span>;
            case 'in_store':
                return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-purple-200 flex items-center gap-1"><PackageCheck className="w-3 h-3" /> En Tienda</span>;
            case 'delivered':
                return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-green-200 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Entregado</span>;
        }
    };

    const confirmStatusChange = (warranty: Warranty, newStatus: Warranty['status']) => {
        const statusLabels: Record<string, string> = {
            'sent_to_provider': 'Enviado a Proveedor',
            'in_store': 'Recibido / Listo en Tienda',
            'delivered': 'Entregado al Cliente'
        };

        if (window.confirm(`¿Deseas actualizar a "${statusLabels[newStatus] || newStatus}"?\n\n¿Deseas enviar el mensaje de WhatsApp al cliente?`)) {
            onUpdateStatus(warranty.id, newStatus);
            handleSendCustomerWhatsApp(warranty, newStatus);
        } else if (window.confirm("¿Deseas actualizar el estado sin enviar mensaje de WhatsApp?")) {
            onUpdateStatus(warranty.id, newStatus);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Controls */}
            <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between">
                <div className="relative w-full xl:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Buscar por modelo, IMEI o teléfono..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as any)}
                        className="flex-1 sm:flex-none px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    >
                        <option value="all">Todos los estados</option>
                        <option value="received">Recibidos</option>
                        <option value="sent_to_provider">Enviados</option>
                        <option value="in_store">En Tienda</option>
                        <option value="delivered">Entregados</option>
                    </select>

                    {isAdmin && (
                        <button
                            onClick={() => { setTempGroupLink(whatsappGroupLink); setShowGroupConfigModal(true); }}
                            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all whitespace-nowrap"
                            title="Configurar Grupo de WhatsApp"
                        >
                            👥 <span className="hidden sm:inline">Grupo WA</span>
                        </button>
                    )}

                    {isAdmin && (
                        <button
                            onClick={() => { setTempTemplates(templates); setShowTemplateModal(true); }}
                            className="flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white px-3 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all whitespace-nowrap"
                            title="Personalizar Mensajes de WhatsApp (Admin)"
                        >
                            <Settings className="w-4 h-4" />
                            <span className="hidden sm:inline">Mensajes</span>
                        </button>
                    )}

                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all hover:shadow-md whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Nueva Garantía</span>
                    </button>
                </div>
            </div>

            {/* Add Modal */}
            {isAdding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <ShieldAlert className="w-5 h-5 text-blue-600" />
                                    {warrantyToEdit ? 'Editar Garantía' : 'Registrar Garantía'}
                                </h2>
                                <p className="text-slate-500 text-sm">Todos los campos son obligatorios.</p>
                            </div>
                            {!isSubmitting && (
                                <button onClick={() => { setIsAdding(false); setWarrantyToEdit(null); }} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                {/* Invoice Number - First Field requested */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">No. Factura</label>
                                    <div className="relative">
                                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            required
                                            maxLength={6}
                                            placeholder="Ej. 123456"
                                            value={formData.invoiceNumber}
                                            onChange={(e) => handleNumericInput('invoiceNumber', e.target.value, 6)}
                                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                                        />
                                    </div>
                                    <p className="text-[10px] text-right text-slate-400">{formData.invoiceNumber.length}/6</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Fecha Recepción</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="date"
                                            required
                                            value={formData.receptionDate}
                                            onChange={(e) => setFormData({ ...formData, receptionDate: e.target.value })}
                                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Número de Contacto (10 Dígitos)</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="tel"
                                            required
                                            placeholder="Ej. 6671234567"
                                            value={formData.contactNumber}
                                            onChange={(e) => handleNumericInput('contactNumber', e.target.value, 10)}
                                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        />
                                    </div>
                                    <p className="text-[10px] text-right text-slate-400">{formData.contactNumber.length}/10</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Posible Fecha Ingreso</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="date"
                                            required
                                            value={formData.possibleEntryDate || ''}
                                            onChange={(e) => setFormData({ ...formData, possibleEntryDate: e.target.value })}
                                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Marca</label>
                                    <div className="relative">
                                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <select
                                            required
                                            value={formData.brand}
                                            onChange={(e) => setFormData({ ...formData, brand: e.target.value as Brand })}
                                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                                        >
                                            {Object.keys(safeBrandConfigs).map((b) => (
                                                <option key={b} value={b}>{safeBrandConfigs[b as Brand]?.label || b}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Modelo</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej. Galaxy A54"
                                        value={formData.model}
                                        onChange={(e) => setFormData({ ...formData, model: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm uppercase"
                                    />
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">IMEI / Serie (15 Dígitos)</label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={15}
                                        placeholder="Ingrese los 15 dígitos del IMEI"
                                        value={formData.imei}
                                        onChange={(e) => handleNumericInput('imei', e.target.value, 15)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                                    />
                                    <p className="text-[10px] text-right text-slate-400">{formData.imei?.length || 0}/15</p>
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Falla Reportada</label>
                                    <div className="relative">
                                        <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                        <textarea
                                            required
                                            rows={2}
                                            placeholder="Describe el problema del equipo..."
                                            value={formData.issueDescription}
                                            onChange={(e) => setFormData({ ...formData, issueDescription: e.target.value })}
                                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Accesorios (Cargador, caja, funda...)</label>
                                    <div className="relative">
                                        <PackageCheck className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                        <textarea
                                            required
                                            rows={2}
                                            placeholder="Detalla qué accesorios se reciben..."
                                            value={formData.accessories}
                                            onChange={(e) => setFormData({ ...formData, accessories: e.target.value })}
                                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Estado Físico</label>
                                    <div className="relative">
                                        <Thermometer className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                        <textarea
                                            required
                                            rows={2}
                                            placeholder="Rayones, golpes, accesorios incluidos..."
                                            value={formData.physicalCondition}
                                            onChange={(e) => setFormData({ ...formData, physicalCondition: e.target.value })}
                                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                                        />
                                    </div>
                                </div>

                                {/* Ticket Image Input */}
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Detalles del Teléfono (si presenta algún detalle o daño)</label>
                                    <div className="flex gap-4 items-start">
                                        {ticketPreview ? (
                                            <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 group">
                                                <img src={ticketPreview} alt="Preview" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => { setTicketPreview(null); setFormData(p => ({ ...p, ticketImage: '' })); }}
                                                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-80 hover:opacity-100"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="w-full cursor-pointer group">
                                                <div className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-blue-50 hover:border-blue-400 transition-colors">
                                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                        <Camera className="w-8 h-8 text-slate-400 group-hover:text-blue-500 mb-2" />
                                                        <p className="text-xs text-slate-500">Tocar para tomar foto</p>
                                                    </div>
                                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                                                </div>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3 justify-end border-t border-slate-100 mt-4">
                                <button
                                    type="button"
                                    onClick={() => { setIsAdding(false); setWarrantyToEdit(null); }}
                                    disabled={isSubmitting}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                                    {isSubmitting ? "Guardando..." : (warrantyToEdit ? "Actualizar Garantía" : "Registrar Equipo")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Warranties List */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sortedWarranties.map(warranty => (
                    <div key={warranty.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden flex flex-col h-full">
                        {/* Brand Stripe */}
                        <div className={`absolute top-0 left-0 w-1 h-full ${safeBrandConfigs[warranty.brand]?.colorClass?.replace('text-', 'bg-') || 'bg-slate-500'}`}></div>

                        <div className="pl-4 flex-1 flex flex-col">
                            {/* Header: Date & Status */}
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recibido</span>
                                    <span className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                        {warranty.receptionDate}
                                    </span>
                                    {warranty.possibleEntryDate && (
                                        <span className="text-[10px] text-slate-400 mt-1">
                                            Ingreso: {warranty.possibleEntryDate}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {getStatusBadge(warranty.status)}
                                    {isAdmin && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startEditingWarranty(warranty);
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Editar Garantía"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteWarranty(warranty);
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Eliminar Garantía"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Device Info */}
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wide ${safeBrandConfigs[warranty.brand]?.colorClass || 'bg-slate-500'}`}
                                        style={safeBrandConfigs[warranty.brand]?.colorClass?.includes('text-black') ? { color: 'black' } : {}}
                                    >
                                        {safeBrandConfigs[warranty.brand]?.label || warranty.brand || 'OTRO'}
                                    </span>
                                    <h3 className="font-bold text-slate-900 text-lg">{warranty.model}</h3>
                                </div>
                                {warranty.imei && <p className="text-xs font-mono text-slate-400 break-all">IMEI: {warranty.imei}</p>}
                            </div>

                            {/* Invoice Number on Card */}
                            <div className="mb-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Factura</span>
                                <span className="text-sm font-medium text-slate-800">{warranty.invoiceNumber}</span>
                            </div>

                            {/* Contact */}
                            <div className="mb-4 flex items-center justify-between gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <Phone className="w-4 h-4 text-blue-500" />
                                    <span className="font-medium">{warranty.contactNumber}</span>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-1 gap-2 mb-4 flex-1">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Falla:</p>
                                    <p className="text-xs text-slate-700 bg-red-50 p-2 rounded border border-red-100 leading-snug">{warranty.issueDescription}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Estado:</p>
                                    <p className="text-xs text-slate-600 leading-snug truncate">{warranty.physicalCondition}</p>
                                </div>
                                <div className="md:col-span-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Accesorios:</p>
                                    <p className="text-xs text-slate-600 leading-snug truncate">{warranty.accessories}</p>
                                </div>
                            </div>

                            {/* Actions & Evidence */}
                            <div className="pt-3 border-t border-slate-100 space-y-3 mt-auto">
                                {/* View Evidence Link if exists */}
                                {warranty.ticketImage && (
                                    <a
                                        href={warranty.ticketImage}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                                    >
                                        <ImageIcon className="w-3.5 h-3.5" />
                                        Ver Evidencia
                                    </a>
                                )}

                                {/* Automated WhatsApp Actions */}
                                <div className="space-y-1.5">
                                    {warranty.status === 'received' && (
                                        <button
                                            onClick={() => handleSendCustomerWhatsApp(warranty, 'received')}
                                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-lg transition-colors border border-emerald-200"
                                        >
                                            📱 Enviar WhatsApp de Ingreso
                                        </button>
                                    )}
                                    {warranty.status === 'in_store' && (
                                        <button
                                            onClick={() => handleSendCustomerWhatsApp(warranty, 'in_store')}
                                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-lg transition-colors border border-emerald-200 animate-pulse"
                                        >
                                            🎉 Enviar WhatsApp de Listo en Tienda
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleSendCustomerWhatsApp(warranty, 'general')}
                                        className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 py-2 rounded-lg transition-colors border border-slate-200"
                                    >
                                        <Share2 className="w-3.5 h-3.5" />
                                        Enviar Reporte por WhatsApp
                                    </button>
                                </div>

                                {/* State Transitions */}
                                <div className="flex gap-2">
                                    {warranty.status === 'received' && (
                                        <button
                                            onClick={() => confirmStatusChange(warranty, 'sent_to_provider')}
                                            className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                                        >
                                            <Truck className="w-3.5 h-3.5" /> Enviar
                                        </button>
                                    )}
                                    {warranty.status === 'sent_to_provider' && (
                                        <button
                                            onClick={() => confirmStatusChange(warranty, 'in_store')}
                                            className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                                        >
                                            <PackageCheck className="w-3.5 h-3.5" /> Recibir
                                        </button>
                                    )}
                                    {warranty.status === 'in_store' && (
                                        <button
                                            onClick={() => confirmStatusChange(warranty, 'delivered')}
                                            className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Entregar
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredWarranties.length === 0 && (
                <div className="text-center py-20 opacity-50">
                    <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-medium text-slate-500">No hay garantías registradas</p>
                </div>
            )}

            {/* WhatsApp Group Config Modal */}
            {showGroupConfigModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    👥 Configurar Grupo de WhatsApp
                                </h3>
                                <p className="text-xs text-slate-500">Ingresa el enlace de invitación de tu grupo (ej. https://chat.whatsapp.com/...)</p>
                            </div>
                            <button onClick={() => setShowGroupConfigModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={saveGroupLink} className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 uppercase">Número de WhatsApp o Enlace</label>
                                <input
                                    type="text"
                                    placeholder="Ej. 6671234567 o https://chat.whatsapp.com/..."
                                    value={tempGroupLink}
                                    onChange={(e) => setTempGroupLink(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                                    required
                                />
                                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                                    💡 <b>Modo Automático:</b> Si ingresas el número de celular del supervisor o de la persona a cargo del grupo (10 dígitos), el mensaje aparecerá <b>completamente prellenado de forma automática</b> (igual que con los clientes) listo para enviarse con 1 solo toque.
                                </p>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowGroupConfigModal(false)}
                                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-colors shadow-md"
                                >
                                    Guardar Enlace
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* WhatsApp Templates Customization Modal (Admin Only) */}
            {showTemplateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-slate-700" />
                                    Personalizar Mensajes de WhatsApp (Admin)
                                </h3>
                                <p className="text-xs text-slate-500">Edita las plantillas. Puedes usar variables como &#123;brand&#125;, &#123;model&#125;, &#123;imei&#125;, &#123;date&#125;, &#123;phone&#125;.</p>
                            </div>
                            <button onClick={() => setShowTemplateModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={saveTemplates} className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 uppercase">📱 1. Mensaje - Equipo Recibido</label>
                                <textarea
                                    rows={3}
                                    value={tempTemplates.received}
                                    onChange={(e) => setTempTemplates({ ...tempTemplates, received: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-slate-700 font-mono"
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 uppercase">🚚 2. Mensaje - Equipo Enviado a Taller/Proveedor</label>
                                <textarea
                                    rows={3}
                                    value={tempTemplates.sent_to_provider}
                                    onChange={(e) => setTempTemplates({ ...tempTemplates, sent_to_provider: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-slate-700 font-mono"
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 uppercase">🎉 3. Mensaje - Equipo en Tienda (Listo)</label>
                                <textarea
                                    rows={3}
                                    value={tempTemplates.in_store}
                                    onChange={(e) => setTempTemplates({ ...tempTemplates, in_store: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-slate-700 font-mono"
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 uppercase">✅ 4. Mensaje - Equipo Entregado</label>
                                <textarea
                                    rows={3}
                                    value={tempTemplates.delivered}
                                    onChange={(e) => setTempTemplates({ ...tempTemplates, delivered: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-slate-700 font-mono"
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 uppercase">📢 5. Mensaje - Reporte para Grupo de WhatsApp</label>
                                <textarea
                                    rows={4}
                                    value={tempTemplates.group}
                                    onChange={(e) => setTempTemplates({ ...tempTemplates, group: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-slate-700 font-mono"
                                    required
                                />
                                <p className="text-[11px] text-slate-400">
                                    Variables: &#123;brand&#125;, &#123;model&#125;, &#123;imei&#125;, &#123;date&#125;, &#123;phone&#125;, &#123;issue&#125;, &#123;accessories&#125;, &#123;physical&#125;
                                </p>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <button
                                    type="button"
                                    onClick={() => setTempTemplates(defaultTemplates)}
                                    className="px-4 py-2 bg-yellow-50 text-yellow-700 rounded-xl font-bold text-xs hover:bg-yellow-100 transition-colors border border-yellow-200"
                                >
                                    Restaurar Predeterminados
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowTemplateModal(false)}
                                        className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2 bg-slate-800 text-white rounded-xl font-bold text-xs hover:bg-slate-900 transition-colors shadow-md"
                                    >
                                        Guardar Plantillas
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Warranties;
