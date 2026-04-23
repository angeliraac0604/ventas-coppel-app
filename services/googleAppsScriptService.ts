
export const uploadImageToDriveScript = async (
    base64Image: string, 
    filename: string, 
    date?: string, 
    folderType: 'sales' | 'warranties' | 'attendance' = 'sales',
    userName: string = 'Usuario'
): Promise<string> => {
    const scriptUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL;

    if (!scriptUrl) {
        throw new Error("Falta configurar la URL del Google Script en el archivo .env (VITE_GOOGLE_SCRIPT_URL)");
    }

    // Ensure base64 string doesn't have the header "data:image/jpeg;base64,"
    const cleanBase64 = base64Image.includes('base64,')
        ? base64Image.split('base64,')[1]
        : base64Image;

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: JSON.stringify({
                action: 'upload',
                filename: filename,
                file: cleanBase64,
                mimeType: 'image/jpeg',
                date: date,
                folderType: folderType,
                userName: userName,
                storeName: (window as any)._activeStoreName || 'Sucursal Desconocida',
                monthName: (window as any)._customMonthName // New hint
            }),
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            }
        });

        const data = await response.json();

        if (data.status === 'success') {
            return data.fileUrl;
        } else {
            throw new Error(data.message || "Error desconocido al subir al script");
        }

    } catch (error) {
        console.error("Error en uploadImageToDriveScript:", error);
        throw error;
    }
};

export const deleteImageFromDriveScript = async (fileUrl: string): Promise<void> => {
    const scriptUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
    if (!scriptUrl) return;

    // Extract ID from URL
    // URL formats:
    // 1. https://drive.google.com/uc?export=view&id=FILE_ID
    // 2. https://drive.google.com/file/d/FILE_ID/view...
    let fileId = '';
    if (fileUrl.includes('id=')) {
        fileId = fileUrl.split('id=')[1].split('&')[0];
    } else if (fileUrl.includes('/d/')) {
        fileId = fileUrl.split('/d/')[1].split('/')[0];
    }

    if (!fileId) {
        console.warn("Could not extract file ID from URL:", fileUrl);
        return;
    }

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: JSON.stringify({
                action: 'delete',
                id: fileId
            }),
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            }
        });

        const data = await response.json();
        if (data.status !== 'success') {
            console.error("Error deleting file from Drive:", data.message);
        }
    } catch (error) {
        console.error("Error in deleteImageFromDriveScript:", error);
        // We generally don't block the UI if delete fails, just log it
    }
};
