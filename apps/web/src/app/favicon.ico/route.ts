import { NextResponse, type NextRequest } from 'next/server';

/** Browsers that ask for /favicon.ico directly get the brand icon (app/icon.png). */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/icon.png', request.url), 308);
}
