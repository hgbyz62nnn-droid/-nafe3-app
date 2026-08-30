// شغّل الملف ده مرة واحدة بس عشان تعمل حساب أدمن تقدر بيه توافق على المدربين.
// الطريقة: node seed-admin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const email = process.argv[2] || 'admin@nafe3.com';
const password = process.argv[3] || 'admin123';

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  console.log('⚠️ في حساب بالإيميل ده خالص:', email);
  process.exit(0);
}

const password_hash = bcrypt.hashSync(password, 10);
db.prepare('INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)')
  .run('admin', 'Admin', email, password_hash);

console.log('✅ اتعمل حساب أدمن:');
console.log('   الإيميل:', email);
console.log('   الباسورد:', password);
console.log('   (سجّل دخول بيهم من نفس صفحة تسجيل الدخول العادية)');
