import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname === '/login';
  const hasSession = request.cookies.has('clogin_admin_session');

  if (!isLoginPage && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isLoginPage && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon|api).*)'] };
