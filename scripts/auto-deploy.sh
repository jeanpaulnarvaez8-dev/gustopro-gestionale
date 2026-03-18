#!/bin/bash
# ─────────────────────────────────────────────────────
# GustoPro — Auto Deploy Script — v1.5
# Controlla GitHub ogni 5 min. Se ci sono nuovi commit
# fa git pull + docker compose build + up -d
#
# Setup (una volta sola in ufficio):
#   chmod +x /share/ZFS20_DATA/dev-projects/gustopro-gestionale/scripts/auto-deploy.sh
#   crontab -e
#   Aggiungere: */5 * * * * /share/ZFS20_DATA/dev-projects/gustopro-gestionale/scripts/auto-deploy.sh >> /share/ZFS20_DATA/dev-projects/gustopro-gestionale/logs/deploy.log 2>&1
# ─────────────────────────────────────────────────────

export PATH="/share/ZFS530_DATA/.qpkg/container-station/bin:/opt/bin:/opt/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/share/ZFS20_DATA/dev-projects/gustopro-gestionale"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

cd "$PROJECT_DIR" || { echo "$LOG_PREFIX ERRORE: directory non trovata $PROJECT_DIR"; exit 1; }

# Scarica info dal remoto senza applicare
# -c safe.directory evita "dubious ownership" quando lo script gira come root
GIT="git -c safe.directory=$PROJECT_DIR"

$GIT fetch origin main --quiet

LOCAL=$($GIT rev-parse HEAD)
REMOTE=$($GIT rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  # Nessuna modifica — niente da fare (nessun log per non riempire il file)
  exit 0
fi

echo "$LOG_PREFIX Nuovi commit rilevati. Avvio deploy..."
echo "$LOG_PREFIX Commit locale:  $LOCAL"
echo "$LOG_PREFIX Commit remoto:  $REMOTE"

# Scarta modifiche locali e allinea al remoto
$GIT reset --hard origin/main
if [ $? -ne 0 ]; then
  echo "$LOG_PREFIX ERRORE: git reset fallito"
  exit 1
fi
echo "$LOG_PREFIX git reset completato"

# Esegui migration SQL pendenti
MIGRATIONS_DIR="$PROJECT_DIR/migrations"
DB_CONTAINER="gestionale-postgres"
DB_USER="gustopro"
DB_NAME="gustopro"

# Crea tabella di tracking se non esiste
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  );
" > /dev/null 2>&1

if [ -d "$MIGRATIONS_DIR" ]; then
  for f in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    filename=$(basename "$f")
    already=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM schema_migrations WHERE filename='$filename'")
    if [ "$already" != "1" ]; then
      echo "$LOG_PREFIX Eseguo migration: $filename"
      docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$f"
      if [ $? -eq 0 ]; then
        docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO schema_migrations (filename) VALUES ('$filename');" > /dev/null
        echo "$LOG_PREFIX Migration completata: $filename"
      else
        echo "$LOG_PREFIX ERRORE migration: $filename"
      fi
    fi
  done
fi

# Rebuild e riavvio container
docker compose build --no-cache
if [ $? -ne 0 ]; then
  echo "$LOG_PREFIX ERRORE: docker compose build fallito"
  exit 1
fi

docker compose up -d
if [ $? -ne 0 ]; then
  echo "$LOG_PREFIX ERRORE: docker compose up fallito"
  exit 1
fi

echo "$LOG_PREFIX Deploy completato con successo"
echo "────────────────────────────────────────"
