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

# 3. Quick-score bulk — scoring patrimonial initial sur tous les profils raw
#    Pas bloquant : si l'API Next.js est down, le cron enrich-persons prendra le relai
log ""
log "════════════════════════════════════════════"
log "  Quick-score bulk (scoring initial toutes personnes raw)"
log "════════════════════════════════════════════"
npx tsx scripts/quick-score-bulk.ts 2>&1 | tee -a "$LOG" || log "  ⚠️  quick-score non bloquant — continuera via cron enrich-persons"

# 4. RPPS complet — re-téléchargement local pour éviter l'ECONNRESET (~41min sur stream HTTP)
#    Le fichier fait ~805MB ; curl reprend sur interruption (-C -).
RPPS_LOCAL="/tmp/rpps-full.txt"
log ""
log "════════════════════════════════════════════"
log "  RPPS complet — téléchargement local"
log "════════════════════════════════════════════"
RPPS_URL=$(node -e "
const r=require('https');
const opts=new URL('https://www.data.gouv.fr/api/1/datasets/69025e6c73d1f9b79ca3c365/');
r.get(opts,(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{
  const rs=JSON.parse(d).resources??[];
  const c=rs.filter(x=>x.url?.includes('personne-activite')||x.url?.endsWith('.txt')||x.format?.toLowerCase()==='txt').sort((a,b)=>(b.filesize??0)-(a.filesize??0));
  console.log(c[0]?.url??'');
});});
" 2>/dev/null)
if [ -z "$RPPS_URL" ]; then
  log "  ⚠️  Impossible de récupérer l'URL RPPS — étape ignorée"
else
  log "  URL: ...${RPPS_URL: -60}"
  log "  Téléchargement vers $RPPS_LOCAL..."
  curl -L -C - --retry 5 --retry-delay 10 -o "$RPPS_LOCAL" "$RPPS_URL" 2>&1 | tee -a "$LOG"
  log "  Téléchargement terminé. Lancement ingest RPPS --file..."
  run "RPPS complet (fichier local)" scripts/ingest-rpps-bulk.ts --file "$RPPS_LOCAL"
  rm -f "$RPPS_LOCAL"
  log "  Fichier temporaire supprimé."
fi

log ""
log "╔══════════════════════════════════════╗"
log "║  PIPELINE VAGUE 3 COMPLET — $(date '+%H:%M:%S')  ║"
log "╚══════════════════════════════════════╝"
