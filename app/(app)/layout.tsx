import { Sidebar } from '@/components/layout/sidebar'
import { AppProviders } from './providers'

export const dynamic = 'force-dynamic'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </AppProviders>
  )
}
