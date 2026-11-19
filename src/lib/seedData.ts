import type { EmailMessage, MailAccount, MailRule, MailSettings } from '../types/mail';

export interface StoredAccount extends MailAccount {
  password?: string;
}

export interface MailboxDatabase {
  accounts: StoredAccount[];
  messages: EmailMessage[];
  labels: string[];
  rules: MailRule[];
  settings: MailSettings;
}

export function createSeedDatabase(now: Date = new Date()): MailboxDatabase {
  const todayAt = (hours: number, minutes: number) => {
    const d = new Date(now);
    d.setHours(hours, minutes, 0, 0);
    if (d.getTime() > now.getTime()) {
      d.setDate(d.getDate() - 1);
    }
    return d.toISOString();
  };

  const daysAgoAt = (days: number, hours: number, minutes: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  };

  const accounts: StoredAccount[] = [
    {
      id: 'acct-personal',
      label: 'Personal',
      email: 'me@gmail.com',
      displayName: 'Prince Boateng',
      provider: 'local-sandbox',
      color: '#C85028',
      signature: 'Best,\nPrince',
      syncEnabled: true,
      notificationsEnabled: true,
      lastSyncedAt: now.toISOString(),
      syncStatus: 'connected',
      order: 0,
    },
    {
      id: 'acct-work',
      label: 'Work',
      email: 'me@outlook.com',
      displayName: 'Prince Boateng',
      provider: 'local-sandbox',
      color: '#2563EB',
      signature: 'Regards,\nPrince Boateng · Product Operations',
      syncEnabled: true,
      notificationsEnabled: true,
      lastSyncedAt: now.toISOString(),
      syncStatus: 'connected',
      order: 1,
    },
    {
      id: 'acct-studio',
      label: 'Studio',
      email: 'studio@fastmail.com',
      displayName: 'Helium Studio',
      provider: 'local-sandbox',
      color: '#15803D',
      signature: 'Warmly,\nHelium Design Studio',
      syncEnabled: true,
      notificationsEnabled: true,
      lastSyncedAt: now.toISOString(),
      syncStatus: 'connected',
      order: 2,
    },
    {
      id: 'acct-reads',
      label: 'Receipts',
      email: 'billing@icloud.com',
      displayName: 'Prince Billing',
      provider: 'local-sandbox',
      color: '#7C3AED',
      signature: 'Prince',
      syncEnabled: true,
      notificationsEnabled: false,
      lastSyncedAt: now.toISOString(),
      syncStatus: 'connected',
      order: 3,
    },
  ];

  const messages: EmailMessage[] = [
    {
      id: 'msg-ama-1',
      threadId: 'thread-ama',
      accountId: 'acct-personal',
      from: { name: 'Ama Mensah', email: 'ama.mensah@gmail.com' },
      to: [{ name: 'Prince', email: 'me@gmail.com' }],
      subject: 'Dinner on Saturday?',
      snippet: 'Hey! Are we still on for Saturday? I found a great spot in Osu that just opened...',
      bodyText:
        'Hey!\n\nAre we still on for Saturday? I found a great spot in Osu that just opened last week — they do wood-fired plantain flatbreads and hibiscus spritzes.\n\nLet me know if 7:30 PM works for you and Kwame. I can grab us a table on the terrace before it fills up.\n\nBest,\nAma',
      timestamp: todayAt(6, 23),
      folder: 'inbox',
      isRead: false,
      isStarred: true,
      labels: ['VIP'],
      attachments: [
        {
          id: 'att-menu',
          filename: 'Saturday-Terrace-Menu.txt',
          mimeType: 'text/plain',
          sizeBytes: 1420,
          contentText: 'Osu Terrace Kitchen — Tasting Menu: Plantain Flatbread, Charred Snapper, Hibiscus Spritz.',
        },
      ],
    },
    {
      id: 'msg-kofi-1',
      threadId: 'thread-kofi',
      accountId: 'acct-work',
      from: { name: 'Kofi Boateng', email: 'kofi@enterprise.io' },
      to: [{ name: 'Prince', email: 'me@outlook.com' }],
      subject: 'Q4 report draft',
      snippet: 'Hi, please review the updated revenue metrics before the board call tomorrow.',
      bodyText:
        'Hi,\n\nPlease review the updated Q4 revenue metrics before the board call tomorrow morning. We reconciled the EMEA expansion numbers and trimmed the hardware burn forecast by 14%.\n\nKey highlights:\n- Net retention rose to 118%\n- Enterprise pipeline up 31% QoQ\n- Two pilot accounts moving to annual contracts\n\nSend over any edits before 4 PM.\n\nThanks,\nKofi',
      timestamp: todayAt(4, 47),
      folder: 'inbox',
      isRead: false,
      isStarred: false,
      labels: ['Work'],
      attachments: [
        {
          id: 'att-q4',
          filename: 'Q4-Metrics-Summary.csv',
          mimeType: 'text/csv',
          sizeBytes: 4280,
          contentText: 'Quarter,ARR,NRR,Churn\nQ1,1.2M,112%,2.1%\nQ2,1.5M,114%,1.8%\nQ3,1.9M,116%,1.5%\nQ4,2.4M,118%,1.2%',
        },
      ],
    },
    {
      id: 'msg-bank-1',
      threadId: 'thread-bank',
      accountId: 'acct-personal',
      from: { name: 'Bank Alerts', email: 'alerts@fidelitysecure.com' },
      to: [{ name: 'Prince', email: 'me@gmail.com' }],
      subject: 'Your monthly statement is ready',
      snippet: 'Your statement for October is now available to view inside your encrypted vault.',
      bodyText:
        'Hello Prince,\n\nYour statement for October is now available. Total account balance and itemized card transactions have been finalized.\n\nSummary:\n- Closing Balance: $12,480.40\n- Direct Deposits: $6,200.00\n- Card Spend: $1,842.15\n\nThank you for banking with us.',
      timestamp: daysAgoAt(1, 21, 47),
      folder: 'inbox',
      isRead: true,
      isStarred: false,
      labels: ['Finance'],
      attachments: [],
    },
    {
      id: 'msg-hr-1',
      threadId: 'thread-hr',
      accountId: 'acct-work',
      from: { name: 'HR Team', email: 'people@enterprise.io' },
      to: [{ name: 'All Staff', email: 'me@outlook.com' }],
      subject: 'Holiday schedule',
      snippet: 'Please find the office holiday schedule and year-end PTO carryover guidelines...',
      bodyText:
        'Hello Team,\n\nPlease find the office holiday schedule for December through early January:\n\n- Dec 24 (Half Day): Offices close at 1:00 PM\n- Dec 25 – Jan 1: Company Winter Break\n- Jan 2: Normal operations resume\n\nUp to 5 unused PTO days automatically roll into Q1. Reach out to People Ops if you have questions.\n\nWarm regards,\nHR Team',
      timestamp: daysAgoAt(2, 14, 15),
      folder: 'inbox',
      isRead: true,
      isStarred: false,
      labels: ['Work'],
      attachments: [],
    },
    {
      id: 'msg-studio-1',
      threadId: 'thread-studio',
      accountId: 'acct-studio',
      from: { name: 'Nadia Osei', email: 'nadia@atelierpress.co' },
      to: [{ name: 'Helium Studio', email: 'studio@fastmail.com' }],
      subject: 'Print proofs arrived — paper stock looks crisp',
      snippet: 'The warm cotton 120gsm stock turned out even better than the digital proofs.',
      bodyText:
        'Hi team,\n\nThe warm cotton 120gsm stock turned out even better than the digital proofs. The terracotta foil stamp catches side light without smudging.\n\nI photographed three spreads so you can sign off before the full 2,500-copy run starts Friday.\n\nBest,\nNadia',
      timestamp: daysAgoAt(3, 11, 10),
      folder: 'inbox',
      isRead: true,
      isStarred: true,
      labels: ['VIP'],
      attachments: [],
    },
    {
      id: 'msg-receipt-1',
      threadId: 'thread-receipt',
      accountId: 'acct-reads',
      from: { name: 'Cloudflare Billing', email: 'billing@notify.cloudflare.com' },
      to: [{ name: 'Prince Billing', email: 'billing@icloud.com' }],
      subject: 'Invoice #CF-88412 paid ($24.00)',
      snippet: 'Thank you for your payment. Your Workers & DNS Pro plan renewed cleanly.',
      bodyText:
        'Receipt for Invoice #CF-88412\nAmount Paid: $24.00 USD\nPlan: Pro + Workers Bundled\nStatus: Paid\n\nNo further action is required.',
      timestamp: daysAgoAt(4, 9, 5),
      folder: 'inbox',
      isRead: true,
      isStarred: false,
      labels: ['Receipts'],
      listUnsubscribe: 'mailto:unsubscribe@notify.cloudflare.com',
      attachments: [],
    },
    {
      id: 'msg-sent-1',
      threadId: 'thread-ama',
      accountId: 'acct-personal',
      from: { name: 'Prince Boateng', email: 'me@gmail.com' },
      to: [{ name: 'Ama Mensah', email: 'ama.mensah@gmail.com' }],
      subject: 'Re: Dinner on Saturday?',
      snippet: 'Count me in! Just checking with Kwame on timing now.',
      bodyText: 'Count me in! Just checking with Kwame on timing now and will lock in 7:30 PM.',
      timestamp: daysAgoAt(1, 18, 20),
      folder: 'sent',
      isRead: true,
      isStarred: false,
      labels: [],
      attachments: [],
    },
    {
      id: 'msg-draft-1',
      threadId: 'thread-draft-1',
      accountId: 'acct-work',
      from: { name: 'Prince Boateng', email: 'me@outlook.com' },
      to: [{ name: 'Kofi Boateng', email: 'kofi@enterprise.io' }],
      subject: 'Re: Q4 report draft',
      snippet: 'Draft: Thanks Kofi — I reviewed slides 4 through 9 and added notes on EMEA...',
      bodyText: 'Thanks Kofi — I reviewed slides 4 through 9 and added notes on EMEA margin expansion.',
      timestamp: todayAt(5, 10),
      folder: 'drafts',
      isRead: true,
      isStarred: false,
      labels: [],
      attachments: [],
    },
    {
      id: 'msg-snoozed-1',
      threadId: 'thread-flight',
      accountId: 'acct-personal',
      from: { name: 'Delta Air Lines', email: 'DeltaAirLines@t.delta.com' },
      to: [{ name: 'Prince', email: 'me@gmail.com' }],
      subject: 'Check-in reminder: Flight DL 157 to Accra',
      snippet: 'Your flight departs in 48 hours. Confirm seat 14A and baggage details.',
      bodyText:
        'Your trip is coming up! Flight DL 157 departs Saturday evening. Online check-in opens 24 hours prior to departure.',
      timestamp: daysAgoAt(2, 16, 40),
      folder: 'snoozed',
      isRead: true,
      isStarred: false,
      labels: ['Travel'],
      snoozedUntil: new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString(),
      attachments: [],
    },
    {
      id: 'msg-archive-1',
      threadId: 'thread-archive-1',
      accountId: 'acct-studio',
      from: { name: 'Linear Updates', email: 'notifications@linear.app' },
      to: [{ name: 'Helium Studio', email: 'studio@fastmail.com' }],
      subject: 'Weekly Cycle 46 completed (18 issues shipped)',
      snippet: 'All 18 scheduled mobile inbox tasks shipped ahead of Friday freeze.',
      bodyText: 'Cycle 46 summary: 18 issues completed, 0 regressions, average cycle time 1.8 days.',
      timestamp: daysAgoAt(6, 17, 0),
      folder: 'archive',
      isRead: true,
      isStarred: false,
      labels: ['Work'],
      listUnsubscribe: 'https://linear.app/unsubscribe',
      attachments: [],
    },
  ];

  const labels = ['VIP', 'Work', 'Finance', 'Travel', 'Receipts'];

  const rules: MailRule[] = [
    {
      id: 'rule-finance',
      name: 'Tag Bank & Billing as Finance',
      enabled: true,
      matchField: 'from',
      matchValue: 'bank',
      action: 'apply-label',
      actionValue: 'Finance',
    },
    {
      id: 'rule-vip-ama',
      name: 'Star messages from Ama Mensah',
      enabled: true,
      matchField: 'from',
      matchValue: 'ama.mensah',
      action: 'star',
    },
  ];

  const settings: MailSettings = {
    swipeRightAction: 'archive',
    swipeLeftAction: 'delete',
    undoSendSeconds: 5,
    theme: 'warm-paper',
    compactDensity: false,
    showAvatars: true,
    autoAdvance: true,
    vacationResponderEnabled: false,
    vacationSubject: 'Out of Office',
    vacationBody: 'Thanks for your note! I am currently away and will reply as soon as I return.',
  };

  return {
    accounts,
    messages,
    labels,
    rules,
    settings,
  };
}
