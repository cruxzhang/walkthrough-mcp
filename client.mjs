export class WalkthroughApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'WalkthroughApiError';
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;
const JSON_RESPONSE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

function checkedBaseUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); } catch { throw new Error('WALKTHROUGH_DESK_URL 必须是有效 URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) throw new Error('WALKTHROUGH_DESK_URL 必须使用 HTTPS；本机开发除外');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('WALKTHROUGH_DESK_URL 不能包含账号、查询参数或片段');
  return parsed.toString().replace(/\/+$/, '');
}

async function boundedJson(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > JSON_RESPONSE_MAX_BYTES) throw new WalkthroughApiError('走查台响应超过安全大小限制', response.status);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > JSON_RESPONSE_MAX_BYTES) throw new WalkthroughApiError('走查台响应超过安全大小限制', response.status);
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

export function createWalkthroughApi({ baseUrl, token, fetchImpl = fetch }) {
  const root = checkedBaseUrl(baseUrl);
  const secret = String(token || '').trim();
  if (!secret) throw new Error('缺少 WALKTHROUGH_DESK_TOKEN');

  async function request(path, options = {}) {
    const response = await fetchImpl(`${root}${path}`, {
      ...options,
      redirect: 'error',
      signal: options.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        Authorization: `Bearer ${secret}`,
      },
    });
    const data = await boundedJson(response);
    if (!response.ok) throw new WalkthroughApiError(data.error || `走查台请求失败（${response.status}）`, response.status);
    return data;
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
    async file(path) {
      const response = await fetchImpl(`${root}/files/${String(path).replace(/^\/+/, '')}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!response.ok) {
        const data = await boundedJson(response);
        throw new WalkthroughApiError(data.error || `截图读取失败（${response.status}）`, response.status);
      }
      const declared = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(declared) && declared > IMAGE_RESPONSE_MAX_BYTES) throw new WalkthroughApiError('截图超过安全大小限制', response.status);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > IMAGE_RESPONSE_MAX_BYTES) throw new WalkthroughApiError('截图超过安全大小限制', response.status);
      return {
        mimeType: response.headers.get('content-type')?.split(';')[0] || 'image/png',
        bytes,
      };
    },
  };
}

