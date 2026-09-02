const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { uploadsDir, privateDocsDir } = require('./paths');

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// بيتأكد من نوع الصورة الحقيقي عن طريق قراءة الـ header الفعلي بمعرفة
// libvips (magic bytes)، مش الـ mimetype اللي المتصفح باعته وسهل تزويره.
// بيرمي error لو مش صورة سليمة أو النوع مش مدعوم.
async function assertRealImageType(buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new Error('الملف ده مش صورة سليمة');
  }
  if (!ALLOWED_FORMATS.has(meta.format)) {
    throw new Error('نوع الصورة غير مدعوم، لازم تكون JPEG أو PNG أو WebP');
  }
  return meta;
}

function newFilename() {
  return crypto.randomBytes(20).toString('hex') + '.webp';
}

// صورة بروفايل: مربعة وموحدة المقاس، بتتقص من النص لو مش مربعة أصلًا.
async function saveAvatar(buffer) {
  await assertRealImageType(buffer);
  const filename = newFilename();
  await sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(path.join(uploadsDir, filename));
  return filename;
}

// صورة جاليري: بتحافظ على نسبة الأبعاد، بس بحد أقصى للبعد الأطول عشان الحجم.
async function saveGalleryPhoto(buffer) {
  await assertRealImageType(buffer);
  const filename = newFilename();
  await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(uploadsDir, filename));
  return filename;
}

function deleteUploadedFile(filename) {
  if (!filename) return;
  fs.unlink(path.join(uploadsDir, filename), () => {});
}

const PDF_MAGIC = Buffer.from('%PDF-');

// مستندات المدرب (بطاقة/شهادة) ممكن تكون صور أو PDF، فمينفعش نستخدم sharp
// بس زي الصور - بنتأكد من النوع الحقيقي بقراءة الـ magic bytes يدويًا لو
// PDF، أو نفس تحقق sharp لو صورة. مفيش إعادة ضغط لـ PDF (مستند مش صورة)،
// بس الصور برضو بتتحول WebP زي باقي الرفعات في التطبيق.
async function saveTrainerDocument(buffer) {
  if (buffer.length > PDF_MAGIC.length && buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    const filename = crypto.randomBytes(20).toString('hex') + '.pdf';
    fs.writeFileSync(path.join(privateDocsDir, filename), buffer);
    return { filename, mimeType: 'application/pdf' };
  }
  await assertRealImageType(buffer);
  const filename = newFilename();
  await sharp(buffer).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(privateDocsDir, filename));
  return { filename, mimeType: 'image/webp' };
}

function deletePrivateDoc(filename) {
  if (!filename) return;
  fs.unlink(path.join(privateDocsDir, filename), () => {});
}

module.exports = { saveAvatar, saveGalleryPhoto, deleteUploadedFile, saveTrainerDocument, deletePrivateDoc };
