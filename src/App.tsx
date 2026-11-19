import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckSquare,
  Mail,
  MailOpen,
  Menu,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type {
  ComposeDraft,
  EmailMessage,
  EmailThread,
  MailAccount,
  MailboxStatePayload,
  MailFolder,
  SwipeAction,
} from './types/mail';
import {
  computeAccountUnreadCounts,
  filterMessages,
  getInitialLetter,
  groupThreads,
} from './lib/mailLogic';
import {
  bulkMessageAction,
  createLabel,
  deleteAccount,
  fetchMailboxState,
  saveDraftMessage,
  sendMailMessage,
  syncAccountMessages,
  syncGmailLabelMutation,
} from './lib/api';
import { initGmailAuth } from './lib/gmailAuth';
import { NavigationDrawer } from './components/NavigationDrawer';
import { ThreadRow } from './components/ThreadRow';
import { ThreadReader } from './components/ThreadReader';
import { ComposeModal } from './components/ComposeModal';
import { AddAccountModal } from './components/AddAccountModal';
import { AccountSwitcherModal } from './components/AccountSwitcherModal';
import { ManageAccountsModal } from './components/ManageAccountsModal';
import { SettingsAndRulesModal } from './components/SettingsAndRulesModal';
import { ConfirmDialog, type ConfirmDialogProps } from './components/ConfirmDialog';
import { HeliumLogo } from './components/HeliumLogo';
import { registerNativeBackHandler, syncNativeStatusBar } from './lib/nativeBridge';

interface UndoToast {
  message: string;
  undoIds?: string[];
  undoFolder?: boolean;
}

export default function App() {
  const [state, setState] = useState<MailboxStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Navigation & filtering
  const [activeFolder, setActiveFolder] = useState<MailFolder>('inbox');
  const [activeAccountId, setActiveAccountId] = useState<string>('all');
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Selection & reader
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [checkedThreadIds, setCheckedThreadIds] = useState<Set<string>>(new Set());

  // Modals & drawers
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitialDraft, setComposeInitialDraft] = useState<ComposeDraft>({
    accountId: '',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    bodyText: '',
    attachments: [],
  });
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [manageAccountsOpen, setManageAccountsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newLabelOpen, setNewLabelOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');

  const [syncingAll, setSyncingAll] = useState(false);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [confirmState, setConfirmState] = useState<
    Omit<ConfirmDialogProps, 'open' | 'onCancel'> & { open: boolean }
  >({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {},
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((next: UndoToast) => {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const reloadState = useCallback(async () => {
    try {
      const next = await fetchMailboxState();
      setState(next);
      setErrorBanner(null);
    } catch (err: any) {
      setErrorBanner(err?.message || 'Unable to load mailbox state.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadState();
    const unsub = initGmailAuth();
    return () => unsub();
  }, [reloadState]);

  useEffect(() => {
    if (!state) return;
    document.documentElement.classList.toggle('dark', state.settings.theme === 'evening-ink');
    syncNativeStatusBar(state.settings.theme);
  }, [state?.settings.theme]);

  // Native Android hardware back button handler
  useEffect(() => {
    return registerNativeBackHandler(() => {
      if (confirmState.open) {
        setConfirmState((prev) => ({ ...prev, open: false }));
        return true;
      }
      if (newLabelOpen) {
        setNewLabelOpen(false);
        return true;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (manageAccountsOpen) {
        setManageAccountsOpen(false);
        return true;
      }
      if (accountSwitcherOpen) {
        setAccountSwitcherOpen(false);
        return true;
      }
      if (addAccountOpen) {
        setAddAccountOpen(false);
        return true;
      }
      if (composeOpen) {
        setComposeOpen(false);
        return true;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (checkedThreadIds.size > 0) {
        setCheckedThreadIds(new Set());
        return true;
      }
      if (selectedThreadId) {
        setSelectedThreadId(null);
        return true;
      }
      return false;
    });
  }, [
    confirmState.open,
    newLabelOpen,
    settingsOpen,
    manageAccountsOpen,
    accountSwitcherOpen,
    addAccountOpen,
    composeOpen,
    drawerOpen,
    checkedThreadIds.size,
    selectedThreadId,
  ]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setSearchFocused(false);
        setCheckedThreadIds(new Set());
        return;
      }

      if (isTyping) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key.toLowerCase() === 'c' && state && state.accounts.length > 0) {
        e.preventDefault();
        openNewCompose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const accounts = state?.accounts ?? [];
  const messages = state?.messages ?? [];
  const labels = state?.labels ?? [];
  const rules = state?.rules ?? [];
  const settings = state?.settings ?? {
    swipeRightAction: 'archive' as SwipeAction,
    swipeLeftAction: 'delete' as SwipeAction,
    undoSendSeconds: 5,
    theme: 'warm-paper' as const,
    compactDensity: false,
    showAvatars: true,
    autoAdvance: true,
    vacationResponderEnabled: false,
    vacationSubject: '',
    vacationBody: '',
  };

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const unreadCounts = useMemo(
    () => computeAccountUnreadCounts(messages, accounts),
    [messages, accounts]
  );

  const filteredMessages = useMemo(
    () =>
      filterMessages(messages, accounts, {
        accountId: activeAccountId,
        folder: activeFolder,
        unreadOnly,
        label: activeLabel,
        searchQuery,
      }),
    [messages, accounts, activeAccountId, activeFolder, unreadOnly, activeLabel, searchQuery]
  );

  const threads = useMemo(() => groupThreads(filteredMessages), [filteredMessages]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.threadId === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const knownContacts = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      if (m.from.email) map.set(m.from.email.toLowerCase(), m.from.name || m.from.email);
      for (const t of m.to) {
        if (t.email) map.set(t.email.toLowerCase(), t.name || t.email);
      }
    }
    return Array.from(map.entries()).map(([email, name]) => ({ email, name }));
  }, [messages]);

  const openNewCompose = (prefill?: Partial<ComposeDraft>) => {
    const defaultAcct =
      (activeAccountId !== 'all' ? accountMap.get(activeAccountId) : accounts[0]) || accounts[0];
    setComposeInitialDraft({
      accountId: prefill?.accountId || defaultAcct?.id || '',
      to: prefill?.to || '',
      cc: prefill?.cc || '',
      bcc: prefill?.bcc || '',
      subject: prefill?.subject || '',
      bodyText: prefill?.bodyText ?? (defaultAcct?.signature ? `\n\n${defaultAcct.signature}` : ''),
      threadId: prefill?.threadId,
      inReplyToId: prefill?.inReplyToId,
      attachments: prefill?.attachments || [],
      scheduledFor: prefill?.scheduledFor,
      id: prefill?.id,
    });
    setComposeOpen(true);
  };

  const handleOpenThread = async (thread: EmailThread) => {
    if (activeFolder === 'drafts') {
      const msg = thread.latestMessage;
      openNewCompose({
        id: msg.id,
        accountId: msg.accountId,
        to: msg.to.map((t) => t.email).join(', '),
        subject: msg.subject === '(Draft)' ? '' : msg.subject,
        bodyText: msg.bodyText,
        threadId: msg.threadId,
        attachments: msg.attachments,
        scheduledFor: msg.scheduledFor,
      });
      return;
    }

    setSelectedThreadId(thread.threadId);
    const unreadIds = thread.messages.filter((m) => !m.isRead).map((m) => m.id);
    if (unreadIds.length > 0) {
      const res = await bulkMessageAction(unreadIds, 'mark-read');
      setState(res.state);

      const acct = accountMap.get(thread.accountId);
      if (acct?.provider === 'gmail-oauth') {
        for (const m of thread.messages) {
          if (!m.isRead && m.remoteId) {
            syncGmailLabelMutation(acct.email, m.remoteId, { removeLabelIds: ['UNREAD'] });
          }
        }
      }
    }
  };

  const handleToggleStar = async (thread: EmailThread) => {
    const ids = thread.messages.map((m) => m.id);
    const action = thread.isStarred ? 'unstar' : 'star';
    const res = await bulkMessageAction(ids, action);
    setState(res.state);

    const acct = accountMap.get(thread.accountId);
    if (acct?.provider === 'gmail-oauth') {
      for (const m of thread.messages) {
        if (m.remoteId) {
          syncGmailLabelMutation(
            acct.email,
            m.remoteId,
            action === 'star' ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] }
          );
        }
      }
    }
  };

  const advanceAfterRemoval = (removedThreadId: string) => {
    if (selectedThreadId !== removedThreadId) return;
    if (!settings.autoAdvance) {
      setSelectedThreadId(null);
      return;
    }
    const idx = threads.findIndex((t) => t.threadId === removedThreadId);
    const next = threads[idx + 1] || threads[idx - 1] || null;
    setSelectedThreadId(next ? next.threadId : null);
  };

  const executeTrashThreads = async (targetThreads: EmailThread[]) => {
    const ids = targetThreads.flatMap((t) => t.messages.map((m) => m.id));
    const res = await bulkMessageAction(ids, activeFolder === 'trash' ? 'delete-forever' : 'trash');
    setState(res.state);
    setCheckedThreadIds(new Set());
    if (targetThreads.some((t) => t.threadId === selectedThreadId)) {
      advanceAfterRemoval(selectedThreadId!);
    }

    for (const t of targetThreads) {
      const acct = accountMap.get(t.accountId);
      if (acct?.provider === 'gmail-oauth') {
        for (const m of t.messages) {
          if (m.remoteId) syncGmailLabelMutation(acct.email, m.remoteId, { trash: true });
        }
      }
    }

    showToast({
      message:
        activeFolder === 'trash'
          ? targetThreads.length === 1
            ? 'Permanently deleted conversation'
            : `Permanently deleted ${targetThreads.length} conversations`
          : targetThreads.length === 1
          ? 'Moved conversation to Trash'
          : `Moved ${targetThreads.length} conversations to Trash`,
      undoIds: activeFolder === 'trash' ? undefined : ids,
      undoFolder: true,
    });
  };

  const requestTrashThreads = (targetThreads: EmailThread[]) => {
    const isPermanent = activeFolder === 'trash';
    const summary =
      targetThreads.length === 1
        ? `“${targetThreads[0].subject}”`
        : `${targetThreads.length} selected conversations`;

    setConfirmState({
      open: true,
      title: isPermanent ? 'Delete permanently?' : 'Move to Trash?',
      description: isPermanent
        ? `Are you sure you want to permanently delete ${summary}? This cannot be undone.`
        : `Move ${summary} to Trash? You can still restore items from Trash later.`,
      confirmLabel: isPermanent ? 'Delete permanently' : 'Move to Trash',
      tone: 'danger',
      icon: 'trash',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, open: false }));
        await executeTrashThreads(targetThreads);
      },
    });
  };

  const handleThreadAction = async (thread: EmailThread, action: SwipeAction) => {
    const ids = thread.messages.map((m) => m.id);
    if (action === 'delete') {
      const acct = accountMap.get(thread.accountId);
      if (activeFolder === 'trash' || acct?.provider === 'gmail-oauth') {
        requestTrashThreads([thread]);
      } else {
        await executeTrashThreads([thread]);
      }
      return;
    }
    if (action === 'star') {
      await handleToggleStar(thread);
      return;
    }
    if (action === 'read') {
      const res = await bulkMessageAction(ids, thread.isUnread ? 'mark-read' : 'mark-unread');
      setState(res.state);
      return;
    }
    if (action === 'snooze') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const res = await bulkMessageAction(ids, 'snooze', tomorrow.toISOString());
      setState(res.state);
      advanceAfterRemoval(thread.threadId);
      showToast({
        message: 'Snoozed until tomorrow 9:00 AM',
        undoIds: ids,
        undoFolder: true,
      });
      return;
    }
    // Archive
    const res = await bulkMessageAction(ids, 'archive');
    setState(res.state);
    advanceAfterRemoval(thread.threadId);
    const acct = accountMap.get(thread.accountId);
    if (acct?.provider === 'gmail-oauth') {
      for (const m of thread.messages) {
        if (m.remoteId) syncGmailLabelMutation(acct.email, m.remoteId, { removeLabelIds: ['INBOX'] });
      }
    }
    showToast({
      message: 'Archived conversation',
      undoIds: ids,
      undoFolder: true,
    });
  };

  const handleRequestSend = (draft: ComposeDraft) => {
    const sender = accountMap.get(draft.accountId);
    const isScheduled = Boolean(draft.scheduledFor && new Date(draft.scheduledFor).getTime() > Date.now() + 5000);
    setConfirmState({
      open: true,
      title: isScheduled ? 'Schedule this email?' : 'Send this email?',
      description: `${isScheduled ? 'Schedule' : 'Send'} “${draft.subject || '(No subject)'}” from ${
        sender?.email || 'your account'
      } to ${draft.to}?`,
      confirmLabel: isScheduled ? 'Confirm schedule' : 'Send email',
      tone: 'primary',
      icon: 'send',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, open: false }));
        try {
          const res = await sendMailMessage(
            { ...draft, draftId: draft.id },
            sender?.email
          );
          setState(res.state);
          setComposeOpen(false);
          showToast({
            message: res.scheduled
              ? 'Email scheduled'
              : `Email sent from ${sender?.email || 'account'}`,
          });
        } catch (err: any) {
          setErrorBanner(err?.message || 'Failed to send message.');
        }
      },
    });
  };

  const handleSyncAll = async () => {
    if (!state) return;
    setSyncingAll(true);
    let totalNew = 0;
    try {
      for (const acct of state.accounts) {
        if (acct.provider === 'gmail-oauth' || acct.imapSmtp) {
          const res = await syncAccountMessages(acct).catch(() => null);
          if (res) totalNew += res.syncedCount;
        }
      }
      await reloadState();
      showToast({
        message: totalNew > 0 ? `Synced ${totalNew} new message(s)` : 'All inboxes are up to date',
      });
    } finally {
      setSyncingAll(false);
    }
  };

  const handleReplyFromReader = (msg: EmailMessage, mode: 'reply' | 'reply-all' | 'forward') => {
    const acct = accountMap.get(msg.accountId);
    const sig = acct?.signature ? `\n\n${acct.signature}` : '';
    const subjectPrefix = mode === 'forward' ? 'Fwd: ' : 'Re: ';
    const cleanSubject = msg.subject.replace(/^(Re|Fwd):\s*/i, '');

    let to = '';
    let cc = '';
    if (mode === 'reply') {
      to = msg.from.email;
    } else if (mode === 'reply-all') {
      const others = [
        msg.from.email,
        ...msg.to.map((t) => t.email),
        ...(msg.cc || []).map((c) => c.email),
      ].filter((e) => e.toLowerCase() !== acct?.email.toLowerCase());
      to = Array.from(new Set(others)).join(', ');
    }

    openNewCompose({
      accountId: msg.accountId,
      to,
      cc,
      subject: `${subjectPrefix}${cleanSubject}`,
      threadId: mode === 'forward' ? undefined : msg.threadId,
      bodyText: `${sig}\n\n--- On ${new Date(msg.timestamp).toLocaleString()}, ${
        msg.from.name || msg.from.email
      } wrote:\n${msg.bodyText}`,
    });
  };

  const activeAccount = activeAccountId === 'all' ? undefined : accountMap.get(activeAccountId);
  const avatarAccount = activeAccount || accounts[0];
  const headingTitle = activeLabel
    ? activeLabel
    : activeFolder === 'all'
    ? 'All Mail'
    : activeFolder.charAt(0).toUpperCase() + activeFolder.slice(1);

  return (
    <div className="h-[100dvh] w-full flex overflow-hidden bg-[#FAF7F2] dark:bg-[#141210] text-[#1C1917] dark:text-[#F5F0E8]">
      {/* Left Navigation Sidebar / Mobile Drawer */}
      <NavigationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        accounts={accounts}
        messages={messages}
        activeFolder={activeFolder}
        activeAccountId={activeAccountId}
        activeLabel={activeLabel}
        labels={labels}
        unreadCounts={unreadCounts}
        syncingAll={syncingAll}
        onSelectFolder={(folder) => {
          setActiveFolder(folder);
          setSelectedThreadId(null);
          setCheckedThreadIds(new Set());
        }}
        onSelectAccount={(acctId) => {
          setActiveAccountId(acctId);
          setSelectedThreadId(null);
          setCheckedThreadIds(new Set());
        }}
        onSelectLabel={(lbl) => {
          setActiveLabel(lbl);
          if (lbl) setActiveFolder('all');
          setSelectedThreadId(null);
        }}
        onOpenAddAccount={() => setAddAccountOpen(true)}
        onOpenManageAccounts={() => setManageAccountsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onSyncAll={handleSyncAll}
        onCreateLabel={() => setNewLabelOpen(true)}
      />

      {/* Main Inbox List Column (Full screen on mobile, Split Pane on desktop) */}
      <section
        aria-label="Message list"
        className={`relative flex flex-col h-full w-full lg:w-[430px] xl:w-[465px] lg:shrink-0 lg:border-r border-[#E7E0D4] dark:border-[#2C2722] ${
          selectedThread ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {/* Top Floating Search Pill */}
        <div className="px-4 pt-[calc(0.875rem+env(safe-area-inset-top))] pb-2 space-y-3 shrink-0">
          <div className="relative flex items-center h-12 px-2 rounded-full bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#E7E0D4] dark:border-[#2F2A24] shadow-[0_2px_10px_rgba(28,25,23,0.04)]">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation drawer"
              className="lg:hidden min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#1C1917] dark:text-[#FAF7F2] hover:bg-[#F3EDE3] dark:hover:bg-[#2A2520]"
            >
              <Menu className="h-5 w-5" />
            </button>

            <input
              ref={searchInputRef}
              type="search"
              aria-label="Search all mail"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all mail"
              className="flex-1 bg-transparent px-2.5 text-[15px] text-[#1C1917] dark:text-[#FAF7F2] placeholder:text-[#78716C] focus:outline-none min-w-0"
            />

            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="min-h-[38px] min-w-[38px] rounded-full flex items-center justify-center text-[#78716C] hover:bg-[#F3EDE3] dark:hover:bg-[#2A2520]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => searchInputRef.current?.focus()}
                aria-label="Focus search input"
                className="min-h-[38px] min-w-[38px] rounded-full flex items-center justify-center text-[#57534E] dark:text-[#A8A095]"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setAccountSwitcherOpen(true)}
              aria-label="Choose email account"
              title="Choose account"
              style={{ backgroundColor: avatarAccount?.color || '#C85028' }}
              className="ml-1 h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-xs hover:opacity-90 transition-opacity"
            >
              {getInitialLetter(avatarAccount?.label || avatarAccount?.displayName || 'P')}
            </button>

            {/* Quick Search Operator Suggestions */}
            {searchFocused && (
              <div className="absolute left-0 right-0 top-14 z-30 rounded-2xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#E4DDD0] dark:border-[#332E28] shadow-xl p-2 flex flex-wrap gap-1.5">
                {['is:unread', 'is:starred', 'has:attachment', 'from:ama'].map((op) => (
                  <button
                    key={op}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSearchQuery((prev) => (prev ? `${prev} ${op}` : op));
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#FAF7F2] dark:bg-[#2A2520] text-xs font-medium text-[#57534E] dark:text-[#D6CFC5] hover:text-[#C85028]"
                  >
                    {op}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Horizontal Account Filter Strip (10+ accounts scrollable) */}
          <div
            className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
            role="tablist"
            aria-label="Filter by email account"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeAccountId === 'all'}
              onClick={() => setActiveAccountId('all')}
              className={`min-h-[36px] px-4 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 flex items-center gap-2 transition-colors ${
                activeAccountId === 'all'
                  ? 'bg-[#141418] text-white dark:bg-[#FAF7F2] dark:text-[#141418]'
                  : 'bg-[#FFFEFB] dark:bg-[#1E1B18] text-[#44403C] dark:text-[#D6CFC5] border border-[#E4DDD0] dark:border-[#332E28]'
              }`}
            >
              <span>All inboxes</span>
              <span className="tabular-nums opacity-85">{unreadCounts.totalUnread}</span>
            </button>

            {accounts.map((acct) => {
              const active = activeAccountId === acct.id;
              const unread = unreadCounts.byAccount[acct.id] || 0;
              return (
                <button
                  key={acct.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveAccountId(acct.id)}
                  className={`min-h-[36px] px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 flex items-center gap-2 transition-colors ${
                    active
                      ? 'bg-[#141418] text-white dark:bg-[#FAF7F2] dark:text-[#141418]'
                      : 'bg-[#FFFEFB] dark:bg-[#1E1B18] text-[#292524] dark:text-[#E7E0D4] border border-[#E4DDD0] dark:border-[#332E28] hover:border-[#C85028]/50'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: acct.color }}
                  />
                  <span>{acct.label}</span>
                  {unread > 0 && (
                    <span className="tabular-nums text-xs opacity-75">{unread}</span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setAddAccountOpen(true)}
              aria-label="Add another email account"
              className="min-h-[36px] px-3 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 border border-dashed border-[#D6CFC2] dark:border-[#3A342D] text-[#78716C] hover:text-[#C85028] hover:border-[#C85028] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Bulk Selection Toolbar OR Editorial Folder Title Row */}
        {checkedThreadIds.size > 0 ? (
          <div className="mx-4 mb-2 px-3.5 py-2 rounded-2xl bg-[#18181B] text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCheckedThreadIds(new Set())}
                aria-label="Clear selection"
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold tabular-nums">
                {checkedThreadIds.size} selected
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mark selected as read"
                onClick={async () => {
                  const ids = threads
                    .filter((t) => checkedThreadIds.has(t.threadId))
                    .flatMap((t) => t.messages.map((m) => m.id));
                  const res = await bulkMessageAction(ids, 'mark-read');
                  setState(res.state);
                  setCheckedThreadIds(new Set());
                }}
                className="h-8 px-2.5 rounded-lg text-xs font-medium hover:bg-white/10 flex items-center gap-1"
              >
                <MailOpen className="h-3.5 w-3.5" />
                <span>Read</span>
              </button>
              <button
                type="button"
                aria-label="Archive selected"
                onClick={async () => {
                  const ids = threads
                    .filter((t) => checkedThreadIds.has(t.threadId))
                    .flatMap((t) => t.messages.map((m) => m.id));
                  const res = await bulkMessageAction(ids, 'archive');
                  setState(res.state);
                  setCheckedThreadIds(new Set());
                  showToast({ message: 'Archived selected messages', undoIds: ids, undoFolder: true });
                }}
                className="h-8 px-2.5 rounded-lg text-xs font-medium hover:bg-white/10 flex items-center gap-1"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archive</span>
              </button>
              <button
                type="button"
                aria-label="Delete selected"
                onClick={() =>
                  requestTrashThreads(threads.filter((t) => checkedThreadIds.has(t.threadId)))
                }
                className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#FDA4AF] hover:bg-white/10 flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-2 pb-2.5 flex items-baseline justify-between gap-4 shrink-0">
            <h1 className="font-serif-editorial text-[32px] font-bold tracking-tight leading-none text-[#181615] dark:text-[#FAF7F2]">
              {headingTitle}
            </h1>
            <div className="flex items-center gap-3">
              {activeFolder === 'trash' && threads.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setConfirmState({
                      open: true,
                      title: 'Empty Trash?',
                      description: `Permanently delete all ${threads.length} conversation(s) in Trash? This cannot be undone.`,
                      confirmLabel: 'Empty Trash',
                      tone: 'danger',
                      icon: 'trash',
                      onConfirm: async () => {
                        setConfirmState((prev) => ({ ...prev, open: false }));
                        const res = await bulkMessageAction([], 'empty-trash');
                        setState(res.state);
                      },
                    })
                  }
                  className="text-xs font-semibold text-[#BE123C] hover:underline min-h-[36px]"
                >
                  Empty trash
                </button>
              )}
              <button
                type="button"
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly((v) => !v)}
                className={`min-h-[36px] px-2 rounded-lg text-[13.5px] font-medium transition-colors ${
                  unreadOnly
                    ? 'text-[#C85028] font-semibold bg-[#C85028]/10'
                    : 'text-[#6B655E] dark:text-[#9A9287] hover:text-[#1C1917]'
                }`}
              >
                Unread only
              </button>
            </div>
          </div>
        )}

        {errorBanner && (
          <div className="mx-4 mb-2 px-3.5 py-2.5 rounded-xl bg-[#BE123C]/10 border border-[#BE123C]/25 text-xs text-[#BE123C] flex items-center justify-between gap-2">
            <span>{errorBanner}</span>
            <button type="button" onClick={() => setErrorBanner(null)} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto pb-28">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-3.5 animate-pulse">
                  <div className="h-11 w-11 rounded-full bg-[#E7E0D4] dark:bg-[#2A2520]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 rounded bg-[#E7E0D4] dark:bg-[#2A2520]" />
                    <div className="h-3.5 w-2/3 rounded bg-[#EFE8DD] dark:bg-[#221E1A]" />
                    <div className="h-3 w-full rounded bg-[#EFE8DD] dark:bg-[#221E1A]" />
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="px-6 py-16 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-[#EFE8DD] dark:bg-[#24201B] flex items-center justify-center text-[#78716C]">
                <Mail className="h-5 w-5" />
              </div>
              <h2 className="font-serif-editorial text-xl font-bold">Nothing here right now</h2>
              <p className="text-sm text-[#78716C] max-w-xs mx-auto">
                {searchQuery || unreadOnly || activeLabel
                  ? 'No messages match your active filters.'
                  : `Your ${headingTitle.toLowerCase()} folder is completely clear.`}
              </p>
              {(searchQuery || unreadOnly || activeLabel) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setUnreadOnly(false);
                    setActiveLabel(null);
                  }}
                  className="min-h-[40px] px-4 rounded-full bg-[#18181B] text-white text-xs font-semibold"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            threads.map((thread) => (
              <ThreadRow
                key={thread.threadId}
                thread={thread}
                account={accountMap.get(thread.accountId)}
                isSelected={selectedThreadId === thread.threadId}
                isChecked={checkedThreadIds.has(thread.threadId)}
                selectionMode={checkedThreadIds.size > 0}
                compactDensity={settings.compactDensity}
                showAvatars={settings.showAvatars}
                swipeRightAction={settings.swipeRightAction}
                swipeLeftAction={settings.swipeLeftAction}
                onOpen={handleOpenThread}
                onToggleCheck={(t) => {
                  setCheckedThreadIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.threadId)) next.delete(t.threadId);
                    else next.add(t.threadId);
                    return next;
                  });
                }}
                onToggleStar={handleToggleStar}
                onSwipeAction={handleThreadAction}
              />
            ))
          )}
        </div>

        {/* Bottom Swipe Hint + Floating Compose CTA */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-10 bg-gradient-to-t from-[#FAF7F2] from-55% via-[#FAF7F2]/95 via-80% to-transparent dark:from-[#141210] dark:from-55% dark:via-[#141210]/95 dark:via-80% flex items-center justify-between gap-3">
          <span className="text-[11.5px] leading-snug text-[#78716C] dark:text-[#9A9287]">
            Swipe right to {settings.swipeRightAction} · left to {settings.swipeLeftAction} · tap avatar to select
          </span>

          <button
            type="button"
            onClick={() => openNewCompose()}
            className="pointer-events-auto min-h-[48px] px-5 rounded-full bg-[#C85028] hover:bg-[#B04320] active:scale-[0.98] text-white text-sm font-semibold shadow-[0_8px_22px_rgba(200,80,40,0.34)] flex items-center gap-2 shrink-0 transition-all"
          >
            <Pencil className="h-4 w-4" />
            <span>Compose</span>
          </button>
        </div>
      </section>

      {/* Reading Pane (Full screen when selected on mobile; always visible right pane on desktop) */}
      <main
        className={`flex-1 h-full min-w-0 ${
          selectedThread ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
        }`}
      >
        {selectedThread ? (
          <ThreadReader
            thread={selectedThread}
            account={accountMap.get(selectedThread.accountId)}
            availableLabels={labels}
            onBack={() => setSelectedThreadId(null)}
            onReply={handleReplyFromReader}
            onArchive={(t) => handleThreadAction(t, 'archive')}
            onTrash={(t) => requestTrashThreads([t])}
            onToggleStar={handleToggleStar}
            onMarkUnread={async (t) => {
              const ids = t.messages.map((m) => m.id);
              const res = await bulkMessageAction(ids, 'mark-unread');
              setState(res.state);
              setSelectedThreadId(null);
            }}
            onSnooze={async (t, untilIso) => {
              const ids = t.messages.map((m) => m.id);
              const res = await bulkMessageAction(ids, 'snooze', untilIso);
              setState(res.state);
              advanceAfterRemoval(t.threadId);
              showToast({ message: 'Snoozed conversation', undoIds: ids, undoFolder: true });
            }}
            onToggleLabel={async (t, label) => {
              const ids = t.messages.map((m) => m.id);
              const has = t.labels.includes(label);
              const res = await bulkMessageAction(ids, has ? 'remove-label' : 'add-label', label);
              setState(res.state);
            }}
            onReportSpam={async (t) => {
              const ids = t.messages.map((m) => m.id);
              const res = await bulkMessageAction(ids, 'spam');
              setState(res.state);
              advanceAfterRemoval(t.threadId);
              showToast({ message: 'Reported as spam', undoIds: ids, undoFolder: true });
            }}
            onUnsubscribe={(msg) => {
              setConfirmState({
                open: true,
                title: 'Unsubscribe from mailing list?',
                description: `Stop receiving automated updates from ${msg.from.name} (${msg.from.email}) and archive this thread?`,
                confirmLabel: 'Unsubscribe',
                tone: 'primary',
                onConfirm: async () => {
                  setConfirmState((prev) => ({ ...prev, open: false }));
                  const res = await bulkMessageAction([msg.id], 'archive');
                  setState(res.state);
                  setSelectedThreadId(null);
                  showToast({ message: `Unsubscribed from ${msg.from.name}` });
                },
              });
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-10 text-center bg-[#FAF7F2] dark:bg-[#141210]">
            <div className="max-w-md space-y-5">
              <div className="flex flex-col items-center gap-2.5">
                <HeliumLogo size="lg" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C85028]">
                  Helium Mail
                </span>
              </div>
              <h2 className="font-serif-editorial text-2xl font-bold">
                {accounts.length} accounts · {unreadCounts.totalUnread} unread
              </h2>
              <p className="text-sm text-[#6B655E] dark:text-[#9A9287] leading-relaxed">
                Select any conversation to read, reply, snooze, or label. Connect Gmail via Google
                Sign-In, Outlook, Yahoo, iCloud, Fastmail, or custom IMAP/SMTP servers — 10+
                inboxes in one calm stream.
              </p>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setAddAccountOpen(true)}
                  className="min-h-[42px] px-5 rounded-full bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#DDD4C6] dark:border-[#332E28] text-sm font-semibold flex items-center gap-2 hover:border-[#C85028]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add account</span>
                </button>
              </div>

              <div className="pt-4 text-xs text-[#78716C] flex items-center justify-center gap-4">
                <span>Press <kbd className="font-mono-code px-1.5 py-0.5 rounded bg-[#EDE6DA] dark:bg-[#24201B]">c</kbd> to compose</span>
                <span aria-hidden="true">·</span>
                <span>Press <kbd className="font-mono-code px-1.5 py-0.5 rounded bg-[#EDE6DA] dark:bg-[#24201B]">/</kbd> to search</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <ComposeModal
        open={composeOpen}
        accounts={accounts}
        knownContacts={knownContacts}
        initialDraft={composeInitialDraft}
        onClose={() => setComposeOpen(false)}
        onRequestSend={handleRequestSend}
        onSaveDraft={async (draft) => {
          const res = await saveDraftMessage(draft);
          setState(res.state);
          showToast({ message: 'Saved to Drafts' });
        }}
      />

      <AddAccountModal
        open={addAccountOpen}
        existingAccountCount={accounts.length}
        onClose={() => setAddAccountOpen(false)}
        onAdded={async (_acct, msg) => {
          await reloadState();
          if (msg) showToast({ message: msg });
        }}
      />

      <AccountSwitcherModal
        open={accountSwitcherOpen}
        accounts={accounts}
        activeAccountId={activeAccountId}
        unreadCounts={unreadCounts}
        onClose={() => setAccountSwitcherOpen(false)}
        onSelectAccount={(acctId) => {
          setActiveAccountId(acctId);
          setSelectedThreadId(null);
          setCheckedThreadIds(new Set());
        }}
        onOpenAddAccount={() => setAddAccountOpen(true)}
        onOpenManageAccounts={() => setManageAccountsOpen(true)}
      />

      <ManageAccountsModal
        open={manageAccountsOpen}
        accounts={accounts}
        onClose={() => setManageAccountsOpen(false)}
        onSelectAccount={(acctId) => {
          setActiveAccountId(acctId);
          setSelectedThreadId(null);
          setCheckedThreadIds(new Set());
        }}
        onOpenAdd={() => setAddAccountOpen(true)}
        onRequestRemoveAccount={(acct: MailAccount) => {
          setConfirmState({
            open: true,
            title: `Remove ${acct.label}?`,
            description: `Disconnect ${acct.email} from Helium Mail and clear its cached messages from this workspace?`,
            confirmLabel: 'Remove account',
            tone: 'danger',
            icon: 'trash',
            onConfirm: async () => {
              setConfirmState((prev) => ({ ...prev, open: false }));
              const res = await deleteAccount(acct.id);
              setState(res.state);
              if (activeAccountId === acct.id) setActiveAccountId('all');
              showToast({ message: `Removed ${acct.email}` });
            },
          });
        }}
        onStateUpdated={async (msg) => {
          await reloadState();
          if (msg) showToast({ message: msg });
        }}
      />

      <SettingsAndRulesModal
        open={settingsOpen}
        settings={settings}
        rules={rules}
        labels={labels}
        onClose={() => setSettingsOpen(false)}
        onStateUpdated={async (msg) => {
          await reloadState();
          if (msg) showToast({ message: msg });
        }}
      />

      {/* Create Label Mini Modal */}
      {newLabelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-label-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#E5DDD0] dark:border-[#332E28] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="new-label-title" className="font-serif-editorial text-lg font-bold">
                New label
              </h2>
              <button
                type="button"
                onClick={() => setNewLabelOpen(false)}
                aria-label="Close new label dialog"
                className="h-9 w-9 rounded-full flex items-center justify-center text-[#78716C] hover:bg-[#F3EDE3]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="e.g., Projects, Invoices, Family"
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#FAF7F2] dark:bg-[#24201B] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewLabelOpen(false)}
                className="min-h-[40px] px-4 rounded-xl border border-[#DDD4C6] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!newLabelName.trim()) return;
                  const res = await createLabel(newLabelName.trim());
                  setState(res.state);
                  setNewLabelName('');
                  setNewLabelOpen(false);
                }}
                className="min-h-[40px] px-4 rounded-xl bg-[#C85028] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Tag className="h-3.5 w-3.5" />
                <span>Create</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Confirmation Modal */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.tone}
        icon={confirmState.icon}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />

      {/* Undo / Status Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 lg:bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-[#18181B] text-white text-xs font-medium shadow-xl flex items-center gap-3"
        >
          <span>{toast.message}</span>
          {toast.undoIds && toast.undoFolder && (
            <button
              type="button"
              onClick={async () => {
                const res = await bulkMessageAction(toast.undoIds!, 'move-inbox');
                setState(res.state);
                setToast(null);
              }}
              className="font-semibold text-[#FDBA74] hover:underline flex items-center gap-1"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Undo</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
