'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Zap, Kanban, MessageSquare, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/prospects', label: 'Prospects', icon: Users },
  { href: '/icp', label: 'Mon ICP', icon: Zap },
  { href: '/pipeline', label: 'Pipeline CRM', icon: Kanban },
  { href: '/outreach', label: 'Outreach', icon: MessageSquare },
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
    <aside className="w-60 min-h-screen bg-gray-900 flex flex-col">
      <div className="p-5 border-b border-gray-800">
        <h1 className="text-white font-bold text-lg">Charlie</h1>
        <p className="text-gray-400 text-xs mt-0.5">Prospection</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(href)
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-800 space-y-1">
        <Link
          href="/settings"
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          )}
        >
          <Settings size={16} />
          Paramètres
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
