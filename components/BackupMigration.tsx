import React, { useState, useMemo, useEffect } from 'react';
import { 
  Upload, FileArchive, CheckCircle2, AlertTriangle, Database, Users, 
  Store as StoreIcon, ShoppingCart, Calendar, ShieldCheck, ArrowRight, 
  Loader2, Download, RefreshCw, Filter, Search, CheckSquare, Square, 
  Sliders, CalendarDays, Check, Sparkles, ChevronRight, Settings2, BarChart3,
  History, Clock, Eye, Trash2, FileText, ChevronDown, ChevronUp, Package, X,
  HardDrive, DollarSign, Layers, ExternalLink, ArrowDownToLine
} from 'lucide-react';
import { db } from '../services/firebase';
import { doc, writeBatch, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

export interface BackupHistoryEntry {
  id: string;
  timestamp: string;
  type: 'import_migration' | 'export_backup' | 'cloud_sync';
  title: string;
  fileName?: string;
  status: 'success' | 'partial' | 'failed';
  summary: {
    totalWrites?: number;
    storesCount: number;
    usersCount: number;
    salesCount: number;
    closingsCount: number;
    warrantiesCount: number;
    attendanceCount?: number;
    totalRecords: number;
    totalSalesRevenue?: number;
    dateSpan?: { start?: string; end?: string };
    storeNames?: string[];
  };
  details?: {
    performedBy?: string;
    notes?: string;
    modulesIncluded?: string[];
  };
}

interface ParsedBackupData {
  users: Array<{
    id: string;
    email: string;
    role: string;
    fullName?: string;
    storeId?: string;
    assignedStores?: string[];
    canJustifyAbsences?: boolean;
    canManageRestDays?: boolean;
    canForceAttendance?: boolean;
    canSetSchedules?: boolean;
    canSellKit?: boolean;
    canSellChip0?: boolean;
    canSellPortability?: boolean;
    canSellChipExpress?: boolean;
    passwordHash?: string;
  }>;
  stores: Array<{
    id: string;
    name: string;
    location?: string;
    createdAt?: string;
    entryTime?: string;
    exitTime?: string;
    lunchDurationMinutes?: number;
    type?: string;
    prefix?: string;
  }>;
  sales: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    price: number;
    brand: string;
    date: string;
    ticketImage?: string;
    createdBy?: string;
    createdAt?: string;
    storeId?: string;
    transactionFolio?: string;
    category?: string;
    iccid?: string;
    phoneNumber?: string;
    portabilityScreenshot?: string;
  }>;
  closings: Array<{
    id: string;
    date: string;
    totalSales: number;
    totalRevenue: number;
    closedAt: string;
    topBrand: string;
    storeId?: string;
    attSales?: number;
    kitCount?: number;
    chip0Count?: number;
    portabilityCount?: number;
    chipExpressCount?: number;
  }>;
  warranties: Array<{
    id: string;
    receptionDate: string;
    invoiceNumber: string;
    brand: string;
    model: string;
    imei?: string;
    issueDescription: string;
    accessories?: string;
    physicalCondition?: string;
    contactNumber: string;
    ticketImage?: string;
    status: string;
    storeId?: string;
  }>;
  attendance: Array<{
    id: string;
    userId: string;
    storeId?: string;
    type: string;
    timestamp: string;
    date: string;
    imageUrl?: string;
    notes?: string;
  }>;
}

interface SyncModulesState {
  stores: boolean;
  users: boolean;
  sales: boolean;
  closings: boolean;
  warranties: boolean;
  attendance: boolean;
}

// Helper to recursively remove any undefined fields before sending to Firestore
export function cleanFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  if (!obj || typeof obj !== 'object') return {};
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue; // Skip undefined completely
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = cleanFirestoreData(value);
    } else if (Array.isArray(value)) {
      result[key] = value
        .filter(v => v !== undefined)
        .map(v => (v !== null && typeof v === 'object' && !(v instanceof Date)) ? cleanFirestoreData(v) : (v === undefined ? null : v));
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface BackupMigrationProps {
  onComplete?: () => void;
  onNavigateToList?: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToAdmin?: () => void;
  userProfile?: UserProfile | null;
}

export const BackupMigration: React.FC<BackupMigrationProps> = ({ 
  onComplete, 
  onNavigateToList, 
  onNavigateToDashboard, 
  onNavigateToAdmin,
  userProfile
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [parsedData, setParsedData] = useState<ParsedBackupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Section Navigation Tabs
  const [sectionTab, setSectionTab] = useState<'upload' | 'history' | 'database'>('upload');
  
  // Persistent History States
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'import_migration' | 'export_backup'>('all');
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<BackupHistoryEntry | null>(null);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  
  // Live Cloud Stats
  const [liveStats, setLiveStats] = useState<{
    salesCount: number;
    storesCount: number;
    usersCount: number;
    closingsCount: number;
    warrantiesCount: number;
    attendanceCount: number;
    totalSalesRevenue: number;
    lastUpdated: string;
  } | null>(null);
  const [isLoadingLiveStats, setIsLoadingLiveStats] = useState(false);

  // Selection States
  const [syncModules, setSyncModules] = useState<SyncModulesState>({
    stores: true,
    users: true,
    sales: true,
    closings: true,
    warranties: true,
    attendance: true
  });

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  
  // Sales filters
  const [salesDateFilter, setSalesDateFilter] = useState<'all' | '30days' | '90days' | 'currentYear' | 'custom'>('all');
  const [salesCustomStartDate, setSalesCustomStartDate] = useState('');
  const [salesCustomEndDate, setSalesCustomEndDate] = useState('');
  const [salesStoreFilter, setSalesStoreFilter] = useState<string>('all');

  // UI Tabs & Search
  const [activeTab, setActiveTab] = useState<'modules' | 'sales' | 'users' | 'stores'>('modules');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [storeSearch, setStoreSearch] = useState('');

  // Migration progress
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationFinished, setMigrationFinished] = useState(false);

  const addLog = (msg: string) => {
    setMigrationLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  // Helper to format ISO dates
  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Fecha desconocida';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  };

  // Load History and Live Stats from Cloud Firestore and localStorage
  const loadHistoryAndStats = async () => {
    setIsLoadingHistory(true);
    setIsLoadingLiveStats(true);
    try {
      // 1. Fetch live document counts from Firestore
      let salesCount = 0;
      let storesCount = 0;
      let usersCount = 0;
      let closingsCount = 0;
      let warrantiesCount = 0;
      let attendanceCount = 0;
      let totalSalesRevenue = 0;

      try {
        const [salesSnap, storesSnap, usersSnap, closingsSnap, warrantiesSnap, attSnap] = await Promise.all([
          getDocs(collection(db, 'sales')),
          getDocs(collection(db, 'stores')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'daily_closings')),
          getDocs(collection(db, 'warranties')),
          getDocs(collection(db, 'attendance'))
        ]);

        salesCount = salesSnap.size;
        storesCount = storesSnap.size;
        usersCount = usersSnap.size;
        closingsCount = closingsSnap.size;
        warrantiesCount = warrantiesSnap.size;
        attendanceCount = attSnap.size;

        salesSnap.docs.forEach(docSnap => {
          const val = Number(docSnap.data().price || 0);
          if (!isNaN(val)) totalSalesRevenue += val;
        });

        setLiveStats({
          salesCount,
          storesCount,
          usersCount,
          closingsCount,
          warrantiesCount,
          attendanceCount,
          totalSalesRevenue,
          lastUpdated: new Date().toISOString()
        });
      } catch (errSnap) {
        console.warn("No se pudieron leer colecciones completas:", errSnap);
      }

      // 2. Fetch History from Firestore
      let entries: BackupHistoryEntry[] = [];
      try {
        const histSnap = await getDocs(collection(db, 'backup_history'));
        if (!histSnap.empty) {
          entries = histSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          })) as BackupHistoryEntry[];
        }
      } catch (e) {
        console.warn("No se pudo leer backup_history de Firestore:", e);
      }

      // 3. Fallback / Merge with localStorage
      try {
        const cachedRaw = localStorage.getItem('app_backup_history');
        if (cachedRaw) {
          const cachedEntries: BackupHistoryEntry[] = JSON.parse(cachedRaw);
          const existingIds = new Set(entries.map(e => e.id));
          cachedEntries.forEach(item => {
            if (!existingIds.has(item.id)) {
              entries.push(item);
            }
          });
        }
      } catch (e) {}

      // 4. If no history entries exist, but there's a lastMigration in localStorage:
      if (entries.length === 0) {
        try {
          const usageRaw = localStorage.getItem('firebase_daily_usage');
          if (usageRaw) {
            const usage = JSON.parse(usageRaw);
            if (usage.lastMigration) {
              const synthesizedEntry: BackupHistoryEntry = {
                id: `hist-mig-saved`,
                timestamp: usage.lastMigration.timestamp || new Date().toISOString(),
                type: 'import_migration',
                title: 'Migración de Respaldo a Cloud Firestore',
                fileName: 'Respaldo Supabase (.gz)',
                status: 'success',
                summary: {
                  totalWrites: usage.lastMigration.writesCount,
                  storesCount: usage.lastMigration.stores || storesCount,
                  usersCount: usage.lastMigration.users || usersCount,
                  salesCount: usage.lastMigration.sales || salesCount,
                  closingsCount: usage.lastMigration.closings || closingsCount,
                  warrantiesCount: usage.lastMigration.warranties || warrantiesCount,
                  attendanceCount: usage.lastMigration.attendance || attendanceCount,
                  totalRecords: usage.lastMigration.writesCount || (salesCount + storesCount + usersCount + closingsCount),
                  totalSalesRevenue: totalSalesRevenue
                },
                details: {
                  performedBy: userProfile?.fullName || 'Administrador',
                  notes: 'Sincronización de respaldo registrada previamente.'
                }
              };
              entries.push(synthesizedEntry);
              setDoc(doc(db, 'backup_history', synthesizedEntry.id), cleanFirestoreData(synthesizedEntry), { merge: true }).catch(() => {});
            }
          }
        } catch (e) {}
      }

      // 5. If still empty, but live data exists in Firestore, record an initial entry so the user sees their data immediately!
      if (entries.length === 0 && (salesCount > 0 || storesCount > 0)) {
        const initialLiveEntry: BackupHistoryEntry = {
          id: `hist-cloud-sync-init`,
          timestamp: new Date().toISOString(),
          type: 'import_migration',
          title: 'Respaldo Activo en Google Cloud Firestore',
          fileName: 'Sincronización en Nube',
          status: 'success',
          summary: {
            storesCount,
            usersCount,
            salesCount,
            closingsCount,
            warrantiesCount,
            attendanceCount,
            totalRecords: salesCount + storesCount + usersCount + closingsCount + warrantiesCount + attendanceCount,
            totalSalesRevenue
          },
          details: {
            performedBy: userProfile?.fullName || userProfile?.email || 'Sistema',
            notes: 'Datos respaldados y operativos en la base de datos de Google Cloud Firestore.'
          }
        };
        entries.push(initialLiveEntry);
        setDoc(doc(db, 'backup_history', initialLiveEntry.id), cleanFirestoreData(initialLiveEntry), { merge: true }).catch(() => {});
      }

      // Sort descending by date
      entries.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      setHistory(entries);
      try {
        localStorage.setItem('app_backup_history', JSON.stringify(entries));
      } catch (e) {}
    } catch (err) {
      console.error("Error cargando historial y métricas de respaldo:", err);
    } finally {
      setIsLoadingHistory(false);
      setIsLoadingLiveStats(false);
    }
  };

  useEffect(() => {
    loadHistoryAndStats();
  }, []);

  // Export / Generate Complete Backup (.json)
  const handleGenerateExportBackup = async () => {
    setIsExportingBackup(true);
    try {
      const [salesSnap, storesSnap, usersSnap, closingsSnap, warrantiesSnap, attSnap] = await Promise.all([
        getDocs(collection(db, 'sales')),
        getDocs(collection(db, 'stores')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'daily_closings')),
        getDocs(collection(db, 'warranties')),
        getDocs(collection(db, 'attendance'))
      ]);

      const storesData = storesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const salesData = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const closingsData = closingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const warrantiesData = warrantiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const attendanceData = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const totalRevenue = salesData.reduce((acc, s: any) => acc + (Number(s.price) || 0), 0);
      const totalCount = storesData.length + usersData.length + salesData.length + closingsData.length + warrantiesData.length + attendanceData.length;

      const backupObject = {
        meta: {
          system: 'Ventas Telcel - Copia de Seguridad Completa',
          version: '3.3',
          exportedAt: new Date().toISOString(),
          exportedBy: userProfile?.fullName || userProfile?.email || 'Administrador',
          environment: 'Google Cloud Firestore',
          counts: {
            stores: storesData.length,
            users: usersData.length,
            sales: salesData.length,
            closings: closingsData.length,
            warranties: warrantiesData.length,
            attendance: attendanceData.length,
            totalRecords: totalCount,
            totalSalesRevenue: totalRevenue
          }
        },
        stores: storesData,
        users: usersData,
        sales: salesData,
        daily_closings: closingsData,
        warranties: warrantiesData,
        attendance: attendanceData
      };

      const nowStr = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `respaldo_ventas_telcel_${nowStr}.json`;
      const blob = new Blob([JSON.stringify(backupObject, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      // Record export action in history
      const historyItem: BackupHistoryEntry = {
        id: `hist-exp-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'export_backup',
        title: `Generación y Descarga de Respaldo Completo`,
        fileName: filename,
        status: 'success',
        summary: {
          storesCount: storesData.length,
          usersCount: usersData.length,
          salesCount: salesData.length,
          closingsCount: closingsData.length,
          warrantiesCount: warrantiesData.length,
          attendanceCount: attendanceData.length,
          totalRecords: totalCount,
          totalSalesRevenue: totalRevenue,
          storeNames: storesData.map((s: any) => s.name || s.id)
        },
        details: {
          performedBy: userProfile?.fullName || userProfile?.email || 'Administrador',
          notes: `Copia de seguridad descargada en archivo JSON con ${totalCount.toLocaleString()} registros respaldados.`
        }
      };

      await setDoc(doc(db, 'backup_history', historyItem.id), cleanFirestoreData(historyItem), { merge: true });
      setHistory(prev => [historyItem, ...prev]);
      try {
        const existing = JSON.parse(localStorage.getItem('app_backup_history') || '[]');
        localStorage.setItem('app_backup_history', JSON.stringify([historyItem, ...existing]));
      } catch (e) {}

      loadHistoryAndStats();
      alert(`🎉 ¡Respaldo generado y descargado exitosamente!\n\nSe respaldaron ${totalCount.toLocaleString()} registros (${salesData.length} ventas, ${storesData.length} sucursales, ${usersData.length} usuarios) en el archivo:\n"${filename}".`);
    } catch (err: any) {
      console.error("Error al exportar respaldo:", err);
      alert(`❌ Error al generar la copia de seguridad: ${err.message || err}`);
    } finally {
      setIsExportingBackup(false);
    }
  };

  // Delete a specific history entry
  const handleDeleteHistoryEntry = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("¿Deseas eliminar este registro del historial de acciones?")) return;
    try {
      await deleteDoc(doc(db, 'backup_history', id));
      setHistory(prev => prev.filter(item => item.id !== id));
      try {
        const existing = JSON.parse(localStorage.getItem('app_backup_history') || '[]');
        localStorage.setItem('app_backup_history', JSON.stringify(existing.filter((item: any) => item.id !== id)));
      } catch (e) {}
    } catch (err) {
      console.error("Error eliminando registro de historial:", err);
    }
  };

  // Clear all history
  const handleClearAllHistory = async () => {
    if (!window.confirm("¿Estás seguro de que deseas vaciar todo el historial de acciones y respaldos?")) return;
    try {
      for (const item of history) {
        await deleteDoc(doc(db, 'backup_history', item.id)).catch(() => {});
      }
      setHistory([]);
      try {
        localStorage.removeItem('app_backup_history');
      } catch (e) {}
    } catch (err) {
      console.error("Error vaciando historial:", err);
    }
  };

  // Safe decompression with automatic fallback
  const decompressGzip = async (inputFile: File): Promise<string> => {
    try {
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('gzip');
        const decompressedStream = inputFile.stream().pipeThrough(ds);
        const response = new Response(decompressedStream);
        return await response.text();
      }
    } catch (e: any) {
      console.warn("DecompressionStream falló, intentando texto plano:", e);
    }
    // Fallback: leer como texto directo (si fue renombrado o no es gzip comprimido)
    return await inputFile.text();
  };

  // Parse SQL Dump (handles both COPY ... FROM stdin and INSERT INTO ...)
  const parseSqlDump = (sqlContent: string): ParsedBackupData => {
    const data: ParsedBackupData = {
      users: [],
      stores: [],
      sales: [],
      closings: [],
      warranties: [],
      attendance: []
    };

    const authUsersMap: Record<string, { id: string; email?: string; passwordHash?: string; rawMetaData?: any }> = {};
    const rawProfilesList: any[] = [];
    const directUsersList: any[] = [];

    const lines = sqlContent.split(/\r?\n/);
    let currentTable: string | null = null;
    let currentColumns: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('--')) continue;

      // 1. FORMATO COPY ... FROM stdin;
      if (line.startsWith('COPY ')) {
        const match = line.match(/COPY\s+(?:["']?(?:public|auth|storage)["']?\.)?["']?([a-z0-9_]+)["']?\s*\(([^)]+)\)\s+FROM stdin;/i);
        if (match) {
          currentTable = match[1].toLowerCase();
          currentColumns = match[2].split(',').map(c => c.trim().replace(/["']/g, ''));
          continue;
        }
      }

      if (line === '\\.' || line === ';') {
        currentTable = null;
        currentColumns = [];
        continue;
      }

      if (currentTable && line) {
        const values = line.split('\t').map(v => v === '\\N' ? '' : v);
        const row: Record<string, string> = {};
        currentColumns.forEach((col, idx) => {
          row[col] = values[idx] !== undefined ? values[idx] : '';
        });

        // Detectar usuarios en auth.users o tablas users
        if (currentTable === 'users' || currentTable === 'auth_users' || currentTable === 'colaboradores') {
          const uid = row.id || `user-${Object.keys(authUsersMap).length + 1}`;
          let meta: any = {};
          try {
            if (row.raw_user_meta_data) meta = JSON.parse(row.raw_user_meta_data);
          } catch {}

          authUsersMap[uid] = {
            id: uid,
            email: row.email || meta.email || '',
            passwordHash: row.encrypted_password || row.password || '',
            rawMetaData: meta
          };

          // Si contiene campos típicos de un perfil
          if (row.full_name || row.name || row.role || row.store_id || row.email) {
            directUsersList.push({
              id: uid,
              email: row.email || meta.email || '',
              role: (row.role || meta.role || 'seller') as UserRole,
              fullName: row.full_name || row.name || meta.full_name || meta.name || (row.email ? row.email.split('@')[0] : 'Colaborador'),
              storeId: row.store_id || meta.store_id || undefined,
              assignedStores: []
            });
          }
        }

        if (currentTable === 'profiles') {
          rawProfilesList.push(row);
        }

        if (currentTable === 'stores') {
          data.stores.push({
            id: row.id || `store-${data.stores.length + 1}`,
            name: row.name || 'Tienda',
            location: row.location || '',
            createdAt: row.created_at || new Date().toISOString(),
            entryTime: row.entry_time || '09:00',
            exitTime: row.exit_time || '19:00',
            lunchDurationMinutes: parseInt(row.lunch_duration_minutes || '60', 10) || 60,
            type: row.type || '',
            prefix: row.prefix || ''
          });
        }

        if (currentTable === 'sales') {
          data.sales.push({
            id: row.id || `sale-${data.sales.length + 1}`,
            invoiceNumber: row.invoice_number || 'S/N',
            customerName: row.customer_name || 'Cliente',
            price: Number(parseFloat(row.price || '0') || 0),
            brand: row.brand || 'OTRO',
            date: row.date || new Date().toISOString().split('T')[0],
            ticketImage: row.ticket_image || '',
            createdBy: row.created_by || '',
            createdAt: row.created_at || new Date().toISOString(),
            storeId: row.store_id || '',
            transactionFolio: row.transaction_folio || '',
            category: row.category || '',
            iccid: row.iccid || '',
            phoneNumber: row.phone_number || '',
            portabilityScreenshot: row.portability_screenshot || ''
          });
        }

        if (currentTable === 'daily_closings') {
          data.closings.push({
            id: row.id || `close-${data.closings.length + 1}`,
            date: row.date || new Date().toISOString().split('T')[0],
            totalSales: parseInt(row.total_sales || '0', 10) || 0,
            totalRevenue: Number(parseFloat(row.total_revenue || '0') || 0),
            closedAt: row.closed_at || new Date().toISOString(),
            topBrand: row.top_brand || 'OTRO',
            storeId: row.store_id || '',
            attSales: parseInt(row.att_sales || '0', 10) || 0,
            kitCount: parseInt(row.kit_count || '0', 10) || 0,
            chip0Count: parseInt(row.chip_0_count || '0', 10) || 0,
            portabilityCount: parseInt(row.portability_count || '0', 10) || 0,
            chipExpressCount: parseInt(row.chip_express_count || '0', 10) || 0
          });
        }

        if (currentTable === 'warranties') {
          data.warranties.push({
            id: row.id || `warranty-${data.warranties.length + 1}`,
            receptionDate: row.reception_date || new Date().toISOString().split('T')[0],
            invoiceNumber: row.invoice_number || 'S/N',
            brand: row.brand || 'OTRO',
            model: row.model || 'Desconocido',
            imei: row.imei || '',
            issueDescription: row.issue_description || 'Sin detalle',
            accessories: row.accessories || '',
            physicalCondition: row.physical_condition || 'Regular',
            contactNumber: row.contact_number || '0000000000',
            ticketImage: row.ticket_image || '',
            status: row.status || 'received',
            storeId: row.store_id || ''
          });
        }

        if (currentTable === 'attendance') {
          data.attendance.push({
            id: row.id || `att-${data.attendance.length + 1}`,
            userId: row.user_id,
            storeId: row.store_id || '',
            type: row.type || 'entry',
            timestamp: row.timestamp || new Date().toISOString(),
            date: row.date || new Date().toISOString().split('T')[0],
            imageUrl: row.image_url || '',
            notes: row.notes || ''
          });
        }
      }

      // 2. FORMATO INSERT INTO ... (en caso de que el volcado use INSERT)
      if (line.startsWith('INSERT INTO ')) {
        const insertMatch = line.match(/INSERT\s+INTO\s+(?:["']?(?:public|auth|storage)["']?\.)?["']?([a-z0-9_]+)["']?\s*\(([^)]+)\)\s+VALUES\s*(.*)/i);
        if (insertMatch) {
          const tableName = insertMatch[1].toLowerCase();
          const cols = insertMatch[2].split(',').map(c => c.trim().replace(/["']/g, ''));
          const valuesPart = insertMatch[3].trim().replace(/;$/, '');
          
          // Extraer grupos de valores: (...), (...)
          const rowMatches = valuesPart.match(/\(([^)]+)\)/g) || [`(${valuesPart.replace(/^\(|\)$/g, '')})`];
          
          for (const rawRow of rowMatches) {
            const inner = rawRow.replace(/^\(|\)$/g, '');
            // Dividir respetando comillas
            const rawVals = inner.split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
            const r: Record<string, string> = {};
            cols.forEach((c, idx) => {
              r[c] = rawVals[idx] !== undefined && rawVals[idx] !== 'NULL' ? rawVals[idx] : '';
            });

            if (tableName === 'stores') {
              data.stores.push({
                id: r.id || `store-${data.stores.length + 1}`,
                name: r.name || 'Tienda',
                location: r.location || '',
                createdAt: r.created_at || new Date().toISOString(),
                entryTime: r.entry_time || '09:00',
                exitTime: r.exit_time || '19:00',
                lunchDurationMinutes: parseInt(r.lunch_duration_minutes || '60', 10) || 60,
                type: r.type || '',
                prefix: r.prefix || ''
              });
            } else if (tableName === 'profiles' || tableName === 'users' || tableName === 'colaboradores') {
              directUsersList.push({
                id: r.id || `user-${directUsersList.length + 1}`,
                email: r.email || '',
                role: (r.role || 'seller') as UserRole,
                fullName: r.full_name || r.name || (r.email ? r.email.split('@')[0] : 'Colaborador'),
                storeId: r.store_id || '',
                assignedStores: []
              });
            } else if (tableName === 'sales') {
              data.sales.push({
                id: r.id || `sale-${data.sales.length + 1}`,
                invoiceNumber: r.invoice_number || 'S/N',
                customerName: r.customer_name || 'Cliente',
                price: Number(parseFloat(r.price || '0') || 0),
                brand: r.brand || 'OTRO',
                date: r.date || new Date().toISOString().split('T')[0],
                storeId: r.store_id || '',
                ticketImage: r.ticket_image || '',
                createdBy: r.created_by || '',
                transactionFolio: r.transaction_folio || '',
                category: r.category || 'kit',
                iccid: r.iccid || '',
                phoneNumber: r.phone_number || ''
              });
            } else if (tableName === 'daily_closings') {
              data.closings.push({
                id: r.id || `close-${data.closings.length + 1}`,
                date: r.date || new Date().toISOString().split('T')[0],
                totalSales: parseInt(r.total_sales || '0', 10) || 0,
                totalRevenue: Number(parseFloat(r.total_revenue || '0') || 0),
                closedAt: r.closed_at || new Date().toISOString(),
                topBrand: r.top_brand || 'OTRO',
                storeId: r.store_id || '',
                attSales: parseInt(r.att_sales || '0', 10) || 0
              });
            } else if (tableName === 'warranties') {
              data.warranties.push({
                id: r.id || `warranty-${data.warranties.length + 1}`,
                receptionDate: r.reception_date || new Date().toISOString().split('T')[0],
                invoiceNumber: r.invoice_number || 'S/N',
                brand: r.brand || 'OTRO',
                model: r.model || 'Desconocido',
                imei: r.imei || '',
                issueDescription: r.issue_description || 'Sin detalle',
                accessories: r.accessories || '',
                physicalCondition: r.physical_condition || 'Regular',
                contactNumber: r.contact_number || '0000000000',
                ticketImage: r.ticket_image || '',
                status: r.status || 'received',
                storeId: r.store_id || ''
              });
            } else if (tableName === 'attendance') {
              data.attendance.push({
                id: r.id || `att-${data.attendance.length + 1}`,
                userId: r.user_id || '',
                storeId: r.store_id || '',
                type: r.type || 'entry',
                timestamp: r.timestamp || new Date().toISOString(),
                date: r.date || new Date().toISOString().split('T')[0]
              });
            }
          }
        }
      }
    }

    // ==========================================
    // RECONCILIACIÓN INTEGRAL DE USUARIOS
    // ==========================================
    const usersMap = new Map<string, UserProfile>();

    // 1. Procesar perfiles enriquecidos con authUsersMap
    rawProfilesList.forEach((row, idx) => {
      const uid = row.id || `user-${idx + 1}`;
      const authInfo = authUsersMap[uid];
      let assignedStores: string[] = [];
      try {
        if (row.assigned_stores && row.assigned_stores.startsWith('{')) {
          assignedStores = row.assigned_stores.replace(/[{}]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
        } else if (row.assigned_stores && row.assigned_stores.startsWith('[')) {
          assignedStores = JSON.parse(row.assigned_stores);
        }
      } catch {}

      const email = row.email || authInfo?.email || authInfo?.rawMetaData?.email || '';
      const fullName = row.full_name || row.name || row.displayName || authInfo?.rawMetaData?.full_name || authInfo?.rawMetaData?.name || (email ? email.split('@')[0].toUpperCase() : `COLABORADOR ${idx + 1}`);
      const role = (row.role || authInfo?.rawMetaData?.role || 'seller') as UserRole;

      usersMap.set(uid, {
        id: uid,
        email,
        role,
        fullName,
        storeId: row.store_id || authInfo?.rawMetaData?.store_id || undefined,
        assignedStores,
        canJustifyAbsences: row.can_justify_absences === 't' || row.can_justify_absences === 'true',
        canManageRestDays: row.can_manage_rest_days === 't' || row.can_manage_rest_days === 'true',
        canForceAttendance: row.can_force_attendance === 't' || row.can_force_attendance === 'true',
        canSetSchedules: row.can_set_schedules === 't' || row.can_set_schedules === 'true',
        canSellKit: row.can_sell_kit !== 'f' && row.can_sell_kit !== 'false',
        canSellChip0: row.can_sell_chip_0 === 't' || row.can_sell_chip_0 === 'true',
        canSellPortability: row.can_sell_portability === 't' || row.can_sell_portability === 'true',
        canSellChipExpress: row.can_sell_chip_express === 't' || row.can_sell_chip_express === 'true'
      });
    });

    // 2. Incorporar usuarios de authUsersMap que no estuvieran en profiles
    Object.values(authUsersMap).forEach(auth => {
      if (!usersMap.has(auth.id)) {
        const meta = auth.rawMetaData || {};
        const email = auth.email || meta.email || '';
        const fullName = meta.full_name || meta.name || (email ? email.split('@')[0].toUpperCase() : `USUARIO ${auth.id.slice(0, 6)}`);
        usersMap.set(auth.id, {
          id: auth.id,
          email,
          role: (meta.role || 'seller') as UserRole,
          fullName,
          storeId: meta.store_id || undefined,
          assignedStores: meta.assigned_stores || []
        });
      }
    });

    // 3. Incorporar usuarios directos
    directUsersList.forEach(u => {
      if (!usersMap.has(u.id)) {
        usersMap.set(u.id, u);
      }
    });

    // 4. Si hay ventas de colaboradores aún no registrados, sintetizarlos
    const salesCreators = new Set<string>();
    data.sales.forEach(s => {
      if (s.createdBy) salesCreators.add(s.createdBy);
    });

    salesCreators.forEach(cId => {
      const exists = Array.from(usersMap.values()).some(u => u.id === cId || (cId.includes('@') && u.email.toLowerCase() === cId.toLowerCase()));
      if (!exists) {
        const sampleSale = data.sales.find(s => s.createdBy === cId);
        const email = cId.includes('@') ? cId : `${cId}@sistema.com`;
        const fullName = cId.includes('@') ? cId.split('@')[0].toUpperCase() : `VENDEDOR (${cId.slice(0, 8)})`;
        usersMap.set(cId, {
          id: cId,
          email,
          fullName,
          role: 'seller',
          storeId: sampleSale?.storeId || undefined,
          assignedStores: sampleSale?.storeId ? [sampleSale.storeId] : []
        });
      }
    });

    data.users = Array.from(usersMap.values());
    return data;
  };

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setError(null);
    setIsProcessing(true);
    setStatusMessage('Analizando archivo de respaldo...');

    try {
      let parsed: ParsedBackupData;

      if (selected.name.endsWith('.json')) {
        const jsonText = await selected.text();
        const rawJson = JSON.parse(jsonText);
        
        // Tolerancia a múltiples nombres de colecciones en JSON
        const rawUsers = Array.isArray(rawJson.users) ? rawJson.users : 
          (Array.isArray(rawJson.profiles) ? rawJson.profiles : 
          (Array.isArray(rawJson.colaboradores) ? rawJson.colaboradores : 
          (Array.isArray(rawJson.data?.users) ? rawJson.data.users : [])));

        const normalizedUsers: UserProfile[] = rawUsers.map((u: any, idx: number) => ({
          id: u.id || `user-${idx + 1}`,
          email: u.email || u.correo || '',
          role: (u.role || u.rol || 'seller') as UserRole,
          fullName: (u.fullName || u.full_name || u.displayName || u.name || u.nombre || (u.email ? u.email.split('@')[0] : `Colaborador ${idx + 1}`)).toUpperCase(),
          storeId: u.storeId || u.store_id || u.tienda_id || undefined,
          assignedStores: u.assignedStores || u.assigned_stores || [],
          canJustifyAbsences: !!(u.canJustifyAbsences ?? u.can_justify_absences),
          canManageRestDays: !!(u.canManageRestDays ?? u.can_manage_rest_days),
          canForceAttendance: !!(u.canForceAttendance ?? u.can_force_attendance),
          canSetSchedules: !!(u.canSetSchedules ?? u.can_set_schedules),
          canSellKit: u.canSellKit ?? u.can_sell_kit ?? true,
          canSellChip0: !!(u.canSellChip0 ?? u.can_sell_chip_0),
          canSellPortability: !!(u.canSellPortability ?? u.can_sell_portability),
          canSellChipExpress: !!(u.canSellChipExpress ?? u.can_sell_chip_express)
        }));

        const rawStores = Array.isArray(rawJson.stores) ? rawJson.stores : (Array.isArray(rawJson.tiendas) ? rawJson.tiendas : (Array.isArray(rawJson.sucursales) ? rawJson.sucursales : []));
        const rawSales = Array.isArray(rawJson.sales) ? rawJson.sales : (Array.isArray(rawJson.ventas) ? rawJson.ventas : []);
        const rawClosings = Array.isArray(rawJson.daily_closings) ? rawJson.daily_closings : (Array.isArray(rawJson.closings) ? rawJson.closings : (Array.isArray(rawJson.cortes) ? rawJson.cortes : []));
        const rawWarranties = Array.isArray(rawJson.warranties) ? rawJson.warranties : (Array.isArray(rawJson.garantias) ? rawJson.garantias : []);
        const rawAtt = Array.isArray(rawJson.attendance) ? rawJson.attendance : (Array.isArray(rawJson.asistencias) ? rawJson.asistencias : []);

        parsed = {
          users: normalizedUsers,
          stores: rawStores,
          sales: rawSales,
          closings: rawClosings,
          warranties: rawWarranties,
          attendance: rawAtt
        };

        // Si no hay usuarios en el JSON pero hay ventas con createdBy, sintetizar
        if (parsed.users.length === 0 && parsed.sales.length > 0) {
          const userIds = Array.from(new Set(parsed.sales.map((s: any) => s.createdBy).filter(Boolean)));
          parsed.users = userIds.map((uid: string) => {
            const sale = parsed.sales.find((s: any) => s.createdBy === uid);
            return {
              id: uid,
              email: sale?.createdByEmail || (uid.includes('@') ? uid : `${uid}@sistema.com`),
              fullName: (sale?.createdByName || (uid.includes('@') ? uid.split('@')[0] : `Colaborador (${uid.slice(0, 8)})`)).toUpperCase(),
              role: 'seller',
              storeId: sale?.storeId || undefined,
              assignedStores: sale?.storeId ? [sale.storeId] : []
            };
          });
        }
      } else {
        let sqlText = '';
        if (selected.name.endsWith('.gz')) {
          setStatusMessage('Descomprimiendo archivo .gz...');
          sqlText = await decompressGzip(selected);
        } else {
          sqlText = await selected.text();
        }

        setStatusMessage('Analizando estructura SQL y extrayendo datos...');
        parsed = parseSqlDump(sqlText);
      }

      if (parsed.users.length === 0 && parsed.sales.length === 0 && parsed.stores.length === 0) {
        throw new Error("No se detectaron tablas reconocibles en el archivo. Asegúrate de que sea un respaldo válido de Supabase.");
      }

      setParsedData(parsed);
      
      // Initialize selection states
      setSyncModules({
        stores: parsed.stores.length > 0,
        users: parsed.users.length > 0,
        sales: parsed.sales.length > 0,
        closings: parsed.closings.length > 0,
        warranties: parsed.warranties.length > 0,
        attendance: parsed.attendance.length > 0
      });
      setSelectedUserIds(new Set(parsed.users.map(u => u.id)));
      setSelectedStoreIds(new Set(parsed.stores.map(s => s.id)));
      setSalesDateFilter('all');
      setSalesStoreFilter('all');
      setActiveTab('modules');
      setStatusMessage('');
    } catch (err: any) {
      console.error("Error al procesar respaldo:", err);
      setError(err.message || "Error al descomprimir o analizar el archivo.");
    } finally {
      setIsProcessing(false);
    }
  };

  // PRESETS
  const applyPreset = (preset: 'all' | 'structureOnly' | 'recentSales') => {
    if (!parsedData) return;
    if (preset === 'all') {
      setSyncModules({
        stores: true,
        users: true,
        sales: true,
        closings: true,
        warranties: true,
        attendance: true
      });
      setSelectedUserIds(new Set(parsedData.users.map(u => u.id)));
      setSelectedStoreIds(new Set(parsedData.stores.map(s => s.id)));
      setSalesDateFilter('all');
      setSalesStoreFilter('all');
    } else if (preset === 'structureOnly') {
      setSyncModules({
        stores: true,
        users: true,
        sales: false,
        closings: false,
        warranties: false,
        attendance: false
      });
      setSelectedUserIds(new Set(parsedData.users.map(u => u.id)));
      setSelectedStoreIds(new Set(parsedData.stores.map(s => s.id)));
    } else if (preset === 'recentSales') {
      setSyncModules({
        stores: true,
        users: true,
        sales: true,
        closings: true,
        warranties: true,
        attendance: false
      });
      setSelectedUserIds(new Set(parsedData.users.map(u => u.id)));
      setSelectedStoreIds(new Set(parsedData.stores.map(s => s.id)));
      setSalesDateFilter('30days');
      setSalesStoreFilter('all');
    }
  };

  // Filtered Items for Migration
  const storesToMigrate = useMemo(() => {
    if (!parsedData || !syncModules.stores) return [];
    return parsedData.stores.filter(s => selectedStoreIds.has(s.id));
  }, [parsedData, syncModules.stores, selectedStoreIds]);

  const usersToMigrate = useMemo(() => {
    if (!parsedData || !syncModules.users) return [];
    return parsedData.users.filter(u => selectedUserIds.has(u.id));
  }, [parsedData, syncModules.users, selectedUserIds]);

  const salesToMigrate = useMemo(() => {
    if (!parsedData || !syncModules.sales) return [];
    return parsedData.sales.filter(sale => {
      // Store filter
      if (salesStoreFilter !== 'all' && sale.storeId !== salesStoreFilter) {
        return false;
      }
      // If store is filtered out by selectedStoreIds
      if (sale.storeId && selectedStoreIds.size > 0 && !selectedStoreIds.has(sale.storeId)) {
        return false;
      }
      // Date filter
      if (salesDateFilter === 'all') return true;
      const saleDate = sale.date || '';
      if (!saleDate) return true;

      const now = new Date();
      if (salesDateFilter === '30days') {
        const d30 = new Date();
        d30.setDate(now.getDate() - 30);
        return saleDate >= d30.toISOString().split('T')[0];
      }
      if (salesDateFilter === '90days') {
        const d90 = new Date();
        d90.setDate(now.getDate() - 90);
        return saleDate >= d90.toISOString().split('T')[0];
      }
      if (salesDateFilter === 'currentYear') {
        return saleDate >= `${now.getFullYear()}-01-01`;
      }
      if (salesDateFilter === 'custom') {
        if (salesCustomStartDate && saleDate < salesCustomStartDate) return false;
        if (salesCustomEndDate && saleDate > salesCustomEndDate) return false;
        return true;
      }
      return true;
    });
  }, [parsedData, syncModules.sales, salesStoreFilter, selectedStoreIds, salesDateFilter, salesCustomStartDate, salesCustomEndDate]);

  const closingsToMigrate = useMemo(() => {
    if (!parsedData || !syncModules.closings) return [];
    return parsedData.closings.filter(c => {
      if (salesStoreFilter !== 'all' && c.storeId !== salesStoreFilter) return false;
      if (c.storeId && selectedStoreIds.size > 0 && !selectedStoreIds.has(c.storeId)) return false;
      if (salesDateFilter === 'all') return true;
      const cDate = c.date || '';
      if (!cDate) return true;

      const now = new Date();
      if (salesDateFilter === '30days') {
        const d30 = new Date();
        d30.setDate(now.getDate() - 30);
        return cDate >= d30.toISOString().split('T')[0];
      }
      if (salesDateFilter === '90days') {
        const d90 = new Date();
        d90.setDate(now.getDate() - 90);
        return cDate >= d90.toISOString().split('T')[0];
      }
      if (salesDateFilter === 'currentYear') {
        return cDate >= `${now.getFullYear()}-01-01`;
      }
      if (salesDateFilter === 'custom') {
        if (salesCustomStartDate && cDate < salesCustomStartDate) return false;
        if (salesCustomEndDate && cDate > salesCustomEndDate) return false;
        return true;
      }
      return true;
    });
  }, [parsedData, syncModules.closings, salesStoreFilter, selectedStoreIds, salesDateFilter, salesCustomStartDate, salesCustomEndDate]);

  const warrantiesToMigrate = useMemo(() => {
    if (!parsedData || !syncModules.warranties) return [];
    return parsedData.warranties.filter(w => {
      if (w.storeId && selectedStoreIds.size > 0 && !selectedStoreIds.has(w.storeId)) return false;
      return true;
    });
  }, [parsedData, syncModules.warranties, selectedStoreIds]);

  const attendanceToMigrate = useMemo(() => {
    if (!parsedData || !syncModules.attendance) return [];
    return parsedData.attendance.filter(a => {
      if (a.storeId && selectedStoreIds.size > 0 && !selectedStoreIds.has(a.storeId)) return false;
      return true;
    }).slice(0, 450);
  }, [parsedData, syncModules.attendance, selectedStoreIds]);

  const totalSelectedWrites = storesToMigrate.length + 
    usersToMigrate.length + 
    salesToMigrate.length + 
    closingsToMigrate.length + 
    warrantiesToMigrate.length + 
    attendanceToMigrate.length;

  // Filtered UI list for Users tab
  const displayUsers = useMemo(() => {
    if (!parsedData) return [];
    return parsedData.users.filter(u => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (userSearch) {
        const q = userSearch.toLowerCase();
        return (u.email && u.email.toLowerCase().includes(q)) || 
               (u.fullName && u.fullName.toLowerCase().includes(q));
      }
      return true;
    });
  }, [parsedData, userSearch, userRoleFilter]);

  // Filtered UI list for Stores tab
  const displayStores = useMemo(() => {
    if (!parsedData) return [];
    return parsedData.stores.filter(s => {
      if (storeSearch) {
        return s.name.toLowerCase().includes(storeSearch.toLowerCase());
      }
      return true;
    });
  }, [parsedData, storeSearch]);

  // Execute Selective Migration to Firestore
  const handleStartMigration = async () => {
    if (!parsedData) return;
    if (totalSelectedWrites === 0) {
      alert("⚠️ No has seleccionado ningún elemento para sincronizar.");
      return;
    }

    setIsMigrating(true);
    setMigrationLogs([]);
    setMigrationFinished(false);

    try {
      addLog("Iniciando sincronización personalizada a Cloud Firestore...");

      // 1. MIGRAR TIENDAS SELECCIONADAS
      if (storesToMigrate.length > 0) {
        addLog(`Sincronizando ${storesToMigrate.length} sucursales seleccionadas...`);
        for (const store of storesToMigrate) {
          const storeDoc = {
            id: store.id,
            name: store.name || 'Sucursal',
            location: store.location || '',
            createdAt: store.createdAt || new Date().toISOString(),
            entryTime: store.entryTime || '09:00',
            exitTime: store.exitTime || '19:00',
            lunchDurationMinutes: store.lunchDurationMinutes || 60,
            type: store.type || '',
            prefix: store.prefix || ''
          };
          await setDoc(doc(db, 'stores', store.id), cleanFirestoreData(storeDoc), { merge: true });
        }
        addLog("✅ Sucursales sincronizadas correctamente.");
      }

      // Si hay ventas con storeId pero esa tienda no estaba en la tabla de tiendas, sintetizarla para vincularlas perfectamente
      const migratedStoreIds = new Set(storesToMigrate.map(s => s.id));
      const missingStoreIds = Array.from(new Set(salesToMigrate.map(s => s.storeId).filter(Boolean))).filter(id => !migratedStoreIds.has(id));
      if (missingStoreIds.length > 0) {
        addLog(`Registrando ${missingStoreIds.length} sucursales adicionales detectadas en ventas para vinculación...`);
        for (let idx = 0; idx < missingStoreIds.length; idx++) {
          const mId = missingStoreIds[idx];
          const autoStore = {
            id: mId,
            name: `Sucursal Respaldo ${idx + 1}`,
            location: 'Importada del respaldo',
            createdAt: new Date().toISOString(),
            entryTime: '09:00',
            exitTime: '19:00',
            lunchDurationMinutes: 60,
            type: 'Coppel',
            prefix: ''
          };
          await setDoc(doc(db, 'stores', mId), cleanFirestoreData(autoStore), { merge: true });
        }
      }

      // 2. MIGRAR USUARIOS SELECCIONADOS
      const allSavedUsers: UserProfile[] = [];
      const migratedUserIds = new Set<string>();

      if (usersToMigrate.length > 0) {
        addLog(`Sincronizando ${usersToMigrate.length} perfiles de usuario seleccionados...`);
        for (const user of usersToMigrate) {
          const { passwordHash, ...userProfile } = user;
          const userDoc: UserProfile = {
            ...userProfile,
            id: user.id,
            email: user.email || userProfile.email || '',
            role: user.role || userProfile.role || 'seller',
            storeId: userProfile.storeId || user.storeId || '',
            fullName: (userProfile.fullName || user.fullName || (user.email ? user.email.split('@')[0] : 'COLABORADOR')).toUpperCase(),
            assignedStores: userProfile.assignedStores || user.assignedStores || []
          };
          await setDoc(doc(db, 'users', user.id), cleanFirestoreData(userDoc), { merge: true });
          await setDoc(doc(db, 'profiles', user.id), cleanFirestoreData(userDoc), { merge: true });
          migratedUserIds.add(user.id);
          allSavedUsers.push(userDoc);
        }
        addLog("✅ Perfiles de usuarios sincronizados en Firestore.");
      }

      // Si hay ventas con createdBy pero el vendedor no estaba en la tabla de usuarios, sintetizarlo automáticamente
      const missingUserIds = Array.from(new Set(salesToMigrate.map(s => s.createdBy).filter(Boolean))).filter(id => !migratedUserIds.has(id));
      if (missingUserIds.length > 0) {
        addLog(`Sincronizando ${missingUserIds.length} colaboradores detectados en ventas para que aparezcan en el Panel de Administración...`);
        for (const mId of missingUserIds) {
          const sampleSale = salesToMigrate.find(s => s.createdBy === mId);
          const email = sampleSale?.createdByEmail || (mId.includes('@') ? mId : `${mId}@sistema.com`);
          const fullName = (sampleSale?.createdByName || (mId.includes('@') ? mId.split('@')[0] : `VENDEDOR (${mId.slice(0, 8)})`)).toUpperCase();
          const autoUser: UserProfile = {
            id: mId,
            email,
            fullName,
            role: 'seller',
            storeId: sampleSale?.storeId || '',
            assignedStores: sampleSale?.storeId ? [sampleSale.storeId] : [],
            canSellKit: true,
            canSellChip0: true,
            canSellPortability: true,
            canSellChipExpress: true
          };
          await setDoc(doc(db, 'users', mId), cleanFirestoreData(autoUser), { merge: true });
          await setDoc(doc(db, 'profiles', mId), cleanFirestoreData(autoUser), { merge: true });
          migratedUserIds.add(mId);
          allSavedUsers.push(autoUser);
        }
        addLog(`✅ ${missingUserIds.length} colaboradores de ventas vinculados exitosamente a la base de datos.`);
      }

      try {
        localStorage.setItem('app_backup_users', JSON.stringify(allSavedUsers));
      } catch (e) {}

      // 3. MIGRAR VENTAS SELECCIONADAS
      if (salesToMigrate.length > 0) {
        addLog(`Sincronizando ${salesToMigrate.length} ventas seleccionadas...`);
        const totalSales = salesToMigrate.length;
        const batchSize = 300;
        for (let i = 0; i < totalSales; i += batchSize) {
          const chunk = salesToMigrate.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(sale => {
            const ref = doc(db, 'sales', sale.id);
            const saleDoc = {
              ...sale,
              storeId: sale.storeId || '',
              ticketImage: sale.ticketImage || '',
              createdBy: sale.createdBy || ''
            };
            batch.set(ref, cleanFirestoreData(saleDoc), { merge: true });
          });
          await batch.commit();
          const currentProgress = Math.min(100, Math.round(((i + chunk.length) / totalSales) * 100));
          setMigrationProgress(currentProgress);
          addLog(`Procesadas ${Math.min(i + batchSize, totalSales)} de ${totalSales} ventas (${currentProgress}%)...`);
        }
        addLog("✅ Ventas sincronizadas exitosamente.");
      }

      // 4. MIGRAR CORTES DIARIOS SELECCIONADOS
      if (closingsToMigrate.length > 0) {
        addLog(`Sincronizando ${closingsToMigrate.length} cierres diarios...`);
        for (const close of closingsToMigrate) {
          const closeDoc = {
            ...close,
            storeId: close.storeId || '',
            topBrand: close.topBrand || 'OTRO'
          };
          await setDoc(doc(db, 'daily_closings', close.id), cleanFirestoreData(closeDoc), { merge: true });
        }
        addLog("✅ Cierres diarios sincronizados.");
      }

      // 5. MIGRAR GARANTÍAS SELECCIONADAS
      if (warrantiesToMigrate.length > 0) {
        addLog(`Sincronizando ${warrantiesToMigrate.length} garantías...`);
        for (const warranty of warrantiesToMigrate) {
          const warrantyDoc = {
            ...warranty,
            storeId: warranty.storeId || '',
            imei: warranty.imei || '',
            ticketImage: warranty.ticketImage || ''
          };
          await setDoc(doc(db, 'warranties', warranty.id), cleanFirestoreData(warrantyDoc), { merge: true });
        }
        addLog("✅ Garantías sincronizadas.");
      }

      // 6. MIGRAR ASISTENCIAS SELECCIONADAS
      if (attendanceToMigrate.length > 0) {
        addLog(`Sincronizando ${attendanceToMigrate.length} asistencias...`);
        const batch = writeBatch(db);
        attendanceToMigrate.forEach(att => {
          const ref = doc(db, 'attendance', att.id);
          batch.set(ref, cleanFirestoreData(att), { merge: true });
        });
        await batch.commit();
        addLog("✅ Asistencias sincronizadas.");
      }

      // Registrar métricas de uso de Firebase en localStorage
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const existingRaw = localStorage.getItem('firebase_daily_usage');
        let dailyStats = existingRaw ? JSON.parse(existingRaw) : { date: todayStr, writes: 0, reads: 0 };
        if (dailyStats.date !== todayStr) {
          dailyStats = { date: todayStr, writes: 0, reads: 0 };
        }
        dailyStats.writes = (dailyStats.writes || 0) + totalSelectedWrites;
        dailyStats.lastMigration = {
          timestamp: new Date().toISOString(),
          writesCount: totalSelectedWrites,
          stores: storesToMigrate.length,
          users: usersToMigrate.length,
          sales: salesToMigrate.length,
          closings: closingsToMigrate.length,
          warranties: warrantiesToMigrate.length
        };
        localStorage.setItem('firebase_daily_usage', JSON.stringify(dailyStats));
      } catch (e) {
        console.warn("No se pudo guardar la métrica de uso:", e);
      }

      addLog(`🎉 ¡SINCRONIZACIÓN EXITOSA! Se escribieron ${totalSelectedWrites} documentos seleccionados en Google Cloud Firestore.`);

      // Guardar en Historial Persistente (Firestore y localStorage)
      const totalRevenueMigrated = salesToMigrate.reduce((acc, s) => acc + (s.price || 0), 0);
      const dates = salesToMigrate.map(s => s.date).filter(Boolean).sort();
      const minDate = dates[0] || undefined;
      const maxDate = dates[dates.length - 1] || undefined;

      const historyEntry: BackupHistoryEntry = {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'import_migration',
        title: `Migración de Respaldo (${file?.name || 'Archivo .gz'})`,
        fileName: file?.name || 'respaldo.gz',
        status: 'success',
        summary: {
          totalWrites: totalSelectedWrites,
          storesCount: storesToMigrate.length,
          usersCount: usersToMigrate.length,
          salesCount: salesToMigrate.length,
          closingsCount: closingsToMigrate.length,
          warrantiesCount: warrantiesToMigrate.length,
          attendanceCount: attendanceToMigrate.length,
          totalRecords: totalSelectedWrites,
          totalSalesRevenue: totalRevenueMigrated,
          dateSpan: minDate ? { start: minDate, end: maxDate } : undefined,
          storeNames: storesToMigrate.map(s => s.name)
        },
        details: {
          performedBy: userProfile?.fullName || userProfile?.email || 'Administrador',
          notes: `Sincronizados ${totalSelectedWrites} documentos seleccionados a Google Cloud Firestore.`,
          modulesIncluded: Object.entries(syncModules).filter(([_, v]) => v).map(([k]) => k)
        }
      };

      try {
        await setDoc(doc(db, 'backup_history', historyEntry.id), cleanFirestoreData(historyEntry), { merge: true });
        setHistory(prev => [historyEntry, ...prev.filter(e => e.id !== historyEntry.id)]);
        const existing = JSON.parse(localStorage.getItem('app_backup_history') || '[]');
        localStorage.setItem('app_backup_history', JSON.stringify([historyEntry, ...existing.filter((e: any) => e.id !== historyEntry.id)]));
        addLog("📜 Acción registrada exitosamente en el historial de respaldos.");
      } catch (histErr) {
        console.warn("No se pudo guardar la entrada de historial:", histErr);
      }

      loadHistoryAndStats();

      try {
        localStorage.setItem('app_selected_store_id', 'all');
        localStorage.setItem('app_current_view', 'list');
      } catch (e) {}
      setMigrationFinished(true);
      if (onComplete) onComplete();
    } catch (err: any) {
      console.error("Error durante la migración a Firestore:", err);
      addLog(`❌ Error en sincronización: ${err.message || err}`);
      setError(`Error durante la inserción en Firestore: ${err.message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  // Download Firebase Auth CLI import JSON
  const downloadFirebaseAuthJson = () => {
    if (!parsedData) return;
    const authUsers = usersToMigrate.map(u => ({
      localId: u.id,
      email: u.email,
      emailVerified: true,
      passwordHash: u.passwordHash ? btoa(u.passwordHash) : undefined,
      displayName: u.fullName || u.email.split('@')[0],
      customAttributes: JSON.stringify({ role: u.role, storeId: u.storeId })
    }));

    const blob = new Blob([JSON.stringify({ users: authUsers }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'firebase_auth_users.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 font-sans">
      {/* SUCCESS MODAL / BANNER */}
      {migrationFinished && (
        <div className="bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-2xl border-2 border-emerald-500/50 animate-in zoom-in-95">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/40 shrink-0">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-500/30 inline-block mb-2">
                🎉 Respaldo Sincronizado Exitosamente
              </span>
              <h2 className="text-xl md:text-2xl font-black text-white">
                ¡Los datos de tu respaldo ya están guardados en la aplicación!
              </h2>
              <p className="text-emerald-200/80 text-sm mt-1">
                Se transfirieron <strong className="text-white font-bold">{storesToMigrate.length}</strong> sucursales, <strong className="text-white font-bold">{salesToMigrate.length}</strong> ventas, <strong className="text-white font-bold">{usersToMigrate.length}</strong> usuarios y <strong className="text-white font-bold">{closingsToMigrate.length}</strong> cierres a Google Cloud Firestore.
              </p>

              <div className="flex flex-wrap items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToList) onNavigateToList();
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-3.5 rounded-2xl shadow-lg shadow-emerald-500/30 flex items-center gap-2 text-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <ShoppingCart className="w-5 h-5 text-slate-950" />
                  Ir al Registro de Ventas (Historial Completo)
                </button>
                {onNavigateToDashboard && (
                  <button
                    type="button"
                    onClick={onNavigateToDashboard}
                    className="bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-3.5 rounded-2xl border border-white/20 flex items-center gap-2 text-sm transition-all cursor-pointer"
                  >
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    Ver Estadísticas (Dashboard)
                  </button>
                )}
                {onNavigateToAdmin && (
                  <button
                    type="button"
                    onClick={onNavigateToAdmin}
                    className="bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-3.5 rounded-2xl border border-white/20 flex items-center gap-2 text-sm transition-all cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-emerald-400" />
                    Ver Usuarios y Tiendas (Admin)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl border border-purple-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-purple-500/20 text-purple-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-purple-500/30 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Administrador de Respaldos y Migración
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Respaldos, Migración e Historial
            </h1>
            <p className="text-purple-200/80 text-sm max-w-xl mt-1">
              Transfiere datos a Google Cloud Firestore, consulta el historial detallado de lo que se ha respaldado y descarga copias de seguridad de toda la base de datos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleGenerateExportBackup}
              disabled={isExportingBackup}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 text-xs transition-all cursor-pointer disabled:opacity-50"
              title="Descargar copia de seguridad completa (.json)"
            >
              {isExportingBackup ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Download className="w-4 h-4 text-slate-950" />}
              Descargar Respaldo (.json)
            </button>
            <button
              type="button"
              onClick={loadHistoryAndStats}
              disabled={isLoadingHistory || isLoadingLiveStats}
              className="bg-white/10 hover:bg-white/20 text-white font-bold p-2.5 rounded-xl border border-white/20 transition-all cursor-pointer"
              title="Actualizar datos e historial"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingHistory || isLoadingLiveStats ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="relative z-10 flex flex-wrap gap-2 mt-6 pt-6 border-t border-purple-500/30">
          <button
            type="button"
            onClick={() => setSectionTab('upload')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              sectionTab === 'upload'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-white/10 text-purple-200 hover:bg-white/20 border border-white/10'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Migrar / Subir Archivo (.gz, .sql, .json)
          </button>

          <button
            type="button"
            onClick={() => setSectionTab('history')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              sectionTab === 'history'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-white/10 text-purple-200 hover:bg-white/20 border border-white/10'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Historial de Acciones y Respaldos
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${sectionTab === 'history' ? 'bg-purple-900 text-white' : 'bg-white/20 text-white'}`}>
              {history.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSectionTab('database')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              sectionTab === 'database'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-white/10 text-purple-200 hover:bg-white/20 border border-white/10'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Datos Respaldados en Firestore {liveStats ? `(${liveStats.salesCount} ventas)` : ''}
          </button>
        </div>
      </div>

      {/* ================= SECTION: DEDICATED HISTORY VIEW ================= */}
      {sectionTab === 'history' && (
        <div className="space-y-6 animate-in fade-in">
          {/* History Metrics Summary Header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total de Acciones</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{history.length}</p>
              <span className="text-[11px] text-slate-500 font-medium">Respaldos registrados</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Registros Respaldados</span>
              <p className="text-2xl font-black text-purple-600 mt-1">
                {history.reduce((acc, h) => acc + (h.summary.totalRecords || 0), 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-500 font-medium">Acumulados en el historial</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Ventas Respaldadas</span>
              <p className="text-2xl font-black text-emerald-600 mt-1">
                {history.reduce((acc, h) => acc + (h.summary.salesCount || 0), 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-500 font-medium">Transacciones registradas</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Último Respaldo</span>
              <p className="text-sm font-bold text-slate-800 mt-2 truncate">
                {history.length > 0 ? formatDate(history[0].timestamp) : 'Sin acciones aún'}
              </p>
              <span className="text-[11px] text-emerald-600 font-bold">● Sincronizado en la nube</span>
            </div>
          </div>

          {/* Filter Bar & Quick Actions */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mr-1">Filtrar por:</span>
              <button
                type="button"
                onClick={() => setHistoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  historyFilter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todas las Acciones ({history.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('import_migration')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  historyFilter === 'import_migration'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📥 Migraciones (.gz / .sql) ({history.filter(h => h.type === 'import_migration').length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('export_backup')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  historyFilter === 'export_backup'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📤 Copias Descargadas (.json) ({history.filter(h => h.type === 'export_backup').length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateExportBackup}
                disabled={isExportingBackup}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Nueva Copia JSON
              </button>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllHistory}
                  className="text-slate-400 hover:text-red-600 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-red-50 transition-all cursor-pointer"
                >
                  Vaciar Historial
                </button>
              )}
            </div>
          </div>

          {/* History List */}
          {isLoadingHistory ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">Cargando historial de respaldos...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-4">
              <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto">
                <History className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">No hay acciones registradas aún</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                  Cuando sincronices un archivo de respaldo (.gz, .sql, .json) o generes una copia de seguridad, aquí aparecerá el historial detallado con la fecha, cantidad de ventas, sucursales y usuarios respaldados.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSectionTab('upload')}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-purple-600/20 cursor-pointer"
                >
                  Subir o Migrar un Respaldo Ahora
                </button>
                <button
                  type="button"
                  onClick={handleGenerateExportBackup}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Generar Primera Copia de Seguridad
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {history
                .filter(item => {
                  if (historyFilter === 'all') return true;
                  return item.type === historyFilter;
                })
                .map((entry, index) => (
                  <div 
                    key={entry.id || index}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        entry.type === 'export_backup' 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                          : 'bg-purple-50 text-purple-600 border border-purple-200'
                      }`}>
                        {entry.type === 'export_backup' ? (
                          <Download className="w-6 h-6" />
                        ) : (
                          <ArrowDownToLine className="w-6 h-6" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            entry.type === 'export_backup' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {entry.type === 'export_backup' ? 'Copia Exportada' : 'Migración / Sincronización'}
                          </span>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                            {formatDate(entry.timestamp)}
                          </span>
                          {index === 0 && (
                            <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                              ⭐ Más Reciente
                            </span>
                          )}
                        </div>

                        <h4 className="font-extrabold text-slate-900 text-sm md:text-base mt-1 truncate">
                          {entry.title}
                        </h4>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
                          <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-slate-700 font-semibold flex items-center gap-1">
                            <ShoppingCart className="w-3.5 h-3.5 text-blue-600" />
                            <strong>{entry.summary.salesCount.toLocaleString()}</strong> Ventas
                            {entry.summary.totalSalesRevenue ? ` ($${entry.summary.totalSalesRevenue.toLocaleString()} MXN)` : ''}
                          </span>

                          <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-slate-700 font-semibold flex items-center gap-1">
                            <StoreIcon className="w-3.5 h-3.5 text-emerald-600" />
                            <strong>{entry.summary.storesCount}</strong> Tiendas
                          </span>

                          <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-slate-700 font-semibold flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-purple-600" />
                            <strong>{entry.summary.usersCount}</strong> Usuarios
                          </span>

                          {entry.summary.closingsCount > 0 && (
                            <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-slate-700 font-semibold flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-amber-600" />
                              <strong>{entry.summary.closingsCount}</strong> Cierres
                            </span>
                          )}

                          {entry.summary.warrantiesCount > 0 && (
                            <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-slate-700 font-semibold flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                              <strong>{entry.summary.warrantiesCount}</strong> Garantías
                            </span>
                          )}

                          <span className="text-[11px] text-slate-500 font-medium">
                            Archivo: <strong className="font-mono text-slate-700">{entry.fileName || 'respaldo'}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryDetail(entry)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-600" />
                        Ver Detalle
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryEntry(entry.id, e)}
                        className="text-slate-300 hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
                        title="Eliminar del historial"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ================= SECTION: CLOUD FIRESTORE DATABASE STATUS ================= */}
      {sectionTab === 'database' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Real-time Collections Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Sales Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full">
                    Colección 'sales'
                  </span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Ventas Respaldadas</h3>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {liveStats ? liveStats.salesCount.toLocaleString() : '...'}
                </p>
                <p className="text-xs text-emerald-600 font-bold mt-1">
                  Total Ingresos: ${liveStats ? liveStats.totalSalesRevenue.toLocaleString() : '0'} MXN
                </p>
              </div>
              {onNavigateToList && (
                <button
                  type="button"
                  onClick={onNavigateToList}
                  className="mt-6 w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver Historial de Ventas
                </button>
              )}
            </div>

            {/* Stores Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
                    <StoreIcon className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                    Colección 'stores'
                  </span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Sucursales Activas</h3>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {liveStats ? liveStats.storesCount : '...'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Tiendas con horarios configurados</p>
              </div>
              {onNavigateToAdmin && (
                <button
                  type="button"
                  onClick={onNavigateToAdmin}
                  className="mt-6 w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <StoreIcon className="w-3.5 h-3.5" />
                  Gestionar Sucursales
                </button>
              )}
            </div>

            {/* Users Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center font-bold">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full">
                    Colección 'users'
                  </span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Usuarios / Vendedores</h3>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {liveStats ? liveStats.usersCount : '...'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Perfiles sincronizados</p>
              </div>
              {onNavigateToAdmin && (
                <button
                  type="button"
                  onClick={onNavigateToAdmin}
                  className="mt-6 w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  Gestionar Usuarios
                </button>
              )}
            </div>

            {/* Closings Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center font-bold">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full">
                    Colección 'daily_closings'
                  </span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Cierres Diarios</h3>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {liveStats ? liveStats.closingsCount : '...'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Cortes acumulados por fecha</p>
              </div>
            </div>

            {/* Warranties Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full">
                    Colección 'warranties'
                  </span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Garantías Registradas</h3>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {liveStats ? liveStats.warrantiesCount : '...'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Equipos en taller o recepción</p>
              </div>
            </div>

            {/* Attendance Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center font-bold">
                    <Clock className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full">
                    Colección 'attendance'
                  </span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Marcajes de Asistencia</h3>
                <p className="text-3xl font-black text-slate-900 mt-1">
                  {liveStats ? liveStats.attendanceCount : '...'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Registros de entrada y salida</p>
              </div>
            </div>
          </div>

          {/* Database Actions Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl border border-slate-800">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Respaldo Integral en 1 Clic</span>
              <h3 className="text-xl font-bold mt-1">¿Deseas descargar una copia local de toda la base de datos?</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-xl">
                Genera un archivo JSON estructurado con todas tus ventas, sucursales, usuarios, cortes y garantías para almacenarlo fuera de la nube.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateExportBackup}
              disabled={isExportingBackup}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-3.5 rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center gap-2 text-sm transition-all cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isExportingBackup ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              Descargar Copia Completa (.json)
            </button>
          </div>
        </div>
      )}

      {/* ================= SECTION: UPLOAD / MIGRATION VIEW ================= */}
      {sectionTab === 'upload' && !parsedData && (
        <div className="space-y-6">
          {/* File Upload Box */}
          <div className="bg-white rounded-3xl p-8 border-2 border-dashed border-slate-300 hover:border-purple-500 transition-all text-center relative group shadow-sm">
            <input
              type="file"
              accept=".gz,.sql,.dump,.json"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <div className="w-20 h-20 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform shadow-inner">
                {isProcessing ? (
                  <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
                ) : (
                  <FileArchive className="w-10 h-10" />
                )}
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">
                  {isProcessing ? statusMessage : 'Selecciona o arrastra tu archivo .gz aquí'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Acepta archivos comprimidos <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">.sql.gz</code>, volcados <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">.sql</code> o respaldos <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">.json</code>
                </p>
              </div>
              {!isProcessing && (
                <button 
                  type="button"
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
                >
                  Explorar Archivos de Respaldo
                </button>
              )}
            </div>
          </div>

          {/* LIVE CLOUD STATUS SUMMARY BAR */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-extrabold text-slate-900 text-sm md:text-base">
                  Datos Respaldados Actualmente en Cloud Firestore
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadHistoryAndStats}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLiveStats ? 'animate-spin' : ''}`} />
                  Actualizar Conteo
                </button>
                <button
                  type="button"
                  onClick={handleGenerateExportBackup}
                  disabled={isExportingBackup}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar Copia (.json)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ventas</span>
                <p className="text-xl font-black text-slate-800 mt-0.5">
                  {liveStats ? liveStats.salesCount.toLocaleString() : '...'}
                </p>
                <span className="text-[10px] text-emerald-600 font-bold block truncate">
                  ${liveStats ? liveStats.totalSalesRevenue.toLocaleString() : '0'} MXN
                </span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sucursales</span>
                <p className="text-xl font-black text-slate-800 mt-0.5">
                  {liveStats ? liveStats.storesCount : '...'}
                </p>
                <span className="text-[10px] text-slate-500 font-medium">Tiendas</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Usuarios</span>
                <p className="text-xl font-black text-slate-800 mt-0.5">
                  {liveStats ? liveStats.usersCount : '...'}
                </p>
                <span className="text-[10px] text-slate-500 font-medium">Vendedores</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cierres</span>
                <p className="text-xl font-black text-slate-800 mt-0.5">
                  {liveStats ? liveStats.closingsCount : '...'}
                </p>
                <span className="text-[10px] text-slate-500 font-medium">Cortes diarios</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Garantías</span>
                <p className="text-xl font-black text-slate-800 mt-0.5">
                  {liveStats ? liveStats.warrantiesCount : '...'}
                </p>
                <span className="text-[10px] text-slate-500 font-medium">En servicio</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Asistencias</span>
                <p className="text-xl font-black text-slate-800 mt-0.5">
                  {liveStats ? liveStats.attendanceCount : '...'}
                </p>
                <span className="text-[10px] text-slate-500 font-medium">Marcajes</span>
              </div>
            </div>
          </div>

          {/* RECENT ACTIONS & BACKUP HISTORY PREVIEW */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-slate-800 text-sm md:text-base">
                  Historial de Acciones y Respaldos Realizados ({history.length})
                </h3>
              </div>
              {history.length > 3 && (
                <button
                  type="button"
                  onClick={() => setSectionTab('history')}
                  className="text-purple-600 hover:text-purple-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  Ver Todo el Historial ({history.length})
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
                <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600">No hay acciones registradas aún en el historial</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tus sincronizaciones y descargas de respaldo se guardarán aquí automáticamente.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.slice(0, 3).map((entry, idx) => (
                  <div 
                    key={entry.id || idx}
                    className="p-4 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        entry.type === 'export_backup' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {entry.type === 'export_backup' ? <Download className="w-4 h-4" /> : <ArrowDownToLine className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs truncate">{entry.title}</span>
                          <span className="text-[10px] font-bold text-slate-400 font-mono">
                            {formatDate(entry.timestamp)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-600">
                          <span>🛒 <strong>{entry.summary.salesCount}</strong> ventas</span>
                          <span>🏪 <strong>{entry.summary.storesCount}</strong> tiendas</span>
                          <span>👥 <strong>{entry.summary.usersCount}</strong> usuarios</span>
                          {entry.summary.closingsCount > 0 && <span>📅 <strong>{entry.summary.closingsCount}</strong> cierres</span>}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedHistoryDetail(entry)}
                      className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors cursor-pointer shrink-0 self-end sm:self-center"
                    >
                      Ver Detalle
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold">Error en el proceso</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Selective Configuration Panel */}
      {parsedData && (
        <div className="space-y-6 animate-in fade-in">
          {/* Quick Presets Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Presets de Selección Rápida:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyPreset('all')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/60 transition-all"
              >
                🌟 Todo el Respaldo ({parsedData.sales.length + parsedData.users.length + parsedData.stores.length} items)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('recentSales')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60 transition-all"
              >
                📅 Ventas Recientes (Últimos 30 días)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('structureOnly')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-all"
              >
                👥 Solo Usuarios y Sucursales
              </button>
              <button
                type="button"
                onClick={() => {
                  setParsedData(null);
                  setFile(null);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors ml-2"
              >
                Cambiar Archivo
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('modules')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeTab === 'modules'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              1. Módulos Generales ({Object.values(syncModules).filter(Boolean).length}/6 activos)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeTab === 'sales'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              2. Filtro de Ventas ({salesToMigrate.length} de {parsedData.sales.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeTab === 'users'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              3. Usuarios ({usersToMigrate.length} de {parsedData.users.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stores')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeTab === 'stores'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <StoreIcon className="w-3.5 h-3.5" />
              4. Sucursales ({storesToMigrate.length} de {parsedData.stores.length})
            </button>
          </div>

          {/* TAB 1: MODULES SELECTION */}
          {activeTab === 'modules' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Stores Card */}
              <div 
                onClick={() => setSyncModules(prev => ({ ...prev, stores: !prev.stores }))}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  syncModules.stores ? 'bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm' : 'bg-white border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${syncModules.stores ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <StoreIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Sucursales / Tiendas</h4>
                      <p className="text-xs text-slate-500">Horarios, ubicaciones y metas</p>
                    </div>
                  </div>
                  {syncModules.stores ? (
                    <CheckSquare className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-500">Encontradas en respaldo:</span>
                  <span className="font-bold text-slate-800">{parsedData.stores.length} tiendas</span>
                </div>
              </div>

              {/* Users Card */}
              <div 
                onClick={() => setSyncModules(prev => ({ ...prev, users: !prev.users }))}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  syncModules.users ? 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-500/20 shadow-sm' : 'bg-white border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${syncModules.users ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Usuarios y Perfiles</h4>
                      <p className="text-xs text-slate-500">Admins, supervisores y vendedores</p>
                    </div>
                  </div>
                  {syncModules.users ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-500">Encontrados en respaldo:</span>
                  <span className="font-bold text-slate-800">{parsedData.users.length} usuarios</span>
                </div>
              </div>

              {/* Sales Card */}
              <div 
                onClick={() => setSyncModules(prev => ({ ...prev, sales: !prev.sales }))}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  syncModules.sales ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-500/20 shadow-sm' : 'bg-white border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${syncModules.sales ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Ventas Históricas</h4>
                      <p className="text-xs text-slate-500">Folios, marcas, clientes y tickets</p>
                    </div>
                  </div>
                  {syncModules.sales ? (
                    <CheckSquare className="w-5 h-5 text-amber-600" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-500">Encontradas en respaldo:</span>
                  <span className="font-bold text-slate-800">{parsedData.sales.length} ventas</span>
                </div>
              </div>

              {/* Daily Closings Card */}
              <div 
                onClick={() => setSyncModules(prev => ({ ...prev, closings: !prev.closings }))}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  syncModules.closings ? 'bg-purple-50/50 border-purple-300 ring-2 ring-purple-500/20 shadow-sm' : 'bg-white border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${syncModules.closings ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Cierres Diarios de Caja</h4>
                      <p className="text-xs text-slate-500">Historial de cortes por fecha y tienda</p>
                    </div>
                  </div>
                  {syncModules.closings ? (
                    <CheckSquare className="w-5 h-5 text-purple-600" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-500">Encontrados en respaldo:</span>
                  <span className="font-bold text-slate-800">{parsedData.closings.length} cierres</span>
                </div>
              </div>

              {/* Warranties Card */}
              <div 
                onClick={() => setSyncModules(prev => ({ ...prev, warranties: !prev.warranties }))}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  syncModules.warranties ? 'bg-rose-50/50 border-rose-300 ring-2 ring-rose-500/20 shadow-sm' : 'bg-white border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${syncModules.warranties ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Garantías de Equipos</h4>
                      <p className="text-xs text-slate-500">IMEIs, diagnósticos y estados</p>
                    </div>
                  </div>
                  {syncModules.warranties ? (
                    <CheckSquare className="w-5 h-5 text-rose-600" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-500">Encontradas en respaldo:</span>
                  <span className="font-bold text-slate-800">{parsedData.warranties.length} garantías</span>
                </div>
              </div>

              {/* Attendance Card */}
              <div 
                onClick={() => setSyncModules(prev => ({ ...prev, attendance: !prev.attendance }))}
                className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                  syncModules.attendance ? 'bg-teal-50/50 border-teal-300 ring-2 ring-teal-500/20 shadow-sm' : 'bg-white border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${syncModules.attendance ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <CalendarDays className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Registros de Asistencia</h4>
                      <p className="text-xs text-slate-500">Checadas y justificaciones</p>
                    </div>
                  </div>
                  {syncModules.attendance ? (
                    <CheckSquare className="w-5 h-5 text-teal-600" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-500">Encontrados en respaldo:</span>
                  <span className="font-bold text-slate-800">{parsedData.attendance.length} registros</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SALES & DATE FILTER */}
          {activeTab === 'sales' && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Filtro de Rango y Periodo de Ventas</h3>
                  <p className="text-xs text-slate-500">Elige qué parte del histórico de ventas deseas sincronizar con Firebase.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Total en archivo: {parsedData.sales.length}</span>
                  <span className="text-xs font-extrabold bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
                    {salesToMigrate.length} seleccionadas
                  </span>
                </div>
              </div>

              {/* Period Selector Buttons */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                {[
                  { id: 'all', label: 'Todo el Histórico' },
                  { id: '30days', label: 'Últimos 30 Días' },
                  { id: '90days', label: 'Últimos 90 Días' },
                  { id: 'currentYear', label: `Año ${new Date().getFullYear()}` },
                  { id: 'custom', label: 'Personalizado' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSalesDateFilter(opt.id as any)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                      salesDateFilter === opt.id
                        ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Range Inputs */}
              {salesDateFilter === 'custom' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha Desde:</label>
                    <input
                      type="date"
                      value={salesCustomStartDate}
                      onChange={(e) => setSalesCustomStartDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha Hasta:</label>
                    <input
                      type="date"
                      value={salesCustomEndDate}
                      onChange={(e) => setSalesCustomEndDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              {/* Store Filter for Sales */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Filtrar por Sucursal de Origen:</label>
                <select
                  value={salesStoreFilter}
                  onChange={(e) => setSalesStoreFilter(e.target.value)}
                  className="w-full md:w-80 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold"
                >
                  <option value="all">Todas las sucursales</option>
                  {parsedData.stores.map(st => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </div>

              {/* Sales Preview Mini-List */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-50 p-3 px-4 text-xs font-bold text-slate-600 flex justify-between items-center">
                  <span>Muestra de ventas a sincronizar ({Math.min(5, salesToMigrate.length)} de {salesToMigrate.length})</span>
                  <span className="text-[11px] text-slate-400">Total a escribir: {salesToMigrate.length} docs</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs max-h-48 overflow-y-auto">
                  {salesToMigrate.slice(0, 8).map((s, i) => (
                    <div key={i} className="p-2.5 px-4 flex justify-between items-center hover:bg-slate-50">
                      <div>
                        <span className="font-bold text-slate-800">Folio: {s.invoiceNumber}</span>
                        <span className="text-slate-400 ml-2">({s.brand} - {s.customerName})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-emerald-600">${Number(s?.price || 0).toFixed(2)}</span>
                        <span className="text-slate-400 text-[11px]">{s.date}</span>
                      </div>
                    </div>
                  ))}
                  {salesToMigrate.length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      No hay ventas que coincidan con los filtros seleccionados.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: USERS SELECTION */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Selección de Usuarios ({selectedUserIds.size} de {parsedData.users.length})</h3>
                  <p className="text-xs text-slate-500">Selecciona con la casilla qué cuentas crear en Firestore.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds(new Set(parsedData.users.map(u => u.id)))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Seleccionar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds(new Set())}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Deseleccionar
                  </button>
                  <button
                    type="button"
                    onClick={downloadFirebaseAuthJson}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1.5 transition-colors"
                    title="Exportar archivo JSON para firebase auth:import"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Auth JSON
                  </button>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full sm:flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar usuario por nombre o correo..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                </div>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="w-full sm:w-48 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold"
                >
                  <option value="all">Todos los roles</option>
                  <option value="admin">Administrador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="seller">Vendedor</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </div>

              {/* Users Checkbox List */}
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-sm">
                {displayUsers.map((u) => {
                  const isChecked = selectedUserIds.has(u.id);
                  return (
                    <div 
                      key={u.id} 
                      onClick={() => {
                        setSelectedUserIds(prev => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        });
                      }}
                      className={`p-3 px-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${
                        isChecked ? 'bg-blue-50/20' : 'opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 shrink-0" />
                        )}
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs uppercase">
                          {u.fullName?.charAt(0) || u.email?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">{u.fullName || 'Sin nombre'}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          u.role === 'admin' ? 'bg-amber-100 text-amber-700' :
                          u.role === 'supervisor' ? 'bg-blue-100 text-blue-700' :
                          u.role === 'viewer' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {u.role}
                        </span>
                        {u.passwordHash && (
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono" title="Hash bcrypt detectado">
                            🔑 Hash OK
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: STORES SELECTION */}
          {activeTab === 'stores' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Selección de Sucursales ({selectedStoreIds.size} de {parsedData.stores.length})</h3>
                  <p className="text-xs text-slate-500">Selecciona qué sucursales importar.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStoreIds(new Set(parsedData.stores.map(s => s.id)))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Seleccionar Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStoreIds(new Set())}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Deseleccionar
                  </button>
                </div>
              </div>

              {/* Stores Checkbox List */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {displayStores.map((st) => {
                  const isChecked = selectedStoreIds.has(st.id);
                  return (
                    <div
                      key={st.id}
                      onClick={() => {
                        setSelectedStoreIds(prev => {
                          const next = new Set(prev);
                          if (next.has(st.id)) next.delete(st.id);
                          else next.add(st.id);
                          return next;
                        });
                      }}
                      className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                        isChecked ? 'bg-emerald-50/30 border-emerald-300 ring-2 ring-emerald-500/20' : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 shrink-0" />
                        )}
                        <div className="truncate">
                          <p className="font-bold text-slate-800 text-xs truncate">{st.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{st.location || 'Sin ubicación'}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-100 shrink-0">
                        {st.entryTime || '09:00'} - {st.exitTime || '19:00'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sticky Bottom Migration Actions Bar */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-800">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Resumen de Selección Personalizada
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 mt-1">
                  <span>🏪 <strong>{storesToMigrate.length}</strong> tiendas</span>
                  <span>👥 <strong>{usersToMigrate.length}</strong> usuarios</span>
                  <span>🛒 <strong>{salesToMigrate.length}</strong> ventas</span>
                  <span>📅 <strong>{closingsToMigrate.length}</strong> cierres</span>
                  <span>🛡️ <strong>{warrantiesToMigrate.length}</strong> garantías</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Impacto en Firebase: <strong className="text-emerald-300">{totalSelectedWrites.toLocaleString()} escrituras</strong> ({((totalSelectedWrites / 20000) * 100).toFixed(1)}% de las 20,000 gratuitas de hoy). <strong className="text-white">Costo: $0.00 MXN</strong>.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {migrationFinished ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateToList) onNavigateToList();
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm px-6 py-3.5 rounded-2xl shadow-xl shadow-emerald-500/30 transition-all flex items-center gap-2 active:scale-[0.98] cursor-pointer"
                  >
                    <CheckCircle2 className="w-5 h-5 text-slate-950" />
                    👉 Ver Registros de Ventas en la App
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartMigration}
                    disabled={isMigrating || totalSelectedWrites === 0}
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-extrabold text-sm px-6 py-3 rounded-2xl shadow-xl shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-[0.98] cursor-pointer"
                  >
                    {isMigrating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sincronizando {migrationProgress}%...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4" />
                        Sincronizar {totalSelectedWrites.toLocaleString()} Seleccionados
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Migration progress bar */}
            {isMigrating && (
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${migrationProgress}%` }}
                />
              </div>
            )}

            {/* Live Terminal Log */}
            {migrationLogs.length > 0 && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-400 max-h-48 overflow-y-auto space-y-1">
                {migrationLogs.map((log, idx) => (
                  <p key={idx} className="leading-tight">{log}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: DETALLE DE ACCIÓN / RESPALDO ================= */}
      {selectedHistoryDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl border border-slate-200 relative animate-in zoom-in-95 duration-200 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  selectedHistoryDetail.type === 'export_backup' 
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                    : 'bg-purple-50 text-purple-600 border border-purple-200'
                }`}>
                  {selectedHistoryDetail.type === 'export_backup' ? (
                    <Download className="w-6 h-6" />
                  ) : (
                    <ArrowDownToLine className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      selectedHistoryDetail.type === 'export_backup' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {selectedHistoryDetail.type === 'export_backup' ? 'Copia de Seguridad Exportada' : 'Migración / Sincronización'}
                    </span>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {selectedHistoryDetail.status === 'success' ? 'Exitoso' : selectedHistoryDetail.status}
                    </span>
                  </div>
                  <h3 className="text-lg md:text-xl font-extrabold text-slate-900 mt-1">
                    {selectedHistoryDetail.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {formatDate(selectedHistoryDetail.timestamp)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedHistoryDetail(null)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block">Archivo Asociado</span>
                <span className="font-mono font-bold text-slate-800 mt-0.5 block truncate">
                  {selectedHistoryDetail.fileName || 'respaldo'}
                </span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block">Responsable</span>
                <span className="font-bold text-slate-800 mt-0.5 block truncate">
                  {selectedHistoryDetail.details?.performedBy || 'Administrador'}
                </span>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                Desglose de Registros Respaldados
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-blue-50/70 border border-blue-200/60 rounded-2xl">
                  <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                    <ShoppingCart className="w-4 h-4" />
                    Ventas
                  </div>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {selectedHistoryDetail.summary.salesCount.toLocaleString()}
                  </p>
                  {selectedHistoryDetail.summary.totalSalesRevenue ? (
                    <span className="text-[10px] font-bold text-emerald-600 block mt-0.5">
                      ${selectedHistoryDetail.summary.totalSalesRevenue.toLocaleString()} MXN
                    </span>
                  ) : null}
                </div>

                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/60 rounded-2xl">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                    <StoreIcon className="w-4 h-4" />
                    Sucursales
                  </div>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {selectedHistoryDetail.summary.storesCount}
                  </p>
                  <span className="text-[10px] text-slate-500 font-medium">Tiendas vinculadas</span>
                </div>

                <div className="p-3.5 bg-purple-50/70 border border-purple-200/60 rounded-2xl">
                  <div className="flex items-center gap-2 text-purple-700 font-bold text-xs">
                    <Users className="w-4 h-4" />
                    Usuarios
                  </div>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {selectedHistoryDetail.summary.usersCount}
                  </p>
                  <span className="text-[10px] text-slate-500 font-medium">Perfiles</span>
                </div>

                <div className="p-3.5 bg-amber-50/70 border border-amber-200/60 rounded-2xl">
                  <div className="flex items-center gap-2 text-amber-700 font-bold text-xs">
                    <Calendar className="w-4 h-4" />
                    Cierres
                  </div>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {selectedHistoryDetail.summary.closingsCount}
                  </p>
                  <span className="text-[10px] text-slate-500 font-medium">Cortes diarios</span>
                </div>

                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/60 rounded-2xl">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    Garantías
                  </div>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {selectedHistoryDetail.summary.warrantiesCount}
                  </p>
                  <span className="text-[10px] text-slate-500 font-medium">Equipos</span>
                </div>

                <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                    <Package className="w-4 h-4" />
                    Total Registros
                  </div>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {selectedHistoryDetail.summary.totalRecords.toLocaleString()}
                  </p>
                  <span className="text-[10px] text-slate-500 font-medium">Documentos totales</span>
                </div>
              </div>
            </div>

            {/* Sales Date Span (if present) */}
            {selectedHistoryDetail.summary.dateSpan?.start && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Periodo de Ventas Respaldadas:</span>
                <span className="font-mono font-bold text-purple-700">
                  {selectedHistoryDetail.summary.dateSpan.start} ➔ {selectedHistoryDetail.summary.dateSpan.end}
                </span>
              </div>
            )}

            {/* Store Names List (if present) */}
            {selectedHistoryDetail.summary.storeNames && selectedHistoryDetail.summary.storeNames.length > 0 && (
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                  Sucursales Respaldadas ({selectedHistoryDetail.summary.storeNames.length})
                </h4>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  {selectedHistoryDetail.summary.storeNames.map((name, sIdx) => (
                    <span key={sIdx} className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs">
                      🏪 {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedHistoryDetail.details?.notes && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs text-slate-600">
                <span className="font-bold text-slate-700 block mb-1">Notas:</span>
                <p>{selectedHistoryDetail.details.notes}</p>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedHistoryDetail(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Cerrar Ventana
              </button>

              <div className="flex items-center gap-2">
                {onNavigateToList && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHistoryDetail(null);
                      onNavigateToList();
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    Ver en Ventas
                  </button>
                )}
                {onNavigateToDashboard && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHistoryDetail(null);
                      onNavigateToDashboard();
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-purple-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Ver Estadísticas
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
