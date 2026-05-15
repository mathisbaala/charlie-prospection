const KEY = 'charlie_pending_desc'

export function storePendingDescription(desc: string): void {
  if (typeof window === 'undefined') return
  const trimmed = desc.trim()
  if (!trimmed) return
  sessionStorage.setItem(KEY, trimmed)
}

export function consumePendingDescription(): string | null {
  if (typeof window === 'undefined') return null
  const desc = sessionStorage.getItem(KEY)
  if (desc) sessionStorage.removeItem(KEY)
  return desc
}
