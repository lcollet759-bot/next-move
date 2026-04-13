import { NavLink } from 'react-router-dom'

const tabs = [
  {
    to: '/aujourdhui',
    label: "Aujourd'hui",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )
  },
  {
    to: '/capturer',
    label: 'Capturer',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    )
  },
  {
    to: '/dossiers',
    label: 'Dossiers',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    )
  },
  {
    to: '/journal',
    label: 'Journal',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    )
  }
]

export default function Navigation() {
  return (
    <nav className="nav-bar">
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `nav-item${isActive ? ' nav-active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
              <span className="nav-indicator" />
            </>
          )}
        </NavLink>
      ))}
      <style>{`
        .nav-bar {
          display: flex;
          background: var(--surface);
          border-top: 1px solid var(--border);
          padding-bottom: env(safe-area-inset-bottom, 0px);
          height: var(--nav-height);
          flex-shrink: 0;
        }
        .nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: var(--text-muted);
          text-decoration: none;
          padding: 8px 0 6px;
          transition: color 0.15s;
        }
        .nav-active { color: var(--text); }
        .nav-icon { display: flex; align-items: center; justify-content: center; }
        .nav-label {
          font-size: 9px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          line-height: 1;
        }
        .nav-indicator {
          width: 18px;
          height: 2px;
          border-radius: 1px;
          background: transparent;
          transition: background 0.15s;
        }
        .nav-active .nav-indicator {
          background: var(--text);
        }
      `}</style>
    </nav>
  )
}
