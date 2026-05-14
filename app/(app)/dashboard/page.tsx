import { redirect } from 'next/navigation'

// DESIGN.md: no dashboard homepage with KPI cards.
// Pipeline-first landing. Stale /dashboard bookmarks redirect here.
export default function DashboardPage() {
  redirect('/pipeline')
}
