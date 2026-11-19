export type MailProvider =
  | 'gmail-oauth'
  | 'gmail-imap'
  | 'outlook'
  | 'yahoo'
  | 'icloud'
  | 'fastmail'
  | 'zoho'
  | 'proton-bridge'
  | 'custom-imap'
  | 'local-sandbox';

export type MailFolder =
  | 'inbox'
  | 'starred'
  | 'snoozed'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'spam'
  | 'trash'
  | 'all';

export type SwipeAction = 'archive' | 'delete' | 'read' | 'star' | 'snooze';

export interface ImapSmtpConfig {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  hasPassword?: boolean;
}

export interface MailAccount {
  id: string;
  label: string;
  email: string;
  displayName: string;
  provider: MailProvider;
  color: string;
  signature: string;
  syncEnabled: boolean;
  notificationsEnabled: boolean;
  lastSyncedAt?: string;
  syncStatus?: 'idle' | 'syncing' | 'connected' | 'needs-auth' | 'error';
  syncError?: string;
  imapSmtp?: ImapSmtpConfig;
  order: number;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentText?: string;
}

export interface EmailParticipant {
  name: string;
  email: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  accountId: string;
  remoteId?: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  timestamp: string;
  folder: Exclude<MailFolder, 'starred' | 'all'>;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  attachments: EmailAttachment[];
  snoozedUntil?: string;
  scheduledFor?: string;
  listUnsubscribe?: string;
  isImportant?: boolean;
}

export interface EmailThread {
  threadId: string;
  accountId: string;
  subject: string;
  latestMessage: EmailMessage;
  messages: EmailMessage[];
  unreadCount: number;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labels: string[];
  participantNames: string[];
}

export interface MailRule {
  id: string;
  name: string;
  enabled: boolean;
  matchField: 'from' | 'subject' | 'body' | 'to';
  matchValue: string;
  action: 'apply-label' | 'star' | 'archive' | 'mark-read';
  actionValue?: string;
}

export interface MailSettings {
  swipeRightAction: SwipeAction;
  swipeLeftAction: SwipeAction;
  undoSendSeconds: number;
  theme: 'warm-paper' | 'evening-ink';
  compactDensity: boolean;
  showAvatars: boolean;
  autoAdvance: boolean;
  vacationResponderEnabled: boolean;
  vacationSubject: string;
  vacationBody: string;
}

export interface ComposeDraft {
  id?: string;
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
  inReplyToId?: string;
  threadId?: string;
  attachments: EmailAttachment[];
  scheduledFor?: string;
}

export interface ProviderPreset {
  id: MailProvider;
  name: string;
  badge: string;
  description: string;
  authMode: 'oauth' | 'imap-smtp' | 'local';
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  helpNote: string;
}

export interface MailboxStatePayload {
  accounts: MailAccount[];
  messages: EmailMessage[];
  labels: string[];
  rules: MailRule[];
  settings: MailSettings;
}
