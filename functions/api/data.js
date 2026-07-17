// Pages Function: чтение/запись данных хранилища в Cloudflare KV.
// Доступ защищён токеном (переменная окружения DATA_TOKEN).
// KV-неймспейс привязывается как FORMVAULT_KV в настройках Pages.

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, x-data-token',
};

function checkAuth(request, env) {
  const token = request.headers.get('x-data-token');
  if (!env.DATA_TOKEN || !token || token !== env.DATA_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }
  return null;
}

function checkKV(env) {
  if (!env.FORMVAULT_KV) {
    return new Response(JSON.stringify({ error: 'kv not bound' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;

  // --- CORS preflight ---
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  // --- GET: вернуть сохранённые данные ---
  if (request.method === 'GET') {
    const authErr = checkAuth(request, env);
    if (authErr) return authErr;

    const kvErr = checkKV(env);
    if (kvErr) return kvErr;

    const raw = await env.FORMVAULT_KV.get('data');
    if (raw) {
      return new Response(raw, { headers: JSON_HEADERS });
    }
    return new Response(
      JSON.stringify({ fields: [], updatedAt: 0 }),
      { headers: JSON_HEADERS }
    );
  }

  // --- PUT: сохранить данные ---
  if (request.method === 'PUT') {
    const authErr = checkAuth(request, env);
    if (authErr) return authErr;

    const kvErr = checkKV(env);
    if (kvErr) return kvErr;

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'bad json' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const fields = Array.isArray(body.fields) ? body.fields : [];
    const payload = { fields, updatedAt: Date.now() };
    await env.FORMVAULT_KV.put('data', JSON.stringify(payload));
    return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ error: 'method not allowed' }), {
    status: 405,
    headers: JSON_HEADERS,
  });
}
