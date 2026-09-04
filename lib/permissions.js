// Centralized permission definitions (spec: Super Admin / Full Platform
// Control §2) - the single source of truth for what an ADMIN vs a
// SUPER_ADMIN may do. No route should hand-roll its own role check; every
// admin-sensitive route goes through requirePermission() (middleware/adminAuth.js),
// which reads this table.
//
// Resources cover the required minimum list from the spec (users, athletes,
// coaches, sports, exercises, training_plans, nutrition, foods, meals,
// subscriptions, payments, chat_support, ai_coach, analytics, notifications,
// settings, admins, audit_logs) plus a few extra resources for moderation
// workflows that already exist in this codebase (reviews, content,
// moderation, deletion_requests) so they get the same centralized treatment
// instead of being left on a flat requireAdmin check.
//
// Actions are a fixed vocabulary (spec §2): view, create, edit, suspend,
// restore, delete, configure, override, manage. Not every resource uses
// every action - a resource's granted-action list only ever contains
// actions that resource's routes actually implement.

const RESOURCES = [
  'users', 'athletes', 'coaches', 'coach_documents', 'sports', 'exercises',
  'training_plans', 'nutrition', 'foods', 'meals', 'subscriptions', 'payments',
  'chat_support', 'reviews', 'content', 'moderation', 'deletion_requests',
  'ai_coach', 'analytics', 'notifications', 'settings', 'admins', 'audit_logs',
];

const ACTIONS = ['view', 'create', 'edit', 'suspend', 'restore', 'delete', 'configure', 'override', 'manage'];

// SUPER_ADMIN is implicitly granted every action on every resource ('*') -
// it is never listed explicitly and can never be narrowed by this table.
// ADMIN gets exactly the actions listed below per resource; anything not
// listed is refused server-side even if the frontend never renders a
// button for it (spec: "hiding buttons in the frontend is NOT sufficient").
//
// This is the *default* ADMIN grant, chosen to preserve every action an
// existing (undifferentiated) admin account could already take before this
// feature - except the handful of actions reserved to SUPER_ADMIN because
// they are irreversible, touch money, or are self-escalation-adjacent
// (permanently deleting a user, managing other admins, reading the audit
// log, downloading a full raw DB backup, sending a platform-wide broadcast,
// and cancelling/over-riding a paid subscription).
const ADMIN_PERMISSIONS = {
  users: ['view', 'edit', 'suspend', 'restore'], // ban/unban/manual-verify; NOT delete
  athletes: ['view'],
  coaches: ['view', 'edit', 'suspend', 'restore'], // approve/reject coach + profile edits
  coach_documents: ['view', 'edit'], // review (approve/reject) trainer documents
  sports: [], // no sports/positions registry exists in this backend - see final report
  exercises: ['view'],
  training_plans: ['view'],
  nutrition: ['view'],
  foods: ['view'],
  meals: ['view'],
  subscriptions: ['view'],
  payments: ['view'], // NOT override - cancelling/refunding is SUPER_ADMIN only
  chat_support: ['view', 'manage'], // support tickets + subscription chat oversight
  reviews: ['view', 'edit'], // hide/restore reviews, act on review reports
  content: ['view', 'edit'], // hide/restore coach posts
  moderation: ['view', 'edit'], // act on user reports, view flagged chat attempts
  deletion_requests: ['view', 'edit'], // approve/reject account-deletion requests
  ai_coach: ['view'],
  analytics: ['view'],
  notifications: ['view'], // NOT manage - sending a broadcast is SUPER_ADMIN only
  settings: [], // backups + platform-wide config are SUPER_ADMIN only
  admins: [], // an ADMIN can never view/manage other admin accounts
  audit_logs: [], // an ADMIN can never read the audit trail (can't cover tracks)
};

function hasPermission(role, resource, action) {
  if (role === 'SUPER_ADMIN') return true;
  const granted = ADMIN_PERMISSIONS[resource];
  return Array.isArray(granted) && granted.includes(action);
}

module.exports = { RESOURCES, ACTIONS, ADMIN_PERMISSIONS, hasPermission };
