import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_COLOR_PALETTE,
  applyMailRules,
  computeAccountUnreadCounts,
  filterMessages,
  groupThreads,
  parseSearchQuery,
  validateAccountInput,
  validateComposeInput,
  wakeDueSnoozedMessages,
} from './mailLogic';
import type { EmailMessage, MailAccount, MailRule } from '../types/mail';

function makeAccount(idx: number, overrides: Partial<MailAccount> = {}): MailAccount {
  return {
    id: `acct-${idx}`,
    label: `Account ${idx}`,
    email: `user${idx}@example.com`,
    displayName: `User ${idx}`,
    provider: 'local-sandbox',
    color: ACCOUNT_COLOR_PALETTE[idx % ACCOUNT_COLOR_PALETTE.length],
    signature: `Sent from Account ${idx}`,
    syncEnabled: true,
    notificationsEnabled: true,
    order: idx,
    ...overrides,
  };
}

function makeMessage(idx: number, overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: `msg-${idx}`,
    threadId: `thread-${idx}`,
    accountId: 'acct-1',
    from: { name: `Sender ${idx}`, email: `sender${idx}@domain.com` },
    to: [{ name: 'Me', email: 'user1@example.com' }],
    subject: `Subject ${idx}`,
    snippet: `Snippet ${idx}`,
    bodyText: `Body text for message ${idx}`,
    timestamp: new Date(2026, 10, 18, 8, idx).toISOString(),
    folder: 'inbox',
    isRead: false,
    isStarred: false,
    labels: [],
    attachments: [],
    ...overrides,
  };
}

test('validateAccountInput rejects empty fields and invalid IMAP settings', () => {
  const emptyRes = validateAccountInput({
    label: '',
    email: 'not-an-email',
    displayName: '',
    provider: 'outlook',
    color: '#C85028',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 587,
    password: '',
  });
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.errors.label);
  assert.ok(emptyRes.errors.email);
  assert.ok(emptyRes.errors.displayName);
  assert.ok(emptyRes.errors.imapHost);
  assert.ok(emptyRes.errors.smtpHost);
  assert.ok(emptyRes.errors.password);

  const validRes = validateAccountInput({
    label: 'Work 365',
    email: 'me@company.com',
    displayName: 'Anthony',
    provider: 'outlook',
    color: '#2563EB',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    password: 'app-password-123',
  });
  assert.equal(validRes.valid, true);
  assert.deepEqual(validRes.errors, {});
});

test('validateComposeInput checks recipients and message content', () => {
  const bad = validateComposeInput({
    accountId: 'acct-1',
    to: 'invalid-address',
    cc: '',
    bcc: '',
    subject: '',
    bodyText: '',
    attachments: [],
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.to);
  assert.ok(bad.errors.bodyText);

  const good = validateComposeInput({
    accountId: 'acct-1',
    to: 'Ama Mensah <ama@example.com>, kofi@example.com',
    cc: 'team@example.com',
    bcc: '',
    subject: 'Dinner on Saturday?',
    bodyText: 'Looking forward to it!',
    attachments: [],
  });
  assert.equal(good.valid, true);
});

test('supports 12+ accounts unread counts and per-account filtering', () => {
  const accounts = Array.from({ length: 12 }, (_, i) => makeAccount(i + 1));
  const messages = accounts.flatMap((acct, idx) => [
    makeMessage(idx * 2 + 1, { accountId: acct.id, isRead: false, folder: 'inbox' }),
    makeMessage(idx * 2 + 2, { accountId: acct.id, isRead: true, folder: 'inbox' }),
    makeMessage(idx * 2 + 100, { accountId: acct.id, isRead: false, folder: 'archive' }),
  ]);

  const counts = computeAccountUnreadCounts(messages, accounts);
  assert.equal(counts.totalUnread, 12);
  assert.equal(counts.byAccount['acct-12'], 1);

  const acct7Unread = filterMessages(messages, accounts, {
    accountId: 'acct-7',
    folder: 'inbox',
    unreadOnly: true,
  });
  assert.equal(acct7Unread.length, 1);
  assert.equal(acct7Unread[0].accountId, 'acct-7');
});

test('parseSearchQuery and filterMessages handle operators and full-text matching', () => {
  const accounts = [makeAccount(1, { email: 'me@gmail.com', label: 'Personal' })];
  const messages = [
    makeMessage(1, {
      from: { name: 'Ama Mensah', email: 'ama@studio.gh' },
      subject: 'Dinner on Saturday?',
      isRead: false,
      attachments: [{ id: 'a1', filename: 'menu.pdf', mimeType: 'application/pdf', sizeBytes: 1200 }],
    }),
    makeMessage(2, {
      from: { name: 'Bank Alerts', email: 'alerts@bank.com' },
      subject: 'Your monthly statement',
      isRead: true,
    }),
  ];

  const parsed = parseSearchQuery('from:ama has:attachment is:unread Saturday');
  assert.equal(parsed.from, 'ama');
  assert.equal(parsed.hasAttachment, true);
  assert.equal(parsed.isUnread, true);
  assert.deepEqual(parsed.textTerms, ['saturday']);

  const matched = filterMessages(messages, accounts, {
    accountId: 'all',
    folder: 'inbox',
    unreadOnly: false,
    searchQuery: 'from:ama has:attachment is:unread Saturday',
  });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, 'msg-1');
});

test('groupThreads aggregates conversation replies and sorts newest first', () => {
  const m1 = makeMessage(1, {
    threadId: 't-100',
    isRead: true,
    isStarred: false,
    timestamp: '2026-11-18T06:00:00.000Z',
  });
  const m2 = makeMessage(2, {
    threadId: 't-100',
    isRead: false,
    isStarred: true,
    timestamp: '2026-11-18T09:00:00.000Z',
  });
  const m3 = makeMessage(3, {
    threadId: 't-200',
    isRead: true,
    timestamp: '2026-11-18T11:00:00.000Z',
  });

  const threads = groupThreads([m1, m2, m3]);
  assert.equal(threads.length, 2);
  assert.equal(threads[0].threadId, 't-200');
  assert.equal(threads[1].threadId, 't-100');
  assert.equal(threads[1].messages.length, 2);
  assert.equal(threads[1].unreadCount, 1);
  assert.equal(threads[1].isStarred, true);
});

test('applyMailRules and wakeDueSnoozedMessages mutate status accurately', () => {
  const rules: MailRule[] = [
    {
      id: 'r1',
      name: 'Label Bank',
      enabled: true,
      matchField: 'from',
      matchValue: 'bank',
      action: 'apply-label',
      actionValue: 'Finance',
    },
    {
      id: 'r2',
      name: 'Star VIP',
      enabled: true,
      matchField: 'subject',
      matchValue: 'urgent',
      action: 'star',
    },
  ];

  const raw = makeMessage(1, {
    from: { name: 'Bank Alerts', email: 'alerts@bank.com' },
    subject: 'Urgent statement ready',
  });
  const ruled = applyMailRules(raw, rules);
  assert.deepEqual(ruled.labels, ['Finance']);
  assert.equal(ruled.isStarred, true);

  const snoozed = makeMessage(2, {
    folder: 'snoozed',
    isRead: true,
    snoozedUntil: '2026-11-18T07:00:00.000Z',
  });
  const woken = wakeDueSnoozedMessages([snoozed], new Date('2026-11-18T08:00:00.000Z'));
  assert.equal(woken[0].folder, 'inbox');
  assert.equal(woken[0].isRead, false);
  assert.equal(woken[0].snoozedUntil, undefined);
});
