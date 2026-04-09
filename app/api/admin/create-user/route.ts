import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { email, password, displayname } = await request.json()

    if (!email || !password || !displayname) {
      return NextResponse.json({ success: false, error: 'Missing required fields' })
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      return NextResponse.json({ success: false, error: authError?.message || 'Failed to create user' })
    }

    // Create user record in tblusers
    const { error: dbError } = await supabaseAdmin
      .from('tblusers')
      .insert({
        userid: authData.user.id,
        email,
        displayname,
        isactive: true,
      })

    if (dbError) {
      // Rollback auth user if db insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ success: false, error: dbError.message })
    }

    return NextResponse.json({ success: true, userid: authData.user.id })

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
