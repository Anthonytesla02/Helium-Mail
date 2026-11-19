import { useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Clock,
  Download,
  Forward,
  MailOpen,
  MoreVertical,
  Paperclip,
  Reply,
  ReplyAll,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import type { EmailMessage, EmailThread, MailAccount } from '../types/mail';
import { formatBytes, getInitialLetter } from '../lib/mailLogic';

interface ThreadReaderProps {
  thread: EmailThread;
  account?: MailAccount;
  availableLabels: string[];
  onBack: () => void;
  onReply: (msg: EmailMessage, mode: 'reply' | 'reply-all' | 'forward') => void;
  onArchive: (thread: EmailThread) => void;
  onTrash: (thread: EmailThread) => void;
  onToggleStar: (thread: EmailThread) => void;
  onMarkUnread: (thread: EmailThread) => void;
  onSnooze: (thread: EmailThread, untilIso: string) => void;
  onToggleLabel: (thread: EmailThread, label: string) => void;
  onReportSpam: (thread: EmailThread) => void;
  onUnsubscribe: (msg: EmailMessage) => void;
}

export function ThreadReader({
  thread,
  account,
  availableLabels,
  onBack,
  onReply,
  onArchive,
  onTrash,
  onToggleStar,
  onMarkUnread,
  onSnooze,
  onToggleLabel,
  onReportSpam,
  onUnsubscribe,
}: ThreadReaderProps) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const lastId = thread.messages[thread.messages.length - 1]?.id;
    return new Set(lastId ? [lastId] : []);
  });

  const latest = thread.latestMessage;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownloadAttachment = (att: { filename: string; contentText?: string }) => {
    const content = att.contentText || `Attachment: ${att.filename}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const snoozeOptions = [
    {
      label: 'Later today (+3 hours)',
      iso: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      label: 'Tomorrow morning (9:00 AM)',
      iso: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.toISOString();
      })(),
    },
    {
      label: 'Next week (Monday 9:00 AM)',
      iso: (() => {
        const d = new Date();
        const delta = ((8 - d.getDay()) % 7) || 7;
        d.setDate(d.getDate() + delta);
        d.setHours(9, 0, 0, 0);
        return d.toISOString();
      })(),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#FAF7F2] dark:bg-[#141210] text-[#1C1917] dark:text-[#F5F0E8]">
      {/* Sticky Top Action Bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-3 sm:px-5 h-14 border-b border-[#E7E0D4] dark:border-[#2C2722] bg-[#FAF7F2]/95 dark:bg-[#141210]/95 backdrop-blur-md">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to message list"
            className="lg:hidden min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EDE6DA] dark:hover:bg-[#24201B]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="hidden lg:inline-flex items-center gap-2 text-xs font-medium text-[#78716C]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: account?.color || '#C85028' }}
            />
            <span>{account?.label || 'Inbox'}</span>
            <span aria-hidden="true">·</span>
            <span>{account?.email}</span>
          </span>
        </div>

        <div className="flex items-center gap-0.5 relative">
          <button
            type="button"
            onClick={() => onArchive(thread)}
            aria-label="Archive thread"
            title="Archive"
            className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EDE6DA] dark:hover:bg-[#24201B]"
          >
            <Archive className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={() => onTrash(thread)}
            aria-label="Delete thread"
            title="Move to Trash"
            className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EDE6DA] dark:hover:bg-[#24201B] hover:text-[#BE123C]"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={() => onMarkUnread(thread)}
            aria-label="Mark as unread"
            title="Mark unread"
            className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EDE6DA] dark:hover:bg-[#24201B]"
          >
            <MailOpen className="h-[18px] w-[18px]" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSnoozeMenu((v) => !v);
                setShowLabelMenu(false);
                setShowMoreMenu(false);
              }}
              aria-label="Snooze thread"
              title="Snooze"
              className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EDE6DA] dark:hover:bg-[#24201B]"
            >
              <Clock className="h-[18px] w-[18px]" />
            </button>
            {showSnoozeMenu && (
              <div className="absolute right-0 mt-1 w-60 rounded-2xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#E4DDD0] dark:border-[#332E28] shadow-xl p-1.5 z-30">
                <p className="px-3 py-1.5 text-xs font-semibold text-[#78716C]">Snooze until…</p>
                {snoozeOptions.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setShowSnoozeMenu(false);
                      onSnooze(thread, opt.iso);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-[#F3EDE3] dark:hover:bg-[#2A2520]"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowLabelMenu((v) => !v);
                setShowSnoozeMenu(false);
                setShowMoreMenu(false);
              }}
              aria-label="Assign labels"
              title="Labels"
              className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EDE6DA] dark:hover:bg-[#24201B]"
            >
              <Tag className="h-[18px] w-[18px]" />
            </button>
            {showLabelMenu && (
              <div className="absolute right-0 mt-1 w-48 rounded-2xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#E4DDD0] dark:border-[#332E28] shadow-xl p-1.5 z-30">
                <p className="px-3 py-1.5 text-xs font-semibold text-[#78716C]">Labels</p>
                {availableLabels.map((lbl) => {
                  const active = thread.labels.includes(lbl);
                  return (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => {
                        onToggleLabel(thread, lbl);
                        setShowLabelMenu(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm hover:bg-[#F3EDE3] dark:hover:bg-[#2A2520]"
                    >
                      <span>{lbl}</span>
                      {active && <span className="text-xs font-bold text-[#C85028]">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowMoreMenu((v) => !v);
                setShowSnoozeMenu(false);
                setShowLabelMenu(false);
              }}
              aria-label="More message options"
              className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EDE6DA] dark:hover:bg-[#24201B]"
            >
              <MoreVertical className="h-[18px] w-[18px]" />
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 mt-1 w-52 rounded-2xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#E4DDD0] dark:border-[#332E28] shadow-xl p-1.5 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onReportSpam(thread);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm hover:bg-[#F3EDE3] dark:hover:bg-[#2A2520]"
                >
                  <ShieldAlert className="h-4 w-4 text-[#78716C]" />
                  <span>Report spam</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    const eml = `From: ${latest.from.name} <${latest.from.email}>\nTo: ${latest.to.map((t) => t.email).join(', ')}\nSubject: ${latest.subject}\nDate: ${latest.timestamp}\n\n${latest.bodyText}`;
                    handleDownloadAttachment({
                      filename: `${latest.subject.slice(0, 32).replace(/[^a-z0-9]/gi, '_')}.eml`,
                      contentText: eml,
                    });
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm hover:bg-[#F3EDE3] dark:hover:bg-[#2A2520]"
                >
                  <Download className="h-4 w-4 text-[#78716C]" />
                  <span>Export .eml</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable Thread Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif-editorial text-2xl sm:text-[28px] font-bold leading-tight text-[#181615] dark:text-[#FAF7F2]">
              {thread.subject}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#78716C]">
              <span>{account?.label}</span>
              <span aria-hidden="true">·</span>
              <span>{account?.email}</span>
              {thread.labels.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#C85028]">
                    {thread.labels.join(' · ')}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleStar(thread)}
            aria-label={thread.isStarred ? 'Unstar conversation' : 'Star conversation'}
            className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-[#EDE6DA] dark:hover:bg-[#24201B] shrink-0"
          >
            <Star
              className={`h-5 w-5 ${
                thread.isStarred ? 'fill-[#EAB308] text-[#EAB308]' : 'text-[#8C847A]'
              }`}
            />
          </button>
        </div>

        {/* Unsubscribe Banner for Newsletters */}
        {latest.listUnsubscribe && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#F3EDE3] dark:bg-[#221E1A] border border-[#E4DDD0] dark:border-[#332E28]">
            <p className="text-xs text-[#57534E] dark:text-[#C4BCB0]">
              Mailing list detected from <span className="font-semibold">{latest.from.name}</span>
            </p>
            <button
              type="button"
              onClick={() => onUnsubscribe(latest)}
              className="text-xs font-semibold text-[#C85028] hover:underline shrink-0 min-h-[36px] px-2"
            >
              Unsubscribe
            </button>
          </div>
        )}

        {/* Messages inside thread */}
        <div className="space-y-4">
          {thread.messages.map((msg) => {
            const isExpanded = expandedIds.has(msg.id);
            const senderName = msg.from.name || msg.from.email;
            return (
              <article
                key={msg.id}
                className="rounded-2xl bg-[#FFFEFB] dark:bg-[#1B1815] border border-[#E7E0D4] dark:border-[#2C2722] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(msg.id)}
                  className="w-full px-4 sm:px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FAF7F2]/60 dark:hover:bg-[#221E1A]/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
                      style={{ backgroundColor: account?.color || '#C85028' }}
                    >
                      {getInitialLetter(senderName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[#1C1917] dark:text-[#FAF7F2] truncate">
                          {senderName}
                        </span>
                        <span className="text-xs text-[#78716C] truncate hidden sm:inline">
                          &lt;{msg.from.email}&gt;
                        </span>
                      </div>
                      <p className="text-xs text-[#78716C] truncate">
                        to {msg.to.map((t) => t.name || t.email).join(', ')}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-[#78716C] tabular-nums shrink-0">
                    {new Date(msg.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-[#F0EAE0] dark:border-[#2A2520]">
                    <div className="mt-3 text-[15px] leading-[1.68] text-[#292524] dark:text-[#E7E0D4] whitespace-pre-wrap break-words max-w-[68ch]">
                      {msg.bodyText}
                    </div>

                    {msg.attachments.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-[#F0EAE0] dark:border-[#2A2520]">
                        <p className="text-xs font-semibold text-[#78716C] mb-2.5">
                          Attachments ({msg.attachments.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              onClick={() => handleDownloadAttachment(att)}
                              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#FAF7F2] dark:bg-[#24201B] border border-[#E4DDD0] dark:border-[#332E28] flex items-center gap-2.5 text-left hover:border-[#C85028] transition-colors"
                            >
                              <Paperclip className="h-4 w-4 text-[#C85028] shrink-0" />
                              <span className="text-xs font-medium truncate max-w-[180px]">
                                {att.filename}
                              </span>
                              <span className="text-[11px] text-[#78716C] tabular-nums">
                                {formatBytes(att.sizeBytes)}
                              </span>
                              <Download className="h-3.5 w-3.5 text-[#78716C]" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* Smart Quick Replies */}
        <div className="pt-2">
          <p className="text-xs font-medium text-[#78716C] mb-2">Quick reply</p>
          <div className="flex flex-wrap gap-2">
            {[
              'Sounds great, count me in!',
              'Thanks for sending this over — reviewing today.',
              'Got it, let’s confirm tomorrow morning.',
            ].map((template) => (
              <button
                key={template}
                type="button"
                onClick={() =>
                  onReply(
                    { ...latest, bodyText: `${template}\n\n` },
                    'reply'
                  )
                }
                className="min-h-[40px] px-3.5 rounded-xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#E4DDD0] dark:border-[#332E28] text-xs font-medium text-[#44403C] dark:text-[#D6CFC5] hover:border-[#C85028] transition-colors"
              >
                {template}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Thumb-Zone Reply Bar */}
      <footer className="sticky bottom-0 z-10 px-4 py-3 border-t border-[#E7E0D4] dark:border-[#2C2722] bg-[#FAF7F2]/95 dark:bg-[#141210]/95 backdrop-blur-md flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => onReply(latest, 'reply')}
          className="flex-1 min-h-[44px] rounded-xl bg-[#C85028] hover:bg-[#B04320] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <Reply className="h-4 w-4" />
          <span>Reply</span>
        </button>
        <button
          type="button"
          onClick={() => onReply(latest, 'reply-all')}
          className="min-h-[44px] px-4 rounded-xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#DDD4C6] dark:border-[#332E28] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
        >
          <ReplyAll className="h-4 w-4" />
          <span className="hidden sm:inline">Reply all</span>
        </button>
        <button
          type="button"
          onClick={() => onReply(latest, 'forward')}
          className="min-h-[44px] px-4 rounded-xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#DDD4C6] dark:border-[#332E28] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
        >
          <Forward className="h-4 w-4" />
          <span className="hidden sm:inline">Forward</span>
        </button>
      </footer>
    </div>
  );
}
