import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  children,
  align = 'end',
}: {
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={8}
        className="z-50 min-w-56 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-overlay data-[state=open]:animate-[fade-in_150ms_ease-out]"
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex h-9 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-sm text-text outline-none data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:stroke-[1.5] [&_svg]:text-muted',
        className,
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <DropdownMenu.Label className="px-2 py-1.5 text-xs text-subtle">{children}</DropdownMenu.Label>
);
export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-border" />;
