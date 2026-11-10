/** Redirect favicon requests to the bundled brand icon (app/icon.png). */
export function GET() {
  return new Response(null, {
    status: 308,
    headers: {
      Location: '/icon.png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
