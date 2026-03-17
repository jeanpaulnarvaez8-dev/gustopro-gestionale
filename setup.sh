#!/bin/sh
# setup.sh — GustoPro Gestionale
# Esegui una volta sul server QNAP: sh setup.sh
# Per aggiornare: sh setup.sh --update

SSH_KEY="/share/HDA_DATA/id_ed25519"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
UPDATE_ONLY=0

if [ "$1" = "--update" ]; then
  UPDATE_ONLY=1
fi

echo ""
echo "============================================="
echo "  GustoPro Gestionale — Setup QNAP"
echo "============================================="
echo "  Dir: $REPO_DIR"
echo ""

# ── 1. Git SSH ────────────────────────────────────
echo "[1/4] Configuro git SSH..."
git -C "$REPO_DIR" config core.sshCommand "ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
echo "      OK"

# ── 2. .env ───────────────────────────────────────
if [ "$UPDATE_ONLY" = "0" ]; then
  if [ ! -f "$REPO_DIR/.env" ]; then
    echo ""
    echo "[2/4] Creo il file .env (inserisci le credenziali)..."
    printf "  POSTGRES_PASSWORD: "
    read POSTGRES_PASSWORD
    printf "  JWT_SECRET (stringa lunga random): "
    read JWT_SECRET
    cat > "$REPO_DIR/.env" << EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
EOF
    echo "      .env creato"
  else
    echo "[2/4] .env già presente — skip"
  fi
else
  echo "[2/4] Modalità --update: .env non toccato"
fi

# ── 3. Pull ───────────────────────────────────────
echo ""
echo "[3/4] Pull da GitHub (main)..."
GIT_SSH_COMMAND="ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  git -C "$REPO_DIR" pull origin main
echo "      OK"

# ── 4. Docker ─────────────────────────────────────
echo ""
echo "[4/4] Build e avvio containers Docker..."
docker-compose -f "$REPO_DIR/docker-compose.yml" up -d --build

echo ""
echo "============================================="
echo "  Setup completato!"
echo "============================================="
IP=$(hostname -i 2>/dev/null || echo "IP-QNAP")
echo "  Backend  → http://${IP}:3011"
echo "  Frontend → http://${IP}:3012"
echo ""
echo "  Comandi utili:"
echo "    Ver log:    docker-compose -f $REPO_DIR/docker-compose.yml logs -f"
echo "    Stop:       docker-compose -f $REPO_DIR/docker-compose.yml down"
echo "    Aggiorna:   sh $REPO_DIR/setup.sh --update"
echo ""
