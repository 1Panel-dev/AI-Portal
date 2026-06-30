#!/bin/sh
set -e

PGDATA=/app/data/pgdata

# 首次初始化
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  su postgres -c "initdb -D $PGDATA --auth-host=trust"
  su postgres -c "pg_ctl -D $PGDATA -w start"
  su postgres -c "createuser aiportal" 2>/dev/null || true
  su postgres -c "createdb -O aiportal ai_portal" 2>/dev/null || true
  su postgres -c "pg_ctl -D $PGDATA -w stop"
fi

su postgres -c "pg_ctl -D $PGDATA -w start"
until su postgres -c "pg_isready -q"; do sleep 1; done
exec node /app/index.js
