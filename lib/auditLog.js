// Immutable admin audit trail (spec: Super Admin / Full Platform Control
// §14). One INSERT-only helper used by every route that performs a
// privileged admin action - there is no update/delete path for this table
// anywhere in the codebase.

const SENSITIVE_KEY_PATTERN = /password|token|secret|hash|credential/i;

// Strips anything that looks like a credential from metadata before it's
// persisted, so a caller passing through a raw request body by mistake
// can't leak a password/token into the audit trail.
function sanitizeMetadata(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeMetadata(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[redacted]' : sanitizeMetadata(v, depth + 1);
    }
    return out;
  }
  return value;
}

function logAudit(db, { adminId, adminUsername, action, resourceType, resourceId, metadata, success = true, ip }) {
  db.prepare(
    `INSERT INTO audit_logs (admin_id, admin_username, action, resource_type, resource_id, metadata, success, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    adminId ?? null,
    adminUsername ?? null,
    action,
    resourceType,
    resourceId != null ? String(resourceId) : null,
    metadata !== undefined ? JSON.stringify(sanitizeMetadata(metadata)) : null,
    success ? 1 : 0,
    ip ?? null
  );
}

module.exports = { logAudit, sanitizeMetadata };
