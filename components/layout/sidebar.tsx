'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Target, Kanban, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Order reflects the natural workflow: define cibles → search → track in suivi.
// /outreach was previously here but pointed to a stub "Bientôt disponible" page —
// dropped to avoid lying to the user. Will return when the feature is built.
const NAV_ITEMS = [
  { href: '/cible', label: 'Cible', icon: Target },
  { href: '/recherche', label: 'Recherche', icon: Search },
  { href: '/suivi', label: 'Suivi', icon: Kanban },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 240,
        minHeight: '100vh',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{ padding: '20px 20px 18px', borderBottom: '1px solid var(--color-border)' }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            flexShrink: 0,
          }}
        />
        <span
          className="font-display"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
          }}
        >
          Charlie
        </span>
        <span style={{ color: 'var(--color-muted)', fontWeight: 300 }}>·</span>
        <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>Prospection</span>
      </div>

      <nav className="flex-1" style={{ padding: '12px 8px' }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <NavLink key={href} href={href} active={pathname.startsWith(href)} Icon={Icon}>
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '8px', borderTop: '1px solid var(--color-border)' }}>
        <NavLink
          href="/settings"
          active={pathname.startsWith('/settings')}
          Icon={Settings}
        >
          Paramètres
        </NavLink>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 transition-colors"
          style={{
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--color-muted)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 2,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
        >
          <LogOut size={15} />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}

function NavLink({
  href,
  active,
  Icon,
  children,
}: {
  href: string
  active: boolean
  Icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 transition-colors"
      style={{
        padding: '8px 10px',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--color-text)' : 'var(--color-muted)',
        background: active ? 'var(--color-accent-dim)' : 'transparent',
        borderLeft: active ? '2px solid var(--color-accent)' : '2px solid transparent',
        borderRadius: 0,
        marginBottom: 1,
      }}
    >
      <Icon size={15} />
      {children}
    </Link>
  )
}
