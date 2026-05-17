// background.js — Service Worker (MV3)
// Responsabilités :
//  1. Auth : reçoit l'api_token depuis la page Charlie (externally_connectable)
//  2. Cookie capture : détecte LinkedIn et envoie li_at à Charlie
//  3. Heartbeat toutes les 5 min
//  4. Cycle bot toutes les 20 min : récupère les jobs et les exécute
//  5. Gestion des messages depuis popup

// ── Config ──────────────────────────────────────────────────────────────────
// L'URL effective est mémorisée dans chrome.storage.local.api_base après le link.
// Avant le link, on essaie ces candidats dans l'ordre.
const API_CANDIDATES = [
  'https://charlie-prospection.vercel.app',
  'http://localhost:3000',
]

async function getApiBase() {
  const { api_base } = await chrome.storage.local.get('api_base')
  return api_base || API_CANDIDATES[0]
}

const DAILY_LIMITS = { invitation: 30, dm: 50 }

// ── Init ─────────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('heartbeat', { periodInMinutes: 5 })
  chrome.alarms.create('bot-cycle', { periodInMinutes: 20 })
  // Ne pas écraser bot_running si déjà défini (évite le reset au rechargement de l'extension)
  chrome.storage.local.get('bot_running', data => {
    if (data.bot_running === undefined) {
      chrome.storage.local.set({ bot_running: false })
    }
  })
})

// Recréer les alarms au réveil du SW (elles persistent mais on s'assure)
chrome.alarms.getAll(alarms => {
  const names = alarms.map(a => a.name)
  if (!names.includes('heartbeat')) chrome.alarms.create('heartbeat', { periodInMinutes: 5 })
  if (!names.includes('bot-cycle')) chrome.alarms.create('bot-cycle', { periodInMinutes: 20 })
})

// ── Auth : reçoit le token depuis la page Charlie ───────────────────────────
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  // Mode direct : la page envoie l'api_token déjà échangé
  if (msg.type === 'CHARLIE_AUTH' && msg.api_token) {
    chrome.storage.local.set({ api_token: msg.api_token }, () => {
      console.log('[Charlie] Extension liée ✓')
      sendResponse({ ok: true })
    })
    return true
  }

  // Mode exchange : la page envoie un one_time_token, l'extension l'échange
  if (msg.type === 'CHARLIE_TOKEN_EXCHANGE' && msg.one_time_token) {
    exchangeToken(msg.one_time_token).then(ok => sendResponse({ ok }))
    return true
  }
})

async function exchangeToken(oneTimeToken) {
  for (const base of API_CANDIDATES) {
    let res
    try {
      res = await fetch(`${base}/api/outreach/extension/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: oneTimeToken }),
      })
    } catch (_) {
      continue
    }
    if (!res.ok) continue
    const { api_token } = await res.json()
    await chrome.storage.local.set({ api_token, api_base: base })
    console.log(`[Charlie] Token échangé ✓ (${base})`)
    return true
  }
  console.error('[Charlie] Token exchange failed: aucun serveur joignable')
  return false
}

// ── Cookie capture LinkedIn ──────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  if (!tab.url?.includes('linkedin.com/feed')) return
  await captureLinkedInSession()
})

async function captureLinkedInSession() {
  const { api_token } = await chrome.storage.local.get('api_token')
  if (!api_token) return

  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' })
    if (!cookie?.value) return

    const base = await getApiBase()
    const res = await fetch(`${base}/api/outreach/extension/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Ext-Key ${api_token}`,
      },
      body: JSON.stringify({ li_at: cookie.value }),
    })

    if (res.ok) {
      await chrome.storage.local.set({ linkedin_session_valid: true })
      console.log('[Charlie] Cookie LinkedIn capturé ✓')
    }
  } catch (e) {
    console.error('[Charlie] Cookie capture failed:', e)
  }
}

// ── Alarms ──────────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'heartbeat') await sendHeartbeat()
  if (alarm.name === 'bot-cycle') await runBotCycle()
})

async function sendHeartbeat() {
  const { api_token } = await chrome.storage.local.get('api_token')
  if (!api_token) return
  const base = await getApiBase()
  try {
    await fetch(`${base}/api/outreach/extension/heartbeat`, {
      method: 'POST',
      headers: { 'Authorization': `Ext-Key ${api_token}` },
    })
  } catch (_) {}
}

// ── Bot cycle ────────────────────────────────────────────────────────────────
// Exposé sur self pour pouvoir l'appeler depuis la console du Service Worker
self.runBotCycle = runBotCycle
async function runBotCycle() {
  const { api_token, bot_running } = await chrome.storage.local.get(['api_token', 'bot_running'])
  console.log(`[Charlie] runBotCycle — token: ${api_token ? '✅' : '❌ absent'} | bot_running: ${bot_running}`)
  if (!api_token) { console.warn('[Charlie] ❌ Pas de token, cycle annulé'); return }
  if (!bot_running) { console.warn('[Charlie] ❌ Bot arrêté (bot_running=false), cycle annulé'); return }

  // Respecter les heures de travail (8h – 22h)
  const h = new Date().getHours()
  if (h < 8 || h >= 22) {
    console.log(`[Charlie] ⏰ Hors des heures de travail (${h}h), cycle ignoré`)
    return
  }

  const base = await getApiBase()

  try {
    const res = await fetch(`${base}/api/outreach/extension/jobs`, {
      headers: { 'Authorization': `Ext-Key ${api_token}` },
    })
    if (!res.ok) return

    const { jobs } = await res.json()
    if (!jobs?.length) return

    console.log(`[Charlie] ${jobs.length} job(s) à exécuter`)

    for (const job of jobs) {
      // Re-vérifier flag pause + token AVANT chaque job — permet d'interrompre le
      // cycle entre deux jobs si user clique Pause/Déconnecter pendant le sleep
      const state = await chrome.storage.local.get(['bot_running', 'api_token'])
      if (!state.api_token) {
        console.warn('[Charlie] 🔌 Token retiré (déconnexion) — cycle interrompu')
        return
      }
      if (!state.bot_running) {
        console.warn('[Charlie] ⏸️ Bot mis en pause — cycle interrompu')
        return
      }
      const result = await executeJob(job, api_token, base)
      // Pacing adaptatif :
      //   - quota_exceeded : aucune interaction LinkedIn → 5-10s
      //   - already_connected (1st relation) ou 404 : pas d'action visible → 30-60s
      //   - sinon : pacing humain normal 45-120s
      const wasQuotaHit = result?.error === 'search_quota_exceeded'
      const wasNoInteraction =
        result?.already_connected ||
        result?.error === 'profile_not_found_404'
      let paceMs
      let pacingTag = ''
      if (wasQuotaHit) {
        paceMs = 5000 + Math.random() * 5000
        pacingTag = ' (quota → court)'
      } else if (wasNoInteraction) {
        paceMs = 30000 + Math.random() * 30000
        pacingTag = result?.already_connected ? ' (1st relation → moyen)' : ' (404 → moyen)'
      } else {
        paceMs = 45000 + Math.random() * 75000
      }
      console.log(`[Charlie] ⏱️ Pacing ${(paceMs/1000).toFixed(0)}s avant le prochain job${pacingTag}`)
      const interrupted = await interruptibleSleep(paceMs)
      if (interrupted) {
        console.warn('[Charlie] ⏸️ Bot interrompu pendant le pacing — cycle stoppé')
        return
      }
    }
  } catch (e) {
    console.error('[Charlie] Bot cycle error:', e)
  }
}

async function isBotRunning() {
  const { bot_running, api_token } = await chrome.storage.local.get(['bot_running', 'api_token'])
  return !!bot_running && !!api_token
}

// Sleep interruptible : retourne true si bot_running passe à false avant la fin.
async function interruptibleSleep(totalMs) {
  const tick = 1000
  const start = Date.now()
  while (Date.now() - start < totalMs) {
    if (!(await isBotRunning())) return true
    await sleep(Math.min(tick, totalMs - (Date.now() - start)))
  }
  return false
}

// ── Exécution d'un job ───────────────────────────────────────────────────────
// Retourne le résultat du content script pour que runBotCycle puisse ajuster
// le pacing (court si quota_exceeded, normal si vraie interaction LinkedIn).
async function executeJob(job, apiToken, apiBase) {
  const tab = await getLinkedInTab()
  if (!tab) {
    console.warn('[Charlie] Impossible d\'ouvrir un onglet LinkedIn')
    return
  }

  let result = { ok: false, error: 'not_executed' }

  const prospect = `${job.first_name || ''} ${job.last_name || ''}`.trim() || job.profile_url || job.enrollment_id
  console.log(`[Charlie] ▶ ${job.type} — ${prospect}`)

  try {
    if (job.type === 'profile_search') {
      result = await searchProfile(tab.id, job)
    } else if (job.type === 'send_invitation') {
      result = await sendInvitation(tab.id, job)
    } else if (job.type === 'check_connection') {
      result = await checkConnection(tab.id, job)
    } else if (job.type === 'send_dm') {
      result = await sendDM(tab.id, job)
    }
  } catch (e) {
    result = { ok: false, error: String(e) }
  }

  if (result.ok) {
    const detail = result.linkedin_url ? ` → ${result.linkedin_url}`
      : result.already_connected ? ' (déjà connecté)'
      : result.is_connected ? ' (connexion acceptée)'
      : ''
    console.log(`[Charlie] ✅ ${job.type} OK${detail} — ${prospect}`)
  } else if (result.error === 'aborted') {
    console.warn(`[Charlie] ⏸️ ${job.type} interrompu (pause) — ${prospect}`)
    return result // ne pas reporter l'abort au serveur
  } else if (result.error === 'search_quota_exceeded') {
    console.warn(`[Charlie] 🚫 Quota search LinkedIn atteint sur ce profil — on tente directement le suivant`)
  } else if (result.error === 'profile_not_found_404') {
    console.warn(`[Charlie] 🗑️ Profil 404 — prospect sera supprimé de la base — ${prospect}`)
  } else {
    console.warn(`[Charlie] ❌ ${job.type} ÉCHEC (${result.error}) — ${prospect}`)
  }

  // Reporter le résultat
  try {
    await fetch(`${apiBase}/api/outreach/extension/action-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Ext-Key ${apiToken}`,
      },
      body: JSON.stringify({ enrollment_id: job.enrollment_id, job_type: job.type, ...result }),
    })
  } catch (e) {
    console.error('[Charlie] Impossible de reporter le résultat:', e)
  }
  return result
}

// ── Actions LinkedIn (via content script) ───────────────────────────────────

async function searchProfile(tabId, job) {
  const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    (job.first_name + ' ' + job.last_name).trim()
  )}`
  await navigateTo(tabId, url)
  await sleep(3000)
  return sendToContent(tabId, {
    type: 'SEARCH_PROFILE',
    first_name: job.first_name,
    last_name: job.last_name,
    company: job.company,
    city: job.city,
  })
}

async function sendInvitation(tabId, job) {
  await navigateTo(tabId, job.profile_url)
  await sleep(3500)
  return sendToContent(tabId, { type: 'SEND_INVITATION', note: job.note || null })
}

async function checkConnection(tabId, job) {
  await navigateTo(tabId, job.profile_url)
  await sleep(2500)
  return sendToContent(tabId, { type: 'CHECK_CONNECTION' })
}

async function sendDM(tabId, job) {
  await navigateTo(tabId, job.profile_url)
  await sleep(3500)
  return sendToContent(tabId, { type: 'SEND_DM', message: job.message })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getLinkedInTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })
  if (tabs.length) {
    // Rendre l'onglet visible
    await chrome.tabs.update(tabs[0].id, { active: true })
    return tabs[0]
  }
  // Créer un onglet LinkedIn visible
  const tab = await chrome.tabs.create({ url: 'https://www.linkedin.com/feed/', active: true })
  await waitForTabLoad(tab.id)
  return tab
}

async function navigateTo(tabId, url) {
  await chrome.tabs.update(tabId, { url })
  await waitForTabLoad(tabId)
}

function waitForTabLoad(tabId, timeout = 20000) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeout)
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

async function sendToContent(tabId, message, timeoutMs = 30000) {
  // Injecter le content script si absent
  for (let i = 0; i < 3; i++) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, message)
      return result
    } catch (e) {
      if (i === 2) return { ok: false, error: 'content_script_unreachable' }
      // Réinjecter
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content-linkedin.js'] })
      } catch (_) {}
      await sleep(1500)
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Messages depuis le popup ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Logs miroir depuis le content script (pour tout voir dans la console du SW)
  if (msg.type === 'CS_LOG') {
    const tag = `[CS tab:${sender.tab?.id ?? '?'}]`
    if (msg.level === 'warn') console.warn(tag, msg.text)
    else console.log(tag, msg.text)
    return false
  }

  if (msg.type === 'GET_STATUS') {
    chrome.storage.local.get(['api_token', 'linkedin_session_valid', 'bot_running'], data => {
      sendResponse({
        extension_linked: !!data.api_token,
        linkedin_valid: !!data.linkedin_session_valid,
        bot_running: !!data.bot_running,
      })
    })
    return true
  }

  if (msg.type === 'CONNECT_CHARLIE') {
    chrome.storage.local.get(['api_token', 'api_base'], async data => {
      if (!data.api_token) {
        const base = data.api_base || (await getApiBase())
        const extId = chrome.runtime.id
        chrome.tabs.create({ url: `${base}/outreach?link_ext=${extId}` })
      }
      sendResponse({ ok: true })
    })
    return true
  }

  if (msg.type === 'TOGGLE_BOT') {
    chrome.storage.local.get('bot_running', data => {
      const next = !data.bot_running
      chrome.storage.local.set({ bot_running: next }, () => {
        console.log(`[Charlie] ${next ? '▶️ Démarrage' : '⏸️ Pause'} du bot (bot_running=${next})`)
        if (next) {
          runBotCycle()
        } else {
          console.log('[Charlie] ℹ️ Le job en cours peut prendre jusqu’à ~30s pour se terminer, le cycle s’arrêtera après.')
        }
        sendResponse({ bot_running: next })
      })
    })
    return true
  }
})
