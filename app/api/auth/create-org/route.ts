import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check if user already has an org
  const { data: existing } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (existing) return NextResponse.json({ org_id: existing.org_id })

  const { name } = await request.json()
  const cabinetName = name || user.user_metadata?.cabinet_name || 'Mon Cabinet'
  const baseSlug = slugify(cabinetName)
  const slug = `${baseSlug}-${Date.now().toString(36)}`

  // Service client bypasses RLS for org creation
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: org, error: orgError } = await service
    .from('prospection_organizations')
    .insert({ name: cabinetName, slug })
    .select()
    .single()
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 })

  const { error: memberError } = await service
    .from('prospection_organization_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' })
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  return NextResponse.json({ org_id: org.id })
}
