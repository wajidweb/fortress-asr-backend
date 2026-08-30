import crypto from 'crypto';

// The key must be 32 bytes (256 bits)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-very-secret-key-32-bytes-long-1234';
const STATIC_IV = process.env.STATIC_IV || 'static-iv-16bytes'; // Must be 16 bytes

// Ensure the key is exactly 32 bytes
const getKey = (): Buffer => {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
};

// Ensure the static IV is exactly 16 bytes
const getStaticIv = (): Buffer => {
  return crypto.createHash('md5').update(STATIC_IV).digest();
};

/**
 * Deterministic encryption (used for unique/searchable fields like email)
 */
export function encryptDeterministic(text: string): string {
  if (!text) return text;
  const key = getKey();
  const iv = getStaticIv();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `det:${encrypted}`;
}

/**
 * Deterministic decryption
 */
export function decryptDeterministic(encryptedText: string): string {
  if (!encryptedText || !encryptedText.startsWith('det:')) return encryptedText;
  try {
    const hexText = encryptedText.substring(4);
    const key = getKey();
    const iv = getStaticIv();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(hexText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return encryptedText; // Fallback if decryption fails (e.g. old unencrypted data)
  }
}

/**
 * Randomized encryption (used for non-searchable fields like names, phone numbers)
 */
export function encryptRandomized(text: string): string {
  if (!text) return text;
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `rand:${iv.toString('hex')}:${encrypted}`;
}

/**
 * Randomized decryption
 */
export function decryptRandomized(encryptedText: string): string {
  if (!encryptedText || !encryptedText.startsWith('rand:')) return encryptedText;
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;
    const iv = Buffer.from(parts[1], 'hex');
    const hexText = parts[2];
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(hexText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return encryptedText; // Fallback if decryption fails
  }
}
