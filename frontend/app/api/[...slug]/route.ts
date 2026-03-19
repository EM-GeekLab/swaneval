import type { NextRequest } from 'next/server'

async function handler(request: NextRequest) {
  const apiEndpoint = process.env.API_ENDPOINT || 'http://localhost:8000/'

  const pathRelative = request.nextUrl.pathname + request.nextUrl.search + request.nextUrl.hash
  const url = new URL(pathRelative, apiEndpoint)

  return fetch(new Request(url, request)).catch((err) => {
    return Response.json({ error: 'Bad Gateway', detail: err.message }, { status: 502 })
  })
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as DELETE,
  handler as PATCH,
  handler as HEAD,
  handler as OPTIONS,
}
