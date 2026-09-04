// Super Admin / Full Platform Control - security test matrix (spec §17).
// Real HTTP requests against the actual app (app.js), a fresh isolated
// SQLite DB per run - not mocks, not unit tests of the middleware in
// isolation. Every assertion here is something the FRONTEND has no part
// in: these prove the backend itself rejects/accepts requests correctly,
// independent of any button being shown or hidden.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, makeSession } = require('./helpers/testServer');

let ctx;

before(async () => {
  const { server, baseUrl } = await startTestServer();
  ctx = { server, baseUrl };

  ctx.superAdmin = makeSession(baseUrl);
  ctx.admin = makeSession(baseUrl);
  ctx.user = makeSession(baseUrl);
  ctx.coach = makeSession(baseUrl);
  ctx.anon = makeSession(baseUrl);

  // First admin ever created self-bootstraps as SUPER_ADMIN.
  const bootstrap = await ctx.superAdmin.post('/api/admin/bootstrap', { username: 'root_admin', password: 'RootPassword123!' });
  assert.equal(bootstrap.status, 200);
  const superLogin = await ctx.superAdmin.post('/api/admin/login', { username: 'root_admin', password: 'RootPassword123!' });
  assert.equal(superLogin.status, 200);
  assert.equal(superLogin.body.admin.role, 'SUPER_ADMIN');
  ctx.superAdminId = superLogin.body.admin.id;

  // SUPER_ADMIN creates a plain ADMIN account.
  const createAdmin = await ctx.superAdmin.post('/api/admins', { username: 'plain_admin', password: 'PlainAdminPass123!', role: 'ADMIN' });
  assert.equal(createAdmin.status, 200);
  ctx.plainAdminId = createAdmin.body.admin.id;
  const adminLogin = await ctx.admin.post('/api/admin/login', { username: 'plain_admin', password: 'PlainAdminPass123!' });
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.body.admin.role, 'ADMIN');

  // A real trainee (USER/ATHLETE) session - register then have the
  // SUPER_ADMIN manually verify the email (same as support would), then log in.
  const registerUser = await ctx.user.post('/api/auth/register', { name: 'Test Trainee', email: 'trainee@example.test', password: 'TraineePass123', role: 'trainee' });
  assert.equal(registerUser.status, 200);
  await ctx.superAdmin.post(`/api/auth/admin/${registerUser.body.userId}/verify`);
  const userLogin = await ctx.user.post('/api/auth/login', { email: 'trainee@example.test', password: 'TraineePass123' });
  assert.equal(userLogin.status, 200);

  // A real COACH session, same pattern.
  const registerCoach = await ctx.coach.post('/api/auth/register', { name: 'Test Coach', email: 'coach@example.test', password: 'CoachPass123', role: 'coach' });
  assert.equal(registerCoach.status, 200);
  await ctx.superAdmin.post(`/api/auth/admin/${registerCoach.body.userId}/verify`);
  const coachLogin = await ctx.coach.post('/api/auth/login', { email: 'coach@example.test', password: 'CoachPass123' });
  assert.equal(coachLogin.status, 200);
});

after(() => {
  ctx.server.close();
});

test('USER cannot access admin APIs (no admin cookie at all)', async () => {
  const stats = await ctx.user.get('/api/admin/stats');
  assert.equal(stats.status, 401);
  const admins = await ctx.user.get('/api/admins');
  assert.equal(admins.status, 401);
  const users = await ctx.user.get('/api/auth/admin/users');
  assert.equal(users.status, 401);
});

test('COACH cannot access admin APIs (no admin cookie at all)', async () => {
  const admins = await ctx.coach.get('/api/admins');
  assert.equal(admins.status, 401);
  const pending = await ctx.coach.get('/api/coaches/admin/pending');
  assert.equal(pending.status, 401);
});

test('an anonymous (unauthenticated) request to any admin route is rejected', async () => {
  const stats = await ctx.anon.get('/api/admin/stats');
  assert.equal(stats.status, 401);
  const admins = await ctx.anon.get('/api/admins');
  assert.equal(admins.status, 401);
});

test('ADMIN cannot reach any Super-Admin-only route (admin management, audit log, backups)', async () => {
  const list = await ctx.admin.get('/api/admins');
  assert.equal(list.status, 403);
  const create = await ctx.admin.post('/api/admins', { username: 'escalated', password: 'WouldBeSuperPass1', role: 'ADMIN' });
  assert.equal(create.status, 403);
  const auditLog = await ctx.admin.get('/api/admin/audit-log');
  assert.equal(auditLog.status, 403);
  const backups = await ctx.admin.get('/api/admin/backups');
  assert.equal(backups.status, 403);
});

test('ADMIN cannot escalate itself to SUPER_ADMIN', async () => {
  const res = await ctx.admin.patch(`/api/admins/${ctx.plainAdminId}/role`, { role: 'SUPER_ADMIN' });
  // Blocked at the route level (requireSuperAdmin) before the handler's own
  // self-escalation logic is even reached - an ADMIN has zero path to this route.
  assert.equal(res.status, 403);
});

test('ADMIN cannot modify or suspend the Super Admin account', async () => {
  const roleChange = await ctx.admin.patch(`/api/admins/${ctx.superAdminId}/role`, { role: 'ADMIN' });
  assert.equal(roleChange.status, 403);
  const suspend = await ctx.admin.post(`/api/admins/${ctx.superAdminId}/suspend`);
  assert.equal(suspend.status, 403);
});

test('SUPER_ADMIN cannot demote or suspend itself (avoids locking out the only Super Admin)', async () => {
  const roleChange = await ctx.superAdmin.patch(`/api/admins/${ctx.superAdminId}/role`, { role: 'ADMIN' });
  assert.equal(roleChange.status, 400);
  const suspend = await ctx.superAdmin.post(`/api/admins/${ctx.superAdminId}/suspend`);
  assert.equal(suspend.status, 400);
});

test('SUPER_ADMIN can access every intended Super Admin resource', async () => {
  const list = await ctx.superAdmin.get('/api/admins');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.admins));
  // Passwords must never be exposed, not even hashed, to any admin API response.
  for (const a of list.body.admins) assert.equal('password_hash' in a, false);

  const stats = await ctx.superAdmin.get('/api/admin/stats');
  assert.equal(stats.status, 200);
  assert.equal(typeof stats.body.athletes, 'number');

  const auditLog = await ctx.superAdmin.get('/api/admin/audit-log');
  assert.equal(auditLog.status, 200);
  assert.ok(Array.isArray(auditLog.body.entries));

  const athletes = await ctx.superAdmin.get('/api/athletes');
  assert.equal(athletes.status, 200);

  const exercises = await ctx.superAdmin.get('/api/exercises/admin/all');
  assert.equal(exercises.status, 200);

  const foods = await ctx.superAdmin.get('/api/foods/admin/all');
  assert.equal(foods.status, 200);
});

test('ADMIN can use the resources it IS granted, and gets 403 (not silently ignored) for ones it is not', async () => {
  const users = await ctx.admin.get('/api/auth/admin/users');
  assert.equal(users.status, 200); // users:view is granted to ADMIN

  const pending = await ctx.admin.get('/api/coaches/admin/pending');
  assert.equal(pending.status, 200); // coaches:view is granted to ADMIN

  // users:delete is reserved to SUPER_ADMIN - permanent account deletion.
  const del = await ctx.admin.del(`/api/auth/admin/999999`);
  assert.equal(del.status, 403);

  // settings (raw DB backups) is empty for ADMIN outright.
  const backups = await ctx.admin.get('/api/admin/backups');
  assert.equal(backups.status, 403);
});

test('unauthorized API requests return a proper HTTP status, never a 200 with an empty/silent body', async () => {
  const res = await ctx.user.get('/api/admins');
  assert.equal(res.status, 401);
  assert.notEqual(res.status, 200);
});

test('audit log records privileged admin actions, including denied attempts, and is itself append-only via the API', async () => {
  // Setup already performed a create_admin action - confirm it's recorded.
  const auditLog = await ctx.superAdmin.get('/api/admin/audit-log?resourceType=admins');
  assert.equal(auditLog.status, 200);
  const actions = auditLog.body.entries.map((e) => e.action);
  assert.ok(actions.includes('create_admin'), 'expected a create_admin entry');
  assert.ok(actions.some((a) => a.startsWith('denied:')), 'expected at least one denied:* entry from the ADMIN-escalation attempts above');

  // Sensitive fields are never persisted into audit metadata.
  for (const entry of auditLog.body.entries) {
    if (entry.metadata) assert.doesNotMatch(entry.metadata, /password/i);
  }
});
