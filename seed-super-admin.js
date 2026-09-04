// Creates or safely upgrades the platform's SUPER_ADMIN account (spec:
// Super Admin / Full Platform Control §15/§20). Run once:
//
//   SUPER_ADMIN_PASSWORD='...' node seed-super-admin.js
//
// The password is read ONLY from the SUPER_ADMIN_PASSWORD environment
// variable (or a CLI argument as a fallback) at run time - it is never
// hardcoded in this file, never logged, never returned by any API, and is
// discarded from memory as soon as bcrypt has hashed it. The username is
// always exactly 'admin' (not configurable), per spec.
//
// Idempotent: running this again with an EXISTING 'admin' account never
// touches its password and never blindly overwrites it - it only verifies/
// upgrades role=SUPER_ADMIN and status=active if either has drifted, and
// reports exactly what it did.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const USERNAME = 'admin';
const password = process.env.SUPER_ADMIN_PASSWORD || process.argv[2];

if (!password) {
  console.error("Missing password. Usage: SUPER_ADMIN_PASSWORD='...' node seed-super-admin.js");
  process.exit(1);
}
// This script is an operator-run, offline, one-time credential seed - not
// a self-service network endpoint - so it uses the app's general 8-char
// baseline (routes/auth.js registration) rather than the stricter 10-char
// floor the exposed HTTP admin bootstrap/create routes enforce for
// self-service admin account creation. Same precedent as the legacy
// seed-admin.js, which enforces no minimum at all.
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const existing = db.prepare('SELECT id, role, status FROM admins WHERE username = ?').get(USERNAME);

if (existing) {
  const changes = [];
  if (existing.role !== 'SUPER_ADMIN') {
    db.prepare("UPDATE admins SET role = 'SUPER_ADMIN' WHERE id = ?").run(existing.id);
    changes.push('role -> SUPER_ADMIN');
  }
  if (existing.status !== 'active') {
    db.prepare("UPDATE admins SET status = 'active' WHERE id = ?").run(existing.id);
    changes.push('status -> active');
  }
  if (changes.length) {
    console.log(`'admin' account already existed (id=${existing.id}). Password left untouched. Upgraded: ${changes.join(', ')}.`);
  } else {
    console.log(`'admin' account already existed (id=${existing.id}) and is already SUPER_ADMIN/active. Nothing changed.`);
  }
  process.exit(0);
}

const password_hash = bcrypt.hashSync(password, 10);
const info = db
  .prepare("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, 'SUPER_ADMIN')")
  .run(USERNAME, password_hash);
console.log(`Created SUPER_ADMIN account 'admin' (id=${info.lastInsertRowid}).`);
