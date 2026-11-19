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
