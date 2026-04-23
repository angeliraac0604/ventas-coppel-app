import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Sube un archivo al bucket 'receipts' y retorna la URL pública.
 * @param file Objeto File a subir
 * @param path Ruta/Nombre del archivo
 */
export const uploadTicketImage = async (file: File): Promise<string | null> => {
  try {
    // Crear un nombre único para el archivo: timestamp-nombre
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('receipts')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Error en uploadTicketImage:', error);
    return null;
  }
};