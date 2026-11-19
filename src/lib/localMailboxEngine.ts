import type {
  ComposeDraft,
  EmailMessage,
  MailAccount,
  MailboxStatePayload,
  MailRule,
  MailSettings,
} from '../types/mail';
import {
  ACCOUNT_COLOR_PALETTE,
  applyMailRules,
  createSnippet,
  parseRecipientList,
  validateAccountInput,
  validateComposeInput,
} from './mailLogic';
import { createSeedDatabase, type MailboxDatabase, type StoredAccount } from './seedData';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const LOCAL_DB_STORAGE_KEY = 'helium_mail_local_db_v1';

function getDefaultStorage(): StorageLike {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  const memory = new Map<string, string>();
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => {
      memory.set(k, v);
    },
  };
}

function sanitizeAccount(acct: StoredAccount): MailAccount {
  const { password: _pw, ...safe } = acct;
  return safe;
}

export class LocalMailboxEngine {
  private storage: StorageLike;
  private storageKey: string;

  constructor(storage?: StorageLike, storageKey = LOCAL_DB_STORAGE_KEY) {
    this.storage = storage ?? getDefaultStorage();
    this.storageKey = storageKey;
  }

  private loadDb(): MailboxDatabase {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as MailboxDatabase;
        if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.messages)) {
          const woken = wakeDueAndSave(parsed);
          if (woken) this.saveDb(parsed);
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh seed if corrupted
    }
    const seed = createSeedDatabase();
    this.saveDb(seed);
    return seed;
  }

  private saveDb(db: MailboxDatabase): void {
    this.storage.setItem(this.storageKey, JSON.stringify(db));
  }

  getState(): MailboxStatePayload {
    const db = this.loadDb();
    return {
      accounts: [...db.accounts]
        .sort((a, b) => a.order - b.order)
        .map(sanitizeAccount),
      messages: db.messages,
      labels: db.labels,
      rules: db.rules,
      settings: db.settings,
    };
  }

  createAccount(payload: {
    label: string;
    email: string;
    displayName: string;
    provider: MailAccount['provider'];
    color: string;
    signature?: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    password?: string;
  }): { account: MailAccount; state: MailboxStatePayload; reused?: boolean } {
    const validation = validateAccountInput({
      label: payload.label || '',
      email: payload.email || '',
      displayName: payload.displayName || '',
      provider: payload.provider || 'local-sandbox',
      color: payload.color || ACCOUNT_COLOR_PALETTE[0],
      signature: payload.signature || '',
      imapHost: payload.imapHost || '',
      imapPort: Number(payload.imapPort || 993),
      imapSecure: Boolean(payload.imapSecure ?? true),
      smtpHost: payload.smtpHost || '',
      smtpPort: Number(payload.smtpPort || 465),
      smtpSecure: Boolean(payload.smtpSecure ?? true),
      password: payload.password || '',
    });

    if (!validation.valid) {
      const err: any = new Error('Validation failed');
      err.fieldErrors = validation.errors;
      err.status = 400;
      throw err;
    }

    const db = this.loadDb();
    const cleanEmail = payload.email.trim().toLowerCase();
    const existing = db.accounts.find(
      (a) => a.email.toLowerCase() === cleanEmail && a.provider === payload.provider
    );
    if (existing) {
      return { account: sanitizeAccount(existing), state: this.getState(), reused: true };
    }

    const id = `acct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isImap = Boolean(payload.imapHost);

    const newAccount: StoredAccount = {
      id,
      label: payload.label.trim(),
      email: cleanEmail,
      displayName: payload.displayName.trim(),
      provider: payload.provider,
      color: payload.color || ACCOUNT_COLOR_PALETTE[db.accounts.length % ACCOUNT_COLOR_PALETTE.length],
      signature: payload.signature || `Best,\n${payload.displayName.trim()}`,
      syncEnabled: true,
      notificationsEnabled: true,
      lastSyncedAt: new Date().toISOString(),
      syncStatus: 'connected',
      order: db.accounts.length,
      ...(isImap
        ? {
            password: payload.password || '',
            imapSmtp: {
              imapHost: String(payload.imapHost).trim(),
              imapPort: Number(payload.imapPort || 993),
              imapSecure: Boolean(payload.imapSecure ?? true),
              smtpHost: String(payload.smtpHost).trim(),
              smtpPort: Number(payload.smtpPort || 465),
              smtpSecure: Boolean(payload.smtpSecure ?? true),
              username: cleanEmail,
              hasPassword: Boolean(payload.password),
            },
          }
        : {}),
    };

    db.accounts.push(newAccount);

    if (newAccount.provider === 'local-sandbox') {
      const welcomeMsg: EmailMessage = {
        id: `msg-welcome-${Date.now()}`,
        threadId: `thread-welcome-${Date.now()}`,
        accountId: newAccount.id,
        from: { name: 'Helium Mail Concierge', email: 'concierge@heliummail.app' },
        to: [{ name: newAccount.displayName, email: newAccount.email }],
        subject: `${newAccount.label} inbox ready`,
        snippet: `Your ${newAccount.label} (${newAccount.email}) mailbox is active in your unified inbox.`,
        bodyText: `Welcome!\n\nYour ${newAccount.label} (${newAccount.email}) account is now live inside Helium Mail.\n\nYou can filter by this account using the top pill strip, send emails from this address in Compose, or customize its color and signature anytime in Manage Accounts.`,
        timestamp: new Date().toISOString(),
        folder: 'inbox',
        isRead: false,
        isStarred: false,
        labels: [],
        attachments: [],
      };
      db.messages.unshift(applyMailRules(welcomeMsg, db.rules));
    }

    this.saveDb(db);
    return { account: sanitizeAccount(newAccount), state: this.getState() };
  }

  updateAccount(id: string, patch: Partial<MailAccount>): { account: MailAccount; state: MailboxStatePayload } {
    const db = this.loadDb();
    const acct = db.accounts.find((a) => a.id === id);
    if (!acct) throw new Error('Account not found');

    if (typeof patch.label === 'string' && patch.label.trim()) acct.label = patch.label.trim();
    if (typeof patch.displayName === 'string' && patch.displayName.trim()) {
      acct.displayName = patch.displayName.trim();
    }
    if (typeof patch.color === 'string') acct.color = patch.color;
    if (typeof patch.signature === 'string') acct.signature = patch.signature;
    if (typeof patch.syncEnabled === 'boolean') acct.syncEnabled = patch.syncEnabled;
    if (typeof patch.notificationsEnabled === 'boolean') {
      acct.notificationsEnabled = patch.notificationsEnabled;
    }

    this.saveDb(db);
    return { account: sanitizeAccount(acct), state: this.getState() };
  }

  deleteAccount(id: string): { state: MailboxStatePayload } {
    const db = this.loadDb();
    db.accounts = db.accounts.filter((a) => a.id !== id);
    db.messages = db.messages.filter((m) => m.accountId !== id);
    this.saveDb(db);
    return { state: this.getState() };
  }

  sendMessage(draft: ComposeDraft & { draftId?: string }): {
    ok: boolean;
    scheduled?: boolean;
    state: MailboxStatePayload;
  } {
    const normalizedDraft: ComposeDraft = {
      ...draft,
      accountId: draft.accountId || '',
      to: draft.to || '',
      cc: draft.cc || '',
      bcc: draft.bcc || '',
      subject: draft.subject || '',
      bodyText: draft.bodyText || '',
      attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
    };
    const validation = validateComposeInput(normalizedDraft);

    if (!validation.valid) {
      const err: any = new Error('Please fix compose errors');
      err.fieldErrors = validation.errors;
      err.status = 400;
      throw err;
    }

    const db = this.loadDb();
    const sender = db.accounts.find((a) => a.id === normalizedDraft.accountId);
    if (!sender) throw new Error('Sender account not found');

    const toParticipants = (raw: string) =>
      parseRecipientList(raw).map((email) => ({ name: email.split('@')[0] || email, email }));

    const toList = toParticipants(normalizedDraft.to);
    const ccList = normalizedDraft.cc ? toParticipants(normalizedDraft.cc) : [];
    const bccList = normalizedDraft.bcc ? toParticipants(normalizedDraft.bcc) : [];
    const threadId = normalizedDraft.threadId || `thread-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const scheduled = Boolean(
      normalizedDraft.scheduledFor &&
        new Date(normalizedDraft.scheduledFor).getTime() > Date.now() + 5000
    );

    const sentMsg: EmailMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      threadId,
      accountId: sender.id,
      from: { name: sender.displayName, email: sender.email },
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: bccList.length ? bccList : undefined,
      subject: normalizedDraft.subject.trim(),
      snippet: createSnippet(normalizedDraft.bodyText),
      bodyText: normalizedDraft.bodyText,
      timestamp: nowIso,
      folder: scheduled ? 'snoozed' : 'sent',
      snoozedUntil: scheduled ? normalizedDraft.scheduledFor : undefined,
      isRead: true,
      isStarred: false,
      labels: [],
      attachments: normalizedDraft.attachments,
    };

    if (draft.draftId) {
      db.messages = db.messages.filter((m) => m.id !== draft.draftId);
    }

    db.messages.unshift(sentMsg);

    // Local delivery between user's own accounts on-device
    if (!scheduled) {
      const allRecipients = [...toList, ...ccList, ...bccList];
      for (const recipient of allRecipients) {
        const targetAccount = db.accounts.find(
          (a) => a.email.toLowerCase() === recipient.email.toLowerCase() && a.id !== sender.id
        );
        if (targetAccount) {
          const delivered: EmailMessage = {
            ...sentMsg,
            id: `msg-rx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            accountId: targetAccount.id,
            folder: 'inbox',
            isRead: false,
          };
          db.messages.unshift(applyMailRules(delivered, db.rules));
        }
      }
    }

    this.saveDb(db);
    return { ok: true, scheduled, state: this.getState() };
  }

  saveDraft(draft: ComposeDraft): { state: MailboxStatePayload } {
    const db = this.loadDb();
    const sender = db.accounts.find((a) => a.id === draft.accountId) || db.accounts[0];
    if (!sender) throw new Error('No account available');

    const draftId = draft.id || `msg-draft-${Date.now()}`;
    const msg: EmailMessage = {
      id: draftId,
      threadId: draft.threadId || `thread-draft-${Date.now()}`,
      accountId: sender.id,
      from: { name: sender.displayName, email: sender.email },
      to: draft.to
        ? parseRecipientList(draft.to).map((email) => ({
            name: email.split('@')[0] || email,
            email,
          }))
        : [],
      subject: (draft.subject || '(Draft)').trim(),
      snippet: createSnippet(draft.bodyText || ''),
      bodyText: draft.bodyText || '',
      timestamp: new Date().toISOString(),
      folder: 'drafts',
      isRead: true,
      isStarred: false,
      labels: [],
      attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
    };

    const existingIdx = db.messages.findIndex((m) => m.id === draftId);
    if (existingIdx >= 0) db.messages[existingIdx] = msg;
    else db.messages.unshift(msg);

    this.saveDb(db);
    return { state: this.getState() };
  }

  bulkAction(
    messageIds: string[],
    action: string,
    value?: string
  ): { state: MailboxStatePayload } {
    const db = this.loadDb();
    const idSet = new Set(messageIds);

    if (action === 'empty-trash') {
      db.messages = db.messages.filter((m) => m.folder !== 'trash');
      this.saveDb(db);
      return { state: this.getState() };
    }

    if (action === 'delete-forever') {
      db.messages = db.messages.filter((m) => !idSet.has(m.id));
      this.saveDb(db);
      return { state: this.getState() };
    }

    db.messages = db.messages.map((m) => {
      if (!idSet.has(m.id)) return m;
      switch (action) {
        case 'mark-read':
          return { ...m, isRead: true };
        case 'mark-unread':
          return { ...m, isRead: false };
        case 'star':
          return { ...m, isStarred: true };
        case 'unstar':
          return { ...m, isStarred: false };
        case 'archive':
          return { ...m, folder: 'archive', snoozedUntil: undefined };
        case 'move-inbox':
          return { ...m, folder: 'inbox', snoozedUntil: undefined };
        case 'trash':
          return { ...m, folder: 'trash' };
        case 'spam':
          return { ...m, folder: 'spam' };
        case 'snooze':
          return { ...m, folder: 'snoozed', snoozedUntil: value };
        case 'add-label':
          return value && !m.labels.includes(value) ? { ...m, labels: [...m.labels, value] } : m;
        case 'remove-label':
          return value ? { ...m, labels: m.labels.filter((l) => l !== value) } : m;
        default:
          return m;
      }
    });

    this.saveDb(db);
    return { state: this.getState() };
  }

  createLabel(name: string): { state: MailboxStatePayload } {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Label name required');
    const db = this.loadDb();
    if (!db.labels.includes(trimmed)) {
      db.labels.push(trimmed);
      this.saveDb(db);
    }
    return { state: this.getState() };
  }

  createRule(ruleInput: Omit<MailRule, 'id' | 'enabled'>): { state: MailboxStatePayload } {
    const db = this.loadDb();
    const rule: MailRule = {
      id: `rule-${Date.now()}`,
      name: ruleInput.name.trim(),
      enabled: true,
      matchField: ruleInput.matchField,
      matchValue: ruleInput.matchValue.trim(),
      action: ruleInput.action,
      actionValue: ruleInput.actionValue,
    };
    db.rules.push(rule);
    db.messages = db.messages.map((m) => applyMailRules(m, [rule]));
    this.saveDb(db);
    return { state: this.getState() };
  }

  toggleRule(id: string, enabled: boolean): { state: MailboxStatePayload } {
    const db = this.loadDb();
    const rule = db.rules.find((r) => r.id === id);
    if (rule) {
      rule.enabled = enabled;
      this.saveDb(db);
    }
    return { state: this.getState() };
  }

  deleteRule(id: string): { state: MailboxStatePayload } {
    const db = this.loadDb();
    db.rules = db.rules.filter((r) => r.id !== id);
    this.saveDb(db);
    return { state: this.getState() };
  }

  updateSettings(patch: Partial<MailSettings>): { state: MailboxStatePayload } {
    const db = this.loadDb();
    db.settings = { ...db.settings, ...patch };
    this.saveDb(db);
    return { state: this.getState() };
  }

  upsertSyncedMessages(accountId: string, incoming: EmailMessage[]): MailboxStatePayload {
    const db = this.loadDb();
    const existingRemoteIds = new Set(db.messages.map((m) => m.remoteId).filter(Boolean));
    for (const msg of incoming) {
      if (msg.remoteId && existingRemoteIds.has(msg.remoteId)) continue;
      db.messages.unshift(applyMailRules(msg, db.rules));
    }
    const acct = db.accounts.find((a) => a.id === accountId);
    if (acct) {
      acct.lastSyncedAt = new Date().toISOString();
      acct.syncStatus = 'connected';
      acct.syncError = undefined;
    }
    this.saveDb(db);
    return this.getState();
  }
}

function wakeDueAndSave(db: MailboxDatabase): boolean {
  const now = Date.now();
  let changed = false;
  db.messages = db.messages.map((m) => {
    if (m.folder === 'snoozed' && m.snoozedUntil && new Date(m.snoozedUntil).getTime() <= now) {
      changed = true;
      return { ...m, folder: 'inbox', isRead: false, snoozedUntil: undefined };
    }
    return m;
  });
  return changed;
}

export const localMailboxEngine = new LocalMailboxEngine();
