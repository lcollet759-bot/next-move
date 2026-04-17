import { NavLink } from 'react-router-dom'

const tabs = [
  {
    to: '/',
    label: "Aujourd'hui",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )
  },
  {
    to: '/planning',
    label: 'Planning',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
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
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
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
          end={tab.to === '/'}
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
