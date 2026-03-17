#!/bin/bash
# ─────────────────────────────────────────────────────
# GustoPro — Auto Deploy Script
# Controlla GitHub ogni 5 min. Se ci sono nuovi commit
# fa git pull + docker compose build + up -d
#
# Setup (una volta sola in ufficio):
#   chmod +x /share/ZFS20_DATA/dev-projects/gustopro-gestionale/scripts/auto-deploy.sh
#   crontab -e
#   Aggiungere: */5 * * * * /share/ZFS20_DATA/dev-projects/gustopro-gestionale/scripts/auto-deploy.sh >> /share/ZFS20_DATA/dev-projects/gustopro-gestionale/logs/deploy.log 2>&1
# ─────────────────────────────────────────────────────

PROJECT_DIR="/share/ZFS20_DATA/dev-projects/gustopro-gestionale"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

cd "$PROJECT_DIR" || { echo "$LOG_PREFIX ERRORE: directory non trovata $PROJECT_DIR"; exit 1; }

# Scarica info dal remoto senza applicare
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  # Nessuna modifica — niente da fare (nessun log per non riempire il file)
  exit 0
fi

echo "$LOG_PREFIX Nuovi commit rilevati. Avvio deploy..."
echo "$LOG_PREFIX Commit locale:  $LOCAL"
echo "$LOG_PREFIX Commit remoto:  $REMOTE"

# Pull
git pull origin main
if [ $? -ne 0 ]; then
  echo "$LOG_PREFIX ERRORE: git pull fallito"
  exit 1
fi
echo "$LOG_PREFIX git pull completato"

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
