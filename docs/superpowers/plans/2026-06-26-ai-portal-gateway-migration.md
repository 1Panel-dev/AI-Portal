# AI-Portal Gateway Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `D:\claude-code\AI-Portal` functionally in line with the current `D:\claude-code\AI-Portal` gateway portal while preserving AI-Portal's `portal/` frontend layout and using AI-Portal as the user-facing brand.

**Architecture:** Treat `AI-Portal` as the source of truth and migrate in layers: schema/backend primitives, backend routes, frontend routes/views, then build/deployment/branding. Backend files remain CommonJS under `server/`; frontend files from source `src/` map into target `portal/src/`.

**Tech Stack:** Vue 3 + Vite + Vue Router + Tailwind CSS frontend; Express + PostgreSQL + CommonJS backend; Docker multi-stage build; 1Panel Enterprise AI Gateway and Skills Hub APIs.

## Global Constraints

- Target repository root: `D:\claude-code\AI-Portal`.
- Source repository root: `D:\claude-code\AI-Portal`.
- Preserve target frontend layout: source `src/...` maps to target `portal/src/...`.
- Keep backend CommonJS: use `require()` and `module.exports` in `server/` files.
- User-visible default brand must be `AI-Portal`.
- Do not modify `LICENSE`.
- Avoid modifying `README.md`; if a README change becomes necessary, keep it minimal and only document the `portal/` frontend layout.
- Do not commit git changes during this migration.
- Do not edit or copy `.env`.
- Do not copy `node_modules`.
- Do not copy runtime `data`.
- Preserve 1Panel API safety behavior: HTTP 200 with `body.code >= 400` is failure, searches paginate, API key reset purges remote keys first, local `portal_api_keys.panel_key_id` is not authoritative, and `PANSL_SYNC_UNVERIFIED` spelling must not be corrected.

---

## File Structure Map

### Files/directories to create

- `server/routes/oauth.js` — OAuth route orchestration: provider list, auth URL, callback, ticket completion, bind/login/skip flows.
- `server/oauth/index.js` — OAuth provider registry and provider config helpers.
- `server/oauth/wecom.js` — Enterprise WeChat OAuth adapter.
- `server/oauth/token-cache.js` — short-lived WeCom access-token cache.
- `server/oauth/username-generator.js` — stable local username generation for OAuth-created users.
- `server/lib/state-store.js` — short-lived one-time state store for OAuth state validation.
- `server/migrations/016_portal_users_auto_created.sql` — add `portal_users.auto_created_from`.
- `server/migrations/017_oauth_providers.sql` — create and seed `oauth_providers`.
- `server/migrations/018_user_identities.sql` — create `user_identities`.
- `server/migrations/019_oauth_provider_allowlist.sql` — create allowlist schema placeholder.
- `portal/src/views/OAuthCompleteView.vue` — exchanges OAuth ticket for local token.
- `portal/src/views/OAuthErrorView.vue` — user-facing OAuth error page.
- `portal/src/views/OAuthBindView.vue` — first-time OAuth identity binding/auto-create page.
- `portal/src/views/AdminOAuthView.vue` — admin OAuth provider settings page.
- `portal/src/components/admin/OAuthProviderCard.vue` — admin OAuth provider editor/test card.
- `portal/src/components/admin/NewUserDialog.vue` — admin-created local user dialog.
- `portal/src/components/AppDialog.vue` — reusable modal dialog used by OAuth/profile flows.
- `docs/1panel-api-gotchas.md` — defensive notes for future 1Panel API work.

### Files to modify

- `server/auth.js` — add OAuth ticket signing and one-time ticket consumption.
- `server/app.js` — trust proxy, static `/uploads`, mount OAuth route.
- `server/panel.js` — configurable 1Panel role ID and role list helper.
- `server/routes/portal.js` — registration gating, public branding/announcement APIs, identity APIs, set-password API.
- `server/routes/admin.js` — role config, branding/announcement APIs, admin user creation, OAuth provider admin APIs.
- `server/db.js` — check whether source has relevant changes; only copy if diff shows migration/admin behavior needed.
- `portal/src/main.js` — add OAuth and admin OAuth routes.
- `portal/src/views/LoginView.vue` — OAuth login buttons and WeCom in-client loading behavior.
- `portal/src/views/RegisterView.vue` — OAuth-enabled registration failure UX.
- `portal/src/views/ProfileView.vue` — identity binding, first password setup, OAuth notices, retain API key management.
- `portal/src/views/AdminConfigView.vue` — role selection, branding, announcement, default gateway tab, hidden legacy storage UI.
- `portal/src/views/AdminUsersView.vue` — admin-created user dialog integration.
- `portal/src/views/AdminView.vue` — navigation consistency.
- `portal/src/views/AdminSkillsView.vue` — navigation consistency.
- `portal/src/App.vue` — ensure announcement/branding integration matches source and brand fallback.
- `portal/src/components/NavBar.vue` — brand fallback and nav consistency.
- `portal/src/components/AnnouncementModal.vue` — announcement integration and brand copy.
- `portal/src/composables/useSiteBranding.js` — verify API path/fallback brand.
- `portal/src/composables/useAnnouncement.js` — verify API path/fallback behavior.
- `portal/vite.config.js` — add dev `__BASE_PATH__` replacement and `/uploads` proxy.
- `portal/package.json` — rename package if still `1panel-ai-hub`; keep dependency versions aligned with target/source.
- `server/package.json` — rename package if still `1panel-ai-hub-server`; keep dependencies needed for copied code.
- `.env.example` — update user-facing product name and required variables without secrets.
- `Dockerfile` — adapt frontend build to `portal/` layout.
- `docker-compose.yml` — update visible service/image/container naming from AI-Portal to AI-Portal while preserving runtime semantics.
- `CLAUDE.md` and `AGENTS.md` — update project identity/path references if they are part of target app guidance; do not touch `LICENSE`, avoid `README.md`.

### Files expected to remain unchanged unless diff proves otherwise

- `server/lib/1panel-api.js`
- `server/lib/modelSync.js`
- `server/lib/skillsSync.js`
- `server/routes/marketplace.js`
- `server/lib/storage.js`
- `server/lib/downloadCounter.js`

---

### Task 1: Baseline Diff and Safety Snapshot

**Files:**
- Read-only compare: `D:\claude-code\AI-Portal`
- Read-only compare: `D:\claude-code\AI-Portal`
- Create: `D:\claude-code\AI-Portal\docs\superpowers\plans\2026-06-26-ai-portal-gateway-migration-baseline.md`

**Interfaces:**
- Consumes: approved design at `docs/superpowers/specs/2026-06-26-ai-portal-gateway-migration-design.md`.
- Produces: a baseline file listing high-risk files and pre-migration git state for rollback/reference.

- [ ] **Step 1: Record target git state**

Run:

```bash
git -C /d/claude-code/AI-Portal status --short --branch > /tmp/ai-portal-status-before.txt
git -C /d/claude-code/AI-Portal ls-files > /tmp/ai-portal-tracked-before.txt
```

Expected: command exits 0. `status` shows most app files as untracked; this is expected.

- [ ] **Step 2: Record source revision state**

Run:

```bash
git -C /d/claude-code/AI-Portal status --short --branch > /tmp/1panelaihub-status-source.txt
git -C /d/claude-code/AI-Portal rev-parse HEAD > /tmp/1panelaihub-head.txt
```

Expected: command exits 0. Source branch may be ahead of origin; record it without changing it.

- [ ] **Step 3: Create baseline notes**

Create `D:\claude-code\AI-Portal\docs\superpowers\plans\2026-06-26-ai-portal-gateway-migration-baseline.md` with this content, replacing only the command-output blocks with the contents from `/tmp`:

```markdown
# AI-Portal Gateway Migration Baseline

Date: 2026-06-26

## Target git state before migration

```text
<contents of /tmp/ai-portal-status-before.txt>
```

## Target tracked files before migration

```text
<contents of /tmp/ai-portal-tracked-before.txt>
```

## Source state

```text
<contents of /tmp/1panelaihub-status-source.txt>
```

Source HEAD:

```text
<contents of /tmp/1panelaihub-head.txt>
```

## High-risk files

- server/auth.js
- server/app.js
- server/panel.js
- server/routes/portal.js
- server/routes/admin.js
- server/routes/oauth.js
- server/oauth/*.js
- server/migrations/016_portal_users_auto_created.sql
- server/migrations/017_oauth_providers.sql
- server/migrations/018_user_identities.sql
- server/migrations/019_oauth_provider_allowlist.sql
- portal/src/main.js
- portal/src/views/LoginView.vue
- portal/src/views/ProfileView.vue
- portal/src/views/AdminConfigView.vue
- portal/src/views/AdminUsersView.vue
- portal/src/views/AdminOAuthView.vue
- portal/vite.config.js
- Dockerfile
- docker-compose.yml
```

- [ ] **Step 4: Verify no accidental git staging**

Run:

```bash
git -C /d/claude-code/AI-Portal diff --cached --name-only
```

Expected: no output.

---

### Task 2: Add OAuth Schema and Backend Primitive Modules

**Files:**
- Create: `server/migrations/016_portal_users_auto_created.sql`
- Create: `server/migrations/017_oauth_providers.sql`
- Create: `server/migrations/018_user_identities.sql`
- Create: `server/migrations/019_oauth_provider_allowlist.sql`
- Create: `server/oauth/index.js`
- Create: `server/oauth/wecom.js`
- Create: `server/oauth/token-cache.js`
- Create: `server/oauth/username-generator.js`
- Create: `server/lib/state-store.js`
- Modify: `server/auth.js`

**Interfaces:**
- Consumes: existing `global.pool`, existing JWT secret and auth middleware exports.
- Produces:
  - `oauthRegistry.isAnyProviderEnabled(pool): Promise<boolean>`
  - `oauthRegistry.getEnabledProviders(pool): Promise<Array<{provider, displayName}>>`
  - `oauthRegistry.getProviderAdapter(provider): object|null`
  - `signOauthTicket(payload): string`
  - `signOauthBindingTicket(payload): string`
  - `consumeTicket(token, expectedType): object`

- [ ] **Step 1: Copy OAuth migrations from source**

Run:

```bash
cp /d/claude-code/AI-Portal/server/migrations/016_portal_users_auto_created.sql /d/claude-code/AI-Portal/server/migrations/016_portal_users_auto_created.sql
cp /d/claude-code/AI-Portal/server/migrations/017_oauth_providers.sql /d/claude-code/AI-Portal/server/migrations/017_oauth_providers.sql
cp /d/claude-code/AI-Portal/server/migrations/018_user_identities.sql /d/claude-code/AI-Portal/server/migrations/018_user_identities.sql
cp /d/claude-code/AI-Portal/server/migrations/019_oauth_provider_allowlist.sql /d/claude-code/AI-Portal/server/migrations/019_oauth_provider_allowlist.sql
```

Expected: four files exist in `AI-Portal/server/migrations`.

- [ ] **Step 2: Copy OAuth primitive modules from source**

Run:

```bash
mkdir -p /d/claude-code/AI-Portal/server/oauth
cp /d/claude-code/AI-Portal/server/oauth/index.js /d/claude-code/AI-Portal/server/oauth/index.js
cp /d/claude-code/AI-Portal/server/oauth/wecom.js /d/claude-code/AI-Portal/server/oauth/wecom.js
cp /d/claude-code/AI-Portal/server/oauth/token-cache.js /d/claude-code/AI-Portal/server/oauth/token-cache.js
cp /d/claude-code/AI-Portal/server/oauth/username-generator.js /d/claude-code/AI-Portal/server/oauth/username-generator.js
cp /d/claude-code/AI-Portal/server/lib/state-store.js /d/claude-code/AI-Portal/server/lib/state-store.js
```

Expected: copied files use CommonJS `require()`/`module.exports`.

- [ ] **Step 3: Copy source auth.js into target**

Run:

```bash
cp /d/claude-code/AI-Portal/server/auth.js /d/claude-code/AI-Portal/server/auth.js
```

Expected: `server/auth.js` exports `signOauthTicket`, `signOauthBindingTicket`, and `consumeTicket` in addition to existing auth helpers.

- [ ] **Step 4: Syntax-check backend primitive files**

Run:

```bash
cd /d/claude-code/AI-Portal/server
node --check auth.js
node --check oauth/index.js
node --check oauth/wecom.js
node --check oauth/token-cache.js
node --check oauth/username-generator.js
node --check lib/state-store.js
```

Expected: no syntax errors.

- [ ] **Step 5: Verify migration order**

Run:

```bash
python - <<'PY'
from pathlib import Path
files = sorted(p.name for p in Path('/d/claude-code/AI-Portal/server/migrations').glob('*.sql'))
print('\n'.join(files))
assert '016_portal_users_auto_created.sql' in files
assert '017_oauth_providers.sql' in files
assert '018_user_identities.sql' in files
assert '019_oauth_provider_allowlist.sql' in files
PY
```

Expected: migrations are listed in numeric order and assertions pass.

---

### Task 3: Wire App Middleware, OAuth Routes, and Configurable 1Panel Role Helpers

**Files:**
- Create: `server/routes/oauth.js`
- Modify: `server/app.js`
- Modify: `server/panel.js`

**Interfaces:**
- Consumes: OAuth registry from Task 2, auth ticket helpers from Task 2.
- Produces:
  - mounted OAuth API routes under `/api/auth/oauth/*`
  - `panel.getPanelRoles(): Promise<Array<{id:number,name:string}>>`
  - `createPanelUser({username,password,name})` uses configured `panel_user_role_id`.

- [ ] **Step 1: Copy OAuth route from source**

Run:

```bash
cp /d/claude-code/AI-Portal/server/routes/oauth.js /d/claude-code/AI-Portal/server/routes/oauth.js
```

Expected: file exists and exports `.router` as in source.

- [ ] **Step 2: Copy source app.js into target**

Run:

```bash
cp /d/claude-code/AI-Portal/server/app.js /d/claude-code/AI-Portal/server/app.js
```

Expected: target `server/app.js` contains:

```js
app.set('trust proxy', 1);
app.use('/uploads', express.static(uploadsDir, {
```

and:

```js
app.use(require('./routes/oauth').router);
```

- [ ] **Step 3: Copy source panel.js into target**

Run:

```bash
cp /d/claude-code/AI-Portal/server/panel.js /d/claude-code/AI-Portal/server/panel.js
```

Expected: target `server/panel.js` contains `getPanelUserRoleId`, `getPanelRoles`, and exports `getPanelRoles`.

- [ ] **Step 4: Syntax-check changed backend files**

Run:

```bash
cd /d/claude-code/AI-Portal/server
node --check app.js
node --check panel.js
node --check routes/oauth.js
```

Expected: no syntax errors.

- [ ] **Step 5: Verify route dependencies resolve**

Run:

```bash
cd /d/claude-code/AI-Portal/server
node - <<'NODE'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-require-check-only';
require('./auth');
require('./oauth');
require('./routes/oauth');
require('./panel');
console.log('backend route dependencies resolved');
NODE
```

Expected output includes: `backend route dependencies resolved`.

---

### Task 4: Merge Portal and Admin Backend Routes

**Files:**
- Modify: `server/routes/portal.js`
- Modify: `server/routes/admin.js`

**Interfaces:**
- Consumes: `oauthRegistry.isAnyProviderEnabled(pool)`, `getPanelRoles()`, `findPanelUser()`, `createPanelUser()`.
- Produces:
  - public APIs: `GET /api/site/branding`, `GET /api/site/announcement`
  - user APIs: `GET /api/auth/identities`, `DELETE /api/auth/identities/:provider`, `POST /api/auth/password/set`
  - admin APIs: branding, announcement, OAuth providers, admin user creation, role config.

- [ ] **Step 1: Copy source portal route into target**

Run:

```bash
cp /d/claude-code/AI-Portal/server/routes/portal.js /d/claude-code/AI-Portal/server/routes/portal.js
```

Expected: target route still contains API key reset/purge functions and now imports `isAnyProviderEnabled` from `../oauth`.

- [ ] **Step 2: Copy source admin route into target**

Run:

```bash
cp /d/claude-code/AI-Portal/server/routes/admin.js /d/claude-code/AI-Portal/server/routes/admin.js
```

Expected: target route contains branding/announcement routes, `/api/admin/portal-users`, and OAuth provider admin routes.

- [ ] **Step 3: Syntax-check route files**

Run:

```bash
cd /d/claude-code/AI-Portal/server
node --check routes/portal.js
node --check routes/admin.js
```

Expected: no syntax errors.

- [ ] **Step 4: Verify required route strings exist**

Run:

```bash
python - <<'PY'
from pathlib import Path
root = Path('/d/claude-code/AI-Portal/server/routes')
portal = (root / 'portal.js').read_text(encoding='utf-8')
admin = (root / 'admin.js').read_text(encoding='utf-8')
for s in [
  '/api/site/branding', '/api/site/announcement', '/api/auth/identities',
  '/api/auth/password/set', 'isAnyProviderEnabled', 'PANSL_SYNC_UNVERIFIED'
]:
    assert s in portal, f'missing in portal.js: {s}'
for s in [
  '/api/admin/branding', '/api/admin/announcement', '/api/admin/portal-users',
  '/api/admin/oauth/providers', 'panelUserRoleId', 'getPanelRoles'
]:
    assert s in admin, f'missing in admin.js: {s}'
print('route strings verified')
PY
```

Expected output: `route strings verified`.

- [ ] **Step 5: Confirm low-risk backend files stayed unchanged or intentionally aligned**

Run:

```bash
git -C /d/claude-code/AI-Portal diff --no-index --stat -- /d/claude-code/AI-Portal/server/lib/1panel-api.js /d/claude-code/AI-Portal/server/lib/1panel-api.js || true
git -C /d/claude-code/AI-Portal diff --no-index --stat -- /d/claude-code/AI-Portal/server/routes/marketplace.js /d/claude-code/AI-Portal/server/routes/marketplace.js || true
git -C /d/claude-code/AI-Portal diff --no-index --stat -- /d/claude-code/AI-Portal/server/lib/modelSync.js /d/claude-code/AI-Portal/server/lib/modelSync.js || true
git -C /d/claude-code/AI-Portal diff --no-index --stat -- /d/claude-code/AI-Portal/server/lib/skillsSync.js /d/claude-code/AI-Portal/server/lib/skillsSync.js || true
```

Expected: either no output or known unrelated differences. If these show gateway-affecting differences, align them by copying the source file and then run `node --check` on the copied file.

---

### Task 5: Add Frontend OAuth Routes and New Components

**Files:**
- Modify: `portal/src/main.js`
- Create: `portal/src/views/OAuthCompleteView.vue`
- Create: `portal/src/views/OAuthErrorView.vue`
- Create: `portal/src/views/OAuthBindView.vue`
- Create: `portal/src/views/AdminOAuthView.vue`
- Create: `portal/src/components/admin/OAuthProviderCard.vue`
- Create: `portal/src/components/admin/NewUserDialog.vue`
- Create: `portal/src/components/AppDialog.vue`

**Interfaces:**
- Consumes: backend OAuth APIs from Tasks 2-4.
- Produces: router entries for OAuth completion, OAuth errors, binding, and admin OAuth configuration.

- [ ] **Step 1: Copy frontend OAuth views and components from source with target path mapping**

Run:

```bash
mkdir -p /d/claude-code/AI-Portal/portal/src/views
mkdir -p /d/claude-code/AI-Portal/portal/src/components/admin
cp /d/claude-code/AI-Portal/src/views/OAuthCompleteView.vue /d/claude-code/AI-Portal/portal/src/views/OAuthCompleteView.vue
cp /d/claude-code/AI-Portal/src/views/OAuthErrorView.vue /d/claude-code/AI-Portal/portal/src/views/OAuthErrorView.vue
cp /d/claude-code/AI-Portal/src/views/OAuthBindView.vue /d/claude-code/AI-Portal/portal/src/views/OAuthBindView.vue
cp /d/claude-code/AI-Portal/src/views/AdminOAuthView.vue /d/claude-code/AI-Portal/portal/src/views/AdminOAuthView.vue
cp /d/claude-code/AI-Portal/src/components/admin/OAuthProviderCard.vue /d/claude-code/AI-Portal/portal/src/components/admin/OAuthProviderCard.vue
cp /d/claude-code/AI-Portal/src/components/admin/NewUserDialog.vue /d/claude-code/AI-Portal/portal/src/components/admin/NewUserDialog.vue
cp /d/claude-code/AI-Portal/src/components/AppDialog.vue /d/claude-code/AI-Portal/portal/src/components/AppDialog.vue
```

Expected: all copied Vue files exist under `portal/src`.

- [ ] **Step 2: Copy source router entry into target**

Run:

```bash
cp /d/claude-code/AI-Portal/src/main.js /d/claude-code/AI-Portal/portal/src/main.js
```

Expected: router imports paths relative to `portal/src` still work because the internal `src` layout is the same.

- [ ] **Step 3: Verify OAuth routes exist in frontend router**

Run:

```bash
python - <<'PY'
from pathlib import Path
main = Path('/d/claude-code/AI-Portal/portal/src/main.js').read_text(encoding='utf-8')
for s in ['/oauth/complete', '/oauth/error', '/oauth/bind', '/admin/oauth']:
    assert s in main, f'missing route {s}'
print('frontend oauth routes verified')
PY
```

Expected output: `frontend oauth routes verified`.

- [ ] **Step 4: Install dependency check for frontend**

Run:

```bash
cd /d/claude-code/AI-Portal/portal
npm install --package-lock-only
```

Expected: command exits 0. This updates `portal/package-lock.json` only if package metadata/dependency resolution requires it.

- [ ] **Step 5: Run frontend build after route additions**

Run:

```bash
cd /d/claude-code/AI-Portal/portal
npm run build
```

Expected: build succeeds. If it fails due to missing imports from later tasks, record the exact error and continue to the dependent task before re-running build.

---

### Task 6: Align Login, Register, Profile, and Admin User Frontend Pages

**Files:**
- Modify: `portal/src/views/LoginView.vue`
- Modify: `portal/src/views/RegisterView.vue`
- Modify: `portal/src/views/ProfileView.vue`
- Modify: `portal/src/views/AdminUsersView.vue`

**Interfaces:**
- Consumes: OAuth frontend components from Task 5 and backend identity APIs from Task 4.
- Produces: user-facing OAuth login, registration gating UX, profile identity management, admin-created user UI.

- [ ] **Step 1: Copy source user/account pages into target**

Run:

```bash
cp /d/claude-code/AI-Portal/src/views/LoginView.vue /d/claude-code/AI-Portal/portal/src/views/LoginView.vue
cp /d/claude-code/AI-Portal/src/views/RegisterView.vue /d/claude-code/AI-Portal/portal/src/views/RegisterView.vue
cp /d/claude-code/AI-Portal/src/views/ProfileView.vue /d/claude-code/AI-Portal/portal/src/views/ProfileView.vue
cp /d/claude-code/AI-Portal/src/views/AdminUsersView.vue /d/claude-code/AI-Portal/portal/src/views/AdminUsersView.vue
```

Expected: target pages contain OAuth provider loading, account identity management, and `NewUserDialog` integration.

- [ ] **Step 2: Verify required frontend API paths exist**

Run:

```bash
python - <<'PY'
from pathlib import Path
root = Path('/d/claude-code/AI-Portal/portal/src/views')
checks = {
    'LoginView.vue': ['/api/auth/oauth/providers'],
    'RegisterView.vue': ['REGISTER_DISABLED'],
    'ProfileView.vue': ['/api/auth/identities', '/api/auth/password/set'],
    'AdminUsersView.vue': ['NewUserDialog'],
}
for file, needles in checks.items():
    text = (root / file).read_text(encoding='utf-8')
    for needle in needles:
        assert needle in text, f'{file} missing {needle}'
print('account page API paths verified')
PY
```

Expected output: `account page API paths verified`.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd /d/claude-code/AI-Portal/portal
npm run build
```

Expected: build succeeds or reports only missing files that are planned in the next task. If it reports missing imports not covered by the next task, fix the missing path by copying the corresponding source file from `AI-Portal/src` into `AI-Portal/portal/src`.

---

### Task 7: Align Admin Config, Navigation, Branding, and Announcement Frontend

**Files:**
- Modify: `portal/src/views/AdminConfigView.vue`
- Modify: `portal/src/views/AdminView.vue`
- Modify: `portal/src/views/AdminSkillsView.vue`
- Modify: `portal/src/App.vue`
- Modify: `portal/src/components/NavBar.vue`
- Modify: `portal/src/components/AnnouncementModal.vue`
- Modify: `portal/src/composables/useSiteBranding.js`
- Modify: `portal/src/composables/useAnnouncement.js`

**Interfaces:**
- Consumes: admin branding/announcement APIs from Task 4, OAuth admin component from Task 5.
- Produces: admin UI for gateway role selection, branding, announcement, and OAuth navigation.

- [ ] **Step 1: Copy source admin/branding frontend files into target**

Run:

```bash
cp /d/claude-code/AI-Portal/src/views/AdminConfigView.vue /d/claude-code/AI-Portal/portal/src/views/AdminConfigView.vue
cp /d/claude-code/AI-Portal/src/views/AdminView.vue /d/claude-code/AI-Portal/portal/src/views/AdminView.vue
cp /d/claude-code/AI-Portal/src/views/AdminSkillsView.vue /d/claude-code/AI-Portal/portal/src/views/AdminSkillsView.vue
cp /d/claude-code/AI-Portal/src/App.vue /d/claude-code/AI-Portal/portal/src/App.vue
cp /d/claude-code/AI-Portal/src/components/NavBar.vue /d/claude-code/AI-Portal/portal/src/components/NavBar.vue
cp /d/claude-code/AI-Portal/src/components/AnnouncementModal.vue /d/claude-code/AI-Portal/portal/src/components/AnnouncementModal.vue
cp /d/claude-code/AI-Portal/src/composables/useSiteBranding.js /d/claude-code/AI-Portal/portal/src/composables/useSiteBranding.js
cp /d/claude-code/AI-Portal/src/composables/useAnnouncement.js /d/claude-code/AI-Portal/portal/src/composables/useAnnouncement.js
```

Expected: admin config page contains role select, branding settings, announcement settings, and `/admin/oauth` entry.

- [ ] **Step 2: Verify admin UI strings and API paths exist**

Run:

```bash
python - <<'PY'
from pathlib import Path
root = Path('/d/claude-code/AI-Portal/portal/src')
checks = {
    'views/AdminConfigView.vue': ['/api/admin/branding', '/api/admin/announcement', 'panelUserRoleId'],
    'views/AdminView.vue': ['/admin/oauth'],
    'views/AdminSkillsView.vue': ['/admin/oauth'],
    'components/NavBar.vue': ['/api/site/branding'],
    'components/AnnouncementModal.vue': ['/api/site/announcement'],
}
for rel, needles in checks.items():
    text = (root / rel).read_text(encoding='utf-8')
    for needle in needles:
        assert needle in text, f'{rel} missing {needle}'
print('admin and branding frontend verified')
PY
```

Expected output: `admin and branding frontend verified`.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd /d/claude-code/AI-Portal/portal
npm run build
```

Expected: build succeeds. If it fails with a missing copied source component, copy the exact missing file from `D:/claude-code/AI-Portal/src/...` to `D:/claude-code/AI-Portal/portal/src/...` and rerun.

---

### Task 8: Apply AI-Portal Branding and Build Layout Changes

**Files:**
- Modify: `portal/vite.config.js`
- Modify: `portal/package.json`
- Modify: `server/package.json`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Create/Modify: `docs/1panel-api-gotchas.md`

**Interfaces:**
- Consumes: functional code from Tasks 2-7.
- Produces: AI-Portal-visible naming, Docker build compatible with `portal/`, dev proxy for `/uploads`, and copied 1Panel API gotchas doc.

- [ ] **Step 1: Copy source Vite config into target portal layout**

Run:

```bash
cp /d/claude-code/AI-Portal/vite.config.js /d/claude-code/AI-Portal/portal/vite.config.js
```

Expected: target config contains `replaceBasePath`, `base: './'`, and `/uploads` proxy.

- [ ] **Step 2: Rename frontend and backend package names**

Run:

```bash
python - <<'PY'
import json
from pathlib import Path
for rel, name, desc in [
    ('portal/package.json', 'ai-portal', 'AI-Portal frontend'),
    ('server/package.json', 'ai-portal-server', 'AI-Portal backend API service'),
]:
    p = Path('/d/claude-code/AI-Portal') / rel
    data = json.loads(p.read_text(encoding='utf-8'))
    data['name'] = name
    data['description'] = desc
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
```

Expected: `portal/package.json` name is `ai-portal`, `server/package.json` name is `ai-portal-server`.

- [ ] **Step 3: Adapt Dockerfile to `portal/` frontend layout**

Replace `D:\claude-code\AI-Portal\Dockerfile` with:

```dockerfile
# syntax=docker/dockerfile:1.6
# 多阶段构建：构建前端 + 安装后端依赖 + 运行时镜像

# ---- 阶段 1: 构建前端 ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app/portal

# 仅装前端依赖（用 package-lock.json 保证可复现）
COPY portal/package.json portal/package-lock.json ./
RUN npm ci

# 仅拷前端必需文件，避免把 server/cli/data 等拖进 builder
COPY portal/index.html portal/vite.config.js portal/tailwind.config.js portal/postcss.config.js ./
COPY portal/src ./src
COPY portal/public ./public

# 关键：覆盖 .env 中可能存在的 VITE_API_URL，确保 bundle 内调用走 /api
ENV VITE_API_URL=/api
RUN npm run build

# ---- 阶段 2: 安装后端生产依赖 ----
FROM node:20-alpine AS backend-deps
WORKDIR /app/server

# bcrypt 在部分平台需要源码编译，临时装编译工具，装完即删
RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev \
 && apk del .build-deps

# ---- 阶段 3: 运行时镜像 ----
FROM node:20-alpine
WORKDIR /app

# tini 作为 PID 1，处理僵尸进程 + 信号转发（双保险）
RUN apk add --no-cache tini

# 后端代码 + 生产依赖
COPY --from=backend-deps /app/server/node_modules ./node_modules
COPY server/ ./

# CLI 资源（如果运行时需要对外分发/打包 CLI，保留；没有 cli 时构建仍应失败提示目录缺失）
COPY cli/ ./cli/

# 前端构建产物
COPY --from=frontend-builder /app/portal/dist ./dist

# 上传目录预创建，与 docker-compose 卷挂载点对齐
RUN mkdir -p /app/data/uploads/skills /app/data/uploads/branding

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_STATIC=true \
    STATIC_PATH=/app/dist \
    LOCAL_STORAGE_PATH=/app/data/uploads/skills

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
```

Expected: Dockerfile no longer copies root `package.json` or root `src`.

- [ ] **Step 4: Update docker-compose visible names without changing runtime env semantics**

Run:

```bash
python - <<'PY'
from pathlib import Path
p = Path('/d/claude-code/AI-Portal/docker-compose.yml')
s = p.read_text(encoding='utf-8')
s = s.replace('AI-Portal Docker Compose', 'AI-Portal Docker Compose')
s = s.replace('swr.cn-north-4.myhuaweicloud.com/maxkb/1panel-ai-hub', 'swr.cn-north-4.myhuaweicloud.com/maxkb/ai-portal')
s = s.replace('container_name: 1panel-ai-hub-app', 'container_name: ai-portal-app')
s = s.replace('DB_NAME:-panel_ai_hub', 'DB_NAME:-ai_portal')
s = s.replace('默认 admin/admin123，⚠️ 部署后请立即登录管理后台改密', '留空则不自动创建管理员；设值需至少 8 位，部署后请立即登录管理后台改密')
s = s.replace('INIT_ADMIN_PASSWORD: ${INIT_ADMIN_PASSWORD-admin123}', 'INIT_ADMIN_PASSWORD: ${INIT_ADMIN_PASSWORD:-}')
p.write_text(s, encoding='utf-8')
PY
```

Expected: compose file uses `ai-portal` image/container naming and no longer defaults admin password to `admin123`.

- [ ] **Step 5: Update `.env.example` product naming and defaults**

Run:

```bash
python - <<'PY'
from pathlib import Path
p = Path('/d/claude-code/AI-Portal/.env.example')
s = p.read_text(encoding='utf-8')
s = s.replace('AI-Portal 环境变量配置', 'AI-Portal 环境变量配置')
s = s.replace('DB_NAME=panel_ai_hub', 'DB_NAME=ai_portal')
s = s.replace('/aihub/', '/ai-portal/')
s = s.replace('BASE_PATH=/aihub/', 'BASE_PATH=/ai-portal/')
s = s.replace('STATIC_PATH=./dist', 'STATIC_PATH=./dist')
p.write_text(s, encoding='utf-8')
PY
```

Expected: `.env.example` uses AI-Portal title and database example.

- [ ] **Step 6: Copy 1Panel API gotchas doc**

Run:

```bash
mkdir -p /d/claude-code/AI-Portal/docs
cp /d/claude-code/AI-Portal/docs/1panel-api-gotchas.md /d/claude-code/AI-Portal/docs/1panel-api-gotchas.md
```

Expected: doc exists at `AI-Portal/docs/1panel-api-gotchas.md`.

- [ ] **Step 7: Update AI-Portal Claude/Codex project guidance minimally**

Run:

```bash
python - <<'PY'
from pathlib import Path
for rel in ['CLAUDE.md', 'AGENTS.md']:
    p = Path('/d/claude-code/AI-Portal') / rel
    s = p.read_text(encoding='utf-8')
    s = s.replace('**AI-Portal**', '**AI-Portal**')
    s = s.replace('AI-Portal', 'AI-Portal')
    s = s.replace('仓库根：`D:\\claude-code\\AI-Portal`', '仓库根：`D:\\claude-code\\AI-Portal`')
    s = s.replace('AI-Portal/', 'AI-Portal/')
    s = s.replace('├── src/                  ← 前端', '├── portal/               ← 前端')
    s = s.replace('src/', 'portal/src/')
    p.write_text(s, encoding='utf-8')
PY
```

Expected: guidance names AI-Portal and references `portal/src` for frontend. If this over-replaces code examples, manually restore only incorrect examples; keep README unchanged.

- [ ] **Step 8: Replace user-visible default brand strings in source-controlled app files**

Run:

```bash
python - <<'PY'
from pathlib import Path
root = Path('/d/claude-code/AI-Portal')
patterns = ['portal/src/**/*.vue', 'portal/src/**/*.js', 'portal/index.html', 'server/migrations/*.sql']
for pattern in patterns:
    for p in root.glob(pattern):
        s = p.read_text(encoding='utf-8')
        original = s
        s = s.replace('AI-Portal', 'AI-Portal')
        s = s.replace('AI-Portal', 'AI-Portal')
        if s != original:
            p.write_text(s, encoding='utf-8')
PY
```

Expected: user-visible defaults now say AI-Portal. Do not run this against `LICENSE` or `README.md`.

---

### Task 9: Run Build and Backend Static Checks

**Files:**
- No planned source edits unless verification reveals a syntax/import error.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence of frontend build success and backend syntax/import sanity.

- [ ] **Step 1: Run frontend build**

Run:

```bash
cd /d/claude-code/AI-Portal/portal
npm run build
```

Expected: Vite build completes successfully and writes `portal/dist`.

- [ ] **Step 2: Syntax-check backend changed files**

Run:

```bash
cd /d/claude-code/AI-Portal/server
for f in auth.js app.js panel.js routes/admin.js routes/portal.js routes/oauth.js oauth/index.js oauth/wecom.js oauth/token-cache.js oauth/username-generator.js lib/state-store.js; do
  node --check "$f"
done
```

Expected: all files pass syntax check.

- [ ] **Step 3: Require-check backend modules without starting DB**

Run:

```bash
cd /d/claude-code/AI-Portal/server
JWT_SECRET=test-secret-for-require-check-only node - <<'NODE'
require('./auth');
require('./oauth');
require('./panel');
require('./routes/oauth');
console.log('core backend modules require successfully');
NODE
```

Expected output: `core backend modules require successfully`.

- [ ] **Step 4: Check for accidental forbidden file changes/staging**

Run:

```bash
git -C /d/claude-code/AI-Portal diff --cached --name-only
git -C /d/claude-code/AI-Portal status --short | sed -n '1,220p'
```

Expected: cached diff command prints nothing. Status may list many untracked files because AI-Portal app code is mostly untracked; verify `.env`, `node_modules`, and `data` are not newly staged.

- [ ] **Step 5: Scan for remaining user-visible old brand strings outside README/LICENSE**

Run:

```bash
python - <<'PY'
from pathlib import Path
root = Path('/d/claude-code/AI-Portal')
skip_parts = {'node_modules', '.git', 'data'}
skip_names = {'README.md', 'LICENSE'}
for p in root.rglob('*'):
    if not p.is_file():
        continue
    if any(part in skip_parts for part in p.parts):
        continue
    if p.name in skip_names:
        continue
    try:
        s = p.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    if 'AI-Portal' in s or 'AI-Portal' in s:
        print(p)
PY
```

Expected: no output, or only internal historical notes where keeping the old source-project name is intentional. Do not change `LICENSE`; avoid changing `README.md` unless required.

---

### Task 10: Optional Runtime Smoke Checks

**Files:**
- No planned source edits unless smoke checks reveal a concrete runtime error.

**Interfaces:**
- Consumes: build and backend checks from Task 9.
- Produces: runtime verification notes for public APIs and startup blockers.

- [ ] **Step 1: Attempt backend startup only if environment is configured**

Run:

```bash
cd /d/claude-code/AI-Portal/server
npm start
```

Expected if env and DB are configured: server starts, migrations run, and logs show service listening. Expected if not configured: explicit blocker such as missing `JWT_SECRET` or database connection failure. Record the blocker; do not claim runtime verification passed.

- [ ] **Step 2: If backend is running, check public APIs**

Run in a second shell if server is running on port 3002:

```bash
curl -sS http://localhost:3002/api/health
curl -sS http://localhost:3002/api/site/branding
curl -sS http://localhost:3002/api/site/announcement
curl -sS http://localhost:3002/api/auth/oauth/providers
```

Expected:

- `/api/health` returns JSON health status.
- `/api/site/branding` returns JSON with `site_name` defaulting to `AI-Portal` if DB config is empty.
- `/api/site/announcement` returns JSON booleans and HTML strings.
- `/api/auth/oauth/providers` returns an empty provider list or disabled providers when none are configured.

- [ ] **Step 3: If admin token is available, check admin APIs**

Run, replacing `$ADMIN_TOKEN` with a valid admin token:

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3002/api/admin/panel-config
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3002/api/admin/oauth/providers
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3002/api/admin/branding
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3002/api/admin/announcement
```

Expected: each endpoint returns JSON and does not 500. If no admin token is available, record that admin API smoke checks were skipped.

---

## Self-Review Notes

- Spec coverage: tasks cover schema, OAuth backend, app wiring, panel role config, portal/admin route APIs, OAuth/frontend account flows, admin config/users, branding/announcement, Vite, Dockerfile, env example, docs, verification, and no-git constraint.
- Placeholder scan: this plan intentionally contains no TBD/TODO/fill-in steps. The only manual substitutions are command-output insertion into the baseline file, with exact source files specified.
- Type consistency: planned backend interface names match source naming: `signOauthTicket`, `signOauthBindingTicket`, `consumeTicket`, `getPanelRoles`, `getPanelUserRoleId`, `isAnyProviderEnabled`.
