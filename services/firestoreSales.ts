import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db } from './firebase';
import { Brand, Sale } from '../types';

export const ONDEMAND_IMAGE_MARKER = '__ondemand__';
export const ARCHIVED_SALES_CACHE_KEY = 'coppel_archived_sales_v2';
export const ARCHIVED_SALES_CACHE_TS_KEY = 'coppel_archived_sales_ts_v2';

export interface UserInfoMap {
  [userId: string]: {
    email?: string;
    fullName?: string;
  };
}

export const formatDateInMx = (dateInput: Date | string): string => {
  const dt = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(dt.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(dt);
  } catch {
    return (
      dt.getFullYear() +
      '-' +
      String(dt.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(dt.getDate()).padStart(2, '0')
    );
  }
};

export const getTodayMxStr = (offsetDays = 0): string => {
  const todayMx = formatDateInMx(new Date());
  if (!todayMx || offsetDays === 0) return todayMx;
  const [y, m, d] = todayMx.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt.toISOString().split('T')[0];
};

export const mapFirestoreSale = (
  d: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => any },
  userMap: UserInfoMap = {}
): Sale => {
  const data = d.data() || {};
  const creatorInfo = userMap[data.createdBy || data.created_by] || {};

  let calculatedCreatedAt = data.createdAt || data.created_at || '';
  if (!calculatedCreatedAt && d.id.startsWith('sale-')) {
    const parts = d.id.split('-');
    const timestamp = Number(parts[1]);
    if (!isNaN(timestamp) && timestamp > 1600000000000) {
      calculatedCreatedAt = new Date(timestamp).toISOString();
    }
  }

  return {
    id: d.id,
    invoiceNumber: data.invoiceNumber || data.invoice_number || 'S/N',
    customerName: data.customerName || data.customer_name || 'Cliente',
    price: Number(data.price || 0),
    brand: (data.brand || 'OTRO') as Brand,
    date: data.date || '',
    ticketImage: data.ticketImage || data.ticket_image || '',
    createdBy: data.createdBy || data.created_by || '',
    createdAt: calculatedCreatedAt,
    createdByEmail: data.createdByEmail || creatorInfo.email || data.profiles?.email || '',
    createdByName: data.createdByName || creatorInfo.fullName || data.profiles?.full_name || '',
    storeId: data.storeId || data.store_id || '',
    transactionFolio: data.transactionFolio || data.transaction_folio || '',
    category: (data.category || 'kit').toLowerCase() as any,
    iccid: data.iccid || '',
    phoneNumber: data.phoneNumber || data.phone_number || '',
    portabilityScreenshot: data.portabilityScreenshot || data.portability_screenshot || ''
  };
};

export const stripHeavyImagesForCache = (salesList: Sale[]): Sale[] => {
  return salesList.map((s) => {
    const hasHeavyTicket = Boolean(s.ticketImage && s.ticketImage.startsWith('data:'));
    const hasHeavyPorta = Boolean(s.portabilityScreenshot && s.portabilityScreenshot.startsWith('data:'));
    if (!hasHeavyTicket && !hasHeavyPorta) return s;
    return {
      ...s,
      ticketImage: hasHeavyTicket ? ONDEMAND_IMAGE_MARKER : s.ticketImage,
      portabilityScreenshot: hasHeavyPorta ? ONDEMAND_IMAGE_MARKER : s.portabilityScreenshot
    };
  });
};

export const sortSalesDesc = (list: Sale[]): Sale[] => {
  return [...list].sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    const createdCmp = (b.createdAt || '').localeCompare(a.createdAt || '');
    if (createdCmp !== 0) return createdCmp;
    return b.id.localeCompare(a.id);
  });
};

const addDaysToDateStr = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
};

/**
 * Fetches sales within [startDate, endDate] split into small 5-day windows
 * so no single Firestore query exceeds the 128 MiB execution memory limit
 * (even when documents contain inline base64 receipt images).
 */
export const fetchSalesByDateRangeChunked = async (
  startDate: string,
  endDate: string,
  userMap: UserInfoMap = {},
  options?: { stripImages?: boolean; windowDays?: number }
): Promise<Sale[]> => {
  const windowDays = options?.windowDays ?? 5;
  const stripImages = options?.stripImages ?? false;
  const resultsMap = new Map<string, Sale>();

  let cursor = startDate;
  while (cursor <= endDate) {
    const windowEnd = addDaysToDateStr(cursor, windowDays - 1);
    const effectiveEnd = windowEnd < endDate ? windowEnd : endDate;

    try {
      const snap = await getDocs(
        query(
          collection(db, 'sales'),
          where('date', '>=', cursor),
          where('date', '<=', effectiveEnd)
        )
      );

      snap.docs.forEach((docSnap) => {
        const mapped = mapFirestoreSale(docSnap, userMap);
        const finalSale = stripImages ? stripHeavyImagesForCache([mapped])[0] : mapped;
        resultsMap.set(finalSale.id, finalSale);
      });
    } catch (err: any) {
      // If even a 5-day window is unexpectedly huge, subdivide day by day
      if (
        (err?.code === 'resource-exhausted' || err?.message?.includes('128.00 MiB')) &&
        cursor < effectiveEnd
      ) {
        let dayCursor = cursor;
        while (dayCursor <= effectiveEnd) {
          const daySnap = await getDocs(
            query(collection(db, 'sales'), where('date', '==', dayCursor))
          );
          daySnap.docs.forEach((docSnap) => {
            const mapped = mapFirestoreSale(docSnap, userMap);
            const finalSale = stripImages ? stripHeavyImagesForCache([mapped])[0] : mapped;
            resultsMap.set(finalSale.id, finalSale);
          });
          dayCursor = addDaysToDateStr(dayCursor, 1);
        }
      } else {
        throw err;
      }
    }

    cursor = addDaysToDateStr(effectiveEnd, 1);
  }

  return sortSalesDesc(Array.from(resultsMap.values()));
};

/**
 * Safely fetches ALL sales across all dates without hitting the 128 MiB per-query limit.
 * Intended for AdminPanel seller recovery, full backups, and initial history hydration.
 */
export const fetchAllSalesChunked = async (
  userMap: UserInfoMap = {},
  options?: { stripImages?: boolean; fromDate?: string }
): Promise<Sale[]> => {
  const fromDate = options?.fromDate || '2026-09-01';
  const tomorrow = getTodayMxStr(1);

  const rangedSales = await fetchSalesByDateRangeChunked(fromDate, tomorrow, userMap, {
    stripImages: options?.stripImages ?? false,
    windowDays: 5
  });

  // Also grab any stray documents prior to fromDate (if any exist)
  const mergedMap = new Map<string, Sale>();
  try {
    const olderSnap = await getDocs(
      query(collection(db, 'sales'), where('date', '<', fromDate), limit(150))
    );
    olderSnap.docs.forEach((docSnap) => {
      const mapped = mapFirestoreSale(docSnap, userMap);
      const finalSale = options?.stripImages ? stripHeavyImagesForCache([mapped])[0] : mapped;
      mergedMap.set(finalSale.id, finalSale);
    });
  } catch (e) {
    console.warn('Older sales check note:', e);
  }

  rangedSales.forEach((s) => mergedMap.set(s.id, s));
  return sortSalesDesc(Array.from(mergedMap.values()));
};

/**
 * Fetches full image fields for a single archived sale on demand (1 Firestore read).
 */
export const fetchSingleSaleImage = async (
  saleId: string
): Promise<{ ticketImage?: string; portabilityScreenshot?: string } | null> => {
  try {
    const snap = await getDoc(doc(db, 'sales', saleId));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return {
      ticketImage: data.ticketImage || data.ticket_image || '',
      portabilityScreenshot: data.portabilityScreenshot || data.portability_screenshot || ''
    };
  } catch (err) {
    console.warn('Error fetching sale image on demand:', err);
    return null;
  }
};
