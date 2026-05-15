import { redirect } from 'next/navigation'

// /pipeline is the legacy route — it was the flat split-panel pipeline. The
// new equivalent is /suivi (grouped by persona, per-prospect signal timeline).
// The redirect keeps old bookmarks and the IntelligenceStrip V1 link alive.
export default function LegacyPipelinePage() {
  redirect('/suivi')
}
