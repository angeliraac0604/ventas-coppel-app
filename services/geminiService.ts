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
  // Intento 1: Ya está en formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // Intento 2: Formato DD-MMM-YY o DD-MMM-YYYY (común en tickets)
  // Mapeo de meses español a número
  const monthMap: { [key: string]: string } = {
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
    'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  try {
    // Buscar patrones: 02-Jun-25, 02/Jun/25, 02 Jun 2025, 26/4/2026
    const parts = dateStr.match(/(\d{1,2})[-/ ]([a-zA-Z]{1,}| \d{1,2})[-/ ](\d{2,4})/);
    if (parts) {
      const day = parts[1].padStart(2, '0');
      const monthPart = parts[2].trim().toLowerCase();
      const yearRaw = parts[3].trim();
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

      let month = '';
      if (/^\d+$/.test(monthPart)) {
        month = monthPart.padStart(2, '0');
      } else {
        month = monthMap[monthPart.substring(0, 3)] || monthMap[monthPart];
      }

      if (month) {
        return `${year}-${month}-${day}`;
      }
    }
  } catch (e) {
    console.warn("Error parsing date:", dateStr, e);
  }
  return undefined; // Fallback
};

export const analyzeTicketImage = async (base64Image: string): Promise<TicketAnalysisResult | null> => {
  const apiKeys = API_KEYS;

  if (apiKeys.length === 0) {
    console.error("❌ No se encontraron claves API de Gemini.");
    throw new Error("Faltan las API Keys de Gemini.");
  }

  // Configuramos modelos (De más reciente/potente a más antiguo/estable)
  const candidateModels = [
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
  ];

  const base64Data = base64Image.split(',')[1] || base64Image;

  const now = new Date();
  const currentDateContext = `Hoy es ${now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}.`;

  const prompt = `Analiza esta imagen de ticket de venta o nota de entrega. 
  ${currentDateContext}
  Tu misión es extraer datos precisos para un registro de ventas. El ticket puede ser de Coppel, Elektra, Salinas y Rocha, Chedraui, Aurrera, Sam's Club u otros.

  Responde ÚNICAMENTE con un objeto JSON válido. No uses Markdown.

  Estructura deseada:
  {
    "store": "Nombre de la tienda detectada (ej. Coppel, Elektra)",
    "invoiceNumber": "Folio, Ticket o Pedido",
    "date": "Fecha textual (ej: 26-Abr-26 o 26/04/2026)",
    "customerName": "Nombre completo del cliente",
    "items": [{ "brand": "Marca", "price": 0 }]
  }

  Instrucciones de Extracción Críticas:
  1. invoiceNumber: 
     - Si es Coppel: Busca "Factura No." (ej: 6624 14537) o "Folio".
     - Si es Elektra/Salinas y Rocha: Busca "No. Pedido" (ej: 419633) o "No. Control".
     - Otros: Busca "Folio", "Ticket", "Ticket No.", "Nota".
  2. date: Busca "Fecha:", "Fecha de surtimiento:" o patrones DD-MMM-YY / DD/MM/YYYY.
  3. customerName: Busca "Nombre:", "Cliente:", "Nombre del Cliente:". Extrae el nombre completo en MAYÚSCULAS.
  4. items (CELULARES SOLAMENTE):
     - IGNORA chips, garantías (GP), fundas, seguros o tiempo aire.
     - brand: Clasifica en (SAMSUNG, APPLE, MOTOROLA, XIAOMI, OPPO, HONOR, HUAWEI, ZTE, REALME, VIVO, SENWA, NUBIA).
     - price: El precio neto del equipo tras descuentos.
     - Lógica de Precios (Coppel/Salinas): Si ves un precio y debajo dice "DESCTO PROMOCION" o "REBAJA", réstalo al precio original. Solo suma artículos que sean teléfonos.`;

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: "image/jpeg",
    },
  };

  // Rotación de Claves API
  for (const [keyIndex, currentApiKey] of apiKeys.entries()) {
    console.log(`🔄 Intentando con API Key #${keyIndex + 1}...`);
    const genAI = new GoogleGenerativeAI(currentApiKey);

    for (const modelName of candidateModels) {
      try {
        console.log(`  ➡️ Modelo: ${modelName}`);
        // USAMOS EL MODELO SIN SCHEMA CONFIG (Modo Libre)
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        if (text) {
          // SANITIZACIÓN: Quitar ```json y ``` sila IA los pone
          let cleanText = text;
          const firstBrace = cleanText.indexOf('{');
          const lastBrace = cleanText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
          }

          const data = JSON.parse(cleanText);
          console.log(`✅ ÉXITO con Key #${keyIndex + 1}`, data);

          // LIMPIEZA DE DATOS (Date & Name Cleaners)
          const cleanDate = parseSpanishDate(data.date);

          let cleanName = (data.customerName || '').trim();
          // Limpieza Extra: Quitar "Nombre:" si la IA lo incluyó
          cleanName = cleanName.replace(/^(nombre|cliente|nom|cli)\s*[:.]?\s*/i, '');

          return {
            invoiceNumber: data.invoiceNumber,
            price: 0, // No usamos precio global
            date: cleanDate,
            customerName: cleanName,
            items: data.items?.map((item: any) => {
              let b = Brand.OTRO;
              const normalizedBrand = item.brand ? item.brand.toString().toUpperCase().trim() : '';
              if (Object.values(Brand).includes(normalizedBrand as Brand)) {
                b = normalizedBrand as Brand;
              }
              return { brand: b, price: item.price };
            })
          };
        }
      } catch (error: any) {
        console.error("Error en intento Gemini:", error);
      }
    }
  }

  return null;
};

