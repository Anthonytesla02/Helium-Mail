import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { MailRule, MailSettings, SwipeAction } from '../types/mail';
import { createRule, deleteRule, getConfiguredApiBaseUrl, setConfiguredApiBaseUrl, toggleRule, updateSettings } from '../lib/api';

interface SettingsAndRulesModalProps {
  open: boolean;
  settings: MailSettings;
  rules: MailRule[];
  labels: string[];
  onClose: () => void;
  onStateUpdated: (message?: string) => void;
}

const SWIPE_ACTIONS: Array<{ value: SwipeAction; label: string }> = [
  { value: 'archive', label: 'Archive' },
  { value: 'delete', label: 'Move to Trash' },
  { value: 'read', label: 'Mark Read / Unread' },
  { value: 'star', label: 'Toggle Star' },
  { value: 'snooze', label: 'Snooze' },
];

export function SettingsAndRulesModal({
  open,
  settings,
  rules,
  labels,
  onClose,
  onStateUpdated,
}: SettingsAndRulesModalProps) {
  const [tab, setTab] = useState<'preferences' | 'rules'>('preferences');
  const [ruleName, setRuleName] = useState('');
  const [matchField, setMatchField] = useState<'from' | 'subject' | 'body' | 'to'>('from');
  const [matchValue, setMatchValue] = useState('');
  const [action, setAction] = useState<'apply-label' | 'star' | 'archive' | 'mark-read'>('apply-label');
  const [actionValue, setActionValue] = useState(labels[0] || 'VIP');
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [serverUrlInput, setServerUrlInput] = useState(() => getConfiguredApiBaseUrl());

  if (!open) return null;

  const handleSettingChange = async (patch: Partial<MailSettings>) => {
    await updateSettings(patch);
    onStateUpdated();
  };

  const handleAddRule = async () => {
    if (!ruleName.trim() || !matchValue.trim()) {
      setRuleError('Provide both a rule name and a keyword to match.');
      return;
    }
    setRuleError(null);
    await createRule({
      name: ruleName.trim(),
      matchField,
      matchValue: matchValue.trim(),
      action,
      actionValue: action === 'apply-label' ? actionValue : undefined,
    });
    setRuleName('');
    setMatchValue('');
    onStateUpdated('Rule added and applied to inbox');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-h-[90dvh] sm:max-w-xl rounded-t-3xl sm:rounded-3xl bg-[#FFFEFB] dark:bg-[#191613] border border-[#E5DDD0] dark:border-[#2E2924] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDE6DA] dark:border-[#2C2722]">
          <h2
            id="settings-modal-title"
            className="font-serif-editorial text-xl font-bold text-[#1C1917] dark:text-[#FAF7F2]"
          >
            Settings & rules
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented tabs */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[#F3EDE3] dark:bg-[#24201B]">
            <button
              type="button"
              onClick={() => setTab('preferences')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                tab === 'preferences'
                  ? 'bg-white dark:bg-[#191613] text-[#1C1917] dark:text-[#FAF7F2] shadow-xs'
                  : 'text-[#6B655E]'
              }`}
            >
              Preferences
            </button>
            <button
              type="button"
              onClick={() => setTab('rules')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                tab === 'rules'
                  ? 'bg-white dark:bg-[#191613] text-[#1C1917] dark:text-[#FAF7F2] shadow-xs'
                  : 'text-[#6B655E]'
              }`}
            >
              Inbox rules ({rules.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'preferences' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="swipe-right" className="block text-xs font-semibold mb-1">
                    Swipe right gesture
                  </label>
                  <select
                    id="swipe-right"
                    value={settings.swipeRightAction}
                    onChange={(e) =>
                      handleSettingChange({ swipeRightAction: e.target.value as SwipeAction })
                    }
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                  >
                    {SWIPE_ACTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="swipe-left" className="block text-xs font-semibold mb-1">
                    Swipe left gesture
                  </label>
                  <select
                    id="swipe-left"
                    value={settings.swipeLeftAction}
                    onChange={(e) =>
                      handleSettingChange({ swipeLeftAction: e.target.value as SwipeAction })
                    }
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                  >
                    {SWIPE_ACTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] cursor-pointer">
                  <span className="text-sm font-medium">Evening Ink (Dark theme)</span>
                  <input
                    type="checkbox"
                    checked={settings.theme === 'evening-ink'}
                    onChange={(e) =>
                      handleSettingChange({
                        theme: e.target.checked ? 'evening-ink' : 'warm-paper',
                      })
                    }
                    className="h-4 w-4 accent-[#C85028]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] cursor-pointer">
                  <span className="text-sm font-medium">Compact message density</span>
                  <input
                    type="checkbox"
                    checked={settings.compactDensity}
                    onChange={(e) => handleSettingChange({ compactDensity: e.target.checked })}
                    className="h-4 w-4 accent-[#C85028]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] cursor-pointer">
                  <span className="text-sm font-medium">Show sender avatars</span>
                  <input
                    type="checkbox"
                    checked={settings.showAvatars}
                    onChange={(e) => handleSettingChange({ showAvatars: e.target.checked })}
                    className="h-4 w-4 accent-[#C85028]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] cursor-pointer">
                  <span className="text-sm font-medium">Auto-advance to next thread</span>
                  <input
                    type="checkbox"
                    checked={settings.autoAdvance}
                    onChange={(e) => handleSettingChange({ autoAdvance: e.target.checked })}
                    className="h-4 w-4 accent-[#C85028]"
                  />
                </label>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] space-y-2.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-semibold">Vacation auto-responder</span>
                  <input
                    type="checkbox"
                    checked={settings.vacationResponderEnabled}
                    onChange={(e) =>
                      handleSettingChange({ vacationResponderEnabled: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#C85028]"
                  />
                </label>
                <input
                  type="text"
                  value={settings.vacationSubject}
                  onChange={(e) => handleSettingChange({ vacationSubject: e.target.value })}
                  placeholder="Out of Office subject"
                  className="w-full min-h-[38px] px-3 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-xs"
                />
                <textarea
                  rows={2}
                  value={settings.vacationBody}
                  onChange={(e) => handleSettingChange({ vacationBody: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-xs"
                />
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] space-y-2">
                <label htmlFor="sync-server-url" className="block text-sm font-semibold">
                  Sync Server URL (optional)
                </label>
                <p className="text-xs text-[#78716C] dark:text-[#9A9287]">
                  Android connects directly to IMAP/SMTP servers on-device when blank. Optionally
                  enter your own hosted Helium Mail server URL to route sync through it.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="sync-server-url"
                    type="url"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    placeholder="https://your-helium-server.run.app"
                    className="flex-1 min-h-[38px] px-3 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setConfiguredApiBaseUrl(serverUrlInput);
                      onStateUpdated(
                        serverUrlInput.trim()
                          ? 'Sync server URL saved'
                          : 'Switched to on-device mailbox storage'
                      );
                    }}
                    className="min-h-[38px] px-3.5 rounded-xl bg-[#18181B] dark:bg-[#FAF7F2] text-white dark:text-[#18181B] text-xs font-semibold shrink-0"
                  >
                    Save
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] space-y-3">
                <h3 className="text-sm font-semibold">Create automation rule</h3>
                {ruleError && <p className="text-xs text-[#BE123C]">{ruleError}</p>}
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Rule name (e.g., Tag Flight Confirmations)"
                  className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={matchField}
                    onChange={(e) => setMatchField(e.target.value as any)}
                    className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-xs"
                  >
                    <option value="from">If From contains</option>
                    <option value="subject">If Subject contains</option>
                    <option value="body">If Body contains</option>
                    <option value="to">If To contains</option>
                  </select>
                  <input
                    type="text"
                    value={matchValue}
                    onChange={(e) => setMatchValue(e.target.value)}
                    placeholder="keyword..."
                    className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value as any)}
                    className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-xs"
                  >
                    <option value="apply-label">Apply label</option>
                    <option value="star">Star message</option>
                    <option value="archive">Auto-archive</option>
                    <option value="mark-read">Mark as read</option>
                  </select>
                  {action === 'apply-label' && (
                    <select
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#191613] border border-[#DDD4C6] dark:border-[#3A342D] text-xs"
                    >
                      {labels.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="min-h-[40px] px-4 rounded-xl bg-[#C85028] text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add & run rule</span>
                </button>
              </div>

              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{rule.name}</p>
                      <p className="text-xs text-[#78716C] truncate">
                        If {rule.matchField} contains “{rule.matchValue}” · {rule.action}
                        {rule.actionValue ? ` (${rule.actionValue})` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="checkbox"
                        aria-label={`Toggle ${rule.name}`}
                        checked={rule.enabled}
                        onChange={async (e) => {
                          await toggleRule(rule.id, e.target.checked);
                          onStateUpdated();
                        }}
                        className="h-4 w-4 accent-[#C85028]"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteRule(rule.id);
                          onStateUpdated();
                        }}
                        aria-label={`Delete rule ${rule.name}`}
                        className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-[#78716C] hover:text-[#BE123C]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
