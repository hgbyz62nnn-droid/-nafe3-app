const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { uploadsDir } = require('./paths');

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

module.exports = { saveAvatar, saveGalleryPhoto, deleteUploadedFile };
