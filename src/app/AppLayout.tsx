import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/sessions/new', label: 'New Session' },
  { to: '/runner', label: 'Record Session' },
  { to: '/history', label: 'History' },
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="sidebar-title">Test Data Capture</h1>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
