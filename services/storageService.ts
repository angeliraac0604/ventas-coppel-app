import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// 1. Client-side Image Compression (Reduces 5MB photo to ~150KB for instant uploads)
export const compressImage = async (base64Str: string, maxWidth = 1000, quality = 0.75): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const uploadToFirebaseStorage = async (base64Image: string, path: string): Promise<string> => {
  try {
    const compressedBase64 = await compressImage(base64Image);
    const response = await fetch(compressedBase64);
    const blob = await response.blob();

    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public,max-age=3600'
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.error("Error uploading to Firebase Storage:", error);
    // Fallback to base64 if storage fails
    return base64Image;
  }
};

export const smartImageUpload = async (
  base64Image: string, 
  filename: string, 
  date: string, 
  storeName: string, 
  folderType: 'sales' | 'warranties' | 'attendance' | 'portability' = 'sales',
  userName: string = 'Usuario',
  chainName: string = 'Coppel',
  subFolder: string = ''
): Promise<string> => {
  // 1. COMPRESS AND UPLOAD TO FIREBASE STORAGE (Instant & Free)
  const dateObj = date ? new Date(date + "T12:00:00") : new Date();
  const y = dateObj.getFullYear().toString();
  const m = getSpanishMonth(dateObj.getMonth());
  const d = dateObj.getDate().toString();
  
  const cleanName = userName.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/ /g, '_');
  const cleanFilename = filename.replace(/[^a-zA-Z0-9]/g, '_');

  const storagePath = folderType === 'attendance'
    ? `attendance/${cleanName}/${y}/${m}/${d}/${Date.now()}-${cleanFilename}.jpg`
    : `${folderType}/${storeName}/${y}/${m}/${d}/${Date.now()}-${cleanFilename}.jpg`;
  
  const firebaseUrl = await uploadToFirebaseStorage(base64Image, storagePath);
  
  // 2. BACKGROUND SYNC TO GOOGLE DRIVE (Non-blocking)
  setTimeout(async () => {
    try {
      const { uploadImageToDriveScript } = await import('./googleAppsScriptService');
      const compressedForDrive = await compressImage(base64Image, 1000, 0.75);
      
      (window as any)._activeStoreName = storeName;
      (window as any)._activeStoreChain = chainName;
      (window as any)._customMonthName = m;
      
      const driveUrl = await uploadImageToDriveScript(compressedForDrive, filename, date, folderType as any, userName, chainName, subFolder);
      
      if (driveUrl) {
        console.log(`✅ [Background] Photo synced to Google Drive: ${driveUrl}`);
      }
    } catch (err) {
      console.error(`❌ [Background] Drive sync failed:`, err);
    }
  }, 2000);

  return firebaseUrl;
};

export const deleteFromSupabaseStorage = async (path: string): Promise<void> => {
  // No-op since Supabase storage is no longer used
};
function getSpanishMonth(monthIndex: number) {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return months[monthIndex];
}
