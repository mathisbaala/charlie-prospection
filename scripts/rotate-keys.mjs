// Key rotation helper — swaps the 3 sensitive keys both in .env.local AND
// on Vercel (production + preview) in a single pass. Saves the user 6 manual
// edits + 3 vercel CLI prompts.
//
// Usage (interactif, valeurs prompted) :
//   node scripts/rotate-keys.mjs
//
// Usage (CI / non-interactive) :
//   PAPPERS_NEW=xxx ANTHROPIC_NEW=sk-ant-... SUPABASE_SVC_NEW=eyJ... \
//     node scripts/rotate-keys.mjs --apply
//
// Le script :
//   1) lit .env.local
//   2) demande / lit les 3 nouvelles valeurs
//   3) backup .env.local → .env.local.bak.$timestamp
//   4) remplace les 3 clés dans .env.local
//   5) execFile (PAS exec — pas d'injection shell sur la valeur) vercel env rm/add
//   6) suggère `vercel redeploy` à la fin

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, argv } from 'node:process'

const APPLY = argv.includes('--apply')
const ENV_PATH = new URL('../.env.local', import.meta.url)

const TARGETS = [
  { key: 'PAPPERS_API_KEY', envVar: 'PAPPERS_NEW', label: 'Pappers' },
  { key: 'ANTHROPIC_API_KEY', envVar: 'ANTHROPIC_NEW', label: 'Anthropic' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', envVar: 'SUPABASE_SVC_NEW', label: 'Supabase service_role' },
]

const envContent = readFileSync(ENV_PATH, 'utf-8')
const currentLines = envContent.split('\n')

console.log('━━━ Lecture .env.local — clés actuelles ━━━')
for (const t of TARGETS) {
  const line = currentLines.find((l) => l.startsWith(`${t.key}=`))
  if (!line) {
    console.log(`  ⚠ ${t.key}  ABSENT du .env.local`)
  } else {
    const masked = line.slice(t.key.length + 1, t.key.length + 9) + '…' + line.slice(-4)
    console.log(`  ✓ ${t.key}  ${masked}`)
  }
}
console.log()

let rl
if (!APPLY) {
  rl = createInterface({ input: stdin, output: stdout })
}

const newValues = {}
for (const t of TARGETS) {
  let value = process.env[t.envVar]
  if (!value && !APPLY) {
    value = await rl.question(`Nouvelle valeur ${t.label} (laisse vide pour skip) : `)
  }
  if (!value || !value.trim()) {
    console.log(`  → ${t.label} : SKIP`)
    continue
  }
  newValues[t.key] = value.trim()
}
if (rl) rl.close()

if (Object.keys(newValues).length === 0) {
  console.log('Aucune clé à rotater. Fin.')
  process.exit(0)
}

// 3) Backup .env.local
const backupPath = ENV_PATH.pathname.replace(/\/$/, '') + `.bak.${Date.now()}`
copyFileSync(ENV_PATH, backupPath)
console.log(`\n✓ Backup : ${backupPath}`)

// 4) Replace in .env.local
const updated = currentLines.map((line) => {
  for (const [key, val] of Object.entries(newValues)) {
    if (line.startsWith(`${key}=`)) return `${key}=${val}`
  }
  return line
})
writeFileSync(ENV_PATH, updated.join('\n'))
console.log(`✓ .env.local mis à jour\n`)

// 5) Vercel sync — execFileSync avec args array (pas de shell injection sur la valeur)
function vercelRun(args) {
  try {
    execFileSync('vercel', args, { stdio: 'pipe' })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 120) }
  }
}

for (const [key, val] of Object.entries(newValues)) {
  console.log(`━━━ Vercel sync : ${key} ━━━`)
  for (const envScope of [['production'], ['preview', 'intelligence']]) {
    const rmRes = vercelRun(['env', 'rm', key, ...envScope, '--yes'])
    console.log(`  rm ${envScope.join(' ')}: ${rmRes.ok ? 'ok' : '(pas présent)'}`)
    const addRes = vercelRun(['env', 'add', key, ...envScope, '--value', val, '--yes'])
    if (addRes.ok) {
      console.log(`  add ${envScope.join(' ')}: ok`)
    } else {
      console.log(`  add ${envScope.join(' ')}: ✗ ${addRes.error}`)
    }
  }
}

console.log('\n━━━ Terminé ━━━')
console.log('  Pour appliquer en prod : `vercel redeploy` (déclenche un nouveau build)')
console.log(`  Pour rollback : restaure ${backupPath} sur .env.local`)
