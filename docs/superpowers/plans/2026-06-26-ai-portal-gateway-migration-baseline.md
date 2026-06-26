# AI-Portal Gateway Migration Baseline

Date: 2026-06-26

## Target git state before migration

```text
## main...origin/main
?? .dockerignore
?? .env.example
?? .gitattributes
?? AGENTS.md
?? CLAUDE.md
?? Dockerfile
?? cli/
?? docker-compose.yml
?? docs/
?? portal/
?? server/
?? update.sh
```

## Target tracked files before migration

```text
.gitignore
LICENSE
README.md
```

## Source state

```text
## feat/1panel-skill-lifecycle...origin/feat/1panel-skill-lifecycle [ahead 56]
 M server/panel.js
?? docs/superpowers/plans/2026-06-26-panel-user-description-text.md
```

Source HEAD:

```text
05434fb8980b9c4789b736e66c3b8056d2c618e9
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
