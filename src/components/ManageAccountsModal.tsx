import { useState } from 'react';
import { Bell, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { MailAccount } from '../types/mail';
import { ACCOUNT_COLOR_PALETTE } from '../lib/mailLogic';
import { syncAccountMessages, updateAccount } from '../lib/api';

interface ManageAccountsModalProps {
  open: boolean;
  accounts: MailAccount[];
  onClose: () => void;
  onSelectAccount: (accountId: string) => void;
  onOpenAdd: () => void;
  onRequestRemoveAccount: (account: MailAccount) => void;
  onStateUpdated: (message?: string) => void;
}

export function ManageAccountsModal({
  open,
  accounts,
  onClose,
  onSelectAccount,
  onOpenAdd,
  onRequestRemoveAccount,
  onStateUpdated,
}: ManageAccountsModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  if (!open) return null;

  const handleUpdate = async (id: string, patch: Partial<MailAccount>) => {
    setStatusError(null);
    try {
      await updateAccount(id, patch);
      onStateUpdated();
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to update account');
    }
  };

  const handleSyncOne = async (acct: MailAccount) => {
    setSyncingId(acct.id);
    setStatusError(null);
    try {
      const res = await syncAccountMessages(acct);
      onStateUpdated(`Synced ${res.syncedCount} new message(s) for ${acct.label}`);
    } catch (err: any) {
      setStatusError(err?.message || 'Sync error');
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-accounts-title"
    >
      <div className="w-full max-h-[90dvh] sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-[#FFFEFB] dark:bg-[#191613] border border-[#E5DDD0] dark:border-[#2E2924] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDE6DA] dark:border-[#2C2722]">
          <div>
            <h2
              id="manage-accounts-title"
              className="font-serif-editorial text-xl font-bold text-[#1C1917] dark:text-[#FAF7F2]"
            >
              Manage accounts ({accounts.length})
            </h2>
            <p className="text-xs text-[#78716C]">
              Customize colors, signatures, sync, and notifications across all mailboxes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAdd();
              }}
              className="min-h-[40px] px-3.5 rounded-full bg-[#C85028] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add account</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account manager"
              className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {statusError && (
            <div className="p-3 rounded-xl bg-[#BE123C]/10 border border-[#BE123C]/25 text-xs font-medium text-[#BE123C]">
              {statusError}
            </div>
          )}

          {accounts.map((acct) => {
            const isEditing = editingId === acct.id;
            return (
              <div
                key={acct.id}
                className="p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAccount(acct.id);
                      onClose();
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl hover:opacity-85 transition-opacity"
                  >
                    <span
                      className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                      style={{ backgroundColor: acct.color }}
                    >
                      {acct.label[0]?.toUpperCase() || 'A'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{acct.label}</span>
                        <span className="text-[11px] text-[#78716C]">{acct.provider}</span>
                      </div>
                      <p className="text-xs text-[#6B655E] dark:text-[#9A9287] truncate">
                        {acct.email}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSyncOne(acct)}
                      disabled={syncingId === acct.id}
                      aria-label={`Sync ${acct.label}`}
                      title="Sync now"
                      className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] hover:bg-[#EDE6DA] dark:hover:bg-[#2C2722]"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${syncingId === acct.id ? 'animate-spin' : ''}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdate(acct.id, {
                          notificationsEnabled: !acct.notificationsEnabled,
                        })
                      }
                      aria-label={`Toggle notifications for ${acct.label}`}
                      title="Toggle notifications"
                      className={`min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center hover:bg-[#EDE6DA] dark:hover:bg-[#2C2722] ${
                        acct.notificationsEnabled ? 'text-[#C85028]' : 'text-[#A8A29E]'
                      }`}
                    >
                      <Bell className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(isEditing ? null : acct.id)}
                      className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-[#44403C] dark:text-[#D6CFC5] hover:bg-[#EDE6DA] dark:hover:bg-[#2C2722]"
                    >
                      {isEditing ? 'Done' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequestRemoveAccount(acct)}
                      aria-label={`Disconnect ${acct.label}`}
                      title="Remove account"
                      className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#78716C] hover:text-[#BE123C] hover:bg-[#EDE6DA] dark:hover:bg-[#2C2722]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="pt-3 border-t border-[#E7E0D4] dark:border-[#332E28] space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Nickname</label>
                        <input
                          type="text"
                          defaultValue={acct.label}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value.trim() !== acct.label) {
                              handleUpdate(acct.id, { label: e.target.value.trim() });
                            }
                          }}
                          className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                        />
                      </div>
                      <div>
                        <span className="block text-xs font-semibold mb-1">Color</span>
                        <div className="flex flex-wrap gap-1.5">
                          {ACCOUNT_COLOR_PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`Color ${c}`}
                              style={{ backgroundColor: c }}
                              onClick={() => handleUpdate(acct.id, { color: c })}
                              className={`h-6 w-6 rounded-full ${
                                acct.color === c ? 'ring-2 ring-offset-1 ring-[#1C1917]' : ''
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">Email signature</label>
                      <textarea
                        rows={2}
                        defaultValue={acct.signature}
                        onBlur={(e) => handleUpdate(acct.id, { signature: e.target.value })}
                        className="w-full p-2.5 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
