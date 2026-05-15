import { redirect } from 'next/navigation'

// /icp is the legacy route — it was the single-active ICP editor. The new
// equivalent is /cible (multi-persona, editable filters, no LinkedIn queries
// section). The redirect keeps old bookmarks alive.
export default function LegacyIcpPage() {
  redirect('/cible')
}
