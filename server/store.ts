import fs from 'fs';
import path from 'path';
import type { MailAccount, MailboxStatePayload } from '../src/types/mail';
import { createSeedDatabase, type MailboxDatabase, type StoredAccount } from './seed';
import { wakeDueSnoozedMessages } from '../src/lib/mailLogic';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'mailbox-store.json');

let memoryDb: MailboxDatabase | null = null;

function ensureStoreLoaded(): MailboxDatabase {
  if (memoryDb) return memoryDb;

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as MailboxDatabase;
      if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.messages)) {
        memoryDb = parsed;
        return memoryDb;
      }
    }
  } catch (err) {
    console.warn('Could not read mailbox store, creating fresh seed:', err);
  }

  memoryDb = createSeedDatabase();
  saveDb(memoryDb);
  return memoryDb;
}

export function getDb(): MailboxDatabase {
  const db = ensureStoreLoaded();
  let changed = false;

  // Wake any due snoozed messages
  const woken = wakeDueSnoozedMessages(db.messages, new Date());
  if (woken.some((m, idx) => m.folder !== db.messages[idx]?.folder)) {
    db.messages = woken;
    changed = true;
  }

  // Dispatch any scheduled messages whose scheduledFor <= now
  const nowMs = Date.now();
  db.messages = db.messages.map((msg) => {
    if (msg.folder === 'drafts' && msg.scheduledFor) {
      const due = new Date(msg.scheduledFor).getTime();
      if (!Number.isNaN(due) && due <= nowMs) {
        changed = true;
        return {
          ...msg,
          folder: 'sent',
          scheduledFor: undefined,
          timestamp: new Date().toISOString(),
        };
      }
    }
    return msg;
  });

  if (changed) {
    saveDb(db);
  }

  return db;
}

export function saveDb(db: MailboxDatabase): void {
  memoryDb = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist mailbox store:', err);
  }
}

export function sanitizeAccount(acct: StoredAccount): MailAccount {
  const { password, ...safe } = acct;
  if (safe.imapSmtp) {
    return {
      ...safe,
      imapSmtp: {
        ...safe.imapSmtp,
        hasPassword: Boolean(password || safe.imapSmtp.hasPassword),
      },
    };
  }
  return safe;
}

export function getSanitizedState(): MailboxStatePayload {
  const db = getDb();
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
