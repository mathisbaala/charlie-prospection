import { NextResponse } from 'next/server'
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
  const { email, password, name } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'email et password requis' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Create user with email already confirmed — no email required
  const { data: userData, error: userError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { cabinet_name: name },
  })

  if (userError) {
    // User already exists → let the client sign in normally
    if (userError.message.includes('already been registered') || userError.code === 'email_exists') {
      return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 })
    }
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  const userId = userData.user.id
  const cabinetName = name || 'Mon Cabinet'
  const slug = `${slugify(cabinetName)}-${Date.now().toString(36)}`

  // Create org immediately (same logic as create-org route)
  const { data: existing } = await service
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .single()

  if (!existing) {
    const { data: org, error: orgError } = await service
      .from('prospection_organizations')
      .insert({ name: cabinetName, slug })
      .select()
      .single()

    if (!orgError && org) {
      await service
        .from('prospection_organization_members')
        .insert({ org_id: org.id, user_id: userId, role: 'owner' })
    }
  }

  return NextResponse.json({ ok: true })
}
