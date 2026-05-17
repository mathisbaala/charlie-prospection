// popup.js — UI de l'extension

const API_CANDIDATES = [
  'https://charlie-prospection.vercel.app',
  'http://localhost:3000',
]

async function getApiBase() {
  const { api_base } = await chrome.storage.local.get('api_base')
  return api_base || API_CANDIDATES[0]
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' })

  const charlieBadge = document.getElementById('charlie-badge')
  const linkedinBadge = document.getElementById('linkedin-badge')
  const pinSection = document.getElementById('pin-section')
  const btnToggle = document.getElementById('btn-toggle')
  const btnUnlink = document.getElementById('btn-unlink')
  const footer = document.getElementById('footer-msg')

  // Charlie connexion
  if (status.extension_linked) {
    charlieBadge.className = 'badge badge-ok'
    charlieBadge.innerHTML = '<span class="badge-dot"></span>Connecté'
    pinSection.classList.add('hidden')
    btnToggle.classList.remove('hidden')
    btnUnlink.classList.remove('hidden')
  } else {
    charlieBadge.className = 'badge badge-err'
    charlieBadge.innerHTML = '<span class="badge-dot"></span>Non connecté'
    pinSection.classList.remove('hidden')
    btnToggle.classList.add('hidden')
    btnUnlink.classList.add('hidden')
  }

  // LinkedIn session
  if (status.linkedin_valid) {
    linkedinBadge.className = 'badge badge-ok'
    linkedinBadge.innerHTML = '<span class="badge-dot"></span>Actif'
  } else if (status.extension_linked) {
    linkedinBadge.className = 'badge badge-warn'
    linkedinBadge.innerHTML = '<span class="badge-dot"></span>Ouvrir LinkedIn'
  } else {
    linkedinBadge.className = 'badge badge-err'
    linkedinBadge.innerHTML = '<span class="badge-dot"></span>Non détecté'
  }

  // Bot running
  if (status.bot_running) {
    btnToggle.className = 'btn btn-danger'
    btnToggle.textContent = '⏸ Mettre en pause'
    footer.textContent = 'Prospection active — vérifie toutes les 20 min.'
  } else if (status.extension_linked) {
    btnToggle.className = 'btn btn-primary'
    btnToggle.textContent = '▶ Démarrer la prospection'
    footer.textContent = 'Prêt. Lance la prospection depuis ici ou depuis l\'app.'
  }
}

async function linkWithPin() {
  const input = document.getElementById('pin-input')
  const errorEl = document.getElementById('pin-error')
  const btn = document.getElementById('btn-link-pin')
  const pin = input.value.trim().toUpperCase()

  errorEl.style.display = 'none'
  if (pin.length !== 6) {
    errorEl.textContent = 'Le code doit faire 6 caractères.'
    errorEl.style.display = 'block'
    return
  }

  btn.textContent = '…'
  btn.disabled = true

  let lastApiError = null
  let reachedAny = false

  try {
    for (const base of API_CANDIDATES) {
      let res
      try {
        res = await fetch(`${base}/api/outreach/extension/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: pin }),
        })
      } catch (_) {
        continue // serveur injoignable, on essaie le suivant
      }
      reachedAny = true

      if (res.ok) {
        const { api_token } = await res.json()
        await chrome.storage.local.set({ api_token, api_base: base })
        input.value = ''
        await refreshStatus()
        return
      }

      // 4xx : PIN potentiellement émis par un autre serveur, on continue
      const data = await res.json().catch(() => ({}))
      lastApiError = data.error || 'Code invalide ou expiré.'
    }

    errorEl.textContent = reachedAny
      ? lastApiError
      : 'Impossible de joindre Charlie (ni Vercel ni localhost).'
    errorEl.style.display = 'block'
  } finally {
    btn.textContent = 'Lier'
    btn.disabled = false
  }
}

async function toggleBot() {
  const btnToggle = document.getElementById('btn-toggle')
  const footer = document.getElementById('footer-msg')
  // Feedback immédiat : on désactive le bouton et on indique l'action en cours
  // (sans attendre le round-trip vers le SW)
  const wasRunning = btnToggle.textContent.includes('pause')
  btnToggle.disabled = true
  btnToggle.textContent = wasRunning ? '⏳ Pause en cours…' : '⏳ Démarrage…'
  if (wasRunning) footer.textContent = 'Arrêt demandé — le job en cours s\'interrompt dans quelques secondes.'

  try {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_BOT' })
  } finally {
    btnToggle.disabled = false
    await refreshStatus()
  }
}

async function unlink() {
  // 1. STOPPE LE BOT D'ABORD — pour que toute boucle en cours dans runBotCycle
  //    voie bot_running=false au prochain check (interruptibleSleep / isBotRunning)
  await chrome.storage.local.set({ bot_running: false })

  const { api_token } = await chrome.storage.local.get('api_token')
  const base = await getApiBase()
  if (api_token) {
    try {
      await fetch(`${base}/api/outreach/extension/unlink`, {
        method: 'POST',
        headers: { 'Authorization': `Ext-Key ${api_token}` },
      })
    } catch (_) {}
  }

  // 2. Puis on retire toutes les clés
  await chrome.storage.local.remove(['api_token', 'api_base', 'linkedin_session_valid', 'bot_running'])
  await refreshStatus()
}

// ── Event listeners (pas de onclick= dans le HTML — bloqué par CSP MV3) ──────
document.addEventListener('DOMContentLoaded', () => {
  refreshStatus()
  document.getElementById('btn-link-pin').addEventListener('click', linkWithPin)
  document.getElementById('btn-toggle').addEventListener('click', toggleBot)
  document.getElementById('btn-unlink').addEventListener('click', unlink)
  document.getElementById('pin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') linkWithPin()
  })
})
