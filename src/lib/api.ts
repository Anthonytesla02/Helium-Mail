import type {
  ComposeDraft,
  EmailMessage,
  MailAccount,
  MailboxStatePayload,
  MailProvider,
  MailRule,
  MailSettings,
} from '../types/mail';
import { getGmailToken } from './gmailAuth';
import { localMailboxEngine } from './localMailboxEngine';
import { isNativeApp } from './nativeBridge';
import { createSnippet } from './mailLogic';

const API_BASE_STORAGE_KEY = 'helium_api_base_url';

export function getConfiguredApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const custom = window.localStorage.getItem(API_BASE_STORAGE_KEY)?.trim();
    if (custom) return custom.replace(/\/+$/, '');
  }
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  return envUrl ? envUrl.replace(/\/+$/, '') : '';
}

export function setConfiguredApiBaseUrl(url: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const clean = url.trim().replace(/\/+$/, '');
  if (clean) {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, clean);
  } else {
    window.localStorage.removeItem(API_BASE_STORAGE_KEY);
  }
}

function shouldUseStandaloneLocalOnly(): boolean {
  return isNativeApp() && !getConfiguredApiBaseUrl();
}

function resolveApiUrl(path: string): string {
  const base = getConfiguredApiBaseUrl();
  return base ? `${base}${path}` : path;
}

async function jsonFetch<T>(
  path: string,
  options: RequestInit = {},
  localFallback?: () => T | Promise<T>
): Promise<T> {
  if (shouldUseStandaloneLocalOnly() && localFallback) {
    return localFallback();
  }

  try {
    const res = await fetch(resolveApiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : {};

    if (!res.ok) {
      // On native builds without a reachable backend, 404/non-JSON means fall back to on-device store
      if (isNativeApp() && !isJson && localFallback) {
        return localFallback();
      }
      const err: any = new Error(data.error || `Request failed (${res.status})`);
      err.fieldErrors = data.errors;
      err.status = res.status;
      throw err;
    }

    if (!isJson && localFallback) {
      return localFallback();
    }

    return data as T;
  } catch (err: any) {
    // Only fall back on network/connectivity errors when running in native mobile shell
    const isNetworkError =
      err instanceof TypeError || err?.name === 'AbortError' || !err?.status;
    if (isNativeApp() && isNetworkError && localFallback) {
      return localFallback();
    }
    throw err;
  }
}

function encodeBase64UrlBrowser(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64UrlBrowser(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function extractGmailBodyClient(payload: any): { text: string; html?: string } {
  if (!payload) return { text: '' };
  if (payload.body?.data) {
    const decoded = decodeBase64UrlBrowser(payload.body.data);
    if (payload.mimeType === 'text/html') {
      return {
        text: decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        html: decoded,
      };
    }
    return { text: decoded };
  }
  if (Array.isArray(payload.parts)) {
    let text = '';
    let html: string | undefined;
    for (const part of payload.parts) {
      const sub = extractGmailBodyClient(part);
      if (sub.text && !text) text = sub.text;
      if (sub.html && !html) html = sub.html;
    }
    return { text: text || (html ? html.replace(/<[^>]+>/g, ' ').trim() : ''), html };
  }
  return { text: '' };
}

async function syncGmailDirectClient(
  account: MailAccount,
  token: string
): Promise<{ syncedCount: number; state: MailboxStatePayload }> {
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) {
    throw new Error('Unable to fetch Gmail messages directly. Please sign in again.');
  }
  const listData = await listRes.json();
  const ids: string[] = (listData.messages || []).map((m: any) => m.id);
  const incoming: EmailMessage[] = [];

  for (const msgId of ids.slice(0, 12)) {
    const detailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!detailRes.ok) continue;
    const detail = await detailRes.json();
    const headers: Array<{ name: string; value: string }> = detail.payload?.headers || [];
    const h = (name: string) =>
      headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value || '';

    const fromRaw = h('From') || account.email;
    const fromMatch = fromRaw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
    const from = fromMatch
      ? { name: (fromMatch[1] || fromMatch[2].split('@')[0]).trim(), email: fromMatch[2].trim() }
      : { name: fromRaw.split('@')[0], email: fromRaw.trim() };

    const labelIds: string[] = detail.labelIds || [];
    const folder = labelIds.includes('TRASH')
      ? 'trash'
      : labelIds.includes('SPAM')
      ? 'spam'
      : labelIds.includes('SENT')
      ? 'sent'
      : labelIds.includes('INBOX')
      ? 'inbox'
      : 'archive';

    const body = extractGmailBodyClient(detail.payload);
    incoming.push({
      id: `msg-gmail-${detail.id}`,
      remoteId: detail.id,
      threadId: `gmail-${detail.threadId || detail.id}`,
      accountId: account.id,
      from,
      to: [{ name: account.displayName, email: account.email }],
      subject: h('Subject') || '(No subject)',
      snippet: detail.snippet || createSnippet(body.text),
      bodyText: body.text || detail.snippet || '',
      bodyHtml: body.html,
      timestamp: detail.internalDate
        ? new Date(Number(detail.internalDate)).toISOString()
        : new Date().toISOString(),
      folder,
      isRead: !labelIds.includes('UNREAD'),
      isStarred: labelIds.includes('STARRED'),
      labels: [],
      attachments: [],
    });
  }

  const state = localMailboxEngine.upsertSyncedMessages(account.id, incoming);
  return { syncedCount: incoming.length, state };
}

export async function fetchMailboxState(): Promise<MailboxStatePayload> {
  return jsonFetch<MailboxStatePayload>('/api/state', {}, () => localMailboxEngine.getState());
}

export interface CreateAccountPayload {
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

export async function createAccount(
  payload: CreateAccountPayload
): Promise<{ account: MailAccount; state: MailboxStatePayload }> {
  return jsonFetch(
    '/api/accounts',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    () => localMailboxEngine.createAccount(payload)
  );
}

export async function updateAccount(
  id: string,
  patch: Partial<MailAccount>
): Promise<{ account: MailAccount; state: MailboxStatePayload }> {
  return jsonFetch(
    `/api/accounts/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    () => localMailboxEngine.updateAccount(id, patch)
  );
}

export async function deleteAccount(id: string): Promise<{ state: MailboxStatePayload }> {
  return jsonFetch(
    `/api/accounts/${id}`,
    { method: 'DELETE' },
    () => localMailboxEngine.deleteAccount(id)
  );
}

export async function testImapConnection(payload: {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}): Promise<{ ok: boolean; message: string }> {
  if (shouldUseStandaloneLocalOnly()) {
    throw new Error(
      'Set a Sync Server URL in Settings & rules (or build with VITE_API_BASE_URL) to verify live IMAP/SMTP servers from the mobile app.'
    );
  }
  return jsonFetch('/api/imap/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function syncAccountMessages(
  account: MailAccount
): Promise<{ syncedCount: number; state: MailboxStatePayload }> {
  if (account.provider === 'gmail-oauth') {
    const token = getGmailToken(account.email);
    if (!token) {
      throw new Error(`Sign in with Google for ${account.email} to refresh live Gmail messages.`);
    }
    if (shouldUseStandaloneLocalOnly()) {
      return syncGmailDirectClient(account, token);
    }
    return jsonFetch(
      '/api/gmail/sync',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accountId: account.id }),
      },
      () => syncGmailDirectClient(account, token)
    );
  }

  if (account.imapSmtp) {
    if (shouldUseStandaloneLocalOnly()) {
      throw new Error(
        'IMAP sync requires a Sync Server URL in Settings & rules when running standalone.'
      );
    }
    return jsonFetch(`/api/imap/sync/${account.id}`, {
      method: 'POST',
    });
  }

  const state = await fetchMailboxState();
  return { syncedCount: 0, state };
}

export async function sendMailMessage(
  draft: ComposeDraft & { draftId?: string },
  senderEmail?: string
): Promise<{ ok: boolean; scheduled?: boolean; state: MailboxStatePayload }> {
  const token = senderEmail ? getGmailToken(senderEmail) : null;
  return jsonFetch(
    '/api/messages/send',
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: JSON.stringify(draft),
    },
    async () => {
      if (token && senderEmail) {
        const mime = [
          `From: ${senderEmail}`,
          `To: ${draft.to}`,
          draft.cc ? `Cc: ${draft.cc}` : '',
          `Subject: ${draft.subject}`,
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          draft.bodyText,
        ]
          .filter(Boolean)
          .join('\r\n');
        await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodeBase64UrlBrowser(mime) }),
        }).catch(() => {});
      }
      return localMailboxEngine.sendMessage(draft);
    }
  );
}

export async function saveDraftMessage(
  draft: ComposeDraft
): Promise<{ state: MailboxStatePayload }> {
  return jsonFetch(
    '/api/drafts',
    {
      method: 'POST',
      body: JSON.stringify(draft),
    },
    () => localMailboxEngine.saveDraft(draft)
  );
}

export async function bulkMessageAction(
  messageIds: string[],
  action:
    | 'mark-read'
    | 'mark-unread'
    | 'star'
    | 'unstar'
    | 'archive'
    | 'move-inbox'
    | 'trash'
    | 'spam'
    | 'snooze'
    | 'add-label'
    | 'remove-label'
    | 'delete-forever'
    | 'empty-trash',
  value?: string
): Promise<{ state: MailboxStatePayload }> {
  return jsonFetch(
    '/api/messages/bulk',
    {
      method: 'POST',
      body: JSON.stringify({ messageIds, action, value }),
    },
    () => localMailboxEngine.bulkAction(messageIds, action, value)
  );
}

export async function syncGmailLabelMutation(
  accountEmail: string,
  remoteMessageId: string,
  opts: { addLabelIds?: string[]; removeLabelIds?: string[]; trash?: boolean }
): Promise<void> {
  const token = getGmailToken(accountEmail);
  if (!token) return;
  if (shouldUseStandaloneLocalOnly()) {
    const endpoint = opts.trash
      ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${remoteMessageId}/trash`
      : `https://gmail.googleapis.com/gmail/v1/users/me/messages/${remoteMessageId}/modify`;
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: opts.trash
        ? undefined
        : JSON.stringify({
            addLabelIds: opts.addLabelIds || [],
            removeLabelIds: opts.removeLabelIds || [],
          }),
    }).catch(() => {});
    return;
  }

  await jsonFetch('/api/gmail/modify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ remoteMessageId, ...opts }),
  }).catch(() => {
    // Non-blocking sync error handled gracefully
  });
}

export async function createLabel(name: string): Promise<{ state: MailboxStatePayload }> {
  return jsonFetch(
    '/api/labels',
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    },
    () => localMailboxEngine.createLabel(name)
  );
}

export async function createRule(
  rule: Omit<MailRule, 'id' | 'enabled'>
): Promise<{ state: MailboxStatePayload }> {
  return jsonFetch(
    '/api/rules',
    {
      method: 'POST',
      body: JSON.stringify(rule),
    },
    () => localMailboxEngine.createRule(rule)
  );
}

export async function toggleRule(
  id: string,
  enabled: boolean
): Promise<{ state: MailboxStatePayload }> {
  return jsonFetch(
    `/api/rules/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    },
    () => localMailboxEngine.toggleRule(id, enabled)
  );
}

export async function deleteRule(id: string): Promise<{ state: MailboxStatePayload }> {
  return jsonFetch(
    `/api/rules/${id}`,
    { method: 'DELETE' },
    () => localMailboxEngine.deleteRule(id)
  );
}

export async function updateSettings(
  patch: Partial<MailSettings>
): Promise<{ state: MailboxStatePayload }> {
  return jsonFetch(
    '/api/settings',
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    () => localMailboxEngine.updateSettings(patch)
  );
}
