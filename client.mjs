export class WalkthroughApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'WalkthroughApiError';
    this.status = status;
  }
}

export function createWalkthroughApi({ baseUrl, token, fetchImpl = fetch }) {
  const root = String(baseUrl || '').trim().replace(/\/+$/, '');
  const secret = String(token || '').trim();
  if (!/^https?:\/\//.test(root)) throw new Error('WALKTHROUGH_DESK_URL 必须是 http(s) URL');
  if (!secret) throw new Error('缺少 WALKTHROUGH_DESK_TOKEN');

  async function request(path, options = {}) {
    const response = await fetchImpl(`${root}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new WalkthroughApiError(data.error || `走查台请求失败（${response.status}）`, response.status);
    return data;
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
    async file(path) {
      const response = await fetchImpl(`${root}/files/${String(path).replace(/^\/+/, '')}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new WalkthroughApiError(data.error || `截图读取失败（${response.status}）`, response.status);
      }
      return {
        mimeType: response.headers.get('content-type')?.split(';')[0] || 'image/png',
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    },
  };
}

