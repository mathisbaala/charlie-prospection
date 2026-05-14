'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Erreur lors de la création du compte.')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push('/pipeline')
  }

  return (
    <div
      className="p-8"
      style={{
        background: 'var(--color-surface)',
        borderRadius: 2,
        border: '1px solid var(--color-border)',
      }}
    >
      <h2
        className="font-display mb-6"
        style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text)' }}
      >
        Créer votre cabinet
      </h2>
      <form onSubmit={handleSignup} className="space-y-4">
        <Field label="Nom du cabinet">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="Cabinet Dupont Patrimoine"
            className="w-full"
            style={inputStyle}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="vous@cabinet.fr"
            className="w-full"
            style={inputStyle}
          />
        </Field>
        <Field label="Mot de passe">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full"
            style={inputStyle}
          />
        </Field>
        {error && (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            background: 'var(--color-text)',
            color: 'var(--color-bg)',
            borderRadius: 2,
          }}
        >
          {loading ? 'Création…' : 'Créer mon cabinet'}
        </button>
      </form>
      <p className="text-center text-sm mt-4" style={{ color: 'var(--color-muted)' }}>
        Déjà un compte ?{' '}
        <Link
          href="/login"
          style={{ color: 'var(--color-accent)', fontWeight: 500 }}
          className="hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block mb-1"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 2,
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
}
