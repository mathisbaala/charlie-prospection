'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Play, Pause, Trash2, SlidersHorizontal, Pencil, Search, MoreHorizontal } from 'lucide-react'
import { CampaignWizard } from './campaign-wizard'
import { SequenceBuilder } from './sequence-builder'
import type { Campaign, CampaignStatus, CampaignStep } from '@/lib/types'

const STATUS_LABELS: Record<CampaignStatus, { label: string; dot: string; text: string }> = {
  draft:     { label: 'Brouillon',  dot: 'var(--color-muted)',   text: 'var(--color-muted)' },
  active:    { label: 'Active',     dot: 'var(--color-success)', text: 'var(--color-success)' },
  paused:    { label: 'En pause',   dot: 'var(--color-warning)', text: 'var(--color-warning)' },
  completed: { label: 'Terminée',   dot: 'var(--color-muted)',   text: 'var(--color-muted)' },
}

export function OutreachPageClient({ extensionLinkParam: _extensionLinkParam }: { extensionLinkParam?: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [showLimits, setShowLimits] = useState(false)

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch('/api/outreach/campaigns')
    if (res.ok) {
      const d = await res.json()
      setCampaigns(d.campaigns ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCampaigns()
  }, [fetchCampaigns])

  async function toggleStatus(campaign: Campaign) {
    const newStatus: CampaignStatus = campaign.status === 'active' ? 'paused' : 'active'
    await fetch(`/api/outreach/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    await fetchCampaigns()
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Supprimer cette campagne et tous ses enrôlements ?')) return
    await fetch(`/api/outreach/campaigns/${id}`, { method: 'DELETE' })
    await fetchCampaigns()
  }

  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return campaigns
    return campaigns.filter(c => c.name.toLowerCase().includes(q))
  }, [campaigns, search])

  return (
    <div style={{ padding: '48px 56px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36, gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>
            Engagement
          </div>
          <h1
            className="font-display"
            style={{ fontSize: 44, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.025em', lineHeight: 1.05 }}
          >
            Campagnes
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 10, maxWidth: 560, lineHeight: 1.6 }}>
            Prospection LinkedIn multi-étapes. L&apos;extension exécute les actions depuis votre navigateur, vous gardez le contrôle.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <SecondaryBtn onClick={() => setShowLimits(true)}>
            <SlidersHorizontal size={14} strokeWidth={1.75} />
            Limites LinkedIn
          </SecondaryBtn>
          <PrimaryBtn onClick={() => setShowWizard(true)}>
            <Plus size={15} strokeWidth={2.25} />
            Nouvelle campagne
          </PrimaryBtn>
        </div>
      </div>

      {/* Search bar */}
      {!loading && campaigns.length > 0 && (
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <Search size={14} strokeWidth={1.75} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input
            placeholder="Rechercher une campagne…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px 11px 40px',
              fontSize: 13,
              background: 'linear-gradient(180deg, #FDFAF5 0%, #FAF4E8 100%)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              color: 'var(--color-text)',
              outline: 'none',
              boxShadow: 'inset 0 1px 2px rgba(53,40,24,0.04)',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(188,107,42,0.12), inset 0 1px 2px rgba(53,40,24,0.04)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(53,40,24,0.04)' }}
          />
        </div>
      )}

      {/* Liste des campagnes */}
      {loading ? (
        <div style={{ padding: 48, color: 'var(--color-muted)', fontSize: 13, textAlign: 'center' }}>Chargement…</div>
      ) : campaigns.length === 0 ? (
        <EmptyState onNew={() => setShowWizard(true)} />
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, color: 'var(--color-muted)', fontSize: 13, textAlign: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          Aucune campagne ne correspond à « {search} ».
        </div>
      ) : (
        <div>
          {filtered.map(c => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onToggle={() => toggleStatus(c)}
              onDelete={() => deleteCampaign(c.id)}
              onEdited={fetchCampaigns}
            />
          ))}
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <CampaignWizard
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); fetchCampaigns() }}
        />
      )}

      {/* Modal limites LinkedIn */}
      {showLimits && <LimitsModal onClose={() => setShowLimits(false)} />}
    </div>
  )
}

function LimitsModal({ onClose }: { onClose: () => void }) {
  const [invitation, setInvitation] = useState(30)
  const [dm, setDm] = useState(50)
  const [checkConn, setCheckConn] = useState(100)
  const [safe, setSafe] = useState({ invitation: 30, dm: 50, check_connection: 100 })
  const [max, setMax] = useState({ invitation: 100, dm: 150, check_connection: 300 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/outreach/limits')
      .then(r => r.json())
      .then(d => {
        setInvitation(d.daily_invitation_limit)
        setDm(d.daily_dm_limit)
        setCheckConn(d.daily_check_connection_limit)
        if (d.safe_zone) setSafe(d.safe_zone)
        if (d.max) setMax(d.max)
      })
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/outreach/limits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_invitation_limit: invitation,
          daily_dm_limit: dm,
          daily_check_connection_limit: checkConn,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Limites LinkedIn"
      subtitle="LinkedIn peut bannir ou restreindre votre compte à vie si vous dépassez ces limites. Restez dans la zone de sécurité — 30 invitations / 24h max est l'usage recommandé."
      onClose={onClose}
      width={580}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <SecondaryBtn onClick={onClose}>Annuler</SecondaryBtn>
          <PrimaryBtn onClick={save} disabled={saving || loading}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </PrimaryBtn>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: 40, color: 'var(--color-muted)', fontSize: 13, textAlign: 'center' }}>Chargement…</div>
      ) : (
        <div>
          <LimitRow
            label="Invitations envoyées par jour"
            value={invitation}
            onChange={setInvitation}
            safe={safe.invitation}
            max={max.invitation}
          />
          <LimitRow
            label="Messages directs (DM) envoyés par jour"
            value={dm}
            onChange={setDm}
            safe={safe.dm}
            max={max.dm}
          />
          <LimitRow
            label="Vérifications de connexion par jour"
            value={checkConn}
            onChange={setCheckConn}
            safe={safe.check_connection}
            max={max.check_connection}
            hint="Visites de profils pour voir qui a accepté l'invitation"
          />
          {error && <div style={{ padding: '14px 26px 0', color: 'var(--color-error)', fontSize: 12 }}>{error}</div>}
        </div>
      )}
    </ModalShell>
  )
}

// ── Modal d'édition de campagne (Messages + Prospects) ──────────────────────
type StepDef = Omit<CampaignStep, 'id' | 'campaign_id' | 'org_id' | 'created_at'>

interface EnrolledProspect {
  enrollment_id: string
  name: string
  url: string | null
  status: string
  failed: boolean
}

function CampaignEditModal({ campaignId, onClose, onSaved }: {
  campaignId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [tab, setTab] = useState<'messages' | 'prospects'>('messages')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [steps, setSteps] = useState<StepDef[]>([])
  const [prospects, setProspects] = useState<EnrolledProspect[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`/api/outreach/campaigns/${campaignId}`)
      .then(r => r.json())
      .then(({ campaign }) => {
        if (!campaign) return
        setName(campaign.name ?? '')
        setSteps((campaign.steps ?? []).map((s: CampaignStep) => ({
          position: s.position,
          type: s.type,
          delay_days: s.delay_days,
          template: s.template,
        })))
        const list: EnrolledProspect[] = (campaign.enrollments ?? []).map((e: Record<string, unknown>) => {
          const p = e.prospect as Record<string, unknown> | null
          const ed = (p?.enrichment_data ?? {}) as Record<string, unknown>
          const ld = (p?.linkedin_data ?? {}) as Record<string, unknown>
          const first = String(ed.dirigeant_prenom ?? ld.prenom ?? '').trim()
          const last = String(ed.dirigeant_nom ?? ld.nom ?? '').trim()
          const status = String(e.status ?? '')
          return {
            enrollment_id: String(e.id),
            name: [first, last].filter(Boolean).join(' ') || 'Prospect inconnu',
            url: (e.linkedin_url_resolved as string | null) ?? (p?.linkedin_url as string | null) ?? null,
            status,
            failed: status === 'failed',
          }
        })
        setProspects(list)
      })
      .finally(() => setLoading(false))
  }, [campaignId])

  async function saveMessages() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), steps }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  async function removeSelected() {
    if (selected.size === 0) return
    if (!confirm(`Retirer ${selected.size} prospect${selected.size > 1 ? 's' : ''} de cette campagne ? Les prospects restent dans la base, ils sont seulement désinscrits.`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/enrollments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_ids: Array.from(selected) }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur')
      setProspects(prev => prev.filter(p => !selected.has(p.enrollment_id)))
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  const filtered = prospects.filter(p =>
    !search.trim() || p.name.toLowerCase().includes(search.toLowerCase().trim())
  )

  function toggleAll(visible: EnrolledProspect[]) {
    const allSelected = visible.every(p => selected.has(p.enrollment_id))
    const next = new Set(selected)
    visible.forEach(p => allSelected ? next.delete(p.enrollment_id) : next.add(p.enrollment_id))
    setSelected(next)
  }

  return (
    <ModalShell
      title="Modifier la campagne"
      onClose={onClose}
      width={760}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            {tab === 'messages' ? 'Modifie le nom et les messages de la séquence' : 'Coche des prospects pour les retirer'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <SecondaryBtn onClick={onClose}>Fermer</SecondaryBtn>
            {tab === 'messages' && (
              <PrimaryBtn onClick={saveMessages} disabled={saving || loading}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </PrimaryBtn>
            )}
          </div>
        </div>
      }
    >
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'linear-gradient(180deg, #FBF6EC 0%, #F4EFE3 100%)' }}>
        {(['messages', 'prospects'] as const).map(t => {
          const active = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '14px 22px', fontSize: 13, fontWeight: active ? 700 : 500,
                background: active ? 'var(--color-surface)' : 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                color: active ? 'var(--color-text)' : 'var(--color-muted)',
                letterSpacing: '0.01em',
                transition: 'color 0.12s, background 0.12s',
              }}
            >
              {t === 'messages' ? `Messages (${steps.length})` : `Prospects (${prospects.length})`}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, color: 'var(--color-muted)', fontSize: 13, textAlign: 'center' }}>Chargement…</div>
      ) : tab === 'messages' ? (
        <div style={{ padding: '24px 26px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>Nom de la campagne</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%', padding: '11px 14px', fontSize: 14,
              border: '1px solid var(--color-border)', borderRadius: 8,
              background: 'linear-gradient(180deg, #FDFAF5 0%, #FAF4E8 100%)',
              color: 'var(--color-text)', marginBottom: 22, outline: 'none',
              boxShadow: 'inset 0 1px 2px rgba(53,40,24,0.04)',
              fontWeight: 500,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(188,107,42,0.12), inset 0 1px 2px rgba(53,40,24,0.04)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(53,40,24,0.04)' }}
          />
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 14, fontStyle: 'italic', lineHeight: 1.6 }}>
            Les nouveaux messages s&apos;appliqueront uniquement aux prospects qui n&apos;ont pas encore reçu cette étape. Les messages déjà envoyés ne sont pas réécrits.
          </div>
          <SequenceBuilder steps={steps} onChange={setSteps} />
        </div>
      ) : (
        <div style={{ padding: '20px 26px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} strokeWidth={1.75} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
              <input
                placeholder="Rechercher par nom…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px 9px 36px', fontSize: 13,
                  border: '1px solid var(--color-border)', borderRadius: 8,
                  background: 'linear-gradient(180deg, #FDFAF5 0%, #FAF4E8 100%)',
                  color: 'var(--color-text)', outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(53,40,24,0.04)',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(188,107,42,0.12), inset 0 1px 2px rgba(53,40,24,0.04)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(53,40,24,0.04)' }}
              />
            </div>
            {selected.size > 0 && (
              <SecondaryBtn onClick={removeSelected} disabled={saving} danger size="sm">
                <Trash2 size={12} strokeWidth={1.75} /> Retirer {selected.size}
              </SecondaryBtn>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            marginBottom: 10,
          }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every(p => selected.has(p.enrollment_id))}
              onChange={() => toggleAll(filtered)}
              style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.04em' }}>
              {filtered.length} prospect{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
              {search.trim() && ` (sur ${prospects.length})`}
            </span>
          </div>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--color-surface)' }}>
            {filtered.map((p, idx) => {
              const isSel = selected.has(p.enrollment_id)
              return (
                <label key={p.enrollment_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  borderBottom: idx === filtered.length - 1 ? 'none' : '1px solid var(--color-border)',
                  cursor: 'pointer',
                  background: isSel ? 'rgba(188,107,42,0.08)' : 'transparent',
                  transition: 'background 0.10s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#FBF7EF' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => {
                      const next = new Set(selected)
                      if (isSel) next.delete(p.enrollment_id); else next.add(p.enrollment_id)
                      setSelected(next)
                    }}
                    style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>{p.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: p.failed ? 'var(--color-warning)' : 'var(--color-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    {STATUS_LABEL_SHORT[p.status] ?? p.status}
                  </span>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 600 }}>↗</a>
                  )}
                </label>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 32, color: 'var(--color-muted)', fontSize: 13, textAlign: 'center' }}>
                {search.trim() ? 'Aucun prospect ne matche cette recherche.' : 'Aucun prospect dans cette campagne.'}
              </div>
            )}
          </div>
        </div>
      )}
      {error && <div style={{ padding: '14px 26px 0', color: 'var(--color-error)', fontSize: 12 }}>{error}</div>}
    </ModalShell>
  )
}

const STATUS_LABEL_SHORT: Record<string, string> = {
  pending: 'À chercher',
  profile_search: 'À inviter',
  invitation_sent: 'Invitation env.',
  connected: 'Connecté',
  dm_sent: 'Contacté',
  replied: 'Répondu',
  failed: 'Échec',
  opted_out: 'Hors-cible',
}

function LimitRow({ label, value, onChange, safe, max, hint }: {
  label: string
  value: number
  onChange: (v: number) => void
  safe: number
  max: number
  hint?: string
}) {
  const outOfSafe = value > safe
  return (
    <div style={{ padding: '18px 26px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{hint}</div>}
        {outOfSafe && (
          <div style={{ fontSize: 11, color: 'var(--color-warning)', marginTop: 5, fontWeight: 600 }}>
            ⚠ Au-dessus de la zone de sécurité ({safe} max recommandé)
          </div>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'linear-gradient(180deg, #FDFAF5 0%, #F4EFE3 100%)',
        border: outOfSafe ? '1px solid var(--color-warning)' : '1px solid #D5CBBA',
        borderRadius: 10,
        boxShadow: outOfSafe
          ? '0 0 0 3px rgba(180,90,26,0.12), inset 0 1px 0 rgba(255,255,255,0.6)'
          : 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 1px rgba(53,40,24,0.05)',
        overflow: 'hidden',
      }}>
        <button
          onClick={() => onChange(Math.max(1, value - 1))}
          style={{ width: 34, height: 34, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text)', fontWeight: 500 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >−</button>
        <input
          type="number"
          value={value}
          onChange={e => onChange(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
          min={1}
          max={max}
          style={{ width: 56, textAlign: 'center', fontSize: 15, fontWeight: 700, background: 'none', border: 'none', borderLeft: '1px solid var(--color-border)', borderRight: '1px solid var(--color-border)', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono, monospace)', height: 34, padding: 0, outline: 'none' }}
        />
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          style={{ width: 34, height: 34, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text)', fontWeight: 500 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >+</button>
      </div>
    </div>
  )
}

// ── Sous-composants ──────────────────────────────────────────────────────────

const FUNNEL_STEPS = [
  { key: 'invited',   label: 'Invitation envoyée', statuses: ['invitation_sent'], color: '#BC6B2A' },
  { key: 'connected', label: 'Connecté',            statuses: ['connected'],      color: '#2A7ABC' },
  { key: 'messaged',  label: 'Contacté',            statuses: ['dm_sent'],        color: '#2A8C5A' },
  { key: 'replied',   label: 'Répondu',             statuses: ['replied'],        color: '#22A855' },
] as const

interface ProspectModalState {
  campaignId: string
  label: string
  statuses: string[]
}

function CampaignRow({ campaign, onToggle, onDelete, onEdited }: {
  campaign: Campaign
  onToggle: () => void
  onDelete: () => void
  onEdited: () => void
}) {
  const [modal, setModal] = useState<ProspectModalState | null>(null)
  const [editing, setEditing] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const st = STATUS_LABELS[campaign.status]
  const canToggle = campaign.status === 'active' || campaign.status === 'paused' || campaign.status === 'draft'
  const bd = campaign.status_breakdown
  const total = campaign.enrollment_count ?? 0
  const failed = bd?.failed ?? 0

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 140px 200px 120px 120px',
        gap: 16, padding: '20px 22px',
        alignItems: 'center',
        background: 'linear-gradient(180deg, #FDFAF5 0%, #F7F1E5 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        marginBottom: 10,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(53,40,24,0.04)',
        transition: 'background 0.16s, box-shadow 0.16s, transform 0.10s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'linear-gradient(180deg, #FDFAF5 0%, #F2EAD8 100%)'
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 12px rgba(53,40,24,0.08), 0 1px 2px rgba(53,40,24,0.04)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'linear-gradient(180deg, #FDFAF5 0%, #F7F1E5 100%)'
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(53,40,24,0.04)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
      >
        {/* Col 1 — Identité */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, fontSize: 20,
            background: 'linear-gradient(180deg, #FFFCF6 0%, #F0E8D7 100%)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 2px rgba(53,40,24,0.06)',
            flexShrink: 0,
          }}>{campaign.emoji}</span>
          <div style={{ minWidth: 0 }}>
            <div className="font-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {campaign.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3, display: 'flex', gap: 8 }}>
              <span>{campaign.steps?.length ?? 0} étape{(campaign.steps?.length ?? 0) > 1 ? 's' : ''}</span>
              {failed > 0 && (
                <>
                  <span>·</span>
                  <span style={{ color: 'var(--color-warning)' }}>{failed} échec{failed > 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Col 2 — Statut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: st.text }}>{st.label}</span>
        </div>

        {/* Col 3 — Pipeline mini */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {bd && total > 0 ? FUNNEL_STEPS.map(step => {
            const n = bd[step.key]
            const pct = total > 0 ? (n / total) * 100 : 0
            return (
              <Tooltip key={step.key} label={`${step.label} · ${n}`}>
                <button
                  disabled={n === 0}
                  onClick={() => n > 0 && setModal({ campaignId: campaign.id, label: step.label, statuses: [...step.statuses] })}
                  style={{
                    flex: 1, minWidth: 38, height: 30,
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 3,
                    background: 'none', border: 'none', padding: 0,
                    cursor: n > 0 ? 'pointer' : 'default', opacity: n > 0 ? 1 : 0.4,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: n > 0 ? step.color : 'var(--color-muted)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                  <div style={{
                    height: 4, width: '100%',
                    background: 'rgba(53,40,24,0.10)',
                    borderRadius: 2,
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {n > 0 && (
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: '100%',
                        width: `${Math.max(pct, 8)}%`,
                        background: `linear-gradient(90deg, ${step.color} 0%, ${step.color}DD 100%)`,
                        borderRadius: 2,
                        boxShadow: `0 0 6px ${step.color}55`,
                      }} />
                    )}
                  </div>
                </button>
              </Tooltip>
            )
          }) : (
            <span style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic' }}>—</span>
          )}
        </div>

        {/* Col 4 — Compte prospects */}
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
          {total}
        </div>

        {/* Col 5 — Actions */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {canToggle && (
            <Tooltip label={campaign.status === 'active' ? 'Mettre en pause' : 'Activer la campagne'}>
              <IconBtn
                onClick={onToggle}
                title=""
                variant={campaign.status === 'active' ? 'warn' : 'accent'}
              >
                {campaign.status === 'active' ? <Pause size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
              </IconBtn>
            </Tooltip>
          )}
          <Tooltip label="Modifier la campagne">
            <IconBtn onClick={() => setEditing(true)} title="">
              <Pencil size={14} strokeWidth={1.75} />
            </IconBtn>
          </Tooltip>
          <div style={{ position: 'relative' }}>
            <Tooltip label="Plus d'actions">
              <IconBtn onClick={() => setActionsOpen(!actionsOpen)} title="">
                <MoreHorizontal size={14} strokeWidth={1.75} />
              </IconBtn>
            </Tooltip>
            {actionsOpen && (
              <>
                <div onClick={() => setActionsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 100,
                  background: 'linear-gradient(180deg, #FDFAF5 0%, #F8F3E8 100%)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  minWidth: 180,
                  boxShadow: '0 8px 24px rgba(53,40,24,0.16), inset 0 1px 0 rgba(255,255,255,0.6)',
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => { setActionsOpen(false); onDelete() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', textAlign: 'left', transition: 'background 0.10s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,34,51,0.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <Trash2 size={13} strokeWidth={1.75} /> Supprimer la campagne
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <CampaignEditModal
          campaignId={campaign.id}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onEdited() }}
        />
      )}

      {modal && (
        <ProspectListModal
          campaignId={modal.campaignId}
          label={modal.label}
          statuses={modal.statuses}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

function ProspectListModal({ campaignId, label, statuses, onClose }: {
  campaignId: string
  label: string
  statuses: string[]
  onClose: () => void
}) {
  const [prospects, setProspects] = useState<{ name: string; url: string | null; sentAt: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/outreach/campaigns/${campaignId}`)
      .then(r => r.json())
      .then(({ campaign }) => {
        const enrs: Record<string, unknown>[] = campaign?.enrollments ?? []
        const list = enrs
          .filter((e: Record<string, unknown>) => statuses.includes(e.status as string))
          .map((e: Record<string, unknown>) => {
            const p = e.prospect as Record<string, unknown> | null
            const ed = (p?.enrichment_data ?? {}) as Record<string, unknown>
            const ld = (p?.linkedin_data ?? {}) as Record<string, unknown>
            const firstName = String(ed.dirigeant_prenom ?? ld.prenom ?? '').trim()
            const lastName  = String(ed.dirigeant_nom  ?? ld.nom  ?? '').trim()
            const name = [firstName, lastName].filter(Boolean).join(' ') || 'Prospect inconnu'
            const url = (e.linkedin_url_resolved as string | null) ?? (p?.linkedin_url as string | null) ?? null
            // invitation_sent_at = date figée à l'envoi de l'invitation (ne bouge plus)
            // fallback sur last_action_at pour les anciens enrôlements pré-migration
            const sentAt =
              (e.invitation_sent_at as string | null) ??
              (e.last_action_at as string | null) ??
              null
            return { name, url, sentAt }
          })
          // Tri : plus récent en premier (last_action_at desc), null en dernier
          .sort((a, b) => {
            if (!a.sentAt && !b.sentAt) return 0
            if (!a.sentAt) return 1
            if (!b.sentAt) return -1
            return b.sentAt.localeCompare(a.sentAt)
          })
        setProspects(list)
      })
      .finally(() => setLoading(false))
  }, [campaignId, statuses])

  function formatSentAt(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    // ex: "16 mai 2026 · 21:34"
    const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return `${date} · ${time}`
  }

  return (
    <ModalShell
      title={label}
      subtitle={!loading ? `${prospects.length} prospect${prospects.length > 1 ? 's' : ''} — triés du plus récent au plus ancien` : undefined}
      onClose={onClose}
      width={480}
    >
      {loading ? (
        <div style={{ padding: '40px 24px', color: 'var(--color-muted)', fontSize: 13, textAlign: 'center' }}>Chargement…</div>
      ) : prospects.length === 0 ? (
        <div style={{ padding: '40px 24px', color: 'var(--color-muted)', fontSize: 13, textAlign: 'center' }}>Aucun prospect dans cette catégorie.</div>
      ) : (
        <div>
          {prospects.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 22px',
              borderBottom: i === prospects.length - 1 ? 'none' : '1px solid var(--color-border)',
              gap: 14,
              transition: 'background 0.10s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FBF7EF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 500 }}>{p.name}</span>
                {p.sentAt && (
                  <span style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', marginTop: 3, letterSpacing: '0.02em' }}>
                    {formatSentAt(p.sentAt)}
                  </span>
                )}
              </div>
              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11, fontWeight: 600,
                    color: 'var(--color-accent)', textDecoration: 'none',
                    background: 'linear-gradient(180deg, rgba(188,107,42,0.10) 0%, rgba(188,107,42,0.06) 100%)',
                    border: '1px solid rgba(188,107,42,0.35)',
                    borderRadius: 8,
                    padding: '5px 11px',
                    flexShrink: 0,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 1px rgba(188,107,42,0.08)',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(188,107,42,0.18) 0%, rgba(188,107,42,0.12) 100%)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(188,107,42,0.10) 0%, rgba(188,107,42,0.06) 100%)' }}
                >
                  Voir profil →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        padding: '80px 40px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 14 }}>
        Aucune campagne
      </div>
      <p className="font-display" style={{ fontSize: 26, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.015em', maxWidth: 420, margin: '0 auto', lineHeight: 1.3 }}>
        Lancez votre première séquence de prospection.
      </p>
      <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 12, marginBottom: 28, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
        Définissez vos messages, sélectionnez vos prospects, l&apos;extension fait le reste depuis votre LinkedIn.
      </p>
      <button
        onClick={onNew}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '11px 22px', fontSize: 13, fontWeight: 600,
          background: 'var(--color-accent)', border: '1px solid var(--color-accent)',
          color: '#fff', cursor: 'pointer',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#A55C22' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-accent)' }}
      >
        <Plus size={15} strokeWidth={2} />
        Créer une campagne
      </button>
    </div>
  )
}

// ── Tooltip personnalisé (bulle parchemin avec petite flèche) ─────────────────
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {children}
      {show && (
        <span
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, #2A211A 0%, #1A1612 100%)',
            color: '#F3EFE6',
            padding: '6px 10px',
            fontSize: 11, fontWeight: 600,
            letterSpacing: '0.02em',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 200,
            boxShadow: '0 6px 16px rgba(28,22,18,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {label}
          <span
            style={{
              position: 'absolute',
              top: '100%', left: '50%',
              transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderTop: '5px solid #1A1612',
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
            }}
          />
        </span>
      )}
    </span>
  )
}

// Bouton icône carré standardisé (palette parchemin/cuivre, radius 8px)
function IconBtn({ children, onClick, title, variant = 'default' }: {
  children: React.ReactNode
  onClick: () => void
  title: string
  variant?: 'default' | 'accent' | 'warn'
}) {
  const palette = {
    default: {
      bg: 'linear-gradient(180deg, #FDFAF5 0%, #F6F1E6 100%)',
      hover: 'linear-gradient(180deg, #FBF6EC 0%, #F0EADC 100%)',
      color: 'var(--color-muted)',
      shadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 1px rgba(53,40,24,0.04)',
    },
    accent:  {
      bg: 'linear-gradient(180deg, rgba(188,107,42,0.16) 0%, rgba(188,107,42,0.10) 100%)',
      hover: 'linear-gradient(180deg, rgba(188,107,42,0.24) 0%, rgba(188,107,42,0.18) 100%)',
      color: 'var(--color-accent)',
      shadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 1px rgba(188,107,42,0.10)',
    },
    warn:    {
      bg: 'linear-gradient(180deg, rgba(180,90,26,0.14) 0%, rgba(180,90,26,0.08) 100%)',
      hover: 'linear-gradient(180deg, rgba(180,90,26,0.22) 0%, rgba(180,90,26,0.14) 100%)',
      color: 'var(--color-warning)',
      shadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 1px rgba(180,90,26,0.10)',
    },
  }[variant]
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32,
        background: palette.bg, border: '1px solid var(--color-border)',
        borderRadius: 8,
        color: palette.color, cursor: 'pointer',
        transition: 'background 0.12s, transform 0.08s, box-shadow 0.12s',
        boxShadow: palette.shadow,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = palette.hover }}
      onMouseLeave={e => { e.currentTarget.style.background = palette.bg }}
      onMouseDown={e => { e.currentTarget.style.transform = 'translateY(1px)' }}
      onMouseUp={e => { e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {children}
    </button>
  )
}

// ── Boutons texte (primaire cuivre / secondaire parchemin) avec effet "lift" ──
function PrimaryBtn({ children, onClick, disabled, size = 'md' }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const padding = size === 'lg' ? '12px 24px' : size === 'sm' ? '7px 14px' : '10px 20px'
  const fontSize = size === 'lg' ? 14 : size === 'sm' ? 12 : 13
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding, fontSize, fontWeight: 600,
        background: disabled ? '#C9B59B' : 'linear-gradient(180deg, #C97529 0%, #B5642A 100%)',
        border: '1px solid #9F551E',
        borderRadius: 8,
        color: '#FFFBF0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled
          ? 'none'
          : 'inset 0 1px 0 rgba(255,255,255,0.20), 0 1px 2px rgba(53,40,24,0.18), 0 2px 4px rgba(53,40,24,0.06)',
        textShadow: '0 1px 0 rgba(0,0,0,0.10)',
        letterSpacing: '0.01em',
        transition: 'background 0.12s, box-shadow 0.12s, transform 0.08s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'linear-gradient(180deg, #B0651F 0%, #9D5825 100%)' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = 'linear-gradient(180deg, #C97529 0%, #B5642A 100%)' }}
      onMouseDown={e => { if (!disabled) { e.currentTarget.style.transform = 'translateY(1px)'; e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 1px rgba(53,40,24,0.20)' } }}
      onMouseUp={e => { if (!disabled) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.20), 0 1px 2px rgba(53,40,24,0.18), 0 2px 4px rgba(53,40,24,0.06)' } }}
    >
      {children}
    </button>
  )
}

function SecondaryBtn({ children, onClick, disabled, size = 'md', danger }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  danger?: boolean
}) {
  const padding = size === 'lg' ? '12px 22px' : size === 'sm' ? '7px 12px' : '10px 18px'
  const fontSize = size === 'lg' ? 14 : size === 'sm' ? 12 : 13
  const color = danger ? 'var(--color-error)' : 'var(--color-text)'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding, fontSize, fontWeight: 500,
        background: 'linear-gradient(180deg, #FDFAF5 0%, #F4EFE3 100%)',
        border: '1px solid #D5CBBA',
        borderRadius: 8,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 1px rgba(53,40,24,0.05)',
        transition: 'background 0.12s, transform 0.08s, box-shadow 0.12s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'linear-gradient(180deg, #F9F4E8 0%, #EEE7D7 100%)' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = 'linear-gradient(180deg, #FDFAF5 0%, #F4EFE3 100%)' }}
      onMouseDown={e => { if (!disabled) { e.currentTarget.style.transform = 'translateY(1px)'; e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 rgba(0,0,0,0)' } }}
      onMouseUp={e => { if (!disabled) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 1px rgba(53,40,24,0.05)' } }}
    >
      {children}
    </button>
  )
}

// ── Shell de modal partagé : ombre douce, header serif, ESC close ─────────────
function ModalShell({ title, subtitle, onClose, width = 560, children, footer }: {
  title: string
  subtitle?: string
  onClose: () => void
  width?: number
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(28, 22, 18, 0.42)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          width, maxWidth: 'calc(100vw - 48px)', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.6), ' +
            '0 1px 2px rgba(53,40,24,0.08), ' +
            '0 12px 28px rgba(53,40,24,0.18), ' +
            '0 32px 80px rgba(53,40,24,0.18)',
        }}
      >
        <div style={{
          padding: '20px 26px 18px',
          borderBottom: '1px solid var(--color-border)',
          background: 'linear-gradient(180deg, #FDFAF5 0%, #F8F3E8 100%)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
        }}>
          <div>
            <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.018em', lineHeight: 1.2 }}>
              {title}
            </h2>
            {subtitle && <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 6, lineHeight: 1.5 }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, flexShrink: 0,
            background: 'transparent', border: '1px solid transparent',
            color: 'var(--color-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
            transition: 'background 0.12s, color 0.12s, border-color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = 'var(--color-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-muted)' }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {children}
        </div>

        {footer && (
          <div style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--color-border)',
            background: 'linear-gradient(180deg, #FBF6EC 0%, #F4EFE3 100%)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

import React from 'react'
