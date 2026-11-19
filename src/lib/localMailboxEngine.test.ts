import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalMailboxEngine, type StorageLike } from './localMailboxEngine';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  };
}

test('LocalMailboxEngine seeds accounts, supports adding 10+ accounts, and persists state', () => {
  const storage = createMemoryStorage();
  const engine = new LocalMailboxEngine(storage);

  const initial = engine.getState();
  assert.equal(initial.accounts.length, 4);
  assert.ok(initial.messages.length >= 6);

  for (let i = 1; i <= 8; i++) {
    engine.createAccount({
      label: `Extra ${i}`,
      email: `extra${i}@example.com`,
      displayName: `User ${i}`,
      provider: 'local-sandbox',
      color: '#C85028',
    });
  }

  const rehydrated = new LocalMailboxEngine(storage).getState();
  assert.equal(rehydrated.accounts.length, 12);
});

test('LocalMailboxEngine delivers messages between local accounts, archives, trashes, and undoes', () => {
  const storage = createMemoryStorage();
  const engine = new LocalMailboxEngine(storage);

  const sendRes = engine.sendMessage({
    accountId: 'acct-personal',
    to: 'me@outlook.com',
    cc: '',
    bcc: '',
    subject: 'Mobile Sync Check',
    bodyText: 'Testing standalone mobile send and receive.',
    attachments: [],
  });
  assert.equal(sendRes.ok, true);

  const delivered = sendRes.state.messages.find(
    (m) => m.accountId === 'acct-work' && m.subject === 'Mobile Sync Check' && m.folder === 'inbox'
  );
  assert.ok(delivered);

  const afterTrash = engine.bulkAction([delivered.id], 'trash');
  assert.equal(
    afterTrash.state.messages.find((m) => m.id === delivered.id)?.folder,
    'trash'
  );

  const afterUndo = engine.bulkAction([delivered.id], 'move-inbox');
  assert.equal(
    afterUndo.state.messages.find((m) => m.id === delivered.id)?.folder,
    'inbox'
  );
});

test('LocalMailboxEngine stores IMAP credentials privately, updates on retry, deduplicates synced messages, and tracks sync errors', () => {
  const storage = createMemoryStorage();
  const engine = new LocalMailboxEngine(storage);

  const created = engine.createAccount({
    label: 'Work Gmail',
    email: 'worker@gmail.com',
    displayName: 'Worker',
    provider: 'gmail-imap',
    color: '#C85028',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    password: 'old-app-password',
  });

  // Public state never leaks password
  assert.equal('password' in created.account, false);
  assert.equal(created.account.imapSmtp?.hasPassword, true);

  // Device-only credential lookup works
  const creds = engine.getImapCredentials(created.account.id);
  assert.equal(creds?.password, 'old-app-password');
  assert.equal(creds?.imapHost, 'imap.gmail.com');

  // Re-submitting same email+provider updates credentials seamlessly
  const updated = engine.createAccount({
    label: 'Work Gmail',
    email: 'worker@gmail.com',
    displayName: 'Worker',
    provider: 'gmail-imap',
    color: '#2563EB',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    password: 'new-app-password',
  });
  assert.equal(updated.reused, true);
  assert.equal(engine.getImapCredentials(created.account.id)?.password, 'new-app-password');

  // Sync error tracking & clearing on successful upsert
  const errState = engine.markAccountSyncError(created.account.id, '535 Authentication failed');
  const erroredAcct = errState.accounts.find((a) => a.id === created.account.id);
  assert.equal(erroredAcct?.syncStatus, 'error');
  assert.equal(erroredAcct?.syncError, '535 Authentication failed');

  const syncedMsg = {
    id: 'msg-imap-101',
    remoteId: `imap-${created.account.id}-101`,
    threadId: 'thread-imap-101',
    accountId: created.account.id,
    from: { name: 'Billing', email: 'billing@stripe.com' },
    to: [{ name: 'Worker', email: 'worker@gmail.com' }],
    subject: 'Your receipt',
    snippet: 'Receipt attached',
    bodyText: 'Receipt attached',
    timestamp: new Date().toISOString(),
    folder: 'inbox' as const,
    isRead: false,
    isStarred: false,
    labels: [],
    attachments: [],
  };

  const afterFirst = engine.upsertSyncedMessages(created.account.id, [syncedMsg]);
  const afterDup = engine.upsertSyncedMessages(created.account.id, [syncedMsg]);
  const matching = afterDup.messages.filter((m) => m.remoteId === syncedMsg.remoteId);
  assert.equal(matching.length, 1);

  const syncedAcct = afterFirst.accounts.find((a) => a.id === created.account.id);
  assert.equal(syncedAcct?.syncStatus, 'connected');
  assert.equal(syncedAcct?.syncError, undefined);
});
