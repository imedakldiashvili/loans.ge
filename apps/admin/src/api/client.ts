// API client — every response is { IsSuccess, Data, Error } (STANDARDS.md §3).

export interface ApiErrorBody {
  Code: string;
  Message: string;
  Details: { Field: string; Message: string }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { Field: string; Message: string }[] = [],
    readonly requestUid: string | null = null,
  ) {
    super(message);
  }
}

/** Standard result of add / edit / enable / disable / delete. */
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

/** Fields every record has (BaseEntity). */
export interface Base extends Ref {
  IsEnable: boolean;
  CreatedOn: string;
  CreatedBy: number | null;
  UpdatedOn: string | null;
  UpdatedBy: number | null;
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'ka' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'სერვერთან კავშირი ვერ დამყარდა');
  }
  const json = (await res.json().catch(() => null)) as { IsSuccess: boolean; Data: T; Error: ApiErrorBody | null } | null;
  if (!json || !json.IsSuccess) {
    const e = json?.Error;
    if (res.status === 401 && !path.startsWith('/public/')) onUnauthorized();
    throw new ApiError(res.status, e?.Code ?? 'INTERNAL_ERROR', e?.Message ?? `შეცდომა (${res.status})`, e?.Details ?? [], res.headers.get('x-request-uid'));
  }
  return json.Data;
}

// Standard actions — /{gateway}/{module}/{action}
const G = '/admin';
export const crud = {
  find: <T>(module: string, page: number, size: number, body: object = {}) => api<Page<T>>('POST', `${G}/${module}/find/${page}/${size}`, body),
  detail: <T>(module: string, r: Ref) => api<T>('GET', `${G}/${module}/detail/${r.ID}/${r.UID}`),
  add: (module: string, body: object) => api<Ref>('POST', `${G}/${module}/add`, body),
  edit: (module: string, r: Ref, body: object) => api<Ref>('PUT', `${G}/${module}/edit/${r.ID}/${r.UID}`, body),
  enable: (module: string, r: Ref, on: boolean) => api<Ref>('PUT', `${G}/${module}/${on ? 'enable' : 'disable'}/${r.ID}/${r.UID}`),
  remove: (module: string, r: Ref) => api<Ref>('DELETE', `${G}/${module}/delete/${r.ID}/${r.UID}`),
  move: (module: string, r: Ref, direction: 'up' | 'down') => api<Ref>('PUT', `${G}/${module}/move/${r.ID}/${r.UID}`, { Direction: direction }),
};

/** All rows of a (small) list — references are short, so one page of 100 is enough per call. */
export async function findAll<T>(module: string, body: object = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const p = await crud.find<T>(module, page, 100, body);
    out.push(...p.Items);
    if (page >= p.TotalPages) return out;
  }
}
