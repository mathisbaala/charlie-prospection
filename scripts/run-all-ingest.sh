#!/bin/bash
# run-all-ingest.sh — Lance tous les scripts d'ingest en séquence avec log.
# Lancer en fond : nohup bash scripts/run-all-ingest.sh > logs/ingest-master.log 2>&1 &
#
# État base au 17/05/2026 :
#   RPPS (57k) ✅  Architectes (5k) ✅  EC (3.5k) ✅
#   Avocats (1k, partiel) ⚠️  Notaires (214, partiel) ⚠️
#   Autres libéraux ❌  Biologistes médicaux ❌  Médecins SELAS ❌
#
# Ce script NE relance PAS le RPPS (déjà complet à 57k).

set -e
cd "$(dirname "$0")/.."

mkdir -p logs
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

# 1. Avocats — relance complète (1 077 en base = très partiel, ~70k attendus)
run "Avocats (AE NAF 69.10Z)" scripts/ingest-avocats-cnb.ts

# 2. Notaires — relance complète (214 en base = très partiel, ~10k attendus)
run "Notaires (AE NAF 69.10Z)" scripts/ingest-notaires.ts

# 3. Experts-comptables — relance (3 578 en base, peut avoir de nouveaux)
run "Experts-comptables (AE NAF 69.20Z)" scripts/ingest-experts-comptables.ts

# 4. Autres libéraux — 12 professions pas encore ingérées :
#    vétérinaires, géomètres, huissiers, courtiers assurance, CGPI,
#    agents assurance, ostéopathes, psychologues, experts judiciaires,
#    commissaires-priseurs, agents immobiliers, architectes (refresh)
run "Autres libéraux + financiers" scripts/ingest-autres-liberaux.ts

# 5. Biologistes médicaux — NOUVEAU (NAF 86.90B + RPPS Biologiste)
run "Biologistes médicaux (AE 86.90B + RPPS)" scripts/ingest-biologistes-medicaux.ts

# 6. Médecins libéraux en société — NOUVEAU (NAF 86.22Z + 86.21Z avec SIREN)
run "Médecins libéraux SELAS/SELARL (AE 86.22Z + 86.21Z)" scripts/ingest-medecins-selas.ts

# 7. Professions AE complémentaires — pharmacies, dentistes SELAS, kinés SELAS
run "AE Complémentaires (pharmacies 47.73Z, dentistes 86.23Z, kinés 86.90E)" scripts/ingest-professions-ae-complement.ts

# 8. RPPS — médecins, dentistes, pharmaciens, kinés open data Santé
run "RPPS médecins/dentistes/pharmaciens/kinés" scripts/ingest-rpps-bulk.ts

echo "" | tee -a "$LOG"
echo "╔══════════════════════════════════╗" | tee -a "$LOG"
echo "║  INGEST COMPLET — $(date '+%H:%M:%S')   ║" | tee -a "$LOG"
echo "╚══════════════════════════════════╝" | tee -a "$LOG"
