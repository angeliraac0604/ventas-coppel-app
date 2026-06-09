import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { TicketAnalysisResult, Brand } from "../types";

// --- CONFIGURACIÓN ---
const API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY_1,
  import.meta.env.VITE_GEMINI_API_KEY_2,
  import.meta.env.VITE_GEMINI_API_KEY_3,
  import.meta.env.VITE_GEMINI_API_KEY,
].filter(Boolean) as string[];

const parseSpanishDate = (dateStr: string | undefined): string | undefined => {
  if (!dateStr) return undefined;
  
  // Limpiar strings basura que a veces mete la IA
  let cleanStr = dateStr.toLowerCase().trim().replace(/fecha[:.]?\s*/, '');
  
  // Intento 1: Ya está en formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr;

  // Mapeo de meses español a número
  const monthMap: { [key: string]: string } = {
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
    'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  try {
    // Buscar patrones: 02-Jun-25, 02/06/2025, 02 Jun 2025, 26/4/26
    const parts = cleanStr.match(/(\d{1,2})[-/ ]([a-z0-9]{1,})[-/ ](\d{2,4})/);
    if (parts) {
      const day = parts[1].padStart(2, '0');
      const monthPart = parts[2].trim();
      const yearRaw = parts[3].trim();
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

      let month = '';
      if (/^\d+$/.test(monthPart)) {
        month = monthPart.padStart(2, '0');
      } else {
        month = monthMap[monthPart.substring(0, 3)] || monthMap[monthPart];
      }

      if (month && parseInt(month) >= 1 && parseInt(month) <= 12) {
        return `${year}-${month}-${day}`;
      }
    }
  } catch (e) {
    console.warn("Error parsing date:", dateStr, e);
  }
  return undefined; 
};

export const analyzeTicketImage = async (
  base64Image: string, 
  storeName: string = 'Sucursal', 
  chainName: string = 'Coppel',
  category: string = 'kit'
): Promise<TicketAnalysisResult | null> => {
  const apiKeys = API_KEYS;

  if (apiKeys.length === 0) {
    throw new Error("Faltan las API Keys de Gemini.");
  }

  const candidateModels = [
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash-lite",
  ];

  const base64Data = base64Image.split(',')[1] || base64Image;
  const now = new Date();
  const currentDateContext = `Hoy es ${now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}.`;

  const categoryContext = category === 'chip_0' 
    ? 'ESTA ES UNA VENTA DE CHIP 0 (EQUIPO LIBRE). Extrae el precio real del EQUIPO/TELÉFONO principal. Aunque el ticket mencione un chip de $1, debes buscar el precio significativo del dispositivo libre.' 
    : 'ESTA ES UNA VENTA DE EQUIPO KIT. Incluye solo equipos móviles de marcas reconocidas. IGNORA chips sueltos o seguros.';

  const prompt = `Analiza este ticket de compra de la tienda ${chainName} (${storeName}). 
  ${currentDateContext}
  ${categoryContext}
  
  REGLAS ESTRICTAS DE FILTRADO Y ENFOQUE:
  1. ENFOQUE EXCLUSIVO EN EQUIPOS MÓVILES (TELÉFONOS): Solo debes extraer teléfonos celulares/smartphones de marcas reconocidas (como SAMSUNG, APPLE, OPPO, ZTE, MOTOROLA, REALME, VIVO, XIAOMI, HONOR, HUAWEI, SENWA, NUBIA, etc.).
  2. IGNORAR ACCESORIOS Y OTROS ARTÍCULOS: Ignora por completo cualquier otro artículo que no sea un teléfono celular. NO incluyas en la lista de items: seguros, micas protectoras, fundas/carcasas, cargadores, cables, tarjetas de memoria, audífonos, servicios, membresías (ej. "Club de Protección"), ni garantías extendidas.
  3. COMPORTAMIENTO CON EL TICKET: Céntrate únicamente en la información impresa del ticket de compra. Ignora cualquier objeto de fondo, manos, o texto que no pertenezca al ticket.

  REGLAS DE DESCUENTO INTELIGENTE Y CÁLCULO DE PRECIO NETO:
  1. DESCUENTO POR LÍNEA: Para cada teléfono celular, busca si inmediatamente abajo, al lado o asociado a él aparece un descuento, ahorro, promoción, bonificación o una cantidad negativa (ej. "Ahorro: $500", "Descuento -$300", "Promo -$1,000", "-500.00").
  2. APLICACIÓN AUTOMÁTICA DEL DESCUENTO: Si encuentras un descuento asociado al teléfono, debes restarlo automáticamente del precio base del equipo para calcular el PRECIO NETO FINAL.
     - Ejemplo: Si dice "Teléfono Samsung $3,999.00" y abajo dice "Ahorro -$500.00", el precio neto final a reportar en el JSON debe ser 3499.
  3. PRECIO NETO FINAL: El valor numérico de 'price' en el JSON debe representar este precio neto final calculado (Precio Base menos todos los descuentos/ahorros aplicados a ese artículo). No incluyas símbolos de moneda ni comas.

  Extrae los siguientes datos en formato JSON estricto:
  1. invoiceNumber: Busca el folio, factura o número de ticket. (Únelo sin espacios).
  2. date: Busca la fecha de la transacción.
  3. customerName: El nombre del cliente en MAYÚSCULAS.
  4. items: Lista de equipos móviles vendidos (solo teléfonos):
     - brand: La marca del equipo (ej. SAMSUNG, MOTOROLA, etc.).
     - price: El PRECIO NETO FINAL pagado por el equipo (después de aplicar los descuentos correspondientes automáticamente).
  
  RESPONDE ÚNICAMENTE CON EL JSON.`;

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: "image/jpeg",
    },
  };

  // Schema para forzar respuesta JSON
  const schema: any = {
    description: "Ticket data extraction",
    type: SchemaType.OBJECT,
    properties: {
      invoiceNumber: { type: SchemaType.STRING },
      date: { type: SchemaType.STRING },
      customerName: { type: SchemaType.STRING },
      items: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            brand: { type: SchemaType.STRING },
            price: { type: SchemaType.NUMBER }
          },
          required: ["brand", "price"]
        }
      }
    },
    required: ["invoiceNumber", "date", "customerName", "items"]
  };

  for (const [keyIndex, currentApiKey] of apiKeys.entries()) {
    const genAI = new GoogleGenerativeAI(currentApiKey);

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
          }
        });

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        if (text) {
          const data = JSON.parse(text);
          
          // Limpieza de datos extraídos
          const cleanDate = parseSpanishDate(data.date);
          let cleanName = (data.customerName || '').trim().replace(/^(nombre|cliente|nom|cli)\s*[:.]?\s*/i, '');
          
          // Formatear Folio de Coppel (Quitar espacios)
          let cleanInvoice = (data.invoiceNumber || '').replace(/\s/g, '');

          return {
            invoiceNumber: cleanInvoice,
            price: 0,
            date: cleanDate,
            customerName: cleanName.toUpperCase(),
            items: data.items?.map((item: any) => {
              // Mapeo inteligente de marca
              const brandText = item.brand?.toUpperCase() || '';
              let b = Brand.OTRO;
              for (const brandKey of Object.values(Brand)) {
                if (brandText.includes(brandKey)) {
                  b = brandKey;
                  break;
                }
              }
              return { brand: b, price: item.price };
            })
          };
        }
      } catch (error: any) {
        console.error(`Error con ${modelName} y Key #${keyIndex + 1}:`, error);
        // Continuar al siguiente modelo o llave
      }
    }
  }

  return null;
};
