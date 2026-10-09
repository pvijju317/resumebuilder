import {
  applyTheme,
  Button,
  cn,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  readTheme,
  type ThemePref,
} from '@tailor/ui';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Briefcase,
  CreditCard,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Settings,
  Sun,
  Vault,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useMe } from '../lib/auth.js';
import { Wordmark } from './wordmark.js';

export const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/vault', label: 'Vault', icon: Vault },
  { to: '/app/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/app/tracker', label: 'Tracker', icon: KanbanSquare },
  { to: '/app/billing', label: 'Billing', icon: CreditCard },
  { to: '/app/settings', label: 'Settings', icon: Settings },
] as const;

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/app'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors duration-150 ease-out',
              isActive
                ? 'bg-surface-muted font-medium text-text'
                : 'text-muted hover:bg-surface-muted hover:text-text',
            )
          }
        >
          <Icon className="size-4" strokeWidth={1.5} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

const THEMES: { value: ThemePref; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'System theme', icon: <Monitor /> },
  { value: 'light', label: 'Light theme', icon: <Sun /> },
  { value: 'dark', label: 'Dark theme', icon: <Moon /> },
];

function ProfileMenu() {
  const { signOut } = useAuth();
  const me = useMe();
  const [theme, setTheme] = useState<ThemePref>(readTheme);
  const initial = (me.data?.name ?? me.data?.email ?? '?').charAt(0).toUpperCase();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-text"
          aria-label="Account menu"
        >
          {initial}
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>
          <span className="block truncate text-sm text-text">
            {me.data?.name ?? 'Signed in as'}
          </span>
          <span className="block truncate">{me.data?.email}</span>
        </MenuLabel>
        <MenuSeparator />
        {THEMES.map((t) => (
          <MenuItem
            key={t.value}
            onSelect={() => {
              applyTheme(t.value);
              setTheme(t.value);
            }}
            className={theme === t.value ? 'font-medium' : undefined}
          >
            {t.icon}
            {t.label}
            {theme === t.value ? <span className="sr-only">(selected)</span> : null}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const me = useMe();
  // New accounts see the short onboarding once (Skip also marks it done).
  if (me.data && !me.data.onboardedAt && pathname !== '/app/welcome')
    return <Navigate to="/app/welcome" replace />;
  const title =
    NAV.find((n) => (n.to === '/app' ? pathname === '/app' : pathname.startsWith(n.to)))?.label ??
    '';

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-4 md:flex">
        <Link to="/" className="px-3" aria-label="Tailor home">
          <Wordmark />
        </Link>
        <NavItems />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur md:px-8">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <MenuIcon />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay md:hidden" />
              <Dialog.Content
                className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 border-r border-border bg-surface px-3 py-4 md:hidden"
                aria-describedby={undefined}
              >
                <div className="flex items-center justify-between px-3">
                  <Dialog.Title asChild>
                    <span>
                      <Wordmark />
                    </span>
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Close navigation">
                      <X />
                    </Button>
                  </Dialog.Close>
                </div>
                <NavItems onNavigate={() => setOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <h1 className="text-base font-semibold tracking-tight text-text">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            <ProfileMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
