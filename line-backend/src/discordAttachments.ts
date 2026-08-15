export const MAX_ANNOUNCEMENT_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export type ValidatedAttachment = {
  file: File;
  filename: string;
  contentType: keyof typeof EXTENSION_BY_TYPE;
  size: number;
};

function hasBytes(bytes: Uint8Array, expected: number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function signatureMatches(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === 'image/png') return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === 'image/jpeg') return hasBytes(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === 'image/gif') return hasBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || hasBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  if (contentType === 'image/webp') return hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  return false;
}

export async function validateAnnouncementAttachments(files: File[]): Promise<ValidatedAttachment[]> {
  if (files.length > MAX_ANNOUNCEMENT_ATTACHMENTS) throw new Error('TOO_MANY_ATTACHMENTS');
  let total = 0;
  const validated: ValidatedAttachment[] = [];
  for (const [index, file] of files.entries()) {
    const contentType = file.type.toLowerCase() as keyof typeof EXTENSION_BY_TYPE;
    if (!EXTENSION_BY_TYPE[contentType]) throw new Error('UNSUPPORTED_ATTACHMENT_TYPE');
    if (file.size < 1 || file.size > MAX_ATTACHMENT_BYTES) throw new Error('ATTACHMENT_TOO_LARGE');
    total += file.size;
    if (total > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error('ATTACHMENTS_TOO_LARGE');
    const signature = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!signatureMatches(contentType, signature)) throw new Error('ATTACHMENT_SIGNATURE_INVALID');
    validated.push({ file, filename: `image-${index + 1}.${EXTENSION_BY_TYPE[contentType]}`, contentType, size: file.size });
  }
  return validated;
}
