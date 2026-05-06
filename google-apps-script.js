/**
 * GOOGLE APPS SCRIPT - SISTEMA DE VENTAS Y ASISTENCIA
 * 
 * Este script maneja:
 * 1. Carga de imágenes con organización jerárquica (Ventas y Asistencias)
 * 2. Eliminación de archivos en Drive
 * 3. Envío de correos de invitación
 * 4. Sincronización de participación de mercado con Google Sheets
 */

const ROOT_FOLDER_NAME = "App cadenas comerciales";

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
  const folderType = data.folderType; // 'sales', 'attendance', 'warranties'
  const storeName = data.storeName || 'Sucursal';
  const chainName = data.chainName || 'Coppel';
  const userName = data.userName || 'Usuario';
  const dateStr = data.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = data.filename;
  const fileContent = data.file;
  const mimeType = data.mimeType || 'image/jpeg';

  const [year, month, day] = dateStr.split('-');
  const monthName = getSpanishMonth(parseInt(month) - 1);

  // 1. Obtener/Crear Carpeta Raíz
  const rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  let targetFolder;

  if (folderType === 'attendance') {
    // ESTRUCTURA SOLICITADA PARA CHECKS:
    // Raíz: App cadenas comerciales
    // 1. Registro de check
    // (a) Cadena comercial
    // (b) Año / Mes / Día
    // (c) Nombre de la persona
    const checkRoot = getOrCreateFolder(rootFolder, "Registro de check");
    const chainFolder = getOrCreateFolder(checkRoot, chainName);
    const yearFolder = getOrCreateFolder(chainFolder, year);
    const monthFolder = getOrCreateFolder(yearFolder, monthName);
    const dayFolder = getOrCreateFolder(monthFolder, day);
    targetFolder = getOrCreateFolder(dayFolder, userName);

  } else if (folderType === 'sales') {
    // ESTRUCTURA SOLICITADA PARA VENTAS:
    // Raíz: App cadenas comerciales
    // 2. Ventas de cadenas
    // (a) Por tiendas
    // (b) Por año
    // (c) Por mes (nombre)
    // (d) Por día
    const salesRoot = getOrCreateFolder(rootFolder, "Ventas de cadenas");
    const storeFolder = getOrCreateFolder(salesRoot, storeName);
    const yearFolder = getOrCreateFolder(storeFolder, year);
    const monthFolder = getOrCreateFolder(yearFolder, monthName);
    targetFolder = getOrCreateFolder(monthFolder, day);

  } else if (folderType === 'warranties') {
    // Estructura para Garantías (Extra)
    const warrantiesRoot = getOrCreateFolder(rootFolder, "Garantías");
    const storeFolder = getOrCreateFolder(warrantiesRoot, storeName);
    const yearFolder = getOrCreateFolder(storeFolder, year);
    targetFolder = getOrCreateFolder(yearFolder, monthName);

  } else {
    // Otros
    const otherRoot = getOrCreateFolder(rootFolder, "Otros");
    targetFolder = getOrCreateFolder(otherRoot, storeName);
  }

  // 2. Crear el archivo
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

    closings.forEach(close => {
      const [year, month, day] = close.date.split('-').map(Number);
      const monthName = getSpanishMonth(month - 1).toUpperCase();
      const sheetName = monthName + " " + year;

      let sheet = ss.getSheetByName(sheetName);

      // 1. Si la hoja no existe, COPIAMOS LA PLANTILLA
      if (!sheet) {
        const template = ss.getSheetByName("PLANTILLA");
        if (template) {
          sheet = template.copyTo(ss).setName(sheetName);

          // --- DINAMISMO DE FECHAS ---
          const daysInMonth = new Date(year, month, 0).getDate();

          for (let d = 1; d <= 31; d++) {
            const row = d + 2; // Los datos empiezan en la fila 3
            if (d <= daysInMonth) {
              // Actualizar fecha en Columna A
              const dateObj = new Date(year, month - 1, d);
              const formattedDate = Utilities.formatDate(dateObj, "GMT", "dd/MMM/yy").toLowerCase();
              sheet.getRange(row, 1).setValue(formattedDate);

              // Limpiar celdas de ventas para el nuevo mes (D, E, F)
              sheet.getRange(row, 4, 1, 3).clearContent();
            } else {
              // Si el mes tiene menos de 31 días, limpiamos las filas sobrantes
              sheet.getRange(row, 1, 1, 11).clearContent().setBorder(false, false, false, false, false, false);
            }
          }
          // Aseguramos que la fila de TOTALES (Fila 34 usualmente) se mantenga con sus fórmulas
        } else {
          // Si no hay plantilla, creamos una básica de emergencia
          sheet = ss.insertSheet(sheetName);
          sheet.appendRow(["DÍA", "TELCEL", "MOVISTAR", "ATT", "TOTAL"]);
        }
      }

      // 2. Llenado de datos (Día 1 = Fila 3)
      const targetRow = day + 2;
      const telcel = parseFloat(close.telcel) || 0;
      const att = parseFloat(close.att) || 0;

      // Columna B: CADENA, C: TIENDA, D: Telcel, E: Movistar (0), F: ATT
      sheet.getRange(targetRow, 2).setValue("COPPEL");
      sheet.getRange(targetRow, 3).setValue("1053");
      sheet.getRange(targetRow, 4).setValue(telcel);
      sheet.getRange(targetRow, 5).setValue(0);
      sheet.getRange(targetRow, 6).setValue(att);

      // La columna G (Total) debería tener su fórmula traída de la plantilla
      // pero la reforzamos por si acaso
      if (sheet.getRange(targetRow, 7).getFormula() === "") {
        sheet.getRange(targetRow, 7).setFormula(`=SUM(D${targetRow}:F${targetRow})`);
      }
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
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(name);
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
