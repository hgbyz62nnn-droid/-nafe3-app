const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'db');
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// منفصل عن uploadsDir عمدًا - ده مش متاح كـ static route، بيتقرا بس عبر
// route فيه تحقق صلاحيات (لمستندات المدرب الخاصة زي البطاقة والشهادات).
const privateDocsDir = path.join(dataDir, 'private-docs');
if (!fs.existsSync(privateDocsDir)) fs.mkdirSync(privateDocsDir, { recursive: true });

module.exports = { dataDir, uploadsDir, privateDocsDir };
