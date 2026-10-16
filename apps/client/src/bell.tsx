import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, Page } from './api';
import { t } from './i18n';
import { disablePush, enablePush, pushState, PushState } from './push';

// The bell: own notifications (new application, customer's answer, deadline), unread badge, live over the events stream.
// Clicking one marks it read and opens the cabinet; "ყველა წაკითხულია" clears the badge.
// At the bottom: browser notifications on / off (they come even with the tab closed).

interface Note {
  ID: number;
  UID: string;
  Type: string;
  Status: string | null;
  Title: string;
  Body: string | null;
  ApplicationOrgID: number | null;
  ReadOn: string | null;
  CreatedOn: string;
}

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('ახლახან');
  if (s < 3600) return `${Math.floor(s / 60)} ${t('წთ წინ')}`;
  if (s < 86400) return `${Math.floor(s / 3600)} ${t('სთ წინ')}`;
  return new Date(iso).toLocaleDateString('ka-GE');
};

export function Bell({ gateway, onOpen }: { gateway: 'partner' | 'client'; onOpen: (n: Note) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<PushState>('unsupported');
  const box = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<Page<Note> & { UnreadCount: number }>('POST', `/${gateway}/notification/find/1/15`, {}) });
  const unread = q.data?.UnreadCount ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  useEffect(() => {
    void pushState().then(setPush);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const click = async (n: Note) => {
    setOpen(false);
    if (!n.ReadOn) await api('PUT', `/${gateway}/notification/read/${n.ID}/${n.UID}`).catch(() => undefined);
    refresh();
    onOpen(n);
  };

  return (
    <div className="bell" ref={box}>
      <button type="button" className="theme bell-btn" title={t('შეტყობინებები')} aria-label={`${t('შეტყობინებები')}${unread ? ` (${unread})` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="bell-n">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-menu" role="dialog" aria-label={t('შეტყობინებები')}>
          <div className="bell-head">
            <b>{t('შეტყობინებები')}</b>
            {unread > 0 && (
              <button type="button" className="bell-link" onClick={async () => (await api('PUT', `/${gateway}/notification/readAll`), refresh())}>
                {t('ყველა წაკითხულია')}
              </button>
            )}
          </div>
          <div className="bell-list">
            {!q.data?.Items.length && <div className="bell-empty">{t(q.isLoading ? 'იტვირთება…' : 'შეტყობინება ჯერ არ არის')}</div>}
            {q.data?.Items.map((n) => (
              <button key={n.ID} type="button" className={`bell-item${n.ReadOn ? '' : ' unread'}`} onClick={() => click(n)}>
                <i />
                <span>
                  <b>{n.Title}</b>
                  {n.Body && <small>{n.Body}</small>}
                  <em>{ago(n.CreatedOn)}</em>
                </span>
              </button>
            ))}
          </div>
          {push !== 'unsupported' && (
            <div className="bell-foot">
              {push === 'on' ? (
                <button type="button" className="bell-link" onClick={async () => setPush(await disablePush(gateway))}>
                  {t('ბრაუზერის შეტყობინებების გამორთვა')}
                </button>
              ) : push === 'denied' ? (
                <span>{t('ბრაუზერის შეტყობინებები დაბლოკილია (ბრაუზერის პარამეტრებში)')}</span>
              ) : (
                <button type="button" className="bell-link" onClick={async () => setPush(await enablePush(gateway).catch(() => 'off' as PushState))}>
                  {t('🔔 ბრაუზერის შეტყობინებების ჩართვა')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { Note };
