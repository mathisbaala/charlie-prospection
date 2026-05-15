import { redirect } from 'next/navigation'

// /prospects is the legacy route — it was the auto-insert search page. The
// new equivalent is /recherche (non-inserting, manual add-to-suivi). The
// redirect keeps old bookmarks alive.
export default function LegacyProspectsPage() {
  redirect('/recherche')
}
