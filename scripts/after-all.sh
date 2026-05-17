#!/bin/bash
# after-all.sh — Troisième vague d'ingest, lance après la fin de after-rpps.sh (PID 7091).
# Usage : nohup bash scripts/after-all.sh <AFTER_RPPS_PID> > logs/after-all.log 2>&1 &
#
# Couvre : experts-comptables (manquant de after-rpps.sh)
# + professions AE haute valeur patrimoniale non couvertes par les vagues précédentes

set -e
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

AFTER_RPPS_PID="${1:-}"
LOG="logs/after-all-$(date +%Y%m%d-%H%M%S).log"
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

# Attendre la fin de after-rpps.sh si un PID est fourni
if [ -n "$AFTER_RPPS_PID" ]; then
  log "En attente de la fin de after-rpps.sh (PID $AFTER_RPPS_PID)..."
  while kill -0 "$AFTER_RPPS_PID" 2>/dev/null; do
    sleep 60
  done
  log "after-rpps.sh terminé. Démarrage de la vague 3."
fi

# 1. Experts-comptables — NAF 69.20Z (~20k attendus)
#    Manquant de after-rpps.sh, haute valeur patrimoniale (revenus 150-400k€/an)
run "Experts-comptables (NAF 69.20Z)" scripts/ingest-experts-comptables.ts

# 2. Professions AE complémentaires — NAF supplémentaires haute valeur
#    Repasse uniquement les professions à forte densité non couvertes par la vague 2
for prof in architectes veterinaires geometres; do
  run "Autres libéraux — $prof (refresh)" scripts/ingest-autres-liberaux.ts --profession "$prof"
done

log ""
log "╔══════════════════════════════════════╗"
log "║  PIPELINE VAGUE 3 COMPLET — $(date '+%H:%M:%S')  ║"
log "╚══════════════════════════════════════╝"
