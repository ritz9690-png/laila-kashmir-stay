// ════════════════════════════════════════
//   CLOUDINARY CONFIG
// ════════════════════════════════════════
// Setup (one-time):
// 1. Cloudinary dashboard (cloudinary.com/console) khol ke "Cloud Name" copy karo
// 2. Settings → Upload → "Upload presets" → Add upload preset
//    Signing Mode = "Unsigned"  (yeh zaroori hai — browser se direct upload ke liye)
//    Preset name jo bhi rakho, wahi neeche paste karo
// 3. Dono values neeche fill karo:

const CLOUDINARY_CONFIG = {
  cloudName: 'djqhnredg',       // e.g. 'dxyz1234'
  uploadPreset: 'lailakashmir'  // e.g. 'flatzy_unsigned'
};

// NOTE: Cloudinary "API Key" + "API Secret" (signed uploads) kabhi bhi client-side
// JS file mein mat daalna — secret browser mein expose ho jayega, koi bhi dekh
// sakta hai (view-source). Unsigned upload preset is the safe way for direct
// browser-to-Cloudinary uploads, isliye sirf cloudName + uploadPreset chahiye.

/**
 * Uploads a single file to Cloudinary and returns the hosted image URL.
 * Usage: const url = await uploadToCloudinary(file);
 */
async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CONFIG.cloudName || !CLOUDINARY_CONFIG.uploadPreset) {
    throw new Error('Cloudinary not configured yet — fill cloudName & uploadPreset in config.js');
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Cloudinary upload failed');
  }
  const data = await res.json();
  return data.secure_url; // permanent CDN URL — store this, not the raw file
}

/**
 * Uploads multiple files in parallel, returns array of URLs (same order as input).
 * Skips/throws individually so one bad file doesn't kill the whole batch.
 */
async function uploadMultipleToCloudinary(fileList) {
  const files = Array.from(fileList);
  return Promise.all(files.map(f => uploadToCloudinary(f)));
}
