import type {
  ComposeDraft,
  EmailMessage,
  EmailThread,
  MailAccount,
  MailFolder,
  MailProvider,
  MailRule,
  ProviderPreset,
} from '../types/mail';

export const ACCOUNT_COLOR_PALETTE = [
  '#C85028', // Terracotta
  '#2563EB', // Cobalt Blue
  '#15803D', // Forest Green
  '#7C3AED', // Royal Plum
  '#B45309', // Warm Ochre
  '#0F766E', // Deep Teal
  '#BE123C', // Crimson Rose
  '#4338CA', // Indigo Ink
  '#4D7C0F', // Olive Moss
  '#0369A1', // Cerulean
  '#EA580C', // Burnt Orange
  '#334155', // Slate Charcoal
] as const;

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'gmail-oauth',
    name: 'Gmail (Google Sign-In)',
    badge: 'OAuth',
    description: 'Connect your Google developer or approved Test User Gmail account via Google Sign-In.',
    authMode: 'oauth',
    helpNote:
      'While Google OAuth is in Testing mode, only Google accounts added to Test Users in Google Cloud Console can sign in here (others get Error 403: access_denied). Use Gmail (App Password) for any other Gmail account.',
  },
  {
    id: 'gmail-imap',
    name: 'Gmail (App Password)',
    badge: 'Any Gmail',
    description: 'Connect any Gmail account (10+ inboxes, no tester limits) via a 16-character App Password.',
    authMode: 'imap-smtp',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    helpNote:
      'Works for any Gmail address without OAuth verification. In your Google Account -> Security -> 2-Step Verification -> App passwords, create a 16-character password and paste it below.',
  },
  {
    id: 'outlook',
    name: 'Outlook / Hotmail / 365',
    badge: 'IMAP',
    description: 'Microsoft personal Outlook.com, Live, Hotmail, and Microsoft 365.',
    authMode: 'imap-smtp',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    helpNote: 'Uses STARTTLS on port 587 for SMTP.',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    badge: 'IMAP',
    description: 'Yahoo Mail & Ymail accounts via App Password.',
    authMode: 'imap-smtp',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    helpNote: 'Generate an App Password in Yahoo Account Security.',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    badge: 'IMAP',
    description: 'Apple @icloud.com, @me.com, and @mac.com inboxes.',
    authMode: 'imap-smtp',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    helpNote: 'Requires an Apple ID app-specific password.',
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    badge: 'IMAP',
    description: 'Privacy-focused Fastmail & custom domain mailboxes.',
    authMode: 'imap-smtp',
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 465,
    smtpSecure: true,
    helpNote: 'Create a dedicated IMAP/SMTP app password in Fastmail Settings.',
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    badge: 'IMAP',
    description: 'Zoho Mail personal and business domain accounts.',
    authMode: 'imap-smtp',
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpSecure: true,
    helpNote: 'Enable IMAP Access in Zoho Mail settings before connecting.',
  },
  {
    id: 'proton-bridge',
    name: 'Proton Mail Bridge',
    badge: 'Bridge',
    description: 'Connect Proton Mail via local Proton Bridge IMAP/SMTP.',
    authMode: 'imap-smtp',
    imapHost: '127.0.0.1',
    imapPort: 1143,
    imapSecure: false,
    smtpHost: '127.0.0.1',
    smtpPort: 1025,
    smtpSecure: false,
    helpNote: 'Requires Proton Bridge running with local Bridge credentials.',
  },
  {
    id: 'custom-imap',
    name: 'Custom IMAP / SMTP',
    badge: 'Custom',
    description: 'Any corporate, university, cPanel, or self-hosted mail server.',
    authMode: 'imap-smtp',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    helpNote: 'Enter your mail server hostname, ports, and credentials.',
  },
  {
    id: 'local-sandbox',
    name: 'Instant Workspace Mailbox',
    badge: 'Instant',
    description: 'Create a dedicated local sandbox inbox for organizing workflows immediately.',
    authMode: 'local',
    helpNote: 'Works offline with full folders, rules, templates, and cross-account sending.',
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export interface AccountFormInput {
  label: string;
  email: string;
  displayName: string;
  provider: MailProvider;
  color: string;
  signature?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  password?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateAccountInput(input: AccountFormInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.label.trim()) {
    errors.label = 'Account label is required (e.g., Personal, Studio, Client).';
  } else if (input.label.trim().length > 28) {
    errors.label = 'Account label must be 28 characters or fewer.';
  }

  if (!input.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!isValidEmail(input.email)) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!input.displayName.trim()) {
    errors.displayName = 'Sender display name is required.';
  }

  const preset = PROVIDER_PRESETS.find((p) => p.id === input.provider);
  if (preset?.authMode === 'imap-smtp') {
    if (!input.imapHost?.trim()) {
      errors.imapHost = 'IMAP server host is required.';
    }
    if (!input.imapPort || Number.isNaN(input.imapPort) || input.imapPort < 1 || input.imapPort > 65535) {
      errors.imapPort = 'IMAP port must be between 1 and 65535.';
    }
    if (!input.smtpHost?.trim()) {
      errors.smtpHost = 'SMTP server host is required.';
    }
    if (!input.smtpPort || Number.isNaN(input.smtpPort) || input.smtpPort < 1 || input.smtpPort > 65535) {
      errors.smtpPort = 'SMTP port must be between 1 and 65535.';
    }
    if (!input.password?.trim()) {
      errors.password = 'Password or app-specific password is required.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function parseRecipientList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((part) => {
      const match = part.match(/<([^>]+)>/);
      return (match ? match[1] : part).trim();
    })
    .filter(Boolean);
}

export function validateComposeInput(draft: ComposeDraft): ValidationResult {
  const errors: Record<string, string> = {};

  if (!draft.accountId.trim()) {
    errors.accountId = 'Please choose a sending account.';
  }

  const toList = parseRecipientList(draft.to);
  if (toList.length === 0) {
    errors.to = 'Add at least one recipient email address.';
  } else {
    const invalid = toList.find((addr) => !isValidEmail(addr));
    if (invalid) {
      errors.to = `Invalid recipient address: ${invalid}`;
    }
  }

  if (draft.cc.trim()) {
    const ccList = parseRecipientList(draft.cc);
    const invalidCc = ccList.find((addr) => !isValidEmail(addr));
    if (invalidCc) {
      errors.cc = `Invalid CC address: ${invalidCc}`;
    }
  }

  if (draft.bcc.trim()) {
    const bccList = parseRecipientList(draft.bcc);
    const invalidBcc = bccList.find((addr) => !isValidEmail(addr));
    if (invalidBcc) {
      errors.bcc = `Invalid BCC address: ${invalidBcc}`;
    }
  }

  if (!draft.subject.trim() && !draft.bodyText.trim()) {
    errors.bodyText = 'Enter a subject or message before sending.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface MessageFilterOptions {
  accountId: string; // 'all' or specific accountId
  folder: MailFolder;
  unreadOnly: boolean;
  label?: string | null;
  searchQuery?: string;
}

export interface ParsedSearchQuery {
  textTerms: string[];
  from?: string;
  to?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const parsed: ParsedSearchQuery = { textTerms: [] };

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower.startsWith('from:') && token.length > 5) {
      parsed.from = token.slice(5).toLowerCase();
    } else if (lower.startsWith('to:') && token.length > 3) {
      parsed.to = token.slice(3).toLowerCase();
    } else if (lower === 'has:attachment') {
      parsed.hasAttachment = true;
    } else if (lower === 'is:unread') {
      parsed.isUnread = true;
    } else if (lower === 'is:starred') {
      parsed.isStarred = true;
    } else {
      parsed.textTerms.push(lower);
    }
  }

  return parsed;
}

export function filterMessages(
  messages: EmailMessage[],
  accounts: MailAccount[],
  options: MessageFilterOptions
): EmailMessage[] {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const parsedSearch = options.searchQuery ? parseSearchQuery(options.searchQuery) : null;

  return messages.filter((msg) => {
    if (options.accountId !== 'all' && msg.accountId !== options.accountId) {
      return false;
    }

    if (options.folder === 'starred') {
      if (!msg.isStarred || msg.folder === 'trash' || msg.folder === 'spam') return false;
    } else if (options.folder === 'all') {
      if (msg.folder === 'trash' || msg.folder === 'spam') return false;
    } else if (msg.folder !== options.folder) {
      return false;
    }

    if (options.unreadOnly && msg.isRead) {
      return false;
    }

    if (options.label && !msg.labels.includes(options.label)) {
      return false;
    }

    if (parsedSearch) {
      if (parsedSearch.hasAttachment && msg.attachments.length === 0) return false;
      if (parsedSearch.isUnread && msg.isRead) return false;
      if (parsedSearch.isStarred && !msg.isStarred) return false;
      if (parsedSearch.from) {
        const fromHaystack = `${msg.from.name} ${msg.from.email}`.toLowerCase();
        if (!fromHaystack.includes(parsedSearch.from)) return false;
      }
      if (parsedSearch.to) {
        const acctEmail = accountMap.get(msg.accountId)?.email ?? '';
        const toHaystack = `${msg.to.map((t) => `${t.name} ${t.email}`).join(' ')} ${acctEmail}`.toLowerCase();
        if (!toHaystack.includes(parsedSearch.to)) return false;
      }
      if (parsedSearch.textTerms.length > 0) {
        const acct = accountMap.get(msg.accountId);
        const fullHaystack = [
          msg.from.name,
          msg.from.email,
          msg.subject,
          msg.snippet,
          msg.bodyText,
          acct?.email ?? '',
          acct?.label ?? '',
          ...msg.labels,
        ]
          .join(' ')
          .toLowerCase();

        for (const term of parsedSearch.textTerms) {
          if (!fullHaystack.includes(term)) return false;
        }
      }
    }

    return true;
  });
}

export function groupThreads(messages: EmailMessage[]): EmailThread[] {
  const byThread = new Map<string, EmailMessage[]>();

  for (const msg of messages) {
    const existing = byThread.get(msg.threadId);
    if (existing) {
      existing.push(msg);
    } else {
      byThread.set(msg.threadId, [msg]);
    }
  }

  const threads: EmailThread[] = [];
  for (const [threadId, threadMsgs] of byThread.entries()) {
    const sorted = [...threadMsgs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const latestMessage = sorted[sorted.length - 1];
    const unreadCount = sorted.filter((m) => !m.isRead).length;
    const isStarred = sorted.some((m) => m.isStarred);
    const hasAttachments = sorted.some((m) => m.attachments.length > 0);
    const labels = Array.from(new Set(sorted.flatMap((m) => m.labels)));
    const participantNames = Array.from(
      new Set(sorted.map((m) => m.from.name || m.from.email))
    );

    threads.push({
      threadId,
      accountId: latestMessage.accountId,
      subject: latestMessage.subject,
      latestMessage,
      messages: sorted,
      unreadCount,
      isUnread: unreadCount > 0,
      isStarred,
      hasAttachments,
      labels,
      participantNames,
    });
  }

  return threads.sort(
    (a, b) =>
      new Date(b.latestMessage.timestamp).getTime() -
      new Date(a.latestMessage.timestamp).getTime()
  );
}

export function computeAccountUnreadCounts(
  messages: EmailMessage[],
  accounts: MailAccount[]
): { totalUnread: number; byAccount: Record<string, number> } {
  const byAccount: Record<string, number> = {};
  for (const acct of accounts) {
    byAccount[acct.id] = 0;
  }

  let totalUnread = 0;
  for (const msg of messages) {
    if (msg.folder === 'inbox' && !msg.isRead) {
      totalUnread += 1;
      byAccount[msg.accountId] = (byAccount[msg.accountId] ?? 0) + 1;
    }
  }

  return { totalUnread, byAccount };
}

export function applyMailRules(
  message: EmailMessage,
  rules: MailRule[]
): EmailMessage {
  let updated = { ...message, labels: [...message.labels] };

  for (const rule of rules) {
    if (!rule.enabled || !rule.matchValue.trim()) continue;
    const needle = rule.matchValue.toLowerCase();
    let haystack = '';
    if (rule.matchField === 'from') {
      haystack = `${updated.from.name} ${updated.from.email}`.toLowerCase();
    } else if (rule.matchField === 'subject') {
      haystack = updated.subject.toLowerCase();
    } else if (rule.matchField === 'body') {
      haystack = updated.bodyText.toLowerCase();
    } else if (rule.matchField === 'to') {
      haystack = updated.to.map((t) => `${t.name} ${t.email}`).join(' ').toLowerCase();
    }

    if (!haystack.includes(needle)) continue;

    if (rule.action === 'apply-label' && rule.actionValue) {
      if (!updated.labels.includes(rule.actionValue)) {
        updated.labels.push(rule.actionValue);
      }
    } else if (rule.action === 'star') {
      updated.isStarred = true;
    } else if (rule.action === 'archive') {
      if (updated.folder === 'inbox') {
        updated.folder = 'archive';
      }
    } else if (rule.action === 'mark-read') {
      updated.isRead = true;
    }
  }

  return updated;
}

export function wakeDueSnoozedMessages(
  messages: EmailMessage[],
  now: Date = new Date()
): EmailMessage[] {
  const nowMs = now.getTime();
  return messages.map((msg) => {
    if (msg.folder === 'snoozed' && msg.snoozedUntil) {
      const dueMs = new Date(msg.snoozedUntil).getTime();
      if (!Number.isNaN(dueMs) && dueMs <= nowMs) {
        return {
          ...msg,
          folder: 'inbox',
          isRead: false,
          snoozedUntil: undefined,
        };
      }
    }
    return msg;
  });
}

export function formatMessageTimestamp(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function createSnippet(bodyText: string, maxLen = 96): string {
  const clean = bodyText.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

export function getInitialLetter(nameOrEmail: string): string {
  const clean = nameOrEmail.trim();
  if (!clean) return '?';
  return clean[0].toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
