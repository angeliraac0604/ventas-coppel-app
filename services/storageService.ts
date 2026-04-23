import { supabase } from './supabaseClient';

export const uploadToSupabaseStorage = async (base64Image: string, path: string): Promise<string> => {
  try {
    // Convert base64 to Blob
    const response = await fetch(base64Image);
    const blob = await response.blob();

    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(path, blob, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    // Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error("Error uploading to Supabase Storage:", error);
    throw error;
  }
};

export const deleteFromSupabaseStorage = async (path: string): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from('receipts')
      .remove([path]);
    if (error) throw error;
  } catch (err) {
    console.error("Error deleting from Supabase Storage:", err);
  }
};

export const smartImageUpload = async (
  base64Image: string, 
  filename: string, 
  date: string, 
  storeName: string, 
  folderType: 'sales' | 'warranties' | 'attendance' = 'sales',
  userName: string = 'Usuario'
): Promise<string> => {
  // 1. UPLOAD TO SUPABASE (Immediate & Reliable)
  const dateObj = date ? new Date(date + "T12:00:00") : new Date();
  const y = dateObj.getFullYear().toString();
  const m = getSpanishMonth(dateObj.getMonth());
  const d = dateObj.getDate().toString();
  
  let supabasePath = '';
  const cleanName = userName.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/ /g, '_');
  const cleanFilename = filename.replace(/[^a-zA-Z0-9]/g, '_');

  if (folderType === 'attendance') {
    // Structure: attendance / UserName / YYYY / Mes / DD / filename
    supabasePath = `attendance/${cleanName}/${y}/${m}/${d}/${Date.now()}-${cleanFilename}.jpg`;
  } else {
    // Structure Sales: sales / Store / YYYY / Mes / DD / filename
    supabasePath = `${folderType}/${storeName}/${y}/${m}/${d}/${Date.now()}-${cleanFilename}.jpg`;
  }
  
  const supabaseUrl = await uploadToSupabaseStorage(base64Image, supabasePath);

  // 2. BACKGROUND SYNC TO GOOGLE DRIVE (Async, non-blocking)
  import('./googleAppsScriptService').then(({ uploadImageToDriveScript }) => {
    (window as any)._activeStoreName = storeName;
    (window as any)._customMonthName = m; // Pass month name as hint
    
    uploadImageToDriveScript(base64Image, filename, date, folderType as any, userName)
      .then(driveUrl => {
        console.log(`✅ [Background Sync] Successfully moved photo to Drive: ${driveUrl}`);
      })
      .catch(err => {
        console.error(`❌ [Background Sync] Failed to sync ${filename} to Drive:`, err);
      });
  });

  return supabaseUrl;
};

// Helper for Spanish Month
function getSpanishMonth(monthIndex: number) {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return months[monthIndex];
}
