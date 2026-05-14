'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Users, Zap, Kanban, MessageSquare, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/prospects', label: 'Dashboard', icon: Users },
  { href: '/icp', label: 'Prospects', icon: Zap },
  { href: '/pipeline', label: 'Suivi', icon: Kanban },
  { href: '/outreach', label: 'Contact', icon: MessageSquare },
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
    <aside className="w-60 min-h-screen flex flex-col" style={{ backgroundColor: '#1a1a1a' }}>
      <div className="p-5 border-b" style={{ borderColor: '#2a2a2a' }}>
        <div className="flex items-center gap-3">
          <Image
            src="/charlie-logo.png"
            alt="Charlie"
            width={36}
            height={36}
            className="object-contain"
          />
          <div>
            <h1 className="font-semibold text-sm" style={{ color: '#E8DCC8' }}>Charlie</h1>
            <p className="text-xs mt-0.5" style={{ color: '#8a7a6a' }}>Prospection</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(href)
                ? 'text-white'
                : 'hover:text-white transition-colors'
            )}
            style={
              pathname.startsWith(href)
                ? { backgroundColor: '#C4A882', color: '#1a1a1a' }
                : { color: '#8a7a6a' }
            }
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 space-y-1" style={{ borderTop: '1px solid #2a2a2a' }}>
        <Link
          href="/settings"
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors'
          )}
          style={
            pathname.startsWith('/settings')
              ? { backgroundColor: '#C4A882', color: '#1a1a1a' }
              : { color: '#8a7a6a' }
          }
        >
          <Settings size={16} />
          Paramètres
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ color: '#8a7a6a' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#E8DCC8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8a7a6a')}
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
