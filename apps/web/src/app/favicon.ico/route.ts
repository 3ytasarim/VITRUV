import { NextResponse, type NextRequest } from 'next/server';

/** Browsers that ask for /favicon.ico directly get the CMS-logo icon (app/icon.tsx). */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/icon', request.url), 308);
}
