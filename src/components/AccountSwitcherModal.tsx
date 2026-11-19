import { useState } from 'react';
import { Check, Layers, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import type { MailAccount } from '../types/mail';
import { getInitialLetter } from '../lib/mailLogic';

interface AccountSwitcherModalProps {
  open: boolean;
  accounts: MailAccount[];
  activeAccountId: string;
  unreadCounts: { totalUnread: number; byAccount: Record<string, number> };
  onClose: () => void;
  onSelectAccount: (accountId: string) => void;
  onOpenAddAccount: () => void;
  onOpenManageAccounts: () => void;
}

export function AccountSwitcherModal({
  open,
  accounts,
  activeAccountId,
  unreadCounts,
  onClose,
  onSelectAccount,
  onOpenAddAccount,
  onOpenManageAccounts,
}: AccountSwitcherModalProps) {
  const [filter, setFilter] = useState('');

  if (!open) return null;

  const filtered = filter.trim()
    ? accounts.filter(
        (a) =>
          a.label.toLowerCase().includes(filter.toLowerCase()) ||
          a.email.toLowerCase().includes(filter.toLowerCase())
      )
    : accounts;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-switcher-title"
    >
      <div className="w-full max-h-[88dvh] sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#FFFEFB] dark:bg-[#191613] border border-[#E5DDD0] dark:border-[#2E2924] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDE6DA] dark:border-[#2C2722]">
          <div>
            <h2
              id="account-switcher-title"
              className="font-serif-editorial text-xl font-bold text-[#1C1917] dark:text-[#FAF7F2]"
            >
              Choose an account
            </h2>
            <p className="text-xs text-[#78716C] tabular-nums">
              {accounts.length} connected · {unreadCounts.totalUnread} unread total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account switcher"
            className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {accounts.length > 5 && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28]">
              <Search className="h-4 w-4 text-[#78716C]" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter accounts..."
                aria-label="Filter connected accounts"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {/* All inboxes option */}
          <button
            type="button"
            onClick={() => {
              onSelectAccount('all');
              onClose();
            }}
            className={`w-full min-h-[54px] px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-3 text-left transition-colors ${
              activeAccountId === 'all'
                ? 'bg-[#18181B] text-white dark:bg-[#FAF7F2] dark:text-[#18181B]'
                : 'bg-[#FAF7F2] dark:bg-[#211D19] hover:bg-[#F2EAE0] dark:hover:bg-[#2A2520]'
            }`}
          >
            <span className="flex items-center gap-3">
              <span
                className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                  activeAccountId === 'all'
                    ? 'bg-white/15 text-white dark:bg-black/10 dark:text-[#18181B]'
                    : 'bg-[#E7E0D4] dark:bg-[#2E2924] text-[#1C1917] dark:text-[#FAF7F2]'
                }`}
              >
                <Layers className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">All inboxes</span>
                <span
                  className={`block text-xs ${
                    activeAccountId === 'all' ? 'text-white/75 dark:text-[#18181B]/75' : 'text-[#78716C]'
                  }`}
                >
                  Unified stream across {accounts.length} accounts
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold tabular-nums">{unreadCounts.totalUnread}</span>
              {activeAccountId === 'all' && <Check className="h-4 w-4" />}
            </span>
          </button>

          {filtered.map((acct) => {
            const active = activeAccountId === acct.id;
            const unread = unreadCounts.byAccount[acct.id] || 0;
            return (
              <button
                key={acct.id}
                type="button"
                onClick={() => {
                  onSelectAccount(acct.id);
                  onClose();
                }}
                className={`w-full min-h-[56px] px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-3 text-left transition-colors ${
                  active
                    ? 'bg-[#F2EAE0] dark:bg-[#2C2620] ring-1 ring-[#C85028]'
                    : 'bg-[#FAF7F2] dark:bg-[#211D19] hover:bg-[#F2EAE0] dark:hover:bg-[#2A2520]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                    style={{ backgroundColor: acct.color }}
                  >
                    {getInitialLetter(acct.label)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#1C1917] dark:text-[#FAF7F2] truncate">
                      {acct.label}
                    </span>
                    <span className="block text-xs text-[#6B655E] dark:text-[#9A9287] truncate">
                      {acct.email}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {unread > 0 && (
                    <span className="text-xs font-semibold text-[#C85028] tabular-nums">
                      {unread}
                    </span>
                  )}
                  {active && <Check className="h-4 w-4 text-[#C85028]" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-3.5 border-t border-[#EDE6DA] dark:border-[#2C2722] bg-[#FAF7F2] dark:bg-[#171411] flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAddAccount();
            }}
            className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#C85028] hover:bg-[#B04320] text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add account</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenManageAccounts();
            }}
            className="min-h-[44px] px-4 rounded-xl border border-[#DDD4C6] dark:border-[#3A342D] text-sm font-semibold flex items-center gap-2 hover:bg-[#EFE8DD] dark:hover:bg-[#24201B]"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Manage</span>
          </button>
        </div>
      </div>
    </div>
  );
}
