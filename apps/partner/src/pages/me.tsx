import { ROLES, useRefs, useSession } from '../session';

/** My data: the signed-in user's own details, the organisation (switch, when there are several) and the theme — opened from the user at the bottom of the menu. */
export function MePage({ dark, setDark }: { dark: boolean; setDark: (d: boolean) => void }) {
  const { me, switchTo } = useSession();
  const { cities } = useRefs();
  const p = me?.Profile;
  const u = me?.User;
  if (!p || !u) return null;
  const org = p.Organization;
  return (
    <div className="main">
      <div className="top">
        <h2>ჩემი მონაცემები</h2>
      </div>
      <div className="card me-card">
        <div className="kv">
          <span>სახელი</span>
          <b>{p.DisplayName || '-'}</b>
          <span>როლი</span>
          <b>{ROLES[p.Role]}</b>
          <span>ელ. ფოსტა</span>
          <b>{u.Email || '-'}</b>
          <span>მობილური</span>
          <b>{u.Phone ? `+995 ${u.Phone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}` : '-'}</b>
          <span>ორგანიზაცია</span>
          {me.Profiles.length > 1 ? (
            <select className="me-org" aria-label="ორგანიზაცია" value={p.ID} onChange={(e) => switchTo(me.Profiles.find((x) => x.ID === Number(e.target.value))!)}>
              {me.Profiles.map((x) => (
                <option key={x.ID} value={x.ID}>
                  {x.Organization.NameKa}
                </option>
              ))}
            </select>
          ) : (
            <b className="me-org-name">
              <span className="lg img">
                <img src={org?.LogoPath ? `/fs/${org.LogoPath}` : '/fs/default/org-logo.png'} alt="" />
              </span>
              {org?.NameKa}
            </b>
          )}
        </div>
      </div>
      {/* the cities this account works in — a sales manager may be limited to some; its own card, like the theme */}
      <div className="card me-card">
        <div className="kv">
          <span>ლოკაცია</span>
          <b>{p.ScopeCities?.length ? p.ScopeCities.map((id) => cities.find((c) => c.ID === id)?.NameKa).filter(Boolean).join(', ') : 'ყველა'}</b>
        </div>
      </div>
      <div className="card me-card">
        <div className="kv">
          <span>თემა</span>
          <div className="seg" role="group" aria-label="თემა">
            {(
              [
                [false, 'ღია', <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>],
                [true, 'მუქი', <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />],
              ] as const
            ).map(([d, label, icon]) => (
              <button key={label} type="button" className={dark === d ? 'on' : ''} title={label} aria-label={label} aria-pressed={dark === d} onClick={() => setDark(d)}>
                <svg viewBox="0 0 24 24">{icon}</svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
