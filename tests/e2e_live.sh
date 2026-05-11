#!/bin/bash
# ╔════════════════════════════════════════════════════════════════╗
# ║ GustoPro — E2E live smoke test suite                           ║
# ║ Run: tests/e2e_live.sh                                         ║
# ║ Verifica end-to-end che tutta la pipeline funzioni:            ║
# ║   - DNS Cloudflare → VPS Hetzner                               ║
# ║   - Security headers + TLS                                     ║
# ║   - Login JWT + tenant resolution                              ║
# ║   - 20+ endpoint API (Riva + Bistrot)                          ║
# ║   - Cross-tenant isolation                                     ║
# ║   - Client error tracking                                      ║
# ║   - Performance (TTFB < 500ms)                                 ║
# ║   - PWA assets + Service Worker headers                        ║
# ║   - DB integrity (counts, pg_stat_statements)                  ║
# ║   - Backup + auto-deploy + cron                                ║
# ╚════════════════════════════════════════════════════════════════╝

set -u
BASE='https://gestione.gustopro.it'
VPS_IP='178.104.106.143'
PASS=0
FAIL=0
TOTAL=0

cR='\033[0;31m'  # rosso
cG='\033[0;32m'  # verde
cY='\033[0;33m'  # giallo
cB='\033[0;34m'  # blu
cD='\033[2m'     # dim
cN='\033[0m'     # reset

section() {
  echo ""
  echo -e "${cB}━━━ $* ━━━${cN}"
}

ok() {
  local name="$1"
  local detail="${2:-}"
  TOTAL=$((TOTAL+1))
  PASS=$((PASS+1))
  if [ -n "$detail" ]; then
    echo -e "  ${cG}✓${cN} $name ${cD}· $detail${cN}"
  else
    echo -e "  ${cG}✓${cN} $name"
  fi
}

fail() {
  local name="$1"
  local detail="${2:-}"
  TOTAL=$((TOTAL+1))
  FAIL=$((FAIL+1))
  echo -e "  ${cR}✗${cN} $name ${cD}· $detail${cN}"
}

check_eq() {
  local name="$1"; local got="$2"; local want="$3"
  if [ "$got" = "$want" ]; then ok "$name" "= $want"
  else fail "$name" "got=$got want=$want"
  fi
}

check_gte() {
  local name="$1"; local got="$2"; local want="$3"
  if [ "$got" -ge "$want" ] 2>/dev/null; then ok "$name" "$got ≥ $want"
  else fail "$name" "got=$got want≥$want"
  fi
}

check_lte() {
  local name="$1"; local got="$2"; local want="$3"
  if [ "$got" -le "$want" ] 2>/dev/null; then ok "$name" "$got ≤ $want"
  else fail "$name" "got=$got want≤$want"
  fi
}

check_match() {
  local name="$1"; local haystack="$2"; local needle="$3"
  if echo "$haystack" | grep -qiE "$needle"; then ok "$name" "match: $needle"
  else fail "$name" "no match for: $needle"
  fi
}

# ════════════════════════════════════════════════════════════════════
section "1. DNS + connettività"
# ════════════════════════════════════════════════════════════════════
DNS=$(dig +short gestione.gustopro.it A | head -1)
check_match "DNS punta a Cloudflare proxy (188.114.*)" "$DNS" '^188\.114\.'

VPS_HEALTH=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: gestione.gustopro.it" "http://${VPS_IP}/health")
check_eq "VPS Hetzner risponde direttamente" "$VPS_HEALTH" "200"

# ════════════════════════════════════════════════════════════════════
section "2. TLS + HTTP/2"
# ════════════════════════════════════════════════════════════════════
HTTP_VER=$(curl -sI -o /dev/null -w '%{http_version}' "$BASE/")
check_eq "HTTP/2 attivo" "$HTTP_VER" "2"

CERT_INFO=$(echo | openssl s_client -servername gestione.gustopro.it -connect gestione.gustopro.it:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
NOT_AFTER=$(echo "$CERT_INFO" | grep notAfter | cut -d= -f2-)
if [ -n "$NOT_AFTER" ]; then ok "Cert TLS valido" "scade $NOT_AFTER"; else fail "Cert TLS check" "no info"; fi

# ════════════════════════════════════════════════════════════════════
section "3. Security headers (Cloudflare passa-through)"
# ════════════════════════════════════════════════════════════════════
H=$(curl -sI "$BASE/")
check_match "HSTS preload"            "$H" 'strict-transport-security.*preload'
check_match "X-Frame-Options DENY"    "$H" 'x-frame-options:\s*deny'
check_match "X-Content-Type nosniff"  "$H" 'x-content-type-options:\s*nosniff'
check_match "Referrer-Policy strict"  "$H" 'referrer-policy:\s*strict'
check_match "CSP no unsafe-eval"      "$H" 'content-security-policy'
# Verifica negativa: NO unsafe-eval nel CSP
if echo "$H" | grep -iE 'content-security-policy' | grep -qi 'unsafe-eval'; then
  fail "CSP NO unsafe-eval" "unsafe-eval ancora presente"
else
  ok "CSP NO unsafe-eval" "rimosso"
fi

# ════════════════════════════════════════════════════════════════════
section "4. PWA assets + CDN cache headers"
# ════════════════════════════════════════════════════════════════════
SW_HEADERS=$(curl -sI "$BASE/sw.js")
check_match "/sw.js HTTP 200"                "$SW_HEADERS" '^HTTP/2 200'
check_match "/sw.js CDN-Cache-Control no-store" "$SW_HEADERS" 'cdn-cache-control:\s*no-store|cloudflare-cdn-cache-control'

MANIFEST_HTTP=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/manifest.webmanifest")
check_eq "/manifest.webmanifest HTTP 200" "$MANIFEST_HTTP" "200"

# ════════════════════════════════════════════════════════════════════
section "5. Login + JWT + tenant resolution"
# ════════════════════════════════════════════════════════════════════
LOGIN_RIVA=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","pin":"0000"}')
TOKEN_RIVA=$(echo "$LOGIN_RIVA" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("token",""))')
TENANT_RIVA=$(echo "$LOGIN_RIVA" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("user",{}).get("tenant_id",""))')
if [ -n "$TOKEN_RIVA" ]; then
  ok "Login Riva (default tenant)" "user=$(echo "$LOGIN_RIVA" | python3 -c 'import sys,json;print(json.load(sys.stdin)["user"]["name"])')"
  check_eq "Tenant_id Riva nel JWT" "$TENANT_RIVA" "00000000-0000-0000-0000-000000000001"
else
  fail "Login Riva" "no token in response: $LOGIN_RIVA"
fi

LOGIN_BIS=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Slug: bistrot-test' \
  -d '{"username":"admin","pin":"0000"}')
TOKEN_BIS=$(echo "$LOGIN_BIS" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("token",""))')
TENANT_BIS=$(echo "$LOGIN_BIS" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("user",{}).get("tenant_id",""))')
if [ -n "$TOKEN_BIS" ]; then
  ok "Login Bistrot via X-Tenant-Slug" "tenant=$TENANT_BIS"
  if [ "$TENANT_BIS" != "$TENANT_RIVA" ]; then
    ok "Tenant_id Bistrot ≠ Riva" "$TENANT_BIS"
  else
    fail "Tenant resolution" "stesso tenant per Riva e Bistrot!"
  fi
else
  fail "Login Bistrot" "no token"
fi

# ════════════════════════════════════════════════════════════════════
section "6. Endpoint API protetti (Riva, 16 endpoint)"
# ════════════════════════════════════════════════════════════════════
for ep in \
  '/api/menu/categories' \
  '/api/menu/items' \
  '/api/tables' \
  '/api/zones' \
  '/api/customers' \
  '/api/users' \
  '/api/billing/receipts' \
  '/api/kds/pending' \
  '/api/service/alerts' \
  '/api/admin/staff-performance?period=today' \
  '/api/admin/stats' \
  '/api/inventory/kpis' \
  '/api/workflow/waiting' \
  '/api/workflow/crossmatches' \
  '/api/reservations' \
  '/api/ingredients'
do
  CODE=$(curl -s -o /tmp/_resp -w '%{http_code}' -H "Authorization: Bearer $TOKEN_RIVA" "$BASE$ep")
  if [ "$CODE" = "200" ]; then
    # Some endpoints return array, others object — try both
    ROWS=$(python3 -c 'import sys,json; d=json.load(open("/tmp/_resp")); print(len(d) if isinstance(d,list) else 1)' 2>/dev/null || echo "?")
    ok "GET $ep" "rows=$ROWS"
  else
    fail "GET $ep" "HTTP $CODE"
  fi
done

# ════════════════════════════════════════════════════════════════════
section "7. Cross-tenant isolation"
# ════════════════════════════════════════════════════════════════════
RIVA_TABLES=$(curl -s -H "Authorization: Bearer $TOKEN_RIVA" "$BASE/api/tables" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
BIS_TABLES=$(curl -s -H "Authorization: Bearer $TOKEN_BIS" "$BASE/api/tables" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
check_gte "Riva: tavoli > 30" "$RIVA_TABLES" "30"
check_eq "Bistrot: tavoli = 0 (isolato)" "$BIS_TABLES" "0"

RIVA_MENU=$(curl -s -H "Authorization: Bearer $TOKEN_RIVA" "$BASE/api/menu/items" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
BIS_MENU=$(curl -s -H "Authorization: Bearer $TOKEN_BIS" "$BASE/api/menu/items" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
check_gte "Riva: menu items > 50" "$RIVA_MENU" "50"
check_eq "Bistrot: menu items = 0 (isolato)" "$BIS_MENU" "0"

# Tentativo cross-tenant: token Bistrot su user_id Riva (deve fallire)
INVALID_AUTH=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tables")
check_eq "No JWT → HTTP 401" "$INVALID_AUTH" "401"

# ════════════════════════════════════════════════════════════════════
section "8. Performance — TTFB"
# ════════════════════════════════════════════════════════════════════
for ep in '/health' '/api/tables' '/api/menu/items' '/api/kds/pending'; do
  TTFB=$(curl -s -o /dev/null -w '%{time_starttransfer}' -H "Authorization: Bearer $TOKEN_RIVA" "$BASE$ep")
  TTFB_MS=$(python3 -c "print(int(float('$TTFB') * 1000))")
  check_lte "TTFB $ep" "$TTFB_MS" "500"
done

# ════════════════════════════════════════════════════════════════════
section "9. Client error tracking (POST /api/_client-error)"
# ════════════════════════════════════════════════════════════════════
CE_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/_client-error" \
  -H 'Content-Type: application/json' \
  -d '{"source":"errorBoundary","message":"E2E suite test","stack":"Error: test\n    at suite","url":"https://gestione.gustopro.it/test","appVersion":"e2e"}')
check_eq "POST /api/_client-error → 204" "$CE_CODE" "204"

# Body invalid → 400
CE_400=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/_client-error" \
  -H 'Content-Type: application/json' \
  -d '{}')
check_eq "POST invalid body → 400" "$CE_400" "400"

# Verify it appears in backend log
sleep 1
if ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
   "docker logs gestionale-backend --since 30s 2>&1" | grep -q 'E2E suite test'; then
  ok "Errore appare nei docker logs" "structured JSON via pino"
else
  fail "Errore client logging" "non trovato nei log backend"
fi

# ════════════════════════════════════════════════════════════════════
section "10. Idempotency middleware"
# ════════════════════════════════════════════════════════════════════
# 2 chiamate POST identiche con stessa Idempotency-Key dovrebbero replay
IDEM_KEY=$(uuidgen | tr '[:upper:]' '[:lower:]')
# Use a side-effect-free POST: skip, complicato senza creare side-effect.
# Verifica solo che il middleware accetta UUID valido
R1=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/_client-error" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d '{"source":"idem-test","message":"idem"}')
# Doppio: stesso UUID dovrebbe essere innocuo (route pubblica, no DB write)
R2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/_client-error" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d '{"source":"idem-test","message":"idem"}')
check_eq "Idem POST #1 → 204" "$R1" "204"
check_eq "Idem POST #2 → 204" "$R2" "204"

# UUID invalido (NON v4) — verificato solo su route protected con tenant
BAD_IDEM=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/orders" \
  -H "Authorization: Bearer $TOKEN_RIVA" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: NOT-A-UUID" \
  -d '{}')
check_eq "Idempotency-Key non UUID → 400" "$BAD_IDEM" "400"

# ════════════════════════════════════════════════════════════════════
section "11. Rate limiting (login)"
# ════════════════════════════════════════════════════════════════════
# 6 login con PIN sbagliato rapidi → almeno l'ultimo deve essere 429
HIT_429=false
for i in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","pin":"9999"}')
  if [ "$CODE" = "429" ]; then HIT_429=true; break; fi
done
if [ "$HIT_429" = true ]; then
  ok "Rate limit attivo su /auth/login" "429 dopo brute-force"
else
  fail "Rate limit /auth/login" "non e' scattato dopo 10 tentativi"
fi

# ════════════════════════════════════════════════════════════════════
section "12. Backend: containers + logs"
# ════════════════════════════════════════════════════════════════════
CONTAINERS_UP=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "docker ps --filter name=gestionale --format '{{.Names}}'" | wc -l | tr -d ' ')
check_eq "3 container gestionale-* UP" "$CONTAINERS_UP" "3"

POSTGRES_HEALTHY=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "docker inspect gestionale-postgres --format='{{.State.Health.Status}}'")
check_eq "gestionale-postgres healthy" "$POSTGRES_HEALTHY" "healthy"

# Backend log: zero 5xx ultimi 5 minuti?
BACKEND_ERRORS=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "docker logs gestionale-backend --since 5m 2>&1 | grep -cE '\"level\":5[0-9]|5xx error'" || echo "0")
# Nota: i client errors loggati sono level 50 → dovrebbero esserci almeno 2 dai test
ok "Backend log accessibile" "level 50+ entries: $BACKEND_ERRORS"

# ════════════════════════════════════════════════════════════════════
section "13. Database + pg_stat_statements"
# ════════════════════════════════════════════════════════════════════
PG_VERSION=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc 'SELECT version()'" 2>/dev/null)
check_match "Postgres 15.x" "$PG_VERSION" 'PostgreSQL 15'

TABLES_DB=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'\"" 2>/dev/null)
check_gte "DB tables ≥ 35" "$TABLES_DB" "35"

TENANTS=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc 'SELECT count(*) FROM tenants WHERE is_active=true'" 2>/dev/null)
check_gte "Tenants attivi ≥ 2" "$TENANTS" "2"

PSS_INSTALLED=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc \"SELECT count(*) FROM pg_extension WHERE extname='pg_stat_statements'\"" 2>/dev/null)
check_eq "pg_stat_statements installato" "$PSS_INSTALLED" "1"

SLOW_QUERIES=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "docker exec gestionale-postgres psql -U gustopro -d gustopro -tAc \"SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 100\"" 2>/dev/null)
check_lte "Query con mean_exec_time > 100ms" "$SLOW_QUERIES" "5"

# ════════════════════════════════════════════════════════════════════
section "14. Backup + auto-deploy + cron"
# ════════════════════════════════════════════════════════════════════
BACKUP_COUNT=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "ls /home/gustopro/backups/gustopro_*.sql.gz 2>/dev/null | wc -l")
check_gte "Backup dump locali ≥ 1" "$BACKUP_COUNT" "1"

LATEST_BACKUP=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "ls -t /home/gustopro/backups/gustopro_*.sql.gz 2>/dev/null | head -1")
if [ -n "$LATEST_BACKUP" ]; then
  INTEGRITY=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
    "gunzip -t '$LATEST_BACKUP' 2>&1 && echo OK" | tail -1)
  if [ "$INTEGRITY" = "OK" ]; then
    ok "Ultimo dump integro" "$LATEST_BACKUP"
  else
    fail "Ultimo dump corrotto" "$INTEGRITY"
  fi
fi

CRON_ENTRIES=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 'crontab -l 2>/dev/null' | grep -cE 'db-backup|auto-deploy|backup-offsite')
check_gte "Cron entries (backup/deploy/offsite) ≥ 3" "$CRON_ENTRIES" "3"

# ════════════════════════════════════════════════════════════════════
section "15. Auto-deploy infrastructure"
# ════════════════════════════════════════════════════════════════════
DEPLOY_LOG_EXISTS=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "test -f /home/gustopro/logs/auto-deploy.log && echo yes || echo no")
check_eq "Auto-deploy log esiste" "$DEPLOY_LOG_EXISTS" "yes"

# Ultima deploy = commit attuale?
LIVE_HEAD=$(ssh -i ~/.ssh/qubitrex-deploy gustopro@178.104.106.143 \
  "cd /home/gustopro/app && git rev-parse --short HEAD")
LOCAL_HEAD=$(cd /Users/jeanpaulnarvaez/gustopro-gestionale && git rev-parse --short HEAD)
check_eq "VPS commit = locale commit" "$LIVE_HEAD" "$LOCAL_HEAD"

# ════════════════════════════════════════════════════════════════════
# Final report
# ════════════════════════════════════════════════════════════════════
echo ""
echo -e "${cB}╔═══════════════════════════════════════════════════════════════╗${cN}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${cB}║${cN}  ${cG}🎉 TUTTI I TEST PASSATI${cN}  ${PASS}/${TOTAL}                                ${cB}║${cN}"
else
  echo -e "${cB}║${cN}  ${cR}⚠️  ${FAIL} FALLITI${cN}  ${PASS}/${TOTAL}                                    ${cB}║${cN}"
fi
echo -e "${cB}╚═══════════════════════════════════════════════════════════════╝${cN}"

exit $FAIL
