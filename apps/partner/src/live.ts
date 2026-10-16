import { QueryKey, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

// Live updates: one Server-Sent Events stream (GET /{gateway}/events/stream, session cookie).
// An event only says what changed; the queries listed in `keys` are reloaded through the normal API.
// After a reconnect ("ready" again) everything listed is reloaded too — events may have been missed meanwhile.

export interface LiveEvent {
  Type: 'application.created' | 'application.status';
  ApplicationID: number;
  ApplicationOrgID: number;
  OrganizationID: number;
  Status: string;
  Actor: string;
}

export function useLiveEvents(path: string | null, keys: QueryKey[], onEvent?: (e: LiveEvent) => void) {
  const qc = useQueryClient();
  const latest = useRef({ keys, onEvent });
  latest.current = { keys, onEvent };
  useEffect(() => {
    if (!path || typeof EventSource === 'undefined') return;
    const es = new EventSource(path);
    let first = true;
    const reload = () => latest.current.keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    es.addEventListener('ready', () => {
      if (!first) reload();
      first = false;
    });
    const handle = (m: MessageEvent) => {
      reload();
      try {
        latest.current.onEvent?.(JSON.parse(m.data) as LiveEvent);
      } catch {
        /* malformed event — the reload already happened */
      }
    };
    es.addEventListener('application.created', handle);
    es.addEventListener('application.status', handle);
    // a new notification for this profile → the bell
    es.addEventListener('notification', () => qc.invalidateQueries({ queryKey: ['notifications'] }));
    return () => es.close();
  }, [path, qc]);
}
