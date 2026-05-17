// Authentification des requêtes provenant de l'extension Chrome.
// L'extension envoie `Authorization: Ext-Key ext_{uuid}` au lieu du cookie Supabase.
// Ce module valide ce token contre la table prospection_linkedin_sessions.

import { createClient as createServiceClient } from '@supabase/supabase-js'

export interface ExtensionAuth {
  user_id: string
  org_id: string
  session_id: string
}

export async function authenticateExtension(request: Request): Promise<ExtensionAuth | null> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Ext-Key ')) return null

  const api_token = auth.slice(8).trim()
  if (!api_token.startsWith('ext_')) return null

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from('prospection_linkedin_sessions')
    .select('id, user_id, org_id')
    .eq('api_token', api_token)
    .maybeSingle()

  if (!data) return null
  return { user_id: data.user_id, org_id: data.org_id, session_id: data.id }
}
