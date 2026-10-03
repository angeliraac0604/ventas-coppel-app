import { Store, Sale, DailyClose, Warranty, Brand } from '../types';

export const CARDENAS_STORE_ID = 'c90b4652-f98f-472b-acab-0d9bc6b4862e';

export const DEFAULT_STORES: Store[] = [
  {
    id: CARDENAS_STORE_ID,
    name: 'Coppel Cárdenas 1053',
    location: 'Lázaro Cárdenas 1053, Centro',
    prefix: '1053',
    entryTime: '09:00',
    exitTime: '19:00',
    lunchDurationMinutes: 60,
    createdAt: '2026-01-01'
  },
  {
    id: 'coppel-centro',
    name: 'Coppel Centro',
    location: 'Av. Juárez 100',
    prefix: '101',
    entryTime: '09:00',
    exitTime: '19:00',
    lunchDurationMinutes: 60,
    createdAt: '2026-01-01'
  },
  {
    id: 'coppel-plaza',
    name: 'Coppel Plaza Galerías',
    location: 'Plaza Galerías Local 25',
    prefix: '102',
    entryTime: '09:00',
    exitTime: '19:00',
    lunchDurationMinutes: 60,
    createdAt: '2026-01-01'
  },
  {
    id: 'coppel-norte',
    name: 'Coppel Norte',
    location: 'Blvd. Norte 820',
    prefix: '103',
    entryTime: '09:00',
    exitTime: '19:00',
    lunchDurationMinutes: 60,
    createdAt: '2026-01-01'
  }
];

export const DEFAULT_USERS = [
  {
    id: 'seller-cardenas-1053',
    email: 'vendedor1053@coppel.com',
    fullName: 'Vendedor Cárdenas 1053',
    role: 'seller',
    storeId: CARDENAS_STORE_ID,
    assignedStores: [CARDENAS_STORE_ID],
    canSellKit: true,
    canSellChip0: true,
    canSellPortability: true,
    canSellChipExpress: true
  },
  {
    id: 'dev-isaac-2001',
    email: 'angeliraac2001@outlook.com',
    fullName: 'Isaac Ángeles',
    role: 'developer',
    storeId: CARDENAS_STORE_ID,
    assignedStores: [CARDENAS_STORE_ID, 'coppel-centro', 'coppel-plaza', 'coppel-norte'],
    canSellKit: true,
    canSellChip0: true,
    canSellPortability: true,
    canSellChipExpress: true
  }
];

export const getInitialSales = (): Sale[] => {
  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  
  const yesterdayObj = new Date(now);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.getFullYear() + '-' + String(yesterdayObj.getMonth() + 1).padStart(2, '0') + '-' + String(yesterdayObj.getDate()).padStart(2, '0');

  return [
    {
      id: 'sale-init-01',
      invoiceNumber: '1053-094821',
      customerName: 'CARLOS MARTÍNEZ RÍOS',
      price: 3499,
      brand: Brand.SAMSUNG,
      date: todayStr,
      createdBy: 'seller-cardenas-1053',
      createdAt: `${todayStr}T10:15:00.000Z`,
      createdByEmail: 'vendedor1053@coppel.com',
      createdByName: 'Vendedor Cárdenas 1053',
      storeId: CARDENAS_STORE_ID,
      transactionFolio: `VNT-${todayStr.replace(/-/g, '')}-A110`,
      category: 'kit',
      iccid: '895205000192837465',
      phoneNumber: '9931234567'
    },
    {
      id: 'sale-init-02',
      invoiceNumber: '1053-094822',
      customerName: 'MARÍA FERNANDA LÓPEZ',
      price: 3299,
      brand: Brand.MOTOROLA,
      date: todayStr,
      createdBy: 'seller-cardenas-1053',
      createdAt: `${todayStr}T11:42:00.000Z`,
      createdByEmail: 'vendedor1053@coppel.com',
      createdByName: 'Vendedor Cárdenas 1053',
      storeId: CARDENAS_STORE_ID,
      transactionFolio: `VNT-${todayStr.replace(/-/g, '')}-B220`,
      category: 'kit',
      iccid: '895205000293847561',
      phoneNumber: '9932345678'
    },
    {
      id: 'sale-init-03',
      invoiceNumber: '1053-094823',
      customerName: 'JOSÉ LUIS HERNÁNDEZ',
      price: 4199,
      brand: Brand.XIAOMI,
      date: todayStr,
      createdBy: 'seller-cardenas-1053',
      createdAt: `${todayStr}T13:20:00.000Z`,
      createdByEmail: 'vendedor1053@coppel.com',
      createdByName: 'Vendedor Cárdenas 1053',
      storeId: CARDENAS_STORE_ID,
      transactionFolio: `VNT-${todayStr.replace(/-/g, '')}-C330`,
      category: 'kit',
      iccid: '895205000384756291',
      phoneNumber: '9933456789'
    },
    {
      id: 'sale-init-04',
      invoiceNumber: '1053-094824',
      customerName: 'ANA PATRICIA GUZMÁN',
      price: 2599,
      brand: Brand.ZTE,
      date: todayStr,
      createdBy: 'seller-cardenas-1053',
      createdAt: `${todayStr}T14:50:00.000Z`,
      createdByEmail: 'vendedor1053@coppel.com',
      createdByName: 'Vendedor Cárdenas 1053',
      storeId: CARDENAS_STORE_ID,
      transactionFolio: `VNT-${todayStr.replace(/-/g, '')}-D440`,
      category: 'kit',
      iccid: '895205000475869302',
      phoneNumber: '9934567890'
    },
    {
      id: 'sale-init-05',
      invoiceNumber: '1053-094825',
      customerName: 'ROBERTO SÁNCHEZ PÉREZ',
      price: 3699,
      brand: Brand.OPPO,
      date: todayStr,
      createdBy: 'seller-cardenas-1053',
      createdAt: `${todayStr}T15:10:00.000Z`,
      createdByEmail: 'vendedor1053@coppel.com',
      createdByName: 'Vendedor Cárdenas 1053',
      storeId: CARDENAS_STORE_ID,
      transactionFolio: `VNT-${todayStr.replace(/-/g, '')}-E550`,
      category: 'kit',
      iccid: '895205000566978413',
      phoneNumber: '9935678901'
    },
    {
      id: 'sale-init-06',
      invoiceNumber: '1053-094819',
      customerName: 'GLORIA MENDEZ CRUZ',
      price: 2799,
      brand: Brand.SAMSUNG,
      date: yesterdayStr,
      createdBy: 'seller-cardenas-1053',
      createdAt: `${yesterdayStr}T16:20:00.000Z`,
      createdByEmail: 'vendedor1053@coppel.com',
      createdByName: 'Vendedor Cárdenas 1053',
      storeId: CARDENAS_STORE_ID,
      transactionFolio: `VNT-${yesterdayStr.replace(/-/g, '')}-F660`,
      category: 'kit'
    }
  ];
};

export const getInitialClosings = (): DailyClose[] => {
  const now = new Date();
  const yesterdayObj = new Date(now);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.getFullYear() + '-' + String(yesterdayObj.getMonth() + 1).padStart(2, '0') + '-' + String(yesterdayObj.getDate()).padStart(2, '0');

  return [
    {
      id: `close-${yesterdayStr}-${CARDENAS_STORE_ID}`,
      date: yesterdayStr,
      totalSales: 6,
      totalRevenue: 19894,
      closedAt: `${yesterdayStr}T20:05:00.000Z`,
      topBrand: Brand.SAMSUNG,
      storeId: CARDENAS_STORE_ID,
      attSales: 0,
      kitCount: 5,
      chip0Count: 1,
      portabilityCount: 0,
      chipExpressCount: 0
    }
  ];
};
