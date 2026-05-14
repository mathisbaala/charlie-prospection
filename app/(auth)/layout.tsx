export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span
              className="inline-block"
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'var(--color-accent)',
              }}
            />
            <span
              className="font-display"
              style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              Charlie
            </span>
            <span style={{ color: 'var(--color-muted)', fontWeight: 300 }}>·</span>
            <span style={{ color: 'var(--color-muted)', fontSize: 14 }}>Prospection</span>
          </div>
          <p
            className="text-sm"
            style={{ color: 'var(--color-muted)', marginTop: 4 }}
          >
            Prospection patrimoniale pour CGPs
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
