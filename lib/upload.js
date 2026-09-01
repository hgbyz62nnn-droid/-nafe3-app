const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { uploadsDir } = require('./paths');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] || '';
    cb(null, crypto.randomBytes(20).toString('hex') + ext);
  },
});

const uploadPhoto = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
});

module.exports = { uploadPhoto };
