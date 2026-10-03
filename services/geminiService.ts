import { TicketAnalysisResult, Brand } from "../types";

const parseSpanishDate = (dateStr: string | undefined): string | undefined => {
  if (!dateStr) return undefined;
  
  let cleanStr = dateStr.toLowerCase().trim().replace(/fecha[:.]?\s*/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr;

  const monthMap: { [key: string]: string } = {
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
    'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  try {
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

const compressImageBase64 = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const MAX = 1024;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const analyzeTicketImage = async (
  base64Image: string, 
  storeName: string = 'Sucursal', 
  chainName: string = 'Coppel',
  category: string = 'kit'
): Promise<TicketAnalysisResult | null> => {
  try {
    const optimizedBase64 = await compressImageBase64(base64Image);
    const base64Data = optimizedBase64.split(',')[1] || optimizedBase64;
    
    const now = new Date();
    const currentDateContext = `Hoy es ${now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}.`;
    const categoryContext = category === 'chip_0' 
      ? 'ESTA ES UNA VENTA DE CHIP 0 (EQUIPO LIBRE). Extrae el precio real del EQUIPO/TELÉFONO principal.' 
      : 'ESTA ES UNA VENTA DE EQUIPO KIT. Incluye solo equipos móviles de marcas reconocidas.';

    const prompt = `Analiza este ticket de compra de la tienda ${chainName} (${storeName}). ${currentDateContext} ${categoryContext}
    
    REGLAS ESTRICTAS DE FILTRADO Y ENFOQUE:
    1. ENFOQUE EXCLUSIVO EN EQUIPOS MÓVILES (TELÉFONOS): Solo extrae teléfonos celulares/smartphones de marcas reconocidas (SAMSUNG, APPLE, OPPO, ZTE, MOTOROLA, REALME, VIVO, XIAOMI, HONOR, HUAWEI, etc.).
    2. IGNORAR ACCESORIOS: Ignora seguros, micas, fundas, cargadores, servicios, etc.

    Extrae los siguientes datos en formato JSON estricto:
    1. invoiceNumber: Folio o factura (sin espacios).
    2. date: Fecha de transacción.
    3. customerName: Nombre del cliente en MAYÚSCULAS.
    4. items: Lista de equipos vendidos (brand y price).
    
    RESPONDE ÚNICAMENTE CON EL JSON VÁLIDO.`;

    let text = null;

    try {
      const res = await fetch('/api/gemini-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, prompt })
      });
      if (res.ok) {
        const dataJson = await res.json();
        text = dataJson.text;
      }
    } catch (e) {
      // Server not available (e.g. running on static GitHub Pages)
    }

    // Fallback: If running on static GitHub Pages without server.ts
    if (!text) {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
      if (apiKey) {
        try {
          const directRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: base64Data } }] }]
            })
          });
          if (directRes.ok) {
            const directJson = await directRes.json();
            text = directJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          }
        } catch (e) {}
      }
    }

    // Second Fallback: OCR.space API (works 100% on static GitHub Pages)
    if (!text) {
      try {
        const formData = new URLSearchParams();
        formData.append('apikey', 'K88513112888957');
        formData.append('base64Image', optimizedBase64);
        formData.append('language', 'spa');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2');

        const ocrRes = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          body: formData
        });
        if (ocrRes.ok) {
          const ocrData = await ocrRes.json();
          const parsed = ocrData.ParsedResults?.[0]?.ParsedText || '';
          if (parsed) {
            let invoiceNumber = '';
            const folioMatch = parsed.match(/(?:folio|factura|ticket|nota|vta)[\s#:.]*([0-9a-zA-Z]{4,12})/i);
            if (folioMatch) {
              invoiceNumber = folioMatch[1].replace(/\D/g, '');
            } else {
              const sixDigits = parsed.match(/\b\d{6}\b/);
              if (sixDigits) invoiceNumber = sixDigits[0];
            }

            let dateStr = undefined;
            const dateMatch = parsed.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
            if (dateMatch) {
              const d = dateMatch[1].padStart(2, '0');
              const m = dateMatch[2].padStart(2, '0');
              let y = dateMatch[3];
              if (y.length === 2) y = `20${y}`;
              dateStr = `${y}-${m}-${d}`;
            }

            let customerName = '';
            const clienteMatch = parsed.match(/(?:cliente|nombre|cli)[\s:.]*([A-ZÁÉÍÓÚÑ\s]{3,30})/i);
            if (clienteMatch) customerName = clienteMatch[1].trim().toUpperCase();

            const items: { brand: Brand; price: number }[] = [];
            for (const line of parsed.split('\n')) {
              const upperLine = line.toUpperCase();
              let foundBrand: Brand | null = null;
              for (const bKey of Object.values(Brand)) {
                if (upperLine.includes(bKey)) {
                  foundBrand = bKey;
                  break;
                }
              }
              if (foundBrand) {
                const priceMatch = line.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
                const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) || 0 : 0;
                items.push({ brand: foundBrand, price });
              }
            }

            return {
              invoiceNumber: invoiceNumber.slice(-6),
              price: 0,
              date: dateStr,
              customerName: customerName || 'CLIENTE',
              items: items.length > 0 ? items : [{ brand: Brand.OTRO, price: 0 }]
            };
          }
        }
      } catch (e) {}
    }

    if (text) {
      console.log("🤖 [Gemini OCR] Model Response:\n", text);
      let jsonStr = text;
      const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch) {
        jsonStr = jsonBlockMatch[1];
      } else {
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }
      }

      const data = JSON.parse(jsonStr);
      const cleanDate = parseSpanishDate(data.date);
      let cleanName = (data.customerName || '').trim().replace(/^(nombre|cliente|nom|cli)\s*[:.]?\s*/i, '');
      let cleanInvoice = (data.invoiceNumber || '').replace(/\s/g, '');

      return {
        invoiceNumber: cleanInvoice,
        price: 0,
        date: cleanDate,
        customerName: cleanName.toUpperCase(),
        items: data.items?.map((item: any) => {
          const brandText = item.brand?.toUpperCase() || '';
          let b = Brand.OTRO;
          for (const brandKey of Object.values(Brand)) {
            if (brandText.includes(brandKey)) {
              b = brandKey;
              break;
            }
          }
          return { brand: b, price: Number(item.price) || 0 };
        }) || []
      };
    }
    return null;
  } catch (err) {
    console.warn("Gemini Server Proxy OCR error:", err);
    return null;
  }
};
