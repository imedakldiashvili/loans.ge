import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { crud, findAll, Page, Ref } from './client';

/** One page of a list (server paging, filter and sort go to POST …/find/{page}/{size}). */
export function useFind<T>(module: string, page: number, size: number, body: object = {}, enabled = true) {
  return useQuery<Page<T>>({
    queryKey: [module, 'find', page, size, body],
    queryFn: () => crud.find<T>(module, page, size, body),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Whole (short) list — for selects and lookups. */
export function useAll<T>(module: string, body: object = {}) {
  return useQuery<T[]>({ queryKey: [module, 'all', body], queryFn: () => findAll<T>(module, body), staleTime: 60_000 });
}

/** Invalidates a module's lists and the menu badges after a change. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...modules: string[]) => Promise.all(modules.flatMap((m) => [qc.invalidateQueries({ queryKey: [m] }), qc.invalidateQueries({ queryKey: ['count', m] })]));
}

/** Standard row actions: enable/disable, move, delete — each refreshes the list. */
export function useRowActions(module: string, extraInvalidate: string[] = []) {
  const invalidate = useInvalidate();
  const done = () => invalidate(module, ...extraInvalidate);
  return {
    enable: useMutation({ mutationFn: ({ r, on }: { r: Ref; on: boolean }) => crud.enable(module, r, on), onSettled: done }),
    move: useMutation({ mutationFn: ({ r, dir }: { r: Ref; dir: 'up' | 'down' }) => crud.move(module, r, dir), onSettled: done }),
    remove: (r: Ref) => crud.remove(module, r).finally(done),
    save: (r: Ref | null, body: object) => (r ? crud.edit(module, r, body) : crud.add(module, body)).finally(done),
  };
}

/**
 * A record opened in a dialog, kept in the address — `${base}/{ID}/{UID}` (a link opens it; filters in `?…` stay).
 * The data comes from `detail`; the row that was clicked is shown meanwhile.
 */
export function useRoutedItem<T extends Ref>(module: string, base: string) {
  const { id, uid } = useParams();
  const nav = useNavigate();
  const { search } = useLocation();
  const clicked = useRef<T | null>(null);
  const ref = id && uid ? { ID: Number(id), UID: uid } : null;
  const q = useQuery({
    queryKey: [module, 'detail', ref?.ID],
    queryFn: () => crud.detail<T>(module, ref!),
    enabled: !!ref,
  });
  const shown = clicked.current && ref && clicked.current.ID === ref.ID ? clicked.current : null;
  return {
    item: ref ? (q.data ?? shown) : null,
    open: (row: T) => {
      clicked.current = row;
      nav(`${base}/${row.ID}/${row.UID}${search}`);
    },
    close: () => nav(`${base}${search}`),
  };
}
