# Activation INPI RNE — checklist

> À suivre dès que la demande PAI (Plateforme d'Accès aux Informations)
> INPI est validée et que tu as reçu **token + URL** par email.

## Pré-requis (déjà en place)

- ✅ `lib/data-sources/inpi.ts` — module data-source avec mapping
  exhaustif des types d'événement, pagination, probe, quota wrapper
- ✅ `app/api/cron/inpi-ingest/route.ts` — cron endpoint avec mode
  `?probe=1` et skipped propre tant que les env vars sont absentes
- ✅ `vercel.ts` — cron schedulé à 05:45 UTC
- ✅ `lib/observability/api-quota.ts` — `tryConsumeQuota('inpi')` câblé
- ✅ Migration `20260518000000_api_quota.sql` — table `prospection_api_quota`
- ✅ Tests : `mapInpiTypeToEvent` (19 cas) + `buildInpiInboxRow` (8 cas)
- ✅ Type extension : `prospection_signals.source` accepte `'inpi'`
- ✅ Type extension : `InboxSource` inclut `'inpi'`

## Étape 1 — Recevoir les credentials d'INPI

INPI t'envoie un email avec :
- Une URL de base (varie selon le track demandé)
- Un token Bearer (chaîne opaque)
- Un guide de l'API avec les endpoints exposés

**Les deux tracks possibles** :
| Track | URL typique | Use case |
|---|---|---|
| API Formalité | `https://api.inpi.fr/formality` | Formalités RCS récentes |
| API RNE direct | `https://registre-national-entreprises.inpi.fr/api` | Diff complet RNE |

Le second est plus complet — préférer si proposé.

## Étape 2 — Poser les env vars sur Vercel

```bash
# Dans le repo, depuis ta branche intelligence
vercel env add INPI_API_TOKEN production
# (paste le token, puis Enter)

vercel env add INPI_API_BASE production
# (paste la base URL SANS trailing slash, ex. https://api.inpi.fr/formality)

# Optionnel — seulement si INPI utilise un path non-standard
# (par défaut le cron tape /companies/diff)
vercel env add INPI_API_PATH production
# (paste le path, ex. /entreprises/diff ou /v1/formality/changes)

# Optionnel — cap de quota (défaut 500 calls/jour)
vercel env add INPI_DAILY_LIMIT production
# (paste un nombre, ex. 200)
```

Répéter pour `preview` et `development` si tu veux que les preview
branches fonctionnent aussi.

## Étape 3 — Probe (test de connexion SANS ingestion)

Mode `?probe=1` sur le cron — fetch 1 record, retourne diagnostics
mais n'écrit rien.

```bash
CS=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -H "Authorization: Bearer $CS" \
  'https://charlie-prospection.vercel.app/api/cron/inpi-ingest?probe=1'
```

Réponses possibles :

| Réponse | Interprétation |
|---|---|
| `{ok:true, status:200, sample_count:N, sample_first:{...}}` | 🟢 Tout OK, INPI répond, on extrait N formalités. Vérifier `sample_first` pour valider que les champs `id`, `siren`, `typeEvenement`, etc. existent. |
| `{ok:true, status:200, sample_count:0, sample_first:null}` | 🟡 Auth OK mais l'envelope est vide ou différent. Soit pas de data récente, soit le `responseExtractor` ne reconnaît pas le shape. Inspecter la réponse brute dans les Vercel logs (timedFetch). |
| `{ok:false, status:401, message:"..."}` | 🔴 Token invalide ou expiré. Revoir l'env var. |
| `{ok:false, status:403, message:"..."}` | 🔴 Token valide mais sans droit sur cet endpoint. Vérifier l'abonnement INPI. |
| `{ok:false, status:404, message:"..."}` | 🔴 Path non trouvé. INPI utilise un autre chemin que `/companies/diff`. Poser `INPI_API_PATH`. |
| `{ok:false, status:null, message:"..."}` | 🔴 Erreur réseau / timeout. Vérifier l'URL. |
| `{ok:false, skipped:true, reason:"..."}` | 🟡 Env vars pas posées. Recommencer Étape 2. |

### Si l'envelope est non standard

Le code accepte par défaut 4 shapes :
- `{ formalites: [...] }`
- `{ data: [...] }`
- `{ items: [...] }`
- Root array `[...]`

Si INPI renvoie autre chose (ex. `{ result: { entries: [...] } }`),
inspecter la réponse brute via les logs Vercel puis customiser :

```ts
// Dans app/api/cron/inpi-ingest/route.ts, dans runIngest():
const records = await fetchInpiDailyDiff({
  sinceDate, baseUrl, token,
  path: process.env.INPI_API_PATH,
  responseExtractor: (j) => (j as any)?.result?.entries ?? [],
})
```

## Étape 4 — Premier run réel

Une fois la probe verte :

```bash
curl -H "Authorization: Bearer $CS" \
  https://charlie-prospection.vercel.app/api/cron/inpi-ingest
```

Réponse attendue :
```json
{
  "ok": true,
  "fetched": 1234,
  "ingested": 1230,
  "skipped_duplicates": 0,
  "skipped_invalid": 4
}
```

Vérifications post-run :
```sql
-- Distribution par type_event sur les signaux INPI ingérés
select type_event, count(*)
  from prospection_signals_inbox
  where source = 'inpi'
  group by type_event
  order by count(*) desc;

-- Sample du raw_data pour confirmer les champs disponibles
select raw_data
  from prospection_signals_inbox
  where source = 'inpi'
  limit 3;
```

Si la distribution `type_event` montre beaucoup de `'autre'` :
- C'est que le mapping de `mapInpiTypeToEvent` ne reconnaît pas les
  vraies valeurs de `typeEvenement` retournées par INPI.
- Récupérer les valeurs réelles dans `raw_data->>typeEvenement` et
  enrichir `mapInpiTypeToEvent` dans `lib/data-sources/inpi.ts`.

## Étape 5 — Validation du matching

Le cron `match-icps` (06:30 UTC) joint automatiquement les nouveaux
signaux INPI aux prospects en `/suivi` par SIREN. Pour vérifier après
24h :

```sql
-- Combien de signaux per-prospect d'origine INPI ?
select count(*)
  from prospection_signals s
  where s.data->>'inbox_source' = 'inpi';

-- Quels prospects ont reçu des signaux INPI ?
select p.id, p.linkedin_data->>'nom' as nom,
       count(s.id) as signaux_inpi
  from prospection_prospects p
  join prospection_signals s on s.prospect_id = p.id
  where s.data->>'inbox_source' = 'inpi'
  group by p.id, p.linkedin_data->>'nom';
```

## Étape 6 — Validation côté UI

- Aller sur `/suivi`
- Ouvrir un prospect qui a reçu des signaux INPI
- Tab "Signaux" — les nouveaux types apparaissent dans les chips de filtre
  (Modif capital, Modif BE, etc.)
- Tab "Fiche" — pas de changement direct (les signaux INPI nourrissent
  uniquement le timeline)

## Étape 7 — Surveillance opérationnelle

Une fois activé, vérifier régulièrement :

```bash
# Quota du jour (en cours)
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/get_api_quota" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_source":"inpi"}'
```

Si tu vois souvent `count` qui colle au cap → augmenter `INPI_DAILY_LIMIT`
ou réduire le `maxRecords` du fetch.

## Troubleshooting

| Symptôme | Cause probable | Fix |
|---|---|---|
| `fetched > 0`, `ingested = 0` | Tous les IDs sont déjà connus (dédup) | Normal après le 1er run quotidien |
| `fetched = 0` | Pas de diff sur la fenêtre 24h, OU envelope non reconnu | Probe + inspecter raw response |
| Beaucoup de `type_event = 'autre'` | `mapInpiTypeToEvent` ne couvre pas le vocab INPI réel | Enrichir le mapper avec les valeurs trouvées dans `raw_data` |
| HTTP 401 après ~30 jours | Token rotation côté INPI | Régénérer + replacer dans Vercel env |
| Quota daily atteint trop vite | Trop de pages fetchées | Baisser `maxRecords` ou augmenter `INPI_DAILY_LIMIT` |

## Désactivation temporaire

Si on doit suspendre INPI sans tout démonter :

```bash
vercel env rm INPI_API_TOKEN production
```

Le cron va se remettre en mode `skipped` propre. Réactivation = re-add
de la variable.
