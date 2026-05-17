#!/bin/bash
# run-all-ingest.sh — Lance tous les scripts d'ingest en séquence avec log.
# Usage : bash scripts/run-all-ingest.sh
# Usage fond de tâche : nohup bash scripts/run-all-ingest.sh > logs/run-all.log 2>&1 &

set -e
cd "$(dirname "$0")/.."

LOG="logs/ingest-$(date +%Y%m%d-%H%M%S).log"
echo "Log : $LOG"

run() {
  local name="$1"; shift
  echo "" | tee -a "$LOG"
  echo "════════════════════════════════════════════" | tee -a "$LOG"
  echo "  $name — $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG"
  echo "════════════════════════════════════════════" | tee -a "$LOG"
  npx tsx "$@" 2>&1 | tee -a "$LOG"
  echo "  ✓ $name terminé — $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG"
}

# 1. RPPS — le plus rapide et le plus haut volume (645k libéraux)
run "RPPS professions de santé" scripts/ingest-rpps-bulk.ts

# 2. Juridiques (NAF 69.10Z) — avocats + notaires, même source, séquentiels
run "Avocats (AE NAF 69.10Z)" scripts/ingest-avocats-cnb.ts
run "Notaires (AE NAF 69.10Z)" scripts/ingest-notaires.ts

# 3. Experts-comptables (NAF 69.20Z)
run "Experts-comptables (AE NAF 69.20Z)" scripts/ingest-experts-comptables.ts

# 4. Autres libéraux — architectes, vétérinaires, géomètres, huissiers
#    + financiers — courtiers assurance (66.22Z), CGPI/CIF (64.99Z), agents assurance (66.19Z)
run "Autres libéraux + financiers" scripts/ingest-autres-liberaux.ts

echo "" | tee -a "$LOG"
echo "╔══════════════════════════════════╗" | tee -a "$LOG"
echo "║  INGEST COMPLET — $(date '+%H:%M:%S')   ║" | tee -a "$LOG"
echo "╚══════════════════════════════════╝" | tee -a "$LOG"
