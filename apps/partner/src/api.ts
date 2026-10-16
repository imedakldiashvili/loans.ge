// API client — { IsSuccess, Data, Error } (STANDARDS.md). The cabinet uses the partner gateway and public references.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { Field: string; Message: string }[] = [],
  ) {
    super(message);
  }
}

export interface Ref {
  ID: number;
  UID: string;
}
export interface Page<T> {
  Items: T[];
  PageNumber: number;
  PageSize: number;
  TotalCount: number;
  TotalPages: number;
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept-Language': 'ka' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'სერვერთან კავშირი ვერ დამყარდა');
  }
  const json = (await res.json().catch(() => null)) as { IsSuccess: boolean; Data: T; Error: { Code: string; Message: string; Details: { Field: string; Message: string }[] } | null } | null;
  if (!json?.IsSuccess) {
    if (res.status === 401 && !path.startsWith('/public/')) onUnauthorized();
    throw new ApiError(res.status, json?.Error?.Code ?? 'INTERNAL_ERROR', json?.Error?.Message ?? `შეცდომა (${res.status})`, json?.Error?.Details ?? []);
  }
  return json.Data;
}

/** Standard actions on a gateway module: /{gateway}/{module}/{action}. */
export const crud = (gateway: 'partner' | 'public', module: string) => ({
  find: <T>(page: number, size: number, body: object = {}) => api<Page<T>>('POST', `/${gateway}/${module}/find/${page}/${size}`, body),
  detail: <T>(r: Ref) => api<T>('GET', `/${gateway}/${module}/detail/${r.ID}/${r.UID}`),
  add: (body: object) => api<Ref>('POST', `/${gateway}/${module}/add`, body),
  edit: (r: Ref, body: object) => api<Ref>('PUT', `/${gateway}/${module}/edit/${r.ID}/${r.UID}`, body),
  enable: (r: Ref, on: boolean) => api<Ref>('PUT', `/${gateway}/${module}/${on ? 'enable' : 'disable'}/${r.ID}/${r.UID}`),
  remove: (r: Ref) => api<Ref>('DELETE', `/${gateway}/${module}/delete/${r.ID}/${r.UID}`),
});

export async function findAll<T>(gateway: 'partner' | 'public', module: string, body: object = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const p = await crud(gateway, module).find<T>(page, 100, body);
    out.push(...p.Items);
    if (page >= p.TotalPages) return out;
  }
}
