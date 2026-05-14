export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Charlie Prospection</h1>
          <p className="text-sm text-gray-500 mt-1">Prospection patrimoniale pour CGPs</p>
        </div>
        {children}
      </div>
    </div>
  )
}
