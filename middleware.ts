import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Login page is always reachable
  if (pathname === '/login') {
    return NextResponse.next()
  }

  // Next.js internals and static assets (anything with a file extension)
  if (pathname.startsWith('/_next/') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Server-to-server routes authenticate themselves with a shared secret
  // (called by n8n, never the browser) so they carry no session cookie.
  // Let them reach their own handlers, which enforce the x-stock-api-key check.
  if (pathname.startsWith('/api/stock-enquiry')) {
    return NextResponse.next()
  }

  // Everything else — all pages AND all remaining /api/* routes — requires a
  // logged-in session. Those API routes run with the service-role key (which
  // bypasses RLS), so this middleware is their only access gate: without this,
  // any anonymous caller could hit e.g. /api/admin/create-user.
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() revalidates the token against the Auth server; getSession() only
  // decodes the cookie locally. This gate fronts RLS-bypassing routes, so use
  // the stronger check.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // For API routes, answer with a JSON 401 rather than an HTML redirect.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.svg).*)'],
}
