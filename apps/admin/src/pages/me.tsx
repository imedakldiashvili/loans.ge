import { ADMIN_ROLES, useAuth } from '../auth/auth';
import { useThemeSetting } from '../layout/shell';
import { Icon } from '../ui/icons';

/** My data: the signed-in admin's own details and the theme (opened from the user at the bottom of the menu). */
export function MePage() {
  const { me, logout } = useAuth();
  const [theme, setTheme] = useThemeSetting();
  const u = me?.User;
  return (
    <>
      <div className="lp-top">
        <div className="lp-title">
          <h2>ჩემი მონაცემები</h2>
        </div>
        {/* logout — top right */}
        <div className="lp-add">
          <button type="button" className="btn btn-red me-out" onClick={() => void logout()}>
            <Icon.logout />
            გასვლა
          </button>
        </div>
      </div>
      <div className="panel me-panel">
        <div className="kv">
          <span>სახელი</span>
          <b>{me?.Profile?.DisplayName || '—'}</b>
          <span>როლი</span>
          <b>{me?.Profile ? ADMIN_ROLES[me.Profile.Role] : '—'}</b>
          <span>ელ. ფოსტა</span>
          <b>{u?.Email || '—'}</b>
          <span>მობილური</span>
          <b>{u?.Phone ? `+995 ${u.Phone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}` : '—'}</b>
        </div>
      </div>
      <div className="panel me-panel">
        <div className="kv">
          <span>თემა</span>
          <div className="seg" role="group" aria-label="თემა">
            {(
              [
                ['light', 'ღია', Icon.sun],
                ['dark', 'მუქი', Icon.moon],
              ] as const
            ).map(([k, label, Ico]) => (
              <button key={k} type="button" className={theme === k ? 'on' : ''} title={label} aria-label={label} aria-pressed={theme === k} onClick={() => setTheme(k)}>
                <Ico />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
