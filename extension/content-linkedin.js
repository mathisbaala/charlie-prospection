// content-linkedin.js — injecté dans toutes les pages linkedin.com

// Miroir des logs [Charlie CS] vers la console du Service Worker, pour qu'on voie
// tout au même endroit (chrome://extensions → service worker). Filtré sur le prefix
// pour ne pas spammer avec les logs internes de LinkedIn.
;(() => {
  const forward = (level, args) => {
    if (typeof args[0] !== 'string' || !args[0].includes('[Charlie CS]')) return
    const text = args.map(a => {
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch (_) { return String(a) }
    }).join(' ')
    try { chrome.runtime.sendMessage({ type: 'CS_LOG', level, text }) } catch (_) {}
  }
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  console.log  = (...args) => { origLog(...args);  forward('log',  args) }
  console.warn = (...args) => { origWarn(...args); forward('warn', args) }
})()

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    SEARCH_PROFILE:   () => searchForProfile(msg.first_name, msg.last_name, msg.company, msg.city),
    SEND_INVITATION:  () => sendInvitation(msg.note),
    CHECK_CONNECTION: () => checkConnectionStatus(),
    SEND_DM:          () => sendDirectMessage(msg.message),
  }
  const handler = handlers[msg.type]
  if (!handler) return false
  handler().then(sendResponse).catch(e => sendResponse({ ok: false, error: e?.message ?? String(e) }))
  return true
})

// ── Mots-clés FR + EN ────────────────────────────────────────────────────────
const KW = {
  connect:  ['se connecter', 'connect'],
  disconnect: ['se déconnecter', 'disconnect', 'retirer'],
  follow:   ['suivre', '+ suivre', 'follow', '+ follow'],
  unfollow: ['ne plus suivre', 'unfollow'],
  message:  ['message'],
  pending:  ['en attente', 'pending', 'invitation envoyée', 'invitation sent'],
}
const RE = {
  addNote:    /add a note|ajouter une note/i,
  sendInvite: /^(send|envoyer)$|send without|envoyer sans|send invitation|envoyer l.invitation/i,
}

// ── Recherche de profil ───────────────────────────────────────────────────────
async function searchForProfile(firstName, lastName, company, city) {
  console.log(`[Charlie CS] 🔍 Recherche: "${firstName} ${lastName}" | co: "${company||'?'}" | ville: "${city||'?'}"`)
  await waitForSelector('.search-results-container, .artdeco-list, [data-chameleon-result-urn], main ul li', 10000)
  await sleep(2500)

  // Détecter le mur de quota mensuel LinkedIn AVANT toute autre logique. Si on
  // continue à chercher après ce point, on gaspille des cycles ET on envoie un
  // signal "bot acharné" à LinkedIn.
  const pageText = document.body.textContent || ''
  const quotaPatterns = /reached the (monthly|commercial) limit|atteint la limite (mensuelle|commerciale)|monthly limit for profile searches|limite mensuelle (de|des) recherches/i
  if (quotaPatterns.test(pageText)) {
    console.warn(`[Charlie CS] 🚫 Quota search LinkedIn atteint — abandon de la recherche`)
    return { ok: false, error: 'search_quota_exceeded' }
  }

  const norm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim()
  const f=norm(firstName), l=norm(lastName), co=norm(company), ci=norm(city)

  const profileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'))
  console.log(`[Charlie CS] ${profileLinks.length} liens /in/`)
  const candidates = []

  for (const link of profileLinks) {
    const href = link.getAttribute('href') || ''
    if (href.includes('/in/me') || href.includes('miniProfile')) continue
    const card = link.closest('li, [data-chameleon-result-urn], .search-result__wrapper, article') || link.parentElement
    const text = norm(card?.textContent || '')
    if (f && !text.includes(f)) continue
    if (l && !text.includes(l)) continue
    const match = href.match(/\/in\/([\w%.-]+)/)
    if (!match) continue
    let score = 1
    if (co && text.includes(norm(co.split(' ')[0]))) score += 3
    if (ci && text.includes(ci)) score += 2
    candidates.push({ score, slug: decodeURIComponent(match[1]).replace(/\/$/, ''), text: text.slice(0,120) })
  }

  if (!candidates.length) {
    console.warn(`[Charlie CS] ❌ Aucun profil: "${firstName} ${lastName}"`)
    return { ok: false, error: 'profile_not_found' }
  }
  candidates.sort((a,b) => b.score - a.score)
  const best = candidates[0]
  const url = `https://www.linkedin.com/in/${best.slug}/`
  const bestLink = profileLinks.find(l => l.getAttribute('href')?.includes(best.slug))
  const bestCard = bestLink?.closest('li, [data-chameleon-result-urn], .search-result__wrapper, article') || bestLink?.parentElement
  const jobTitle = bestCard?.querySelector('div:nth-child(2), .entity-result__primary-subtitle, [class*="subtitle"]')?.textContent?.trim()
    || bestCard?.textContent?.replace(firstName,'').replace(lastName,'').trim().split('\n').filter(s=>s.trim().length>5)[0]?.trim() || ''
  console.log(`[Charlie CS] ✅ Profil (score ${best.score}/${candidates.length}): ${url} | titre: "${jobTitle}"`)
  return { ok: true, linkedin_url: url, job_title: jobTitle }
}

// ── Envoyer une invitation ────────────────────────────────────────────────────
const MODAL_SELECTORS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '.artdeco-modal',
  '.artdeco-modal-overlay',
  '[data-test-modal]',
  '[data-test-modal-container]',
  '.send-invite',
  '.send-invite-modal',
]

// Cherche un modal d'invitation visible n'importe où dans le DOM (LinkedIn le porte
// sur <body>, hors de main). Retourne le plus large des matches (top-level).
function findInvitationModal() {
  const seen = new Set()
  const candidates = []
  for (const sel of MODAL_SELECTORS) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue
      seen.add(el)
      const r = el.getBoundingClientRect()
      if (r.width < 100 || r.height < 100) continue
      const text = (el.textContent || '').toLowerCase()
      const looksLikeInvite =
        /add a note|ajouter une note|send without|envoyer sans|invitation|connect to/.test(text)
      candidates.push({ el, looksLikeInvite, area: r.width * r.height })
    }
  }
  if (!candidates.length) return null
  // Préférer celui qui ressemble à un modal d'invitation, sinon le plus grand
  candidates.sort((a, b) => {
    if (a.looksLikeInvite !== b.looksLikeInvite) return a.looksLikeInvite ? -1 : 1
    return b.area - a.area
  })
  return candidates[0].el
}

async function waitForInvitationModal(timeoutMs = 8000) {
  const start = Date.now()
  let lastDump = 0
  while (Date.now() - start < timeoutMs) {
    const modal = findInvitationModal()
    if (modal) return modal
    // Dump périodique de l'état du DOM toutes les 1.5s pour aider au debug
    if (Date.now() - lastDump > 1500) {
      lastDump = Date.now()
      const counts = MODAL_SELECTORS.map(sel => `${sel}=${document.querySelectorAll(sel).length}`).join(' ')
      console.log(`[Charlie CS] ⏳ attente modal (${((Date.now()-start)/1000).toFixed(1)}s) — ${counts}`)
    }
    await sleep(250)
  }
  return null
}

async function sendInvitation(note) {
  console.log(`[Charlie CS] 📨 Invitation (note demandée: ${note ? 'oui' : 'non'}) — url=${location.href}`)
  await sleep(2000)

  // Détecter le 404 LinkedIn : la page redirige vers /404/ ou affiche "This page doesn't exist"
  if (isLinkedIn404()) {
    console.warn(`[Charlie CS] 🗑️ Profil 404 — URL invalide, demande suppression du prospect`)
    return { ok: false, error: 'profile_not_found_404' }
  }

  // Détecter statut réel AVANT de chercher le bouton
  const status = await checkConnectionStatus()
  if (status.is_connected) {
    console.log('[Charlie CS] ✅ Déjà connecté (1st)')
    return { ok: true, already_connected: true }
  }

  // Chercher "Se connecter / Connect" direct ou dans More
  let connectBtn = findButton(KW.connect, { exclude: KW.disconnect, checkAria: true })
  let viaMore = false
  if (!connectBtn) {
    const moreBtn = findMoreButton()
    if (moreBtn) {
      console.log(`[Charlie CS] Clic More: "${moreBtn.textContent.replace(/\s+/g,' ').trim()}"`)
      moreBtn.click()
      await sleep(800)
      connectBtn = findButton(KW.connect, { exclude: KW.disconnect, checkAria: true })
      viaMore = true
    }
  }
  if (!connectBtn) {
    console.warn('[Charlie CS] ❌ Bouton Connect non trouvé (direct + More)')
    return { ok: false, error: 'connect_button_not_found' }
  }

  const btnRect = connectBtn.getBoundingClientRect()
  console.log(`[Charlie CS] Clic Connect ${viaMore?'(via More) ':''}: "${connectBtn.textContent.replace(/\s+/g,' ').trim()}" @ (${Math.round(btnRect.x)},${Math.round(btnRect.y)})`)
  await clickRobust(connectBtn)

  // Si on a cliqué via le menu More, fermer le menu pour qu'il ne masque pas le modal
  if (viaMore) {
    await sleep(600)
    // Click ailleurs (ESC ou click sur le body) pour fermer le dropdown
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(300)
  }

  // Stratégie : on essaie TOUJOURS "Send without a note" en premier — c'est le
  // chemin le plus rapide et le plus fiable.
  console.log(`[Charlie CS] Recherche bouton "Send without a note" (10s)`)
  const sendWithout = await waitForVisibleButton(matchSendWithoutNote, 10000)
  if (sendWithout) {
    await humanPause('Lecture du modal avant envoi', 2500, 6000)
    return clickAndConfirm(sendWithout, '✅ Invitation envoyée (Send without a note)')
  }

  // Fallback texte : recherche par contenu textuel (traverse aussi les shadow DOM).
  // Utile si LinkedIn met le bouton dans un Web Component custom non détecté.
  console.log(`[Charlie CS] Recherche fallback par texte`)
  const byText = findClickableByText(/send without|envoyer sans/i)
  if (byText) {
    console.log(`[Charlie CS] ✓ Trouvé via texte: <${byText.tagName}> "${(byText.textContent||'').trim().slice(0,50)}"`)
    await humanPause('Lecture du modal avant envoi', 2500, 6000)
    return clickAndConfirm(byText, '✅ Invitation envoyée (via fallback texte)')
  }

  // Pas de "Send without a note" ? On regarde si on a un "Send" / "Envoyer" actif
  // (cas où LinkedIn affiche un modal simplifié sans option note)
  const plainSend = await waitForVisibleButton(matchPlainSend, 3000)
  if (plainSend) {
    await humanPause('Lecture du modal avant envoi', 2500, 6000)
    return clickAndConfirm(plainSend, '✅ Invitation envoyée (Send simple)')
  }

  const plainSendByText = findClickableByText(/^\s*(send|envoyer)\s*$/i)
  if (plainSendByText) {
    await humanPause('Lecture du modal avant envoi', 2500, 6000)
    return clickAndConfirm(plainSendByText, '✅ Invitation envoyée (Send simple via texte)')
  }

  // Dernier recours : si une note est demandée et qu'on a "Add a note", on tente
  // le flow complet (clic Add a note → tape → Send)
  if (note) {
    console.log(`[Charlie CS] Tentative flow avec note`)
    const addNoteBtn = await waitForVisibleButton(b => RE.addNote.test(b.textContent), 3000)
    if (addNoteBtn) {
      await clickRobust(addNoteBtn)
      await sleep(800)
      const textarea = await waitForVisibleElement(
        () => document.querySelector('textarea, [contenteditable="true"]'),
        3000
      )
      if (textarea) {
        textarea.focus(); await sleep(300); await typeSlowly(textarea, note); await sleep(400)
        const sendBtn = await waitForVisibleButton(matchPlainSend, 5000)
        if (sendBtn) {
          return clickAndConfirm(sendBtn, '✅ Invitation envoyée (avec note)')
        }
      }
    }
  }

  // Si Connect a disparu c'est peut-être passé silencieusement
  await sleep(500)
  const stillConnect = findButton(KW.connect, { exclude: KW.disconnect, checkAria: true })
  if (!stillConnect) {
    console.log('[Charlie CS] ✅ Invitation envoyée (Connect a disparu, sans modal détecté)')
    return { ok: true }
  }

  // Diagnostic final : dump des boutons visibles pour comprendre
  dumpVisibleButtons('Échec send_button_not_found')
  return { ok: false, error: 'send_button_not_found' }
}

// Détecte si la page courante est un 404 LinkedIn (URL invalide).
function isLinkedIn404() {
  if (location.pathname.startsWith('/404')) return true
  const txt = (document.body?.textContent || '').toLowerCase()
  if (/this page doesn'?t exist|cette page n'existe pas|please check your url/.test(txt)) return true
  return false
}

function matchSendWithoutNote(b) {
  const t = (b.textContent || '').replace(/\s+/g,' ').trim().toLowerCase()
  const a = (b.getAttribute('aria-label') || '').toLowerCase().trim()
  return /send without|envoyer sans/.test(t + ' ' + a)
}

function matchPlainSend(b) {
  const t = (b.textContent || '').replace(/\s+/g,' ').trim().toLowerCase()
  const a = (b.getAttribute('aria-label') || '').toLowerCase().trim()
  if (/send without|envoyer sans/.test(t + ' ' + a)) return false // exclu le "Send without"
  return t === 'send' || t === 'envoyer'
    || t === 'send invitation' || t === "envoyer l'invitation"
    || /^send invitation/.test(a) || /^envoyer l.invitation/.test(a)
}

// Clic robuste : pointerdown + mousedown + mouseup + pointerup + click
// LinkedIn écoute parfois pointer events, parfois mouse, parfois les deux.
async function clickRobust(el) {
  el.scrollIntoView({ block: 'center', behavior: 'instant' })
  await sleep(200)
  const r = el.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }
  el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse' }))
  el.dispatchEvent(new MouseEvent('mousedown', opts))
  el.dispatchEvent(new PointerEvent('pointerup',   { ...opts, pointerType: 'mouse' }))
  el.dispatchEvent(new MouseEvent('mouseup',   opts))
  el.click()
}

// Pause aléatoire pour mimer un comportement humain (lecture, réflexion).
// Utilise sleep() abortable : si bot_running=false pendant la pause, le job s'arrête.
async function humanPause(label, minMs, maxMs) {
  const ms = Math.round(minMs + Math.random() * (maxMs - minMs))
  console.log(`[Charlie CS] 🕒 ${label} — pause ${(ms/1000).toFixed(1)}s`)
  await sleep(ms)
}

async function clickAndConfirm(btn, successMsg) {
  console.log(`[Charlie CS] Clic: "${btn.textContent.replace(/\s+/g,' ').trim()}"`)
  btn.scrollIntoView({ block: 'center', behavior: 'instant' })
  await sleep(300)
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  btn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }))
  btn.click()
  await sleep(1200)
  console.log(`[Charlie CS] ${successMsg}`)
  return { ok: true }
}

// Cherche TOUS les éléments cliquables dans le DOM, y compris dans les shadow roots
// et les iframes same-origin. LinkedIn cache parfois ses modals dans un shadow DOM
// (Web Components), donc querySelectorAll('button') sur document seul ne suffit pas.
function findAllClickableElements() {
  const result = []
  function walk(root) {
    try {
      for (const el of root.querySelectorAll('button, [role="button"], a[href]')) {
        result.push(el)
      }
      // Shadow roots
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) walk(el.shadowRoot)
      }
    } catch (_) {}
  }
  walk(document)
  // Iframes (same-origin uniquement)
  for (const frame of document.querySelectorAll('iframe')) {
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document
      if (doc) walk(doc)
    } catch (_) {}
  }
  return result
}

// Fallback : trouve un élément dont le TEXTE visible matche le pattern, où qu'il soit
// dans la page (y compris shadow DOM). Remonte au parent cliquable.
function findClickableByText(textPattern) {
  function searchIn(root) {
    const walker = (root.ownerDocument || root).createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      const text = node.textContent || ''
      if (!textPattern.test(text)) continue
      // Remonte au parent cliquable
      let el = node.parentElement
      while (el) {
        const tag = el.tagName
        if (tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button') {
          return el
        }
        el = el.parentElement
        if (!el || el === root) break
      }
    }
    // Recurse into shadow roots
    try {
      for (const el of root.querySelectorAll?.('*') || []) {
        if (el.shadowRoot) {
          const found = searchIn(el.shadowRoot)
          if (found) return found
        }
      }
    } catch (_) {}
    return null
  }
  return searchIn(document.body)
}

// Attend qu'un bouton visible+actif matchant le prédicat apparaisse, où qu'il soit
// dans le DOM (y compris shadow roots / iframes).
async function waitForVisibleButton(predicate, timeoutMs = 8000) {
  const start = Date.now()
  let lastLog = 0
  while (Date.now() - start < timeoutMs) {
    const all = findAllClickableElements()
    for (const b of all) {
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue
      const r = b.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      try { if (predicate(b)) return b } catch (_) {}
    }
    if (Date.now() - lastLog > 1500) {
      lastLog = Date.now()
      const visibleTexts = all
        .filter(b => {
          const r = b.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && !b.disabled && b.getAttribute('aria-disabled') !== 'true'
        })
        .map(b => {
          const t = (b.textContent || '').replace(/\s+/g,' ').trim()
          const a = (b.getAttribute('aria-label') || '').trim()
          return a ? `${t}[aria=${a}]` : t
        })
        .filter(t => t && t.length < 80)
      console.log(`[Charlie CS] ⏳ attente bouton (${((Date.now()-start)/1000).toFixed(1)}s) — ${all.length} clickables total, ${visibleTexts.length} visibles avec texte: ${visibleTexts.slice(0,15).map(t=>`"${t}"`).join(', ')}`)
    }
    await sleep(250)
  }
  return null
}

async function waitForVisibleElement(finder, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { const el = finder(); if (el) return el } catch (_) {}
    await sleep(200)
  }
  return null
}

function dumpVisibleButtons(why) {
  const all = findAllClickableElements()
  const visible = all.filter(b => {
    const r = b.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }).map(b => ({
    text: (b.textContent || '').replace(/\s+/g,' ').trim().slice(0, 80),
    aria: (b.getAttribute('aria-label') || '').slice(0, 80),
    disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
  }))
  console.warn(`[Charlie CS] 🔍 ${why} — ${visible.length} clickables visibles (incl. shadow/iframes):`)
  visible.forEach((b, i) => {
    if (b.text || b.aria) console.warn(`  [${i}] text="${b.text}" aria="${b.aria}" disabled=${b.disabled}`)
  })
  // Diagnostic supplémentaire : présence d'éléments contenant "Send without"
  const sendWithoutInHTML = document.body.innerHTML.match(/send without[^<]{0,40}/i)
  if (sendWithoutInHTML) {
    console.warn(`[Charlie CS] 🕵 "Send without" trouvé dans innerHTML: "${sendWithoutInHTML[0]}" — probablement dans un shadow DOM non traversé`)
  } else {
    console.warn(`[Charlie CS] 🕵 Pas de "Send without" dans innerHTML — modal pas affiché ?`)
  }
  // Lister les dialogs
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
  console.warn(`[Charlie CS] 🕵 ${dialogs.length} dialog(s):`)
  dialogs.forEach((d, i) => {
    const text = (d.textContent || '').replace(/\s+/g,' ').trim().slice(0, 100)
    console.warn(`  dialog[${i}] visible=${d.getBoundingClientRect().width > 0} text="${text}"`)
  })
}

// ── Vérifier statut de connexion ──────────────────────────────────────────────
// Localise la zone d'action du profil (entête avec les boutons Connect/Message/More).
// LinkedIn change ses classes mais cette zone est toujours en haut de main.
function findProfileHeader() {
  const candidates = [
    '.pv-top-card',
    'section.pv-top-card',
    '.pv-text-details__left-panel',
    'main section:first-of-type',
    'main > section:first-child',
  ]
  for (const sel of candidates) {
    const el = document.querySelector(sel)
    if (el && el.getBoundingClientRect().height > 100) return el
  }
  return null
}

async function checkConnectionStatus() {
  const header = findProfileHeader()

  if (header) {
    // Toutes les actions du profil sont DANS le header. On scope ici pour éviter
    // de matcher un "Connect" dans "People also viewed" ou un autre profil suggéré.
    const headerButtons = Array.from(header.querySelectorAll('button, a[href]'))
      .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    const txtOf = b => ((b.textContent || '').replace(/\s+/g,' ').trim() + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()

    const hasConnect = headerButtons.some(b => {
      const t = txtOf(b)
      return /\b(connect|se connecter)\b/.test(t) && !/\b(disconnect|se déconnecter|retirer)\b/.test(t)
    })
    const hasMessage = headerButtons.some(b => /(?:^|\s|\[)message(?:$|\s)/.test(txtOf(b)))
    const hasPending = headerButtons.some(b => /(pending|en attente|invitation envoyée|invitation sent)/.test(txtOf(b)))

    // Badge 1st/2nd/3rd dans le header (en chiffres ou en abréviations FR/EN)
    const headerText = (header.textContent || '').toLowerCase()
    const has1st = /\b1st\b|·\s*1st|\b1er\b/.test(headerText)
    const has2nd3rd = /\b(2nd|3rd|2ème|3ème|2e|3e)\b/.test(headerText)

    console.log(`[Charlie CS] 🔍 Header — connect:${hasConnect} message:${hasMessage} pending:${hasPending} badge1st:${has1st} badge2nd3rd:${has2nd3rd}`)

    if (hasPending) {
      console.log('[Charlie CS] 🔍 Non connecté (Pending visible dans header)')
      return { ok: true, is_connected: false }
    }
    if (has1st) {
      console.log('[Charlie CS] 🔍 Connecté ✅ (badge 1st dans header)')
      return { ok: true, is_connected: true }
    }
    if (has2nd3rd) {
      console.log('[Charlie CS] 🔍 Non connecté (badge 2nd/3rd dans header)')
      return { ok: true, is_connected: false }
    }
    if (hasMessage && !hasConnect) {
      console.log('[Charlie CS] 🔍 Connecté ✅ (Message présent dans header, pas de Connect)')
      return { ok: true, is_connected: true }
    }
    if (hasConnect) {
      console.log('[Charlie CS] 🔍 Non connecté (Connect dans header)')
      return { ok: true, is_connected: false }
    }
    // Header trouvé mais aucun signal — vérifier le menu More
  }

  // Pas de header reconnu OU header ambigu → fallback : check menu More
  const moreBtn = findMoreButton()
  if (moreBtn) {
    moreBtn.click()
    await sleep(700)
    const connectInMore = findButton(KW.connect, { exclude: KW.disconnect })
    moreBtn.click()
    await sleep(300)
    if (connectInMore) {
      console.log('[Charlie CS] 🔍 Non connecté (Connect dans More dropdown)')
      return { ok: true, is_connected: false }
    }
  }

  // Header présent + Message visible + pas de Connect ni dans header ni dans More → 1st
  if (header) {
    const headerHasMessage = Array.from(header.querySelectorAll('button, a[href]'))
      .some(b => /(?:^|\s|\[)message(?:$|\s)/.test(((b.textContent||'') + ' ' + (b.getAttribute('aria-label')||'')).toLowerCase()))
    if (headerHasMessage) {
      console.log('[Charlie CS] 🔍 Connecté ✅ (Message dans header, aucun Connect trouvé)')
      return { ok: true, is_connected: true }
    }
  }

  // Follow visible quelque part → pas connecté
  const followBtn = findButton(KW.follow, { exclude: KW.unfollow, checkAria: true })
  if (followBtn) {
    console.log('[Charlie CS] 🔍 Non connecté (Follow visible)')
    return { ok: true, is_connected: false }
  }

  // 6. Message seul sans aucun autre signal → connecté
  const messageBtn = findButton(KW.message, { exclude: ['msg-overlay-conversation-bubble', 'typeahead'], checkAria: true })
  const connected = !!messageBtn
  console.log(`[Charlie CS] 🔍 ${connected ? 'Connecté ✅ (Message seul)' : 'Statut indéterminé'}`)
  return { ok: true, is_connected: connected }
}

// ── Envoyer un DM ─────────────────────────────────────────────────────────────
async function sendDirectMessage(message) {
  console.log(`[Charlie CS] 💬 DM (${message.length} chars)`)
  await sleep(2000)

  for (const frame of document.querySelectorAll('iframe')) {
    if (/li\.protechts\.net|recaptcha\/enterprise|merchantpool1\.linkedin\.com/.test(frame.src||''))
      return { ok: false, error: 'bot_detection' }
  }

  const bubblesBefore = document.querySelectorAll('.msg-overlay-conversation-bubble').length
  const messageBtn = findButton(KW.message, { exclude: ['msg-overlay-conversation-bubble', 'typeahead'], checkAria: true })
  if (!messageBtn) return { ok: false, error: 'message_button_not_found' }
  messageBtn.click()
  await sleep(2200)

  let textbox = null
  for (let attempt = 0; attempt < 35; attempt++) {
    for (const frame of document.querySelectorAll('iframe')) {
      if (/li\.protechts\.net|recaptcha\/enterprise/.test(frame.src||''))
        return { ok: false, error: 'bot_detection' }
    }
    const allBubbles = document.querySelectorAll('.msg-overlay-conversation-bubble')
    if (allBubbles.length > bubblesBefore) {
      textbox = allBubbles[allBubbles.length-1].querySelector('[contenteditable="true"]:not([name*="recaptcha"])')
    }
    if (!textbox) {
      const iframe = document.querySelector('[data-testid="interop-iframe"]')
      if (iframe) { try { textbox = (iframe.contentDocument||iframe.contentWindow?.document)?.querySelector('[contenteditable="true"]:not([name*="recaptcha"]):not([id*="recaptcha"])') } catch(_){} }
    }
    if (textbox) break
    await sleep(800)
  }
  if (!textbox) return { ok: false, error: 'textbox_not_found' }

  textbox.focus(); await sleep(400)
  await typeSlowly(textbox, message)
  await sleep(600)
  textbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: true, bubbles: true }))
  await sleep(1200)

  const after = (textbox.textContent || textbox.innerText || '').trim()
  if (after.length === 0) return { ok: true }

  const sendBtn = document.querySelector('[data-testid="msg-form-send-toggle"], button[aria-label*="Envoyer"], button[aria-label*="Send"]')
  if (sendBtn) { sendBtn.click(); await sleep(1000); return { ok: (textbox.textContent||textbox.innerText||'').trim().length === 0 } }
  return { ok: false, error: 'message_not_sent' }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

// Trouve le bouton "More" / "Plus" / "…" pour ouvrir le menu déroulant du profil
function findMoreButton() {
  const btns = Array.from(document.querySelectorAll('button'))
    .filter(btn => { const r = btn.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 })
  btns.sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  return btns.find(btn => {
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase()
    const text = (btn.textContent || '').replace(/\s+/g,' ').trim().toLowerCase()
    return aria.includes("plus d'action") || aria.includes('more action')
      || text === 'more' || text === 'plus'   // ← texte visible FR/EN
      || text === '…'   || text === '...'
  }) || null
}

// Trouve un bouton par mots-clés exacts sur text ou aria-label
function findButton(keywords, opts = {}) {
  const { exclude = [], checkAria = false } = opts
  const all = Array.from(document.querySelectorAll('button, a[href]'))
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
  all.sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  return all.find(el => {
    if (el.disabled) return false
    const text = (el.textContent || '').replace(/\s+/g,' ').trim().toLowerCase()
    const aria = (checkAria ? el.getAttribute('aria-label') || '' : '').toLowerCase().trim()
    const matches = keywords.some(kw => { const k=kw.toLowerCase(); return text===k || aria===k || aria.startsWith(k+' ') || aria.includes(' '+k) })
    if (!matches) return false
    return !exclude.some(ex => { const e=ex.toLowerCase(); if(ex.includes('-')) return !!el.closest(`.${ex}`); return text.includes(e)||aria.includes(e) })
  })
}

async function typeSlowly(el, text) {
  el.focus()
  for (const char of text) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    if (el.contentEditable === 'true') { document.execCommand('insertText', false, char) }
    else {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set
      if (setter) { setter.call(el, el.value+char); el.dispatchEvent(new Event('input', { bubbles: true })) }
    }
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
    await sleep(40 + Math.random()*80)
  }
}

async function waitForSelector(selector, timeout=8000) {
  const start = Date.now()
  while (Date.now()-start < timeout) { if (document.querySelector(selector)) return document.querySelector(selector); await sleep(200) }
  return null
}
async function waitForSelectorIn(root, selector, timeout=3000) {
  const start = Date.now()
  while (Date.now()-start < timeout) { const el=root.querySelector(selector); if(el) return el; await sleep(200) }
  return null
}
// Sleep ABORTABLE : si bot_running passe à false pendant l'attente, jette une
// exception 'aborted' qui remonte tout le call stack — toutes les fonctions du
// content script utilisent ce sleep donc une seule modif suffit.
async function sleep(ms) {
  const tick = 500
  const start = Date.now()
  let lastCheck = 0
  while (Date.now() - start < ms) {
    if (Date.now() - lastCheck >= tick) {
      lastCheck = Date.now()
      try {
        const { bot_running } = await chrome.storage.local.get('bot_running')
        if (!bot_running) {
          console.warn('[Charlie CS] ⏸️ Job aborté (pause détectée pendant sleep)')
          throw new Error('aborted')
        }
      } catch (e) {
        if (e?.message === 'aborted') throw e
        // chrome.storage indisponible → on continue le sleep sans bloquer
      }
    }
    const remaining = ms - (Date.now() - start)
    await new Promise(r => setTimeout(r, Math.min(100, remaining)))
  }
}
