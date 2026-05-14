export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
      <p className="text-gray-500 mt-1">Bienvenue sur Charlie Prospection.</p>
      <div className="grid grid-cols-3 gap-6 mt-8">
        {[
          { label: 'Prospects identifiés', value: '0' },
          { label: 'Signaux cette semaine', value: '0' },
          { label: 'Messages envoyés', value: '0' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
