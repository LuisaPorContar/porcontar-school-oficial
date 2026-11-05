// ============================================================
// https://academia.porcontar.com/mcp — la dirección del MCP de la Academia.
//
// Función de Cloudflare Pages: se publica sola con el sitio (push a main).
// No tiene lógica propia: pasa cada pedido tal cual a la función de Supabase
// (código en supabase/functions/mcp-academia/index.ts), que revisa la clave
// MCP_TOKEN y pide autorización antes de escribir.
// ============================================================

const DESTINO = 'https://lcbonixjumchbhffyxee.supabase.co/functions/v1/mcp-academia'

export async function onRequest({ request }) {
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.delete('host')
  return fetch(DESTINO + url.search, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  })
}
