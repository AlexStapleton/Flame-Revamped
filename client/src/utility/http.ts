// Small fetch wrapper with the axios surface the app used: `http.get/post/put/
// delete<T>()` resolve to `{ data, status }` and reject non-2xx responses with
// an HttpError carrying `response.data` / `response.status`, so callers keep
// reading `err.response?.data.error`. Plain objects are sent as JSON; FormData
// is passed through so the browser sets the multipart boundary.

export interface HttpResponse<T> {
  data: T;
  status: number;
}

export interface HttpConfig {
  headers?: Record<string, string>;
  // Abort after this many ms; 0 disables the timeout.
  timeoutMs?: number;
}

// A request that gets no answer would otherwise hang (and block poll loops
// that wait for it) until the browser gives up, which can take minutes.
export const DEFAULT_TIMEOUT_MS = 15 * 1000;

export class HttpError<T = any> extends Error {
  response: HttpResponse<T>;

  constructor(response: HttpResponse<T>) {
    super(`Request failed with status code ${response.status}`);
    this.name = 'HttpError';
    this.response = response;
  }
}

const parseBody = async (res: Response): Promise<any> => {
  const text = await res.text();
  if (!text) return null;
  // Like axios: parse JSON when the body is JSON, otherwise keep the text.
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const request = async <T>(
  method: string,
  url: string,
  body?: unknown,
  config: HttpConfig = {}
): Promise<HttpResponse<T>> => {
  const headers: Record<string, string> = { ...config.headers };
  let payload: BodyInit | undefined;

  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  // Uploads can legitimately take long, so they only time out when asked to.
  const timeoutMs =
    config.timeoutMs ?? (body instanceof FormData ? 0 : DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} s`);
    }
    throw err;
  }
  const response = { data: (await parseBody(res)) as T, status: res.status };
  if (!res.ok) throw new HttpError(response);
  return response;
};

export const http = {
  get: <T>(url: string, config?: HttpConfig) =>
    request<T>('GET', url, undefined, config),
  delete: <T>(url: string, config?: HttpConfig) =>
    request<T>('DELETE', url, undefined, config),
  post: <T>(url: string, body?: unknown, config?: HttpConfig) =>
    request<T>('POST', url, body, config),
  put: <T>(url: string, body?: unknown, config?: HttpConfig) =>
    request<T>('PUT', url, body, config),
};
