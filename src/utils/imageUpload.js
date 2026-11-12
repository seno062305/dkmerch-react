/** Shared image pick rules — still photos only (no GIF). */

const GIF_TYPE = 'image/gif';
const GIF_EXT = /\.gif$/i;

export function isGifFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '');
  return type === GIF_TYPE || GIF_EXT.test(name);
}

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateImageFile(file, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (!file) return { ok: false, error: 'Please choose an image file.' };
  if (!String(file.type || '').startsWith('image/')) {
    return { ok: false, error: 'Please upload an image file (JPG or PNG).' };
  }
  if (isGifFile(file)) {
    return { ok: false, error: 'GIF images are not allowed. Please upload JPG or PNG.' };
  }
  if (maxBytes && file.size > maxBytes) {
    return { ok: false, error: `Image must be under ${Math.round(maxBytes / (1024 * 1024))}MB.` };
  }
  return { ok: true };
}

/** HTML accept attribute — excludes GIF */
export const IMAGE_ACCEPT_NO_GIF = 'image/jpeg,image/jpg,image/png,image/webp';
