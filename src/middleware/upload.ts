import multer from 'multer';

const ALLOWED_MIMETYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  // Videos
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
  // Documents
  'application/pdf',
]);

// Files are held in memory; the media module streams them to Cloudinary.
// Limit is set high enough for video uploads; per-type limits are enforced in media.service.ts.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB ceiling
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});
