export enum Brand {
  SAMSUNG = 'SAMSUNG',
  APPLE = 'APPLE',
  OPPO = 'OPPO',
  ZTE = 'ZTE',
  MOTOROLA = 'MOTOROLA',
  REALME = 'REALME',
  VIVO = 'VIVO',
  XIAOMI = 'XIAOMI',
  HONOR = 'HONOR',
  HUAWEI = 'HUAWEI',
  SENWA = 'SENWA',
  NUBIA = 'NUBIA',
  OTRO = 'OTRO'
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerName: string;
  price: number;
  brand: Brand;
  date: string;
  ticketImage?: string; // Base64 string
  createdBy?: string; // UUID of user
  createdAt?: string; // ISO Timestamp
  createdByEmail?: string;
  createdByName?: string;
  storeId?: string; // UUID of store
}

export interface BrandConfig {
  label: string;
  colorClass: string;
  hex: string;
  logoUrl?: string;
}

export interface TicketAnalysisResult {
  invoiceNumber?: string;
  price?: number;
  date?: string;
  brand?: Brand;
  customerName?: string;
  items?: Array<{ brand: Brand; price: number }>;
}

export interface DailyClose {
  id: string;
  date: string;
  totalSales: number;
  totalRevenue: number;
  closedAt: string;
  topBrand: Brand | 'N/A';
}

export type UserRole = 'admin' | 'supervisor' | 'seller' | 'viewer';

export interface Store {
  id: string;
  name: string;
  location?: string;
  createdAt?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  storeId?: string;
}

export type AttendanceType = 'entry' | 'lunch_start' | 'lunch_end' | 'exit';

export interface AttendanceRecord {
  id: string;
  userId: string;
  storeId?: string;
  type: AttendanceType;
  timestamp: string;
  date: string;
  imageUrl?: string;
  screenshotUrl?: string;
  locationCoords?: string;
}

export interface MonthlyGoal {
  month: string; // YYYY-MM
  revenue_goal: number;
  devices_goal: number;
}

export interface Warranty {
  id: string;
  receptionDate: string;
  invoiceNumber: string; // Nuevo
  brand: Brand;
  model: string;
  imei?: string;
  issueDescription: string; // falla
  accessories: string; // Nuevo: Accesorios
  physicalCondition: string; // estado fisico
  contactNumber: string;
  ticketImage?: string; // URL de Google Drive o base64 temporal
  possibleEntryDate?: string; // Nuevo: Posible fecha de ingreso
  status: 'received' | 'sent_to_provider' | 'in_store' | 'delivered';
  storeId?: string;
}