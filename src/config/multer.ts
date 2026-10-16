import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure local uploads directory for secure RTW documents storage
const uploadDir = path.join(__dirname, '../../uploads/rtw-documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure local uploads directory for corporate client logos
const logoUploadDir = path.join(__dirname, '../../uploads/client-logos');
if (!fs.existsSync(logoUploadDir)) {
  fs.mkdirSync(logoUploadDir, { recursive: true });
}

// Configure local uploads directory for guard profile photos
const guardPhotoUploadDir = path.join(__dirname, '../../uploads/guard-photos');
if (!fs.existsSync(guardPhotoUploadDir)) {
  fs.mkdirSync(guardPhotoUploadDir, { recursive: true });
}

// Configure local uploads directory for shift check-in and check-out photos
const checkInPhotoUploadDir = path.join(__dirname, '../../uploads/check-in-photos');
if (!fs.existsSync(checkInPhotoUploadDir)) {
  fs.mkdirSync(checkInPhotoUploadDir, { recursive: true });
}

/**
 * Resolves file extension safely, falling back to mimetype mapping if extension is absent
 */
export function resolveExtension(filename: string, mimetype: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext) {
    return ext;
  }
  // Mimetype fallbacks if extension is missing
  switch (mimetype) {
    case 'application/pdf':
      return '.pdf';
    case 'application/msword':
      return '.doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx';
    case 'application/rtf':
    case 'text/rtf':
      return '.rtf';
    case 'application/vnd.oasis.opendocument.text':
      return '.odt';
    case 'text/plain':
      return '.txt';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/svg+xml':
      return '.svg';
    case 'image/bmp':
      return '.bmp';
    case 'image/tiff':
      return '.tiff';
    case 'image/avif':
      return '.avif';
    case 'image/heic':
      return '.heic';
    case 'image/heif':
      return '.heif';
    default:
      if (mimetype.startsWith('image/')) return '.jpg';
      return '';
  }
}

/**
 * Validates whether a file is a valid image (JPG, PNG, WEBP, GIF, SVG, BMP, TIFF, AVIF, HEIC, etc.)
 */
export function isValidImage(filename: string, mimetype: string): boolean {
  if (/\.(exe|sh|bat|cmd|bin|apk|jar|py|js|ts|php|pl|cgi|msi)$/i.test(filename)) {
    return false;
  }
  const isImageMime = mimetype.startsWith('image/');
  const isImageExt = /\.(jpe?g|png|webp|gif|svg|bmp|tiff?|avif|heic|heif|ico)$/i.test(filename);
  return isImageMime || isImageExt;
}

/**
 * Validates whether a file is a valid document or scanned image for Right to Work proof
 * Supports PDF, DOC, DOCX, ODT, RTF, TXT, and all scanned image formats
 */
export function isValidRtwDocument(filename: string, mimetype: string): boolean {
  if (/\.(exe|sh|bat|cmd|bin|apk|jar|py|js|ts|php|pl|cgi|msi)$/i.test(filename)) {
    return false;
  }

  const isImage = isValidImage(filename, mimetype);
  const isPdf = mimetype === 'application/pdf';
  const isWord =
    mimetype.includes('msword') ||
    mimetype.includes('wordprocessingml') ||
    mimetype.includes('officedocument');
  const isOtherDoc =
    mimetype.includes('opendocument') ||
    mimetype === 'application/rtf' ||
    mimetype === 'text/rtf' ||
    mimetype === 'text/plain';
  const hasValidExt =
    /\.(pdf|docx?|odt|rtf|txt|jpe?g|png|webp|bmp|tiff?|heic|heif|gif|svg|pages|xps)$/i.test(filename);

  return isImage || isPdf || isWord || isOtherDoc || hasValidExt;
}

// Multer Storage Configuration for generic documents
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = resolveExtension(file.originalname, file.mimetype);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Configure Multer engine with size limit of 50MB and PDF/DOC/DOCX/image constraints
export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB Limit
  fileFilter: (req, file, cb) => {
    if (isValidRtwDocument(file.originalname, file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed formats: PDF, DOC, DOCX, and scanned image documents.'));
    }
  }
});

// Client logo storage configuration
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logoUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = resolveExtension(file.originalname, file.mimetype);
    cb(null, 'logo-' + uniqueSuffix + ext);
  }
});

export const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB Limit
  fileFilter: (req, file, cb) => {
    if (isValidImage(file.originalname, file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Please upload a valid image (JPG, PNG, WEBP, SVG, etc.).'));
    }
  }
});

// Guard upload storage configuration (directs photo to guard-photos and rtwDocument to rtw-documents)
const guardUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'photo') {
      cb(null, guardPhotoUploadDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = resolveExtension(file.originalname, file.mimetype);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

export const guardUpload = multer({
  storage: guardUploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photo') {
      // Profile Photo: Allow any image format (PNG, JPG, JPEG, WEBP, GIF, SVG, BMP, TIFF, AVIF, HEIC, etc.)
      if (isValidImage(file.originalname, file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid image format for officer profile photo. Please upload a valid image file (PNG, JPG, JPEG, WEBP, etc.).'));
      }
    } else if (file.fieldname === 'rtwDocument') {
      // Right to Work Document: Allow PDF, DOC, DOCX, ODT, RTF, TXT, or any scanned image format
      if (isValidRtwDocument(file.originalname, file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid document format. Allowed formats: PDF, DOC, DOCX, and common image formats (PNG, JPG, JPEG, WEBP, etc.).'));
      }
    } else {
      cb(null, true);
    }
  }
});

// Shift attendance upload storage (visual check-in / check-out live camera photos)
const attendanceUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, checkInPhotoUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = resolveExtension(file.originalname, file.mimetype);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

export const attendanceUpload = multer({
  storage: attendanceUploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (isValidImage(file.originalname, file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Live camera capture must be an image file.'));
    }
  }
});

export default upload;
