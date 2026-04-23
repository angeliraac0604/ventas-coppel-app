import { Brand, BrandConfig } from './types';

export const BRAND_CONFIGS: Record<Brand, BrandConfig> = {
  [Brand.SAMSUNG]: { label: 'Samsung', colorClass: 'bg-[#1428a0]', hex: '#1428a0', logoUrl: 'https://cdn.simpleicons.org/samsung/1428a0' },
  [Brand.APPLE]: { label: 'Apple', colorClass: 'bg-[#000000]', hex: '#000000', logoUrl: 'https://cdn.simpleicons.org/apple/000000' },
  [Brand.OPPO]: { label: 'Oppo', colorClass: 'bg-[#009B77]', hex: '#009B77', logoUrl: 'https://cdn.simpleicons.org/oppo/009B77' },
  [Brand.ZTE]: { label: 'ZTE', colorClass: 'bg-[#2C8CDB]', hex: '#2C8CDB', logoUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgNTAiPjx0ZXh0IHk9IjQwIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI5MDAiIGZvbnQtc2l6ZT0iNDAiIGZpbGw9IiMyQzhDREIiPlpURTwvdGV4dD48L3N2Zz4=' },
  [Brand.MOTOROLA]: { label: 'Motorola', colorClass: 'bg-[#5C6BC0]', hex: '#5C6BC0', logoUrl: 'https://cdn.simpleicons.org/motorola/5C6BC0' },
  [Brand.REALME]: { label: 'Realme', colorClass: 'bg-[#FFC700] text-black', hex: '#FFC700', logoUrl: 'https://cdn.simpleicons.org/realme/000000' },
  [Brand.VIVO]: { label: 'Vivo', colorClass: 'bg-[#415FFF]', hex: '#415FFF', logoUrl: 'https://cdn.simpleicons.org/vivo/415FFF' },
  [Brand.XIAOMI]: { label: 'Xiaomi', colorClass: 'bg-[#FF6900]', hex: '#FF6900', logoUrl: 'https://cdn.simpleicons.org/xiaomi/FF6900' },
  [Brand.HONOR]: { label: 'Honor', colorClass: 'bg-[#00E3E3] text-black', hex: '#00E3E3', logoUrl: 'https://cdn.simpleicons.org/honor/00E3E3' },
  [Brand.HUAWEI]: { label: 'Huawei', colorClass: 'bg-[#C7000B]', hex: '#C7000B', logoUrl: 'https://cdn.simpleicons.org/huawei/C7000B' },
  [Brand.SENWA]: { label: 'Senwa', colorClass: 'bg-[#7E22CE]', hex: '#7E22CE' },
  [Brand.NUBIA]: { label: 'Nubia', colorClass: 'bg-[#BE123C]', hex: '#BE123C' },
  [Brand.OTRO]: { label: 'Otro', colorClass: 'bg-[#64748b]', hex: '#64748b' },
};

export const DEFAULT_SALE_FORM = {
  invoiceNumber: '',
  customerName: '',
  price: '',
  brand: Brand.SAMSUNG,
  date: new Date().toISOString().split('T')[0],
  ticketImage: null as string | null
};