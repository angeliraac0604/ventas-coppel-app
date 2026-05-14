/**
 * Utility functions for handling images, especially Google Drive URLs
 */

/**
 * Transforms a Google Drive URL into a direct link that can be used in <img> tags.
 * Also handles other common image URL types.
 */
export const transformImageUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  
  // If it's already a Supabase URL or a blob, return as is
  if (url.includes('supabase.co') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  // Google Drive URL transformations
  if (url.includes('drive.google.com')) {
    let fileId = '';
    
    // Format 1: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    if (url.includes('/d/')) {
      fileId = url.split('/d/')[1].split('/')[0];
    } 
    // Format 2: https://drive.google.com/open?id=FILE_ID or https://drive.google.com/uc?id=FILE_ID
    else if (url.includes('id=')) {
      fileId = url.split('id=')[1].split('&')[0];
    }

    if (fileId) {
      // Use the direct download/view endpoint
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
  }

  return url;
};

/**
 * Fallback image URL when an image fails to load
 */
export const IMAGE_FALLBACK = 'https://www.google.com/s2/favicons?sz=64&domain=google.com'; // Example small placeholder
