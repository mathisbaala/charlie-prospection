'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Target, Kanban, Settings, LogOut, Send, Wifi, WifiOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

// Order reflects the natural workflow: define cibles → search → track in suivi.
// /outreach was previously here but pointed to a stub "Bientôt disponible" page —
// dropped to avoid lying to the user. Will return when the feature is built.
const NAV_ITEMS = [
  { href: '/cible',    label: 'Cible',      icon: Target },
  { href: '/recherche',label: 'Recherche',  icon: Search },
  { href: '/suivi',    label: 'Suivi',      icon: Kanban },
  { href: '/outreach', label: 'Campagnes',  icon: Send },
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
        <ExtensionWidget />
        <NavLink href="/settings" active={pathname.startsWith('/settings')} Icon={Settings}>
          Paramètres
        </NavLink>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 transition-colors"
          style={{ padding: '8px 12px', fontSize: 13, color: 'var(--color-muted)', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 2 }}
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

function ExtensionWidget() {
  const [status, setStatus] = useState<{ extension_linked: boolean; linkedin_valid: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetch_ = () =>
      fetch('/api/outreach/extension/connected')
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setStatus(d))
    fetch_()
    const t = setInterval(fetch_, 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function disconnect() {
    await fetch('/api/outreach/extension/unlink', { method: 'POST' })
    setStatus(s => s ? { ...s, extension_linked: false, linkedin_valid: false } : s)
    setOpen(false)
  }

  const linked = status?.extension_linked ?? false
  const linkedinOk = status?.linkedin_valid ?? false

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 2 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', borderRadius: 2,
        }}
      >
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {linked ? <Wifi size={15} color="var(--color-muted)" /> : <WifiOff size={15} color="var(--color-muted)" />}
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 6, height: 6, borderRadius: '50%',
            background: linked ? '#22A855' : '#E05C2A',
            border: '1px solid var(--color-surface)',
          }} />
        </span>
        <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>Extension</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 8,
          width: 220, background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, padding: '12px 14px',
        }}>
          <div style={{ marginBottom: 10 }}>
            <Row label="Extension" ok={linked} okText="Connectée" koText="Non connectée" />
            <Row label="LinkedIn" ok={linkedinOk} okText="Session active" koText="Ouvrir LinkedIn" />
          </div>
          {linked && (
            <button
              onClick={disconnect}
              style={{ width: '100%', padding: '6px 0', fontSize: 11, color: '#E05C2A', background: 'none', border: '1px solid #E05C2A', cursor: 'pointer' }}
            >
              Déconnecter l&apos;extension
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, ok, okText, koText }: { label: string; ok: boolean; okText: string; koText: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: ok ? '#22A855' : '#E05C2A' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#22A855' : '#E05C2A', display: 'inline-block' }} />
        {ok ? okText : koText}
      </span>
    </div>
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
