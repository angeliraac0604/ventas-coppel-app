import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Bell, Check, X, ArrowRight, ArrowLeft, User, Calendar, Tag, Smartphone, MessageSquare, Trash2, Edit2, AlertCircle, CheckCircle, Loader2, ChevronRight, Hash, DollarSign, Image as ImageIcon, ExternalLink, Eye } from 'lucide-react';
import { deleteFromSupabaseStorage } from '../services/storageService';
import { deleteImageFromDriveScript } from '../services/googleAppsScriptService';
import { Brand } from '../types';
import { BRAND_CONFIGS } from '../constants';

interface RequestsPanelProps {
  onBack?: () => void;
  onRefresh?: () => void;
  stores?: any[];
}

const RequestsPanel: React.FC<RequestsPanelProps> = ({ onBack, onRefresh, stores }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectionModal, setRejectionModal] = useState<{id: string} | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [localStoreFilter, setLocalStoreFilter] = useState('all');

  useEffect(() => {
    fetchRequests();

    // REAL-TIME SUBSCRIPTION
    const channel = supabase
      .channel('sale_requests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sale_requests' },
        () => {
          fetchRequests();
          if (onRefresh) onRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sale_requests')
        .select(`
          *,
          requester:profiles(full_name, email),
          sale:sales(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error("Error fetching requests:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: any) => {
    if (!window.confirm("¿Confirmas la aplicación de este cambio/eliminación?")) return;
    setIsProcessing(true);
    try {
      const saleData = request.sale || request.sale_data_snapshot;
      
      // Update snapshot before deleting to ensure we have it
      if (!request.sale_data_snapshot && request.sale) {
        await supabase.from('sale_requests').update({
          sale_data_snapshot: request.sale
        }).eq('id', request.id);
      }

      if (request.type === 'delete') {
        // 1. Delete the sale from DB
        const { error } = await supabase.from('sales').delete().eq('id', request.sale_id);
        if (error) throw error;

        // 2. Delete images (Supabase & Drive)
        if (saleData?.ticketImage || saleData?.ticket_image) {
          const img = saleData.ticketImage || saleData.ticket_image;
          // Supabase Deletion
          if (img.includes('supabase.co')) {
            const parts = img.split('/receipts/');
            if (parts.length > 1) {
              await deleteFromSupabaseStorage(parts[1]);
            }
          }
          // Drive Deletion
          if (img.includes('google.com')) {
            await deleteImageFromDriveScript(img).catch(console.error);
          }
        }
      } else {
        // Edit logic
        const { error } = await supabase.from('sales').update({
          brand: request.suggested_changes.brand,
          price: request.suggested_changes.price,
          customer_name: request.suggested_changes.customerName,
          invoice_number: request.suggested_changes.invoiceNumber
        }).eq('id', request.sale_id);
        if (error) throw error;
      }

      await supabase.from('sale_requests').update({
        status: 'approved',
        resolved_at: new Date().toISOString()
      }).eq('id', request.id);

      // fetchRequests(); // Realtime will handle this
      if (onRefresh) onRefresh();
      alert("✅ Solicitud procesada y aplicada con éxito.");
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async (request: any) => {
    if (!request.sale_data_snapshot) {
      alert("No hay datos de respaldo para restaurar esta venta.");
      return;
    }
    if (!window.confirm("¿Deseas restaurar esta venta eliminada?")) return;
    
    setIsProcessing(true);
    try {
      const snap = request.sale_data_snapshot;
      // Re-insert into sales
      const { error: insertError } = await supabase.from('sales').insert([{
        id: snap.id, // Reuse same ID if possible or new one? Better reuse to keep history.
        invoice_number: snap.invoiceNumber || snap.invoice_number,
        customer_name: snap.customerName || snap.customer_name,
        price: snap.price,
        brand: snap.brand,
        date: snap.date,
        ticket_image: snap.ticketImage || snap.ticket_image,
        created_by: snap.createdBy || snap.created_by,
        store_id: snap.storeId || snap.store_id,
        transaction_folio: snap.transactionFolio || snap.transaction_folio
      }]);

      if (insertError) throw insertError;

      // Mark request as pending again
      await supabase.from('sale_requests').update({
        status: 'pending',
        resolved_at: null
      }).eq('id', request.id);

      alert("✅ Venta restaurada correctamente.");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert("Error al restaurar: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionModal || !rejectionReason.trim()) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase.from('sale_requests').update({
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        rejection_reason: rejectionReason
      }).eq('id', rejectionModal.id);

      if (error) throw error;
      setRejectionModal(null);
      setRejectionReason('');
      fetchRequests();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (localStoreFilter === 'all') return true;
    const storeId = r.sale?.store_id || r.sale_data_snapshot?.storeId || r.sale_data_snapshot?.store_id;
    return storeId === localStoreFilter;
  });

  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const resolvedRequests = filteredRequests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-50 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
        <div className="relative z-10 flex flex-col gap-4">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:translate-x-[-4px] transition-transform w-fit"
          >
            <ArrowLeft className="w-3 h-3" /> Volver al Panel
          </button>
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Bell className="w-6 h-6" />
             </div>
             <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tighter">Solicitudes</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Auditoría y corrección de ventas</p>
             </div>
          </div>
        </div>
        <div className="relative z-10 flex flex-col md:flex-row gap-4 items-center">
           <div className="flex gap-4">
             <div className="text-center px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase">Pendientes</p>
                <p className="text-xl font-black text-blue-600">{pendingRequests.length}</p>
             </div>
             <div className="text-center px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase">Resueltas</p>
                <p className="text-xl font-black text-slate-800">{resolvedRequests.length}</p>
             </div>
           </div>
           
           <div className="h-10 w-[2px] bg-slate-100 hidden md:block"></div>

           <div className="flex flex-col gap-1 w-full md:w-64">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Filtrar por Tienda</label>
              <select 
                value={localStoreFilter}
                onChange={(e) => setLocalStoreFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
              >
                <option value="all">Todas las Tiendas</option>
                {stores?.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-8">
        
        {/* Pending Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-4">
             <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
             <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Solicitudes Pendientes</h3>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border border-slate-100">
               <Loader2 className="w-10 h-10 text-blue-200 animate-spin mb-4" />
               <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Consultando base de datos...</p>
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border border-slate-100 italic text-slate-400">
               <CheckCircle className="w-12 h-12 text-slate-100 mb-4" />
               <p className="text-sm font-bold uppercase tracking-tight">Todo al día. No hay solicitudes pendientes.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingRequests.map(req => (
                <div key={req.id} className="bg-white rounded-3xl shadow-lg shadow-slate-200/40 border border-slate-50 overflow-hidden flex flex-col group hover:border-indigo-100 transition-all border-l-4 border-l-transparent hover:border-l-indigo-400">
                  {/* Card Header: Compact */}
                  <div className="px-5 py-4 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                          <User className="w-4 h-4" />
                       </div>
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-800 uppercase leading-none">{req.requester?.full_name || 'Vendedor'}</span>
                          <span className="text-[8px] font-bold text-blue-500 uppercase mt-0.5">
                             {stores?.find(s => s.id === (req.sale?.store_id || req.sale_data_snapshot?.storeId || req.sale_data_snapshot?.store_id))?.name || 'Sucursal Desconocida'}
                          </span>
                       </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${req.type === 'delete' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
                       {req.type === 'delete' ? 'BAJA' : 'EDIT'}
                    </span>
                  </div>

                  {/* Body: Compact info */}
                  <div className="p-5 space-y-4">
                    <div className="flex items-start gap-2">
                       <MessageSquare className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                       <p className="text-[10px] font-bold italic text-slate-500 leading-tight">"{req.reason}"</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                       {/* Current info */}
                       <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Venta Original</p>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[9px] font-bold text-slate-600 space-y-1">
                             <div className="truncate"><Hash className="inline w-2.5 h-2.5 mr-1" />{req.sale?.invoice_number || req.sale_data_snapshot?.invoice_number || req.sale_data_snapshot?.invoiceNumber}</div>
                             <div className="truncate"><User className="inline w-2.5 h-2.5 mr-1" />{req.sale?.customer_name || req.sale_data_snapshot?.customer_name || req.sale_data_snapshot?.customerName}</div>
                             <div className="truncate text-indigo-600"><DollarSign className="inline w-2.5 h-2.5 mr-1" />${req.sale?.price || req.sale_data_snapshot?.price}</div>
                          </div>
                       </div>

                       {/* Suggested / Photo */}
                       <div className="space-y-1">
                          {req.type === 'edit' ? (
                            <>
                               <p className="text-[8px] font-black text-indigo-300 uppercase tracking-tighter">Propuesta</p>
                               <div className="bg-indigo-50/30 p-2.5 rounded-xl border border-indigo-100/50 text-[9px] font-black text-indigo-600 space-y-1">
                                  <div className={req.sale?.invoice_number !== req.suggested_changes?.invoiceNumber ? 'text-indigo-600' : 'text-slate-300'}><Hash className="inline w-2.5 h-2.5 mr-1" />{req.suggested_changes?.invoiceNumber}</div>
                                  <div className={req.sale?.customer_name !== req.suggested_changes?.customerName ? 'text-indigo-600' : 'text-slate-300'}><User className="inline w-2.5 h-2.5 mr-1" />{req.suggested_changes?.customerName}</div>
                                  <div className={req.sale?.price !== req.suggested_changes?.price ? 'text-indigo-600' : 'text-slate-300'}><DollarSign className="inline w-2.5 h-2.5 mr-1" />${req.suggested_changes?.price}</div>
                               </div>
                            </>
                          ) : (
                            <>
                               <p className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Comprobante</p>
                               <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center h-[52px]">
                                  {(req.sale?.ticket_image || req.sale_data_snapshot?.ticket_image || req.sale_data_snapshot?.ticketImage) ? (
                                    <button 
                                      onClick={() => window.open(req.sale?.ticket_image || req.sale_data_snapshot?.ticket_image || req.sale_data_snapshot?.ticketImage, '_blank')}
                                      className="w-full h-full flex flex-col items-center justify-center gap-1 group/btn hover:bg-white rounded-lg transition-colors"
                                    >
                                       <ImageIcon className="w-5 h-5 text-slate-300 group-hover/btn:text-indigo-500" />
                                       <span className="text-[7px] font-black uppercase text-slate-400">Ver Ticket</span>
                                    </button>
                                  ) : (
                                    <div className="text-[7px] font-bold text-slate-300 uppercase">Sin Imagen</div>
                                  )}
                               </div>
                            </>
                          )}
                       </div>
                    </div>
                  </div>

                  {/* Footer: Compact Buttons */}
                  <div className="p-4 bg-slate-50/30 border-t border-slate-50 grid grid-cols-2 gap-3">
                     <button 
                       onClick={() => handleApprove(req)}
                       disabled={isProcessing}
                       className="py-2.5 bg-emerald-500 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-emerald-50 hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5"
                     >
                        <Check className="w-3.5 h-3.5" /> Aplicar
                     </button>
                     <button 
                       onClick={() => setRejectionModal({id: req.id})}
                       disabled={isProcessing}
                       className="py-2.5 bg-white text-rose-500 border border-rose-100 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-50 transition-all flex items-center justify-center gap-1.5"
                     >
                        <X className="w-3.5 h-3.5" /> Rechazar
                     </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* History Section */}
        {resolvedRequests.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest px-4">Historial de Resoluciones (Últimos 30 días)</h3>
            <div className="bg-white rounded-[3rem] shadow-xl shadow-slate-100 border border-slate-50 overflow-hidden">
               <div className="hidden md:grid grid-cols-6 gap-4 px-10 py-6 bg-slate-50/50 border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <div className="col-span-2">Solicitante / Fecha</div>
                  <div>Tipo</div>
                  <div>Estado</div>
                  <div>Resuelto</div>
                  <div className="text-right">Acción</div>
               </div>
               <div className="divide-y divide-slate-50">
                   {resolvedRequests
                    .filter(req => {
                      const resDate = req.resolved_at ? new Date(req.resolved_at) : new Date();
                      const thirtyDaysAgo = new Date();
                      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                      return resDate >= thirtyDaysAgo;
                    })
                    .slice(0, 20).map(req => (
                     <div key={req.id} className="grid grid-cols-1 md:grid-cols-6 gap-4 px-10 py-6 items-center group/row">
                        <div className="col-span-2">
                           <p className="text-sm font-bold text-slate-700">{req.requester?.full_name}</p>
                           <div className="flex items-center gap-2">
                              <span className="text-[8px] font-black text-blue-500 uppercase">
                                 {stores?.find(s => s.id === (req.sale?.store_id || req.sale_data_snapshot?.storeId || req.sale_data_snapshot?.store_id))?.name || 'Sucursal'}
                              </span>
                              <span className="text-[10px] text-slate-300">•</span>
                              <p className="text-[10px] text-slate-400 font-bold">{new Date(req.created_at).toLocaleString()}</p>
                           </div>
                        </div>
                        <div>
                           <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${req.type === 'delete' ? 'bg-red-50 text-red-400' : 'bg-blue-50 text-blue-400'}`}>
                              {req.type === 'delete' ? 'Baja' : 'Edit'}
                           </span>
                        </div>
                        <div>
                           <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                              {req.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                           </span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-400">
                           {req.resolved_at ? new Date(req.resolved_at).toLocaleDateString() : '-'}
                        </div>
                        <div className="text-right">
                           {req.type === 'delete' && req.status === 'approved' && (
                             <button 
                               onClick={() => handleRestore(req)}
                               disabled={isProcessing}
                               className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl md:opacity-0 group-hover/row:opacity-100 transition-all flex items-center gap-1 justify-end w-full"
                               title="Restaurar Venta Eliminada"
                             >
                               <span className="text-[8px] font-black uppercase">Restaurar</span>
                               <ArrowRight className="w-4 h-4 rotate-180" />
                             </button>
                           )}
                        </div>
                     </div>
                   ))}
                </div>
            </div>
          </section>
        )}
      </div>

      {/* REJECTION MODAL */}
      {rejectionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden p-10 space-y-6">
            <div className="flex items-center gap-4 text-red-500">
               <AlertCircle className="w-8 h-8" />
               <h3 className="text-xl font-black uppercase tracking-tighter">Rechazar Solicitud</h3>
            </div>
            <p className="text-sm text-slate-500 font-bold">Indica al vendedor por qué no se puede aplicar este cambio:</p>
            <textarea 
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ej: El folio no coincide con el sistema Coppel..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-bold outline-none h-32 resize-none"
            ></textarea>
            <div className="grid grid-cols-2 gap-4">
               <button onClick={() => setRejectionModal(null)} className="py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all">Cancelar</button>
               <button 
                 onClick={handleReject}
                 disabled={isProcessing || !rejectionReason.trim()}
                 className="py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-100 hover:scale-[1.02] transition-all disabled:opacity-50"
               >
                 Confirmar Rechazo
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestsPanel;
