// Worker: обработка API /api/data + раздача статических ассетов.
// Доступ защищён токеном (secret DATA_TOKEN).
// KV-неймспейс привязывается как FORMVAULT_KV.

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, x-data-token',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function checkAuth(request, env) {
  const token = request.headers.get('x-data-token');
  if (!env.DATA_TOKEN || !token || token !== env.DATA_TOKEN) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

function checkKV(env) {
  if (!env.FORMVAULT_KV) {
    return json({ error: 'kv not bound' }, 500);
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Только /api/data обрабатываем в Worker, остальное — статические ассеты.
    if (url.pathname !== '/api/data') {
      // Отдаём обработку ассетов (env.ASSETS).
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return json({ error: 'not found' }, 404);
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const authErr = checkAuth(request, env);
    if (authErr) return authErr;

    const kvErr = checkKV(env);
    if (kvErr) return kvErr;

    // GET: чтение данных
    if (request.method === 'GET') {
      const raw = await env.FORMVAULT_KV.get('data');
      if (raw) {
        return new Response(raw, { headers: JSON_HEADERS });
      }
      return json({ fields: [], updatedAt: 0 });
    }

    // PUT: сохранение данных
    if (request.method === 'PUT') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: 'bad json' }, 400);
      }
      const fields = Array.isArray(body.fields) ? body.fields : [];
      const payload = { fields, updatedAt: Date.now() };
      await env.FORMVAULT_KV.put('data', JSON.stringify(payload));
      return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
