import { redirect } from 'next/navigation'

// DESIGN.md: no dashboard homepage with KPI cards.
// Pipeline-first landing. Stale /dashboard bookmarks redirect straight to
// /suivi (we used to chain via /pipeline → /suivi, but that's two redirects
// for nothing).
export default function DashboardPage() {
  redirect('/suivi')
}
