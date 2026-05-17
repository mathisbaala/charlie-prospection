#!/bin/bash
# after-rpps.sh — Lance les scripts d'ingest séquentiellement après la fin du RPPS.
# Usage : nohup bash scripts/after-rpps.sh <RPPS_PID> > logs/after-rpps.log 2>&1 &

set -e
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

RPPS_PID="${1:-}"
LOG="logs/after-rpps-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

run() {
  local name="$1"; shift
  log ""
  log "════════════════════════════════════════════"
  log "  $name"
  log "════════════════════════════════════════════"
  npx tsx "$@" 2>&1 | tee -a "$LOG"
  log "  ✓ $name terminé"
}

# Attendre la fin du RPPS si un PID est fourni
if [ -n "$RPPS_PID" ]; then
  log "En attente de la fin du RPPS (PID $RPPS_PID)..."
  while kill -0 "$RPPS_PID" 2>/dev/null; do
    sleep 60
  done
  log "RPPS terminé. Démarrage des scripts suivants."
fi

# 1. Médecins libéraux SELAS/SELARL (NAF 86.22A/B/C + 86.21Z)
run "Médecins SELAS/SELARL" scripts/ingest-medecins-selas.ts

# 2. Pharmacies, dentistes SELAS, kinés SELAS (NAF 47.73Z, 86.23Z, 86.90E)
run "AE Complémentaires (pharmacies, dentistes, kinés)" scripts/ingest-professions-ae-complement.ts

# 3. Autres libéraux — 9 professions séquentielles
for prof in huissiers courtiers_assurance conseillers_financiers agents_assurance osteopathes psychologues experts_judiciaires commissaires_priseurs agents_immo; do
  run "Autres libéraux — $prof" scripts/ingest-autres-liberaux.ts --profession "$prof"
done

# 4. Avocats — relance complète (~70k attendus)
run "Avocats (NAF 69.10Z)" scripts/ingest-avocats-cnb.ts

# 5. Notaires — relance (~10k attendus)
run "Notaires (NAF 69.10Z)" scripts/ingest-notaires.ts

# 6. Biologistes médicaux
run "Biologistes médicaux (AE 86.90B + RPPS)" scripts/ingest-biologistes-medicaux.ts

log ""
log "╔══════════════════════════════════════╗"
log "║  PIPELINE NUIT COMPLET — $(date '+%H:%M:%S')  ║"
log "╚══════════════════════════════════════╝"
