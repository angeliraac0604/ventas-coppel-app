import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// 1. Client-side Image Compression (Reduces 5MB photo to ~50-90KB for fast Firestore sync)
export const compressImage = async (base64Str: string, maxWidth = 720, quality = 0.58): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const renderAt = (wLimit: number, q: number): string => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > wLimit) {
          height = Math.round((height * wLimit) / width);
          width = wLimit;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return base64Str;

        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', q);
      };

      let result = renderAt(maxWidth, quality);
      // Ensure base64 payload stays comfortably below Firestore's 1 MiB document limit
      if (result.length > 260000) {
        result = renderAt(Math.min(maxWidth, 640), 0.45);
      }
      if (result.length > 360000) {
        result = renderAt(520, 0.38);
      }
      resolve(result);
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
  // Compress immediately so saving is instantaneous and compact
  const compressed = await compressImage(base64Image, 720, 0.58);

  // Background upload to Google Drive if configured (non-blocking)
  setTimeout(async () => {
    try {
      if (import.meta.env.VITE_GOOGLE_SCRIPT_URL) {
        const { uploadImageToDriveScript } = await import('./googleAppsScriptService');
        const dateObj = date ? new Date(date + "T12:00:00") : new Date();
        const m = getSpanishMonth(dateObj.getMonth());
        
        (window as any)._activeStoreName = storeName;
        (window as any)._activeStoreChain = chainName;
        (window as any)._customMonthName = m;
        
        await uploadImageToDriveScript(compressed, filename, date, folderType as any, userName, chainName, subFolder);
      }
    } catch (err) {
      console.warn(`Background Drive sync note:`, err);
    }
  }, 100);

  return compressed;
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
