import { useEffect, useState, type ChangeEvent } from 'react';
import {
  Clock,
  FileText,
  Paperclip,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { ComposeDraft, EmailAttachment, MailAccount } from '../types/mail';
import { formatBytes, validateComposeInput } from '../lib/mailLogic';

interface ComposeModalProps {
  open: boolean;
  accounts: MailAccount[];
  knownContacts: Array<{ name: string; email: string }>;
  initialDraft: ComposeDraft;
  onClose: () => void;
  onRequestSend: (draft: ComposeDraft) => void;
  onSaveDraft: (draft: ComposeDraft) => Promise<void>;
}

const QUICK_TEMPLATES = [
  {
    name: 'Meeting Follow-up',
    subject: 'Follow-up from today’s conversation',
    body: 'Hi,\n\nThanks for taking the time to connect today. Here are the key next steps we aligned on:\n- \n- \n\nLet me know if anything needs adjusting.',
  },
  {
    name: 'Quick Confirmation',
    subject: 'Confirmed — see you then',
    body: 'Hi,\n\nConfirmed on my side. Looking forward to it!',
  },
];

export function ComposeModal({
  open,
  accounts,
  knownContacts,
  initialDraft,
  onClose,
  onRequestSend,
  onSaveDraft,
}: ComposeModalProps) {
  const [draft, setDraft] = useState<ComposeDraft>(initialDraft);
  const [showCcBcc, setShowCcBcc] = useState(Boolean(initialDraft.cc || initialDraft.bcc));
  const [showSchedule, setShowSchedule] = useState(Boolean(initialDraft.scheduledFor));
  const [showTemplates, setShowTemplates] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initialDraft);
      setShowCcBcc(Boolean(initialDraft.cc || initialDraft.bcc));
      setShowSchedule(Boolean(initialDraft.scheduledFor));
      setErrors({});
    }
  }, [open, initialDraft]);

  if (!open) return null;

  const selectedAccount = accounts.find((a) => a.id === draft.accountId) || accounts[0];

  const handleAccountChange = (newAccountId: string) => {
    const oldAcct = accounts.find((a) => a.id === draft.accountId);
    const newAcct = accounts.find((a) => a.id === newAccountId);
    let nextBody = draft.bodyText;
    if (oldAcct?.signature && nextBody.includes(oldAcct.signature)) {
      nextBody = nextBody.replace(oldAcct.signature, newAcct?.signature || '');
    } else if (newAcct?.signature && !nextBody.includes(newAcct.signature)) {
      nextBody = `${nextBody.trimEnd()}\n\n${newAcct.signature}`;
    }
    setDraft((prev) => ({ ...prev, accountId: newAccountId, bodyText: nextBody }));
  };

  const handleFileAttach = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments: EmailAttachment[] = await Promise.all(
      files.map(async (f) => ({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        filename: f.name,
        mimeType: f.type || 'application/octet-stream',
        sizeBytes: f.size,
        contentText: f.type.startsWith('text/') ? await f.text() : undefined,
      }))
    );
    setDraft((prev) => ({
      ...prev,
      attachments: [...prev.attachments, ...newAttachments],
    }));
    e.target.value = '';
  };

  const handleValidateAndSubmit = () => {
    const result = validateComposeInput(draft);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onRequestSend(draft);
  };

  const handleSave = async () => {
    setSavingDraft(true);
    try {
      await onSaveDraft(draft);
      onClose();
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-modal-title"
    >
      <div className="w-full h-[94dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-[#FFFEFB] dark:bg-[#191613] border border-[#E5DDD0] dark:border-[#2E2924] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EDE6DA] dark:border-[#2C2722]">
          <h2
            id="compose-modal-title"
            className="font-serif-editorial text-xl font-bold text-[#1C1917] dark:text-[#FAF7F2]"
          >
            Compose
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="min-h-[38px] px-3 rounded-full text-xs font-semibold text-[#57534E] dark:text-[#C4BCB0] hover:bg-[#F3EDE3] dark:hover:bg-[#24201B] flex items-center gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Templates</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={savingDraft}
              aria-label="Save draft"
              title="Save draft"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] dark:text-[#C4BCB0] hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close composer"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] dark:text-[#C4BCB0] hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {showTemplates && (
          <div className="px-5 py-2.5 bg-[#FAF7F2] dark:bg-[#211D19] border-b border-[#EDE6DA] dark:border-[#2C2722] flex flex-wrap gap-2">
            {QUICK_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => {
                  setDraft((prev) => ({
                    ...prev,
                    subject: prev.subject || tpl.subject,
                    bodyText: `${tpl.body}\n\n${selectedAccount?.signature || ''}`,
                  }));
                  setShowTemplates(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#2C2722] border border-[#E4DDD0] dark:border-[#3A342D] text-xs font-medium hover:border-[#C85028]"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        )}

        {/* Body fields */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {/* From selector */}
          <div className="flex items-center gap-3 pb-2.5 border-b border-[#F0EAE0] dark:border-[#2A2520]">
            <label htmlFor="compose-from" className="text-xs font-semibold text-[#78716C] w-12 shrink-0">
              From
            </label>
            <select
              id="compose-from"
              value={draft.accountId}
              onChange={(e) => handleAccountChange(e.target.value)}
              className="flex-1 bg-transparent text-sm font-medium text-[#1C1917] dark:text-[#FAF7F2] focus:outline-none min-h-[38px]"
            >
              {accounts.map((acct) => (
                <option key={acct.id} value={acct.id} className="bg-white dark:bg-[#1E1B18]">
                  {acct.label} ({acct.email})
                </option>
              ))}
            </select>
          </div>

          {/* To */}
          <div className="pb-2.5 border-b border-[#F0EAE0] dark:border-[#2A2520]">
            <div className="flex items-center gap-3">
              <label htmlFor="compose-to" className="text-xs font-semibold text-[#78716C] w-12 shrink-0">
                To
              </label>
              <input
                id="compose-to"
                type="text"
                list="helium-known-contacts"
                value={draft.to}
                onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
                placeholder="recipient@example.com (comma separated)"
                className="flex-1 bg-transparent text-sm text-[#1C1917] dark:text-[#FAF7F2] placeholder:text-[#A8A29E] focus:outline-none min-h-[38px]"
              />
              <button
                type="button"
                onClick={() => setShowCcBcc((v) => !v)}
                className="text-xs font-semibold text-[#78716C] hover:text-[#1C1917] px-2 py-1"
              >
                Cc/Bcc
              </button>
            </div>
            <datalist id="helium-known-contacts">
              {knownContacts.map((c) => (
                <option key={c.email} value={c.email}>
                  {c.name}
                </option>
              ))}
            </datalist>
            {errors.to && <p className="mt-1 ml-15 text-xs text-[#BE123C]">{errors.to}</p>}
          </div>

          {showCcBcc && (
            <>
              <div className="pb-2.5 border-b border-[#F0EAE0] dark:border-[#2A2520]">
                <div className="flex items-center gap-3">
                  <label htmlFor="compose-cc" className="text-xs font-semibold text-[#78716C] w-12 shrink-0">
                    Cc
                  </label>
                  <input
                    id="compose-cc"
                    type="text"
                    value={draft.cc}
                    onChange={(e) => setDraft((prev) => ({ ...prev, cc: e.target.value }))}
                    placeholder="cc@example.com"
                    className="flex-1 bg-transparent text-sm text-[#1C1917] dark:text-[#FAF7F2] placeholder:text-[#A8A29E] focus:outline-none min-h-[36px]"
                  />
                </div>
                {errors.cc && <p className="mt-1 ml-15 text-xs text-[#BE123C]">{errors.cc}</p>}
              </div>

              <div className="pb-2.5 border-b border-[#F0EAE0] dark:border-[#2A2520]">
                <div className="flex items-center gap-3">
                  <label htmlFor="compose-bcc" className="text-xs font-semibold text-[#78716C] w-12 shrink-0">
                    Bcc
                  </label>
                  <input
                    id="compose-bcc"
                    type="text"
                    value={draft.bcc}
                    onChange={(e) => setDraft((prev) => ({ ...prev, bcc: e.target.value }))}
                    placeholder="bcc@example.com"
                    className="flex-1 bg-transparent text-sm text-[#1C1917] dark:text-[#FAF7F2] placeholder:text-[#A8A29E] focus:outline-none min-h-[36px]"
                  />
                </div>
                {errors.bcc && <p className="mt-1 ml-15 text-xs text-[#BE123C]">{errors.bcc}</p>}
              </div>
            </>
          )}

          {/* Subject */}
          <div className="pb-2.5 border-b border-[#F0EAE0] dark:border-[#2A2520]">
            <div className="flex items-center gap-3">
              <label htmlFor="compose-subject" className="text-xs font-semibold text-[#78716C] w-12 shrink-0">
                Subject
              </label>
              <input
                id="compose-subject"
                type="text"
                value={draft.subject}
                onChange={(e) => setDraft((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="Subject"
                className="flex-1 bg-transparent text-sm font-medium text-[#1C1917] dark:text-[#FAF7F2] placeholder:text-[#A8A29E] focus:outline-none min-h-[38px]"
              />
            </div>
          </div>

          {/* Schedule send option */}
          {showSchedule && (
            <div className="p-3 rounded-xl bg-[#FAF7F2] dark:bg-[#221E1A] border border-[#E4DDD0] dark:border-[#332E28] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[#57534E] dark:text-[#C4BCB0]">
                <Clock className="h-4 w-4 text-[#C85028]" />
                <span>Schedule send:</span>
              </div>
              <input
                type="datetime-local"
                aria-label="Schedule send date and time"
                value={draft.scheduledFor ? draft.scheduledFor.slice(0, 16) : ''}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    scheduledFor: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  }))
                }
                className="text-xs bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] rounded-lg px-2.5 py-1.5"
              />
            </div>
          )}

          {/* Message Body */}
          <div>
            <textarea
              aria-label="Email body"
              rows={9}
              value={draft.bodyText}
              onChange={(e) => setDraft((prev) => ({ ...prev, bodyText: e.target.value }))}
              placeholder="Write your message..."
              className="w-full resize-y bg-transparent text-[15px] leading-relaxed text-[#1C1917] dark:text-[#FAF7F2] placeholder:text-[#A8A29E] focus:outline-none"
            />
            {errors.bodyText && <p className="mt-1 text-xs text-[#BE123C]">{errors.bodyText}</p>}
          </div>

          {/* Attachments */}
          {draft.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {draft.attachments.map((att) => (
                <div
                  key={att.id}
                  className="px-3 py-1.5 rounded-xl bg-[#FAF7F2] dark:bg-[#24201B] border border-[#E4DDD0] dark:border-[#332E28] flex items-center gap-2 text-xs"
                >
                  <Paperclip className="h-3.5 w-3.5 text-[#C85028]" />
                  <span className="truncate max-w-[160px] font-medium">{att.filename}</span>
                  <span className="text-[#78716C] tabular-nums">{formatBytes(att.sizeBytes)}</span>
                  <button
                    type="button"
                    aria-label={`Remove attachment ${att.filename}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        attachments: prev.attachments.filter((a) => a.id !== att.id),
                      }))
                    }
                    className="text-[#78716C] hover:text-[#BE123C]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer action bar */}
        <div className="px-5 py-3.5 border-t border-[#EDE6DA] dark:border-[#2C2722] bg-[#FAF7F2] dark:bg-[#171411] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <label className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#57534E] dark:text-[#C4BCB0] hover:bg-[#EDE6DA] dark:hover:bg-[#24201B] cursor-pointer">
              <Paperclip className="h-[18px] w-[18px]" />
              <input type="file" multiple onChange={handleFileAttach} className="sr-only" />
            </label>
            <button
              type="button"
              onClick={() => setShowSchedule((v) => !v)}
              aria-label="Schedule send"
              title="Schedule send"
              className={`min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-[#EDE6DA] dark:hover:bg-[#24201B] ${
                showSchedule ? 'text-[#C85028]' : 'text-[#57534E] dark:text-[#C4BCB0]'
              }`}
            >
              <Clock className="h-[18px] w-[18px]" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleValidateAndSubmit}
            className="min-h-[44px] px-6 rounded-full bg-[#C85028] hover:bg-[#B04320] text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Send className="h-4 w-4" />
            <span>{draft.scheduledFor ? 'Schedule' : 'Send'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
