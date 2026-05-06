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

export const analyzeTicketImage = async (base64Image: string): Promise<TicketAnalysisResult | null> => {
  const apiKeys = API_KEYS;

  if (apiKeys.length === 0) {
    throw new Error("Faltan las API Keys de Gemini.");
  }

  const candidateModels = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ];

  const base64Data = base64Image.split(',')[1] || base64Image;
  const now = new Date();
  const currentDateContext = `Hoy es ${now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}.`;

  const prompt = `Analiza este ticket de Coppel o nota de entrega. 
  ${currentDateContext}
  
  Extrae los siguientes datos en formato JSON estricto:
  1. invoiceNumber: Busca "Factura No." o "Ticket". En Coppel suele ser un número como "6624 14537" (únelos como "662414537").
  2. date: Busca la fecha del ticket.
  3. customerName: El nombre del cliente en MAYÚSCULAS.
  4. items: Lista de CELULARES vendidos. 
     - IGNORA: Seguros, Garantías, Chips, Fundas.
     - brand: Debe ser una de estas: (SAMSUNG, APPLE, MOTOROLA, XIAOMI, OPPO, HONOR, HUAWEI, ZTE, REALME, VIVO, SENWA, NUBIA).
     - price: El precio final (después de descuentos si los hay).

  RESPONDE SOLO CON EL JSON.`;

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: "image/jpeg",
    },
  };

  // Schema para forzar respuesta JSON
  const schema = {
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
