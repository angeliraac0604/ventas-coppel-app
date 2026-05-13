/**
 * GOOGLE APPS SCRIPT - SISTEMA DE VENTAS Y ASISTENCIA
 * 
 * Este script maneja:
 * 1. Carga de imágenes con organización jerárquica (Ventas y Asistencias)
 * 2. Eliminación de archivos en Drive
 * 3. Envío de correos de invitación
 * 4. Sincronización de participación de mercado con Google Sheets
 */

// ID de la carpeta principal de Google Drive
const ROOT_FOLDER_ID = "1o-dLhRr7x3IjyoodRFdsVxkd_h5fyQtY";

/**
 * Punto de entrada principal para peticiones POST
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let result;
    switch (action) {
      case 'upload':
        result = handleUpload(data);
        break;
      case 'delete':
        result = handleDelete(data);
        break;
      case 'sendInvite':
        result = handleSendInvite(data);
        break;
      case 'syncMarketParticipation':
        result = handleSyncMarketParticipation(data);
        break;
      default:
        throw new Error("Acción no válida: " + action);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * MANEJADOR: Carga de archivos y organización de carpetas
 */
function handleUpload(data) {
  const folderType = data.folderType; // 'sales', 'attendance', 'warranties', 'portability'
  const storeName = (data.storeName || 'Sucursal Desconocida').trim();
  const userName = (data.userName || 'Usuario').trim();
  const dateStr = data.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = data.filename;
  const fileContent = data.file;
  const mimeType = data.mimeType || 'image/jpeg';
  const subFolder = (data.subFolder || "").trim();

  const [year, month, day] = dateStr.split('-');
  const monthName = getSpanishMonth(parseInt(month) - 1);

  // 1. Obtener Carpeta Raíz Principal (AppCadenasComerciales)
  let mainRoot;
  try {
    mainRoot = DriveApp.getFolderById(ROOT_FOLDER_ID);
  } catch (e) {
    mainRoot = getOrCreateFolder(DriveApp.getRootFolder(), "AppCadenasComerciales");
  }

  let targetFolder;

  // LÓGICA SEGÚN EL TIPO DE CARGA
  if (folderType === 'attendance' || subFolder === 'Check Asistencia') {
    // --- RUTA 2: Registro de Check ---
    // Estructura: Registro de Check > [Tienda] > Año > Mes > Día > [Usuario]
    const checkRoot = getOrCreateFolder(mainRoot, "Registro de Check");
    const storeFolder = getOrCreateFolder(checkRoot, storeName);
    const yearFolder = getOrCreateFolder(storeFolder, year);
    const monthFolder = getOrCreateFolder(yearFolder, monthName);
    const dayFolder = getOrCreateFolder(monthFolder, day);
    targetFolder = getOrCreateFolder(dayFolder, userName);
    
  } else {
    // --- RUTA 1: Ventas de Cadenas ---
    // Estructura: Ventas de Cadenas > [Tienda] > Año > Mes > Día > [Categoría]
    const salesRoot = getOrCreateFolder(mainRoot, "Ventas de Cadenas");
    const storeFolder = getOrCreateFolder(salesRoot, storeName);
    const yearFolder = getOrCreateFolder(storeFolder, year);
    const monthFolder = getOrCreateFolder(yearFolder, monthName);
    const dayFolder = getOrCreateFolder(monthFolder, day);
    
    // Determinar nombre de la categoría (Ajustado a Kit, Chip 0, Portabilidad)
    let categoryName = subFolder;
    if (!categoryName || categoryName === 'Check Asistencia') {
      if (folderType === 'sales') categoryName = "Kit";
      else if (folderType === 'portability') categoryName = "Portabilidad";
      else if (folderType === 'warranties') categoryName = "Garantias";
      else categoryName = "Otros";
    }
    // Mapeo a nombres específicos solicitados
    if (categoryName === 'Equipo Kit' || categoryName === 'Ventas Kit') categoryName = "Kit";
    if (categoryName === 'Chip Cero') categoryName = "Chip 0";

    targetFolder = getOrCreateFolder(dayFolder, categoryName);
  }

  // 3. Crear el archivo en la carpeta destino final
  const decodedFile = Utilities.base64Decode(fileContent);
  const blob = Utilities.newBlob(decodedFile, mimeType, filename);
  const file = targetFolder.createFile(blob);

  return {
    status: 'success',
    fileUrl: file.getUrl(),
    fileId: file.getId(),
    path: targetFolder.getName()
  };
}

/**
 * MANEJADOR: Eliminación de archivos
 */
function handleDelete(data) {
  const fileId = data.id;
  try {
    const file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: "No se pudo eliminar el archivo: " + e.toString() };
  }
}

/**
 * MANEJADOR: Envío de correos de invitación
 */
function handleSendInvite(data) {
  const { email, role, storeName, link } = data;

  const subject = "🚀 Invitación a la App de Ventas - " + storeName;

  // Cuerpo en HTML "Premium"
  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; background-color: #ffffff; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #2563eb; margin: 0; font-size: 24px;">¡Bienvenido al Equipo!</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 8px;">Has sido invitado a gestionar ventas en la nube.</p>
      </div>
      
      <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #f1f5f9;">
        <p style="margin: 0 0 12px 0;"><strong>Sucursal:</strong> <span style="color: #2563eb;">${storeName}</span></p>
        <p style="margin: 0;"><strong>Rol Asignado:</strong> <span style="color: #2563eb;">${role}</span></p>
      </div>
      
      <p style="line-height: 1.6;">Para comenzar a registrar tus ventas y asistencias, es necesario que completes tu perfil haciendo clic en el botón de abajo:</p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${link}" style="display: inline-block; background-color: #2563eb; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Completar Mi Registro</a>
      </div>

      <div style="border-top: 2px solid #f1f5f9; margin-top: 32px; padding-top: 24px;">
        <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 16px;">📲 Cómo instalar en tu celular:</h3>
        <p style="font-size: 14px; color: #475569; margin-bottom: 12px;">Nuestra app es una <strong>PWA</strong>, lo que significa que puedes instalarla sin usar la App Store o Play Store:</p>
        
        <div style="display: flex; gap: 16px; margin-bottom: 20px;">
          <div style="flex: 1; background-color: #fff7ed; padding: 12px; border-radius: 8px; border-left: 4px solid #f97316;">
            <p style="margin: 0; font-weight: bold; font-size: 13px; color: #9a3412;">Android (Chrome)</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #7c2d12;">Toca los 3 puntos (⋮) y selecciona <strong>"Instalar aplicación"</strong> o "Añadir a pantalla de inicio".</p>
          </div>
        </div>

        <div style="display: flex; gap: 16px;">
          <div style="flex: 1; background-color: #f0f9ff; padding: 12px; border-radius: 8px; border-left: 4px solid #0ea5e9;">
            <p style="margin: 0; font-weight: bold; font-size: 13px; color: #075985;">iPhone (Safari)</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #0c4a6e;">Toca el icono de <strong>"Compartir"</strong> (cuadrado con flecha) y selecciona <strong>"Añadir a pantalla de inicio"</strong>.</p>
          </div>
        </div>
      </div>
      
      <p style="font-size: 12px; color: #94a3b8; line-height: 1.4; border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 32px;">
        Este enlace es personal y único para tu cuenta. Si no esperabas este correo, por favor contáctanos o ignora este mensaje.
      </p>
    </div>
  `;

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });

  return { status: 'success' };
}

/**
 * MANEJADOR: Sincronización de Participación de Mercado (Google Sheets)
 * Sistema basado en PLANTILLA para mantener el diseño exacto del usuario.
 */
function handleSyncMarketParticipation(data) {
  const { sheetId, closings } = data;

  try {
    const ss = SpreadsheetApp.openById(sheetId);
    
    // 1. Agrupar los cierres por nombre de hoja (Mes Año) para no repetir trabajo
    const closingsBySheet = {};
    closings.forEach(close => {
      const [year, month, day] = close.date.split('-').map(Number);
      const monthName = getSpanishMonth(month - 1).toUpperCase();
      const sheetName = monthName + " " + year;
      if (!closingsBySheet[sheetName]) closingsBySheet[sheetName] = { 
        year, month, daysInMonth: new Date(year, month, 0).getDate(), data: [] 
      };
      closingsBySheet[sheetName].data.push(close);
    });

    // 2. Procesar cada hoja una sola vez
    Object.keys(closingsBySheet).forEach(sheetName => {
      const group = closingsBySheet[sheetName];
      let sheet = ss.getSheetByName(sheetName);

      // Si la hoja no existe, COPIAMOS LA PLANTILLA
      if (!sheet) {
        const template = ss.getSheetByName("PLANTILLA");
        if (template) {
          sheet = template.copyTo(ss).setName(sheetName);
        } else {
          sheet = ss.insertSheet(sheetName);
          sheet.appendRow(["DÍA", "TELCEL", "MOVISTAR", "ATT", "TOTAL"]);
        }
      }

      // --- TRABAJO PESADO: Solo una vez por hoja ---
      // Llenar días y limpiar formato
      for (let d = 1; d <= group.daysInMonth; d++) {
        const row = d + 2;
        const dateObj = new Date(group.year, group.month - 1, d);
        const formattedDate = Utilities.formatDate(dateObj, "GMT", "dd/MMM/yy").toLowerCase();
        sheet.getRange(row, 1).setValue(formattedDate);
      }

      // Ajustar fila de TOTALES (solo si es necesario)
      const targetTotalsRow = group.daysInMonth + 3;
      let currentTotalsRow = -1;
      const colBValues = sheet.getRange("B1:B40").getValues();
      for (let i = 0; i < colBValues.length; i++) {
        if (colBValues[i][0].toString().includes("TOTALES")) {
          currentTotalsRow = i + 1;
          break;
        }
      }

      if (currentTotalsRow !== -1 && currentTotalsRow > targetTotalsRow) {
        sheet.deleteRows(targetTotalsRow, currentTotalsRow - targetTotalsRow);
      } else if (currentTotalsRow === -1) {
        sheet.getRange(targetTotalsRow, 1, 1, 11).setBackground("#002060").setFontColor("white").setFontWeight("bold");
        sheet.getRange(targetTotalsRow, 2).setValue("TOTALES");
      }

      // --- LLENADO DE DATOS DEL GRUPO ---
      group.data.forEach(close => {
        const [,, day] = close.date.split('-').map(Number);
        const targetRow = day + 2;
        const telcel = parseFloat(close.telcel) || 0;
        const att = parseFloat(close.att) || 0;

        sheet.getRange(targetRow, 2).setValue("COPPEL");
        sheet.getRange(targetRow, 3).setValue("1053");
        sheet.getRange(targetRow, 4).setValue(telcel);
        sheet.getRange(targetRow, 5).setValue(0);
        sheet.getRange(targetRow, 6).setValue(att);
        sheet.getRange(targetRow, 7).setFormula(`=SUM(D${targetRow}:F${targetRow})`);
      });

      // Actualizar fórmulas finales
      const lastDataRow = group.daysInMonth + 2;
      sheet.getRange(targetTotalsRow, 4).setFormula(`=SUM(D3:D${lastDataRow})`);
      sheet.getRange(targetTotalsRow, 5).setFormula(`=SUM(E3:E${lastDataRow})`);
      sheet.getRange(targetTotalsRow, 6).setFormula(`=SUM(F3:F${lastDataRow})`);
      sheet.getRange(targetTotalsRow, 7).setFormula(`=SUM(G3:G${lastDataRow})`);
    });

    return { status: 'success' };
  } catch (e) {
    console.error("Error en sincronización:", e);
    return { status: 'error', message: "Error en sincronización de Sheets: " + e.toString() };
  }
}

/**
 * UTIL: Obtener carpeta o crearla si no existe
 */
function getOrCreateFolder(parent, name) {
  const cleanName = name.trim();
  const folders = parent.getFoldersByName(cleanName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(cleanName);
  }
}

/**
 * UTIL: Nombres de meses en español
 */
function getSpanishMonth(monthIndex) {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return months[monthIndex];
}
