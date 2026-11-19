import {
  Archive,
  Clock,
  FileEdit,
  Inbox,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { EmailMessage, MailAccount, MailFolder } from '../types/mail';
import { HeliumLogo } from './HeliumLogo';

interface NavigationDrawerProps {
  open: boolean;
  onClose: () => void;
  accounts: MailAccount[];
  messages: EmailMessage[];
  activeFolder: MailFolder;
  activeAccountId: string;
  activeLabel: string | null;
  labels: string[];
  unreadCounts: { totalUnread: number; byAccount: Record<string, number> };
  syncingAll: boolean;
  onSelectFolder: (folder: MailFolder) => void;
  onSelectAccount: (accountId: string) => void;
  onSelectLabel: (label: string | null) => void;
  onOpenAddAccount: () => void;
  onOpenManageAccounts: () => void;
  onOpenSettings: () => void;
  onSyncAll: () => void;
  onCreateLabel: () => void;
}

const FOLDERS: Array<{ id: MailFolder; label: string; icon: typeof Inbox }> = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'snoozed', label: 'Snoozed', icon: Clock },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileEdit },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'spam', label: 'Spam', icon: ShieldAlert },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'all', label: 'All Mail', icon: Mail },
];

export function NavigationDrawer({
  open,
  onClose,
  accounts,
  messages,
  activeFolder,
  activeAccountId,
  activeLabel,
  labels,
  unreadCounts,
  syncingAll,
  onSelectFolder,
  onSelectAccount,
  onSelectLabel,
  onOpenAddAccount,
  onOpenManageAccounts,
  onOpenSettings,
  onSyncAll,
  onCreateLabel,
}: NavigationDrawerProps) {
  const folderCounts = (folder: MailFolder) => {
    if (folder === 'inbox') return unreadCounts.totalUnread;
    if (folder === 'starred') {
      return messages.filter((m) => m.isStarred && m.folder !== 'trash' && m.folder !== 'spam').length;
    }
    if (folder === 'all') {
      return messages.filter((m) => m.folder !== 'trash' && m.folder !== 'spam').length;
    }
    return messages.filter((m) => m.folder === folder).length;
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#FAF7F2] dark:bg-[#171411] text-[#1C1917] dark:text-[#F5F0E8]">
      <div className="flex items-center justify-between px-4 pt-5 pb-4 border-b border-[#E7E0D4] dark:border-[#2C2722]">
        <HeliumLogo
          size="md"
          showWordmark
          subtitle={`${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} connected`}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSyncAll}
            disabled={syncingAll}
            aria-label="Sync all accounts"
            title="Sync all accounts"
            className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] dark:text-[#B8B0A4] hover:bg-[#EDE6DA] dark:hover:bg-[#2A2520]"
          >
            <RefreshCw className={`h-4 w-4 ${syncingAll ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="lg:hidden min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] hover:bg-[#EDE6DA]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-6">
        {/* Folders */}
        <nav aria-label="Mail folders" className="space-y-0.5">
          {FOLDERS.map((item) => {
            const Icon = item.icon;
            const active = activeFolder === item.id && !activeLabel;
            const count = folderCounts(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectLabel(null);
                  onSelectFolder(item.id);
                  onClose();
                }}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center justify-between text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#18181B] text-white dark:bg-[#FAF7F2] dark:text-[#18181B]'
                    : 'text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EFE8DD] dark:hover:bg-[#24201B]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-[18px] w-[18px]" />
                  <span>{item.label}</span>
                </span>
                {count > 0 && (
                  <span
                    className={`text-xs tabular-nums ${
                      active ? 'text-white/85 dark:text-[#18181B]/80' : 'text-[#78716C]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Accounts Section (Supports 10+ accounts cleanly) */}
        <div>
          <div className="px-3.5 pb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#78716C] dark:text-[#9A9287]">
              Accounts ({accounts.length})
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAddAccount();
              }}
              aria-label="Add email account"
              className="text-xs font-semibold text-[#C85028] hover:underline flex items-center gap-1 min-h-[32px] px-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                onSelectAccount('all');
                onClose();
              }}
              className={`w-full min-h-[42px] px-3.5 rounded-xl flex items-center justify-between text-sm transition-colors ${
                activeAccountId === 'all'
                  ? 'bg-[#EDE6DA] dark:bg-[#2A2520] font-semibold text-[#1C1917] dark:text-[#FAF7F2]'
                  : 'text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#F3EDE3] dark:hover:bg-[#221E1A]'
              }`}
            >
              <span>All inboxes</span>
              <span className="text-xs text-[#78716C] tabular-nums">{unreadCounts.totalUnread}</span>
            </button>

            {accounts.map((acct) => {
              const isAcctActive = activeAccountId === acct.id;
              const unread = unreadCounts.byAccount[acct.id] || 0;
              return (
                <button
                  key={acct.id}
                  type="button"
                  onClick={() => {
                    onSelectAccount(acct.id);
                    onClose();
                  }}
                  className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center justify-between gap-2 text-left transition-colors ${
                    isAcctActive
                      ? 'bg-[#EDE6DA] dark:bg-[#2A2520] font-semibold'
                      : 'hover:bg-[#F3EDE3] dark:hover:bg-[#221E1A]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: acct.color }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm truncate text-[#1C1917] dark:text-[#FAF7F2]">
                        {acct.label}
                      </span>
                      <span className="block text-[11px] truncate text-[#78716C]">
                        {acct.email}
                      </span>
                    </span>
                  </span>
                  {unread > 0 && (
                    <span className="text-xs font-semibold text-[#C85028] tabular-nums shrink-0">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Labels */}
        <div>
          <div className="px-3.5 pb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#78716C] dark:text-[#9A9287]">Labels</span>
            <button
              type="button"
              onClick={onCreateLabel}
              className="text-xs font-semibold text-[#57534E] dark:text-[#B8B0A4] hover:text-[#1C1917] min-h-[32px] px-1.5"
            >
              + New
            </button>
          </div>
          <div className="space-y-0.5">
            {labels.map((label) => {
              const active = activeLabel === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    onSelectLabel(active ? null : label);
                    onClose();
                  }}
                  className={`w-full min-h-[40px] px-3.5 rounded-xl flex items-center gap-3 text-sm transition-colors ${
                    active
                      ? 'bg-[#EDE6DA] dark:bg-[#2A2520] font-semibold text-[#1C1917] dark:text-[#FAF7F2]'
                      : 'text-[#57534E] dark:text-[#C4BCB0] hover:bg-[#F3EDE3] dark:hover:bg-[#221E1A]'
                  }`}
                >
                  <Tag className="h-4 w-4 text-[#78716C]" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t border-[#E7E0D4] dark:border-[#2C2722] space-y-1">
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenManageAccounts();
          }}
          className="w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EFE8DD] dark:hover:bg-[#24201B]"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Manage accounts</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
          className="w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EFE8DD] dark:hover:bg-[#24201B]"
        >
          <Settings className="h-4 w-4" />
          <span>Settings & rules</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-[#E7E0D4] dark:border-[#2C2722] h-full">
        {sidebarContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[82vw] max-w-[320px] h-full shadow-2xl border-r border-[#E7E0D4] dark:border-[#2C2722]">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
