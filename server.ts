import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { getDb, getSanitizedState, saveDb, sanitizeAccount } from './server/store';
import {
  ACCOUNT_COLOR_PALETTE,
  applyMailRules,
  createSnippet,
  parseRecipientList,
  validateAccountInput,
  validateComposeInput,
} from './src/lib/mailLogic';
import type { EmailMessage, MailRule, MailSettings } from './src/types/mail';
import type { StoredAccount } from './server/seed';

const PORT = Number(process.env.PORT || 3000);

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  return Buffer.from(base64 + pad, 'base64').toString('utf-8');
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function parseAddressHeader(header: string): { name: string; email: string } {
  const match = header.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (match) {
    return {
      name: (match[1] || match[2].split('@')[0]).trim(),
      email: match[2].trim(),
    };
  }
  const clean = header.trim();
  return {
    name: clean.split('@')[0] || clean || 'Unknown',
    email: clean,
  };
}

function extractGmailBody(payload: any): { text: string; html?: string } {
  if (!payload) return { text: '' };
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
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
      const sub = extractGmailBody(part);
      if (sub.text && !text) text = sub.text;
      if (sub.html && !html) html = sub.html;
    }
    return { text: text || (html ? html.replace(/<[^>]+>/g, ' ').trim() : ''), html };
  }
  return { text: '' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Allow Capacitor native Android/iOS WebView and local origins to call the Express API
  app.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    if (
      origin &&
      (origin === 'capacitor://localhost' ||
        origin === 'http://localhost' ||
        origin === 'https://localhost' ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://'))
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Get full mailbox state
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json(getSanitizedState());
  });

  // Add account (unlimited accounts: Gmail OAuth, IMAP/SMTP, or Local Sandbox)
  app.post('/api/accounts', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const validation = validateAccountInput({
      label: String(body.label || ''),
      email: String(body.email || ''),
      displayName: String(body.displayName || ''),
      provider: body.provider || 'local-sandbox',
      color: String(body.color || ACCOUNT_COLOR_PALETTE[0]),
      signature: body.signature ? String(body.signature) : '',
      imapHost: body.imapHost ? String(body.imapHost) : '',
      imapPort: Number(body.imapPort || 993),
      imapSecure: Boolean(body.imapSecure ?? true),
      smtpHost: body.smtpHost ? String(body.smtpHost) : '',
      smtpPort: Number(body.smtpPort || 465),
      smtpSecure: Boolean(body.smtpSecure ?? true),
      password: body.password ? String(body.password) : '',
    });

    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
    }

    const db = getDb();
    const existing = db.accounts.find(
      (a) => a.email.toLowerCase() === String(body.email).trim().toLowerCase() && a.provider === body.provider
    );
    if (existing) {
      if (typeof body.label === 'string' && body.label.trim()) existing.label = body.label.trim();
      if (typeof body.displayName === 'string' && body.displayName.trim()) {
        existing.displayName = body.displayName.trim();
      }
      if (typeof body.color === 'string') existing.color = body.color;
      if (typeof body.signature === 'string' && body.signature.trim()) {
        existing.signature = body.signature.trim();
      }
      if (body.imapHost) {
        existing.password = String(body.password || existing.password || '');
        existing.imapSmtp = {
          imapHost: String(body.imapHost).trim(),
          imapPort: Number(body.imapPort || 993),
          imapSecure: Boolean(body.imapSecure ?? true),
          smtpHost: String(body.smtpHost || existing.imapSmtp?.smtpHost || '').trim(),
          smtpPort: Number(body.smtpPort || 465),
          smtpSecure: Boolean(body.smtpSecure ?? true),
          username: String(body.email).trim().toLowerCase(),
          hasPassword: Boolean(existing.password),
        };
      }
      saveDb(db);
      return res.json({ account: sanitizeAccount(existing), state: getSanitizedState(), reused: true });
    }

    const id = `acct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isImap = Boolean(body.imapHost);

    const newAccount: StoredAccount = {
      id,
      label: String(body.label).trim(),
      email: String(body.email).trim().toLowerCase(),
      displayName: String(body.displayName).trim(),
      provider: body.provider,
      color: String(body.color || ACCOUNT_COLOR_PALETTE[db.accounts.length % ACCOUNT_COLOR_PALETTE.length]),
      signature: String(body.signature || `Best,\n${String(body.displayName).trim()}`),
      syncEnabled: true,
      notificationsEnabled: true,
      lastSyncedAt: new Date().toISOString(),
      syncStatus: 'connected',
      order: db.accounts.length,
      ...(isImap
        ? {
            password: String(body.password || ''),
            imapSmtp: {
              imapHost: String(body.imapHost).trim(),
              imapPort: Number(body.imapPort || 993),
              imapSecure: Boolean(body.imapSecure ?? true),
              smtpHost: String(body.smtpHost).trim(),
              smtpPort: Number(body.smtpPort || 465),
              smtpSecure: Boolean(body.smtpSecure ?? true),
              username: String(body.email).trim().toLowerCase(),
              hasPassword: Boolean(body.password),
            },
          }
        : {}),
    };

    db.accounts.push(newAccount);

    // Seed a helpful welcome thread for brand new Local Sandbox inboxes so user sees immediate inbox readiness
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

    saveDb(db);
    return res.status(201).json({ account: sanitizeAccount(newAccount), state: getSanitizedState() });
  });

  // Update account settings
  app.patch('/api/accounts/:id', (req: Request, res: Response) => {
    const db = getDb();
    const acct = db.accounts.find((a) => a.id === req.params.id);
    if (!acct) return res.status(404).json({ error: 'Account not found' });

    const body = req.body ?? {};
    if (typeof body.label === 'string' && body.label.trim()) acct.label = body.label.trim();
    if (typeof body.displayName === 'string' && body.displayName.trim()) acct.displayName = body.displayName.trim();
    if (typeof body.color === 'string') acct.color = body.color;
    if (typeof body.signature === 'string') acct.signature = body.signature;
    if (typeof body.syncEnabled === 'boolean') acct.syncEnabled = body.syncEnabled;
    if (typeof body.notificationsEnabled === 'boolean') acct.notificationsEnabled = body.notificationsEnabled;
    if (typeof body.order === 'number') acct.order = body.order;

    saveDb(db);
    return res.json({ account: sanitizeAccount(acct), state: getSanitizedState() });
  });

  // Remove account
  app.delete('/api/accounts/:id', (req: Request, res: Response) => {
    const db = getDb();
    const exists = db.accounts.some((a) => a.id === req.params.id);
    if (!exists) return res.status(404).json({ error: 'Account not found' });

    db.accounts = db.accounts.filter((a) => a.id !== req.params.id);
    db.messages = db.messages.filter((m) => m.accountId !== req.params.id);
    saveDb(db);
    return res.json({ ok: true, state: getSanitizedState() });
  });

  // Test live IMAP + SMTP credentials
  app.post('/api/imap/test', async (req: Request, res: Response) => {
    const { email, password, imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure } = req.body ?? {};
    if (!email || !password || !imapHost || !smtpHost) {
      return res.status(400).json({ ok: false, error: 'Missing required IMAP/SMTP credentials.' });
    }

    const client = new ImapFlow({
      host: String(imapHost),
      port: Number(imapPort || 993),
      secure: Boolean(imapSecure ?? true),
      auth: { user: String(email), pass: String(password) },
      logger: false,
      connectionTimeout: 8000,
    });

    try {
      await client.connect();
      await client.logout();

      const transporter = nodemailer.createTransport({
        host: String(smtpHost),
        port: Number(smtpPort || 465),
        secure: Boolean(smtpSecure ?? true),
        auth: { user: String(email), pass: String(password) },
        connectionTimeout: 8000,
      });
      await transporter.verify();

      return res.json({ ok: true, message: 'IMAP and SMTP connections verified successfully.' });
    } catch (err: any) {
      try {
        await client.logout();
      } catch {
        // ignore cleanup error
      }
      return res.status(400).json({
        ok: false,
        error: err?.message || 'Could not authenticate with IMAP/SMTP server.',
      });
    }
  });

  // Sync messages from real IMAP server
  app.post('/api/imap/sync/:accountId', async (req: Request, res: Response) => {
    const db = getDb();
    const acct = db.accounts.find((a) => a.id === req.params.accountId);
    if (!acct || !acct.imapSmtp || !acct.password) {
      return res.status(400).json({ error: 'IMAP credentials are not configured for this account.' });
    }

    const client = new ImapFlow({
      host: acct.imapSmtp.imapHost,
      port: acct.imapSmtp.imapPort,
      secure: acct.imapSmtp.imapSecure,
      auth: { user: acct.imapSmtp.username, pass: acct.password },
      logger: false,
      connectionTimeout: 10000,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      const imported: EmailMessage[] = [];

      try {
        const total = client.mailbox ? client.mailbox.exists : 0;
        if (total > 0) {
          const start = Math.max(1, total - 19);
          for await (const msg of client.fetch(`${start}:${total}`, {
            envelope: true,
            flags: true,
            source: true,
            uid: true,
          })) {
            if (!msg.source) continue;
            const parsed = await simpleParser(msg.source);
            const remoteId = `imap-${acct.id}-${msg.uid}`;
            if (db.messages.some((m) => m.remoteId === remoteId)) continue;

            const fromAddr = parsed.from?.value?.[0];
            const toAddrs = parsed.to
              ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap((t) =>
                  t.value.map((v) => ({ name: v.name || v.address || '', email: v.address || '' }))
                )
              : [{ name: acct.displayName, email: acct.email }];

            const bodyText = parsed.text || (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '') || '';
            const normalized: EmailMessage = applyMailRules(
              {
                id: `msg-${Date.now()}-${msg.uid}`,
                threadId: parsed.inReplyTo || parsed.messageId || `thread-imap-${msg.uid}`,
                accountId: acct.id,
                remoteId,
                from: {
                  name: fromAddr?.name || fromAddr?.address || 'Sender',
                  email: fromAddr?.address || '',
                },
                to: toAddrs,
                subject: parsed.subject || '(No subject)',
                snippet: createSnippet(bodyText),
                bodyText,
                bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
                timestamp: (parsed.date || new Date()).toISOString(),
                folder: 'inbox',
                isRead: msg.flags?.has('\\Seen') ?? false,
                isStarred: msg.flags?.has('\\Flagged') ?? false,
                labels: [],
                attachments: (parsed.attachments || []).map((att, idx) => ({
                  id: `att-${msg.uid}-${idx}`,
                  filename: att.filename || `attachment-${idx + 1}`,
                  mimeType: att.contentType || 'application/octet-stream',
                  sizeBytes: att.size || 0,
                })),
              },
              db.rules
            );
            imported.push(normalized);
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();
      if (imported.length > 0) {
        db.messages.unshift(...imported);
      }
      acct.lastSyncedAt = new Date().toISOString();
      acct.syncStatus = 'connected';
      acct.syncError = undefined;
      saveDb(db);

      return res.json({ syncedCount: imported.length, state: getSanitizedState() });
    } catch (err: any) {
      acct.syncStatus = 'error';
      acct.syncError = err?.message || 'IMAP sync failed';
      saveDb(db);
      return res.status(502).json({ error: acct.syncError });
    }
  });

  // Real Gmail API sync using Bearer token obtained from client-side Google OAuth
  app.post('/api/gmail/sync', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const { accountId } = req.body ?? {};
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Google OAuth Bearer token.' });
    }

    const db = getDb();
    const acct = db.accounts.find((a) => a.id === accountId);
    if (!acct) return res.status(404).json({ error: 'Account not found' });

    try {
      const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20', {
        headers: { Authorization: authHeader },
      });
      if (!listRes.ok) {
        const text = await listRes.text();
        acct.syncStatus = listRes.status === 401 ? 'needs-auth' : 'error';
        acct.syncError = `Gmail API error (${listRes.status})`;
        saveDb(db);
        return res.status(listRes.status).json({ error: text || 'Failed to list Gmail messages' });
      }

      const listData = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }> };
      const messageRefs = listData.messages || [];
      let syncedCount = 0;

      const details = await Promise.all(
        messageRefs.slice(0, 15).map(async (ref) => {
          const r = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
            { headers: { Authorization: authHeader } }
          );
          return r.ok ? r.json() : null;
        })
      );

      for (const item of details) {
        if (!item) continue;
        const remoteId = `gmail-${acct.id}-${item.id}`;
        const existingIdx = db.messages.findIndex((m) => m.remoteId === remoteId);

        const headers: Array<{ name: string; value: string }> = item.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const labelIds: string[] = item.labelIds || [];
        let folder: EmailMessage['folder'] = 'archive';
        if (labelIds.includes('TRASH')) folder = 'trash';
        else if (labelIds.includes('SPAM')) folder = 'spam';
        else if (labelIds.includes('DRAFT')) folder = 'drafts';
        else if (labelIds.includes('SENT') && !labelIds.includes('INBOX')) folder = 'sent';
        else if (labelIds.includes('INBOX')) folder = 'inbox';

        const from = parseAddressHeader(getHeader('From'));
        const toRaw = getHeader('To');
        const to = toRaw
          ? parseRecipientList(toRaw).map((e) => ({ name: e.split('@')[0], email: e }))
          : [{ name: acct.displayName, email: acct.email }];

        const body = extractGmailBody(item.payload);
        const dateHeader = getHeader('Date');
        const isoDate = dateHeader && !Number.isNaN(Date.parse(dateHeader))
          ? new Date(dateHeader).toISOString()
          : new Date(Number(item.internalDate || Date.now())).toISOString();

        const normalized: EmailMessage = applyMailRules(
          {
            id: existingIdx >= 0 ? db.messages[existingIdx].id : `msg-gm-${item.id}`,
            threadId: `gm-thread-${item.threadId || item.id}`,
            accountId: acct.id,
            remoteId,
            from,
            to,
            subject: getHeader('Subject') || '(No subject)',
            snippet: item.snippet || createSnippet(body.text),
            bodyText: body.text || item.snippet || '',
            bodyHtml: body.html,
            timestamp: isoDate,
            folder,
            isRead: !labelIds.includes('UNREAD'),
            isStarred: labelIds.includes('STARRED'),
            labels: existingIdx >= 0 ? db.messages[existingIdx].labels : [],
            listUnsubscribe: getHeader('List-Unsubscribe') || undefined,
            attachments: [],
          },
          db.rules
        );

        if (existingIdx >= 0) {
          db.messages[existingIdx] = normalized;
        } else {
          db.messages.unshift(normalized);
          syncedCount += 1;
        }
      }

      acct.lastSyncedAt = new Date().toISOString();
      acct.syncStatus = 'connected';
      acct.syncError = undefined;
      saveDb(db);

      return res.json({ syncedCount, state: getSanitizedState() });
    } catch (err: any) {
      acct.syncStatus = 'error';
      acct.syncError = err?.message || 'Gmail sync failed';
      saveDb(db);
      return res.status(502).json({ error: acct.syncError });
    }
  });

  // Sync Gmail label changes when modifying a synced Gmail message
  app.post('/api/gmail/modify', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const { remoteMessageId, addLabelIds, removeLabelIds, trash } = req.body ?? {};
    if (!authHeader || !remoteMessageId) {
      return res.status(400).json({ error: 'Missing Authorization or remoteMessageId' });
    }
    const rawId = String(remoteMessageId).split('-').pop();
    const url = trash
      ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${rawId}/trash`
      : `https://gmail.googleapis.com/gmail/v1/users/me/messages/${rawId}/modify`;

    const gmailRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: trash ? undefined : JSON.stringify({ addLabelIds: addLabelIds || [], removeLabelIds: removeLabelIds || [] }),
    });

    if (!gmailRes.ok) {
      const txt = await gmailRes.text();
      return res.status(gmailRes.status).json({ error: txt });
    }
    return res.json({ ok: true });
  });

  // Send or schedule email across Gmail OAuth, SMTP, or Local Unified Store
  app.post('/api/messages/send', async (req: Request, res: Response) => {
    const draft = req.body ?? {};
    const validation = validateComposeInput({
      accountId: String(draft.accountId || ''),
      to: String(draft.to || ''),
      cc: String(draft.cc || ''),
      bcc: String(draft.bcc || ''),
      subject: String(draft.subject || ''),
      bodyText: String(draft.bodyText || ''),
      attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
      scheduledFor: draft.scheduledFor,
    });

    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
    }

    const db = getDb();
    const acct = db.accounts.find((a) => a.id === draft.accountId);
    if (!acct) return res.status(404).json({ error: 'Sending account not found' });

    const toList = parseRecipientList(draft.to);
    const ccList = draft.cc ? parseRecipientList(draft.cc) : [];
    const bccList = draft.bcc ? parseRecipientList(draft.bcc) : [];
    const nowIso = new Date().toISOString();
    const threadId = draft.threadId || `thread-${Date.now()}`;

    // If scheduled for the future, store in drafts with scheduledFor
    if (draft.scheduledFor && new Date(draft.scheduledFor).getTime() > Date.now() + 5000) {
      const scheduledMsg: EmailMessage = {
        id: draft.draftId || `msg-sched-${Date.now()}`,
        threadId,
        accountId: acct.id,
        from: { name: acct.displayName, email: acct.email },
        to: toList.map((e) => ({ name: e.split('@')[0], email: e })),
        cc: ccList.map((e) => ({ name: e.split('@')[0], email: e })),
        bcc: bccList.map((e) => ({ name: e.split('@')[0], email: e })),
        subject: String(draft.subject || '(No subject)'),
        snippet: createSnippet(String(draft.bodyText || '')),
        bodyText: String(draft.bodyText || ''),
        timestamp: nowIso,
        folder: 'drafts',
        isRead: true,
        isStarred: false,
        labels: [],
        attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
        scheduledFor: draft.scheduledFor,
      };
      db.messages = db.messages.filter((m) => m.id !== draft.draftId);
      db.messages.unshift(scheduledMsg);
      saveDb(db);
      return res.json({ ok: true, scheduled: true, state: getSanitizedState() });
    }

    // Real Gmail OAuth dispatch when Authorization Bearer token is passed
    const authHeader = req.headers.authorization;
    if (acct.provider === 'gmail-oauth' && authHeader?.startsWith('Bearer ')) {
      const mimeLines = [
        `From: "${acct.displayName}" <${acct.email}>`,
        `To: ${toList.join(', ')}`,
        ccList.length ? `Cc: ${ccList.join(', ')}` : '',
        bccList.length ? `Bcc: ${bccList.join(', ')}` : '',
        `Subject: ${draft.subject || '(No subject)'}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        String(draft.bodyText || ''),
      ]
        .filter((l, idx, arr) => l !== '' || idx === arr.length - 2)
        .join('\r\n');

      const gmailSendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodeBase64Url(mimeLines) }),
      });

      if (!gmailSendRes.ok) {
        const errTxt = await gmailSendRes.text();
        return res.status(gmailSendRes.status).json({ error: errTxt || 'Failed to send via Gmail API' });
      }
    }

    // Real SMTP dispatch when IMAP/SMTP credentials exist
    if (acct.imapSmtp && acct.password) {
      try {
        const transporter = nodemailer.createTransport({
          host: acct.imapSmtp.smtpHost,
          port: acct.imapSmtp.smtpPort,
          secure: acct.imapSmtp.smtpSecure,
          auth: { user: acct.imapSmtp.username, pass: acct.password },
        });
        await transporter.sendMail({
          from: `"${acct.displayName}" <${acct.email}>`,
          to: toList.join(', '),
          cc: ccList.length ? ccList.join(', ') : undefined,
          bcc: bccList.length ? bccList.join(', ') : undefined,
          subject: String(draft.subject || '(No subject)'),
          text: String(draft.bodyText || ''),
        });
      } catch (err: any) {
        return res.status(502).json({ error: `SMTP send failed: ${err?.message || 'Unknown error'}` });
      }
    }

    // Remove draft if sending from draft
    if (draft.draftId) {
      db.messages = db.messages.filter((m) => m.id !== draft.draftId);
    }

    const sentMsg: EmailMessage = {
      id: `msg-sent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      threadId,
      accountId: acct.id,
      from: { name: acct.displayName, email: acct.email },
      to: toList.map((e) => ({ name: e.split('@')[0], email: e })),
      cc: ccList.map((e) => ({ name: e.split('@')[0], email: e })),
      bcc: bccList.map((e) => ({ name: e.split('@')[0], email: e })),
      subject: String(draft.subject || '(No subject)'),
      snippet: createSnippet(String(draft.bodyText || '')),
      bodyText: String(draft.bodyText || ''),
      timestamp: nowIso,
      folder: 'sent',
      isRead: true,
      isStarred: false,
      labels: [],
      attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
    };
    db.messages.unshift(sentMsg);

    // If recipient matches another connected local account, also deliver to that account's inbox!
    for (const recipientEmail of toList) {
      const targetAcct = db.accounts.find(
        (a) => a.email.toLowerCase() === recipientEmail.toLowerCase() && a.id !== acct.id
      );
      if (targetAcct) {
        const delivered: EmailMessage = applyMailRules(
          {
            ...sentMsg,
            id: `msg-deliv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            accountId: targetAcct.id,
            folder: 'inbox',
            isRead: false,
          },
          db.rules
        );
        db.messages.unshift(delivered);
      }
    }

    saveDb(db);
    return res.json({ ok: true, sentMessage: sentMsg, state: getSanitizedState() });
  });

  // Save draft
  app.post('/api/drafts', (req: Request, res: Response) => {
    const draft = req.body ?? {};
    const db = getDb();
    const acct = db.accounts.find((a) => a.id === draft.accountId) || db.accounts[0];
    if (!acct) return res.status(400).json({ error: 'No account available' });

    const id = draft.id || `msg-draft-${Date.now()}`;
    const toList = draft.to ? parseRecipientList(String(draft.to)) : [];
    const draftMsg: EmailMessage = {
      id,
      threadId: draft.threadId || `thread-draft-${Date.now()}`,
      accountId: acct.id,
      from: { name: acct.displayName, email: acct.email },
      to: toList.map((e) => ({ name: e.split('@')[0], email: e })),
      subject: String(draft.subject || '(Draft)'),
      snippet: createSnippet(String(draft.bodyText || 'Empty draft')),
      bodyText: String(draft.bodyText || ''),
      timestamp: new Date().toISOString(),
      folder: 'drafts',
      isRead: true,
      isStarred: false,
      labels: [],
      attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
      scheduledFor: draft.scheduledFor,
    };

    const idx = db.messages.findIndex((m) => m.id === id);
    if (idx >= 0) db.messages[idx] = draftMsg;
    else db.messages.unshift(draftMsg);

    saveDb(db);
    return res.json({ draft: draftMsg, state: getSanitizedState() });
  });

  // Bulk message actions (read, unread, star, unstar, archive, snooze, unsnooze, move, label, trash, delete)
  app.post('/api/messages/bulk', (req: Request, res: Response) => {
    const { messageIds, action, value } = req.body ?? {};
    if (!Array.isArray(messageIds) || !action) {
      return res.status(400).json({ error: 'messageIds array and action are required' });
    }

    const db = getDb();
    const idSet = new Set(messageIds as string[]);

    if (action === 'delete-forever') {
      db.messages = db.messages.filter((m) => !idSet.has(m.id));
    } else if (action === 'empty-trash') {
      db.messages = db.messages.filter((m) => m.folder !== 'trash');
    } else {
      db.messages = db.messages.map((msg) => {
        if (!idSet.has(msg.id)) return msg;
        switch (action) {
          case 'mark-read':
            return { ...msg, isRead: true };
          case 'mark-unread':
            return { ...msg, isRead: false };
          case 'star':
            return { ...msg, isStarred: true };
          case 'unstar':
            return { ...msg, isStarred: false };
          case 'archive':
            return { ...msg, folder: 'archive', snoozedUntil: undefined };
          case 'move-inbox':
            return { ...msg, folder: 'inbox', snoozedUntil: undefined };
          case 'trash':
            return { ...msg, folder: 'trash', snoozedUntil: undefined };
          case 'spam':
            return { ...msg, folder: 'spam', snoozedUntil: undefined };
          case 'snooze':
            return {
              ...msg,
              folder: 'snoozed',
              snoozedUntil: value || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
          case 'add-label':
            return value && !msg.labels.includes(value)
              ? { ...msg, labels: [...msg.labels, value] }
              : msg;
          case 'remove-label':
            return { ...msg, labels: msg.labels.filter((l: string) => l !== value) };
          default:
            return msg;
        }
      });
    }

    saveDb(db);
    return res.json({ ok: true, state: getSanitizedState() });
  });

  // Labels management
  app.post('/api/labels', (req: Request, res: Response) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Label name is required' });
    const db = getDb();
    if (!db.labels.includes(name)) {
      db.labels.push(name);
      saveDb(db);
    }
    return res.json({ state: getSanitizedState() });
  });

  // Rules management
  app.post('/api/rules', (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!body.name?.trim() || !body.matchValue?.trim()) {
      return res.status(400).json({ error: 'Rule name and match keyword are required.' });
    }

    const db = getDb();
    const newRule: MailRule = {
      id: `rule-${Date.now()}`,
      name: String(body.name).trim(),
      enabled: true,
      matchField: body.matchField || 'from',
      matchValue: String(body.matchValue).trim(),
      action: body.action || 'apply-label',
      actionValue: body.actionValue ? String(body.actionValue).trim() : undefined,
    };

    db.rules.push(newRule);
    db.messages = db.messages.map((m) => applyMailRules(m, [newRule]));
    saveDb(db);
    return res.status(201).json({ rule: newRule, state: getSanitizedState() });
  });

  app.patch('/api/rules/:id', (req: Request, res: Response) => {
    const db = getDb();
    const rule = db.rules.find((r) => r.id === req.params.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    if (typeof req.body?.enabled === 'boolean') rule.enabled = req.body.enabled;
    saveDb(db);
    return res.json({ state: getSanitizedState() });
  });

  app.delete('/api/rules/:id', (req: Request, res: Response) => {
    const db = getDb();
    db.rules = db.rules.filter((r) => r.id !== req.params.id);
    saveDb(db);
    return res.json({ state: getSanitizedState() });
  });

  // Settings update
  app.patch('/api/settings', (req: Request, res: Response) => {
    const db = getDb();
    const patch = req.body as Partial<MailSettings>;
    db.settings = { ...db.settings, ...patch };
    saveDb(db);
    return res.json({ state: getSanitizedState() });
  });

  // Vite dev middleware or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Helium Mail server listening on http://localhost:${PORT}`);
  });
}

startServer();
