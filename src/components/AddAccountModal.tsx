import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, MailPlus, ShieldCheck, X } from 'lucide-react';
import type { MailAccount, MailProvider } from '../types/mail';
import {
  ACCOUNT_COLOR_PALETTE,
  PROVIDER_PRESETS,
  validateAccountInput,
} from '../lib/mailLogic';
import { connectGmailWithGoogle } from '../lib/gmailAuth';
import { createAccount, syncAccountMessages, testImapConnection } from '../lib/api';

interface AddAccountModalProps {
  open: boolean;
  existingAccountCount: number;
  onClose: () => void;
  onAdded: (account: MailAccount, message?: string) => void;
}

export function AddAccountModal({
  open,
  existingAccountCount,
  onClose,
  onAdded,
}: AddAccountModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<MailProvider | null>(null);
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [color, setColor] = useState<string>(
    ACCOUNT_COLOR_PALETTE[existingAccountCount % ACCOUNT_COLOR_PALETTE.length]
  );
  const [signature, setSignature] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedProvider(null);
      setLabel('');
      setEmail('');
      setDisplayName('');
      setSignature('');
      setPassword('');
      setErrors({});
      setStatusMessage(null);
      setErrorBanner(null);
      setColor(ACCOUNT_COLOR_PALETTE[existingAccountCount % ACCOUNT_COLOR_PALETTE.length]);
    }
  }, [open, existingAccountCount]);

  if (!open) return null;

  const preset = PROVIDER_PRESETS.find((p) => p.id === selectedProvider) || null;

  const chooseProvider = (id: MailProvider) => {
    const p = PROVIDER_PRESETS.find((item) => item.id === id);
    setSelectedProvider(id);
    setErrors({});
    setErrorBanner(null);
    setStatusMessage(null);
    setColor(ACCOUNT_COLOR_PALETTE[existingAccountCount % ACCOUNT_COLOR_PALETTE.length]);
    if (p) {
      setImapHost(p.imapHost || '');
      setImapPort(p.imapPort || 993);
      setImapSecure(p.imapSecure ?? true);
      setSmtpHost(p.smtpHost || '');
      setSmtpPort(p.smtpPort || 465);
      setSmtpSecure(p.smtpSecure ?? true);
    }
  };

  const handleGoogleOAuth = async () => {
    setBusy(true);
    setErrorBanner(null);
    try {
      const gmail = await connectGmailWithGoogle();
      const chosenLabel = label.trim() || gmail.displayName.split(' ')[0] || 'Gmail';
      const { account } = await createAccount({
        label: chosenLabel,
        email: gmail.email,
        displayName: gmail.displayName,
        provider: 'gmail-oauth',
        color,
        signature: signature.trim() || `Best,\n${gmail.displayName}`,
      });
      await syncAccountMessages(account).catch(() => null);
      onAdded(account, `Connected ${gmail.email} via Google Sign-In`);
      onClose();
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('unauthorized-domain')) {
        setErrorBanner(
          'Google Sign-In is not authorized on this host domain. Use Gmail (App Password) or Instant Workspace Mailbox below to connect your Gmail account.'
        );
      } else if (
        msg.includes('access_denied') ||
        msg.includes('popup-closed-by-user') ||
        msg.includes('cancelled-popup-request')
      ) {
        setErrorBanner(
          'Google Sign-In was closed or blocked (Error 403: access_denied happens when a Gmail account is not yet in your Google Cloud Test Users list). You can add that email as a Test User in Google Cloud Console, or connect it immediately using Gmail App Password below.'
        );
      } else if (msg.includes('popup-blocked')) {
        setErrorBanner(
          'The Google account chooser popup was blocked by your browser. Allow popups for this site, or connect via Gmail App Password below.'
        );
      } else {
        setErrorBanner(msg || 'Google sign-in was cancelled or blocked.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTestImap = async () => {
    const validation = validateAccountInput({
      label: label || 'Test',
      email,
      displayName: displayName || 'User',
      provider: selectedProvider || 'custom-imap',
      color,
      imapHost,
      imapPort,
      imapSecure,
      smtpHost,
      smtpPort,
      smtpSecure,
      password,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setBusy(true);
    setErrorBanner(null);
    setStatusMessage(null);
    try {
      const res = await testImapConnection({
        email,
        password,
        imapHost,
        imapPort,
        imapSecure,
        smtpHost,
        smtpPort,
        smtpSecure,
      });
      setStatusMessage(res.message);
    } catch (err: any) {
      setErrorBanner(err?.message || 'Connection test failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitForm = async () => {
    if (!selectedProvider) return;
    const validation = validateAccountInput({
      label,
      email,
      displayName,
      provider: selectedProvider,
      color,
      signature,
      imapHost,
      imapPort,
      imapSecure,
      smtpHost,
      smtpPort,
      smtpSecure,
      password,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setBusy(true);
    setErrors({});
    setErrorBanner(null);
    try {
      const { account } = await createAccount({
        label,
        email,
        displayName,
        provider: selectedProvider,
        color,
        signature: signature.trim() || `Best,\n${displayName.trim()}`,
        imapHost: preset?.authMode === 'imap-smtp' ? imapHost : undefined,
        imapPort: preset?.authMode === 'imap-smtp' ? imapPort : undefined,
        imapSecure: preset?.authMode === 'imap-smtp' ? imapSecure : undefined,
        smtpHost: preset?.authMode === 'imap-smtp' ? smtpHost : undefined,
        smtpPort: preset?.authMode === 'imap-smtp' ? smtpPort : undefined,
        smtpSecure: preset?.authMode === 'imap-smtp' ? smtpSecure : undefined,
        password: preset?.authMode === 'imap-smtp' ? password : undefined,
      });

      if (preset?.authMode === 'imap-smtp') {
        await syncAccountMessages(account).catch(() => null);
      }

      onAdded(account, `Added ${account.label} (${account.email})`);
      onClose();
    } catch (err: any) {
      if (err?.fieldErrors) setErrors(err.fieldErrors);
      setErrorBanner(err?.message || 'Could not add account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-account-title"
    >
      <div className="w-full max-h-[92dvh] sm:max-w-xl rounded-t-3xl sm:rounded-3xl bg-[#FFFEFB] dark:bg-[#191613] border border-[#E5DDD0] dark:border-[#2E2924] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDE6DA] dark:border-[#2C2722]">
          <div className="flex items-center gap-2">
            {selectedProvider && (
              <button
                type="button"
                onClick={() => setSelectedProvider(null)}
                aria-label="Back to providers list"
                className="min-h-[40px] min-w-[40px] -ml-2 rounded-full flex items-center justify-center text-[#57534E] hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <h2
                id="add-account-title"
                className="font-serif-editorial text-xl font-bold text-[#1C1917] dark:text-[#FAF7F2]"
              >
                {preset ? preset.name : 'Add email account'}
              </h2>
              <p className="text-xs text-[#78716C] tabular-nums">
                {existingAccountCount} connected · Add unlimited accounts (10+ supported)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#57534E] hover:bg-[#F3EDE3] dark:hover:bg-[#24201B]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorBanner && (
            <div className="p-3.5 rounded-xl bg-[#BE123C]/10 border border-[#BE123C]/25 text-xs font-medium text-[#BE123C] space-y-2.5">
              <p>{errorBanner}</p>
              {selectedProvider === 'gmail-oauth' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => chooseProvider('gmail-imap')}
                    className="min-h-[36px] px-3 rounded-lg bg-[#C85028] text-white font-semibold"
                  >
                    Use Gmail App Password (IMAP)
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseProvider('local-sandbox')}
                    className="min-h-[36px] px-3 rounded-lg bg-white dark:bg-[#1E1B18] border border-[#DDD4C6] text-[#1C1917] dark:text-[#FAF7F2] font-semibold"
                  >
                    Create Local Mailbox
                  </button>
                </div>
              )}
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-[#15803D]/10 border border-[#15803D]/25 text-xs font-medium text-[#15803D] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {!preset ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PROVIDER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => chooseProvider(p.id)}
                  className="text-left p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#E7E0D4] dark:border-[#332E28] hover:border-[#C85028] transition-colors flex flex-col justify-between gap-2 min-h-[92px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-[#1C1917] dark:text-[#FAF7F2]">
                      {p.name}
                    </span>
                    <span className="text-[11px] font-medium text-[#C85028]">{p.badge}</span>
                  </div>
                  <p className="text-xs text-[#6B655E] dark:text-[#9A9287] leading-relaxed">
                    {p.description}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-[#6B655E] dark:text-[#9A9287] bg-[#FAF7F2] dark:bg-[#211D19] p-3 rounded-xl border border-[#E7E0D4] dark:border-[#332E28]">
                {preset.helpNote}
              </p>

              {/* Color Swatch Picker */}
              <div>
                <span className="block text-xs font-semibold text-[#57534E] dark:text-[#C4BCB0] mb-2">
                  Inbox color tag
                </span>
                <div className="flex flex-wrap gap-2">
                  {ACCOUNT_COLOR_PALETTE.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setColor(swatch)}
                      aria-label={`Select color ${swatch}`}
                      style={{ backgroundColor: swatch }}
                      className={`h-8 w-8 rounded-full transition-transform ${
                        color === swatch
                          ? 'ring-2 ring-offset-2 ring-[#1C1917] dark:ring-[#FAF7F2] scale-110'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {preset.authMode === 'oauth' ? (
                <div className="space-y-4 pt-1">
                  <div>
                    <label htmlFor="oauth-label" className="block text-xs font-semibold mb-1">
                      Account nickname (optional)
                    </label>
                    <input
                      id="oauth-label"
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g., Personal Gmail, Work Gmail, Side Project"
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                    />
                  </div>

                  <div className="pt-2 flex flex-col items-start gap-2">
                    <button
                      type="button"
                      onClick={handleGoogleOAuth}
                      disabled={busy}
                      className="gsi-material-button"
                    >
                      <div className="gsi-material-button-icon">
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          style={{ display: 'block' }}
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                        </svg>
                      </div>
                      <span>{busy ? 'Connecting...' : 'Sign in with Google'}</span>
                    </button>
                    <p className="text-[11px] text-[#78716C] leading-relaxed">
                      Tip: Seeing <span className="font-mono-code">Error 403: access_denied</span>? Only accounts listed under Google Cloud Console → OAuth consent screen → Test users can use Google Sign-In while in Testing mode.
                    </p>
                    <button
                      type="button"
                      onClick={() => chooseProvider('gmail-imap')}
                      className="text-xs font-semibold text-[#C85028] hover:underline text-left"
                    >
                      Connect any Gmail with an App Password instead (no 403 restriction) →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="acct-label" className="block text-xs font-semibold mb-1">
                        Inbox nickname
                      </label>
                      <input
                        id="acct-label"
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g., Client Ops"
                        className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                      />
                      {errors.label && <p className="mt-1 text-xs text-[#BE123C]">{errors.label}</p>}
                    </div>

                    <div>
                      <label htmlFor="acct-display" className="block text-xs font-semibold mb-1">
                        Your display name
                      </label>
                      <input
                        id="acct-display"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g., Prince Boateng"
                        className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                      />
                      {errors.displayName && (
                        <p className="mt-1 text-xs text-[#BE123C]">{errors.displayName}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="acct-email" className="block text-xs font-semibold mb-1">
                      Email address
                    </label>
                    <input
                      id="acct-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@domain.com"
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                    />
                    {errors.email && <p className="mt-1 text-xs text-[#BE123C]">{errors.email}</p>}
                  </div>

                  {preset.authMode === 'imap-smtp' && (
                    <>
                      <div>
                        <label htmlFor="acct-password" className="block text-xs font-semibold mb-1">
                          Password / App password
                        </label>
                        <input
                          id="acct-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••••••"
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                        />
                        {errors.password && (
                          <p className="mt-1 text-xs text-[#BE123C]">{errors.password}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="col-span-2">
                          <label htmlFor="imap-host" className="block text-xs font-semibold mb-1">
                            IMAP host
                          </label>
                          <input
                            id="imap-host"
                            type="text"
                            value={imapHost}
                            onChange={(e) => setImapHost(e.target.value)}
                            className="w-full min-h-[42px] px-3 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-xs font-mono-code"
                          />
                          {errors.imapHost && (
                            <p className="mt-1 text-xs text-[#BE123C]">{errors.imapHost}</p>
                          )}
                        </div>
                        <div>
                          <label htmlFor="imap-port" className="block text-xs font-semibold mb-1">
                            IMAP port
                          </label>
                          <input
                            id="imap-port"
                            type="number"
                            value={imapPort}
                            onChange={(e) => setImapPort(Number(e.target.value))}
                            className="w-full min-h-[42px] px-3 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-xs font-mono-code"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="col-span-2">
                          <label htmlFor="smtp-host" className="block text-xs font-semibold mb-1">
                            SMTP host
                          </label>
                          <input
                            id="smtp-host"
                            type="text"
                            value={smtpHost}
                            onChange={(e) => setSmtpHost(e.target.value)}
                            className="w-full min-h-[42px] px-3 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-xs font-mono-code"
                          />
                          {errors.smtpHost && (
                            <p className="mt-1 text-xs text-[#BE123C]">{errors.smtpHost}</p>
                          )}
                        </div>
                        <div>
                          <label htmlFor="smtp-port" className="block text-xs font-semibold mb-1">
                            SMTP port
                          </label>
                          <input
                            id="smtp-port"
                            type="number"
                            value={smtpPort}
                            onChange={(e) => setSmtpPort(Number(e.target.value))}
                            className="w-full min-h-[42px] px-3 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-xs font-mono-code"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label htmlFor="acct-signature" className="block text-xs font-semibold mb-1">
                      Default signature
                    </label>
                    <textarea
                      id="acct-signature"
                      rows={2}
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      placeholder="Best regards, ..."
                      className="w-full p-3 rounded-xl bg-[#FAF7F2] dark:bg-[#211D19] border border-[#DDD4C6] dark:border-[#3A342D] text-sm"
                    />
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
                    {preset.authMode === 'imap-smtp' && (
                      <button
                        type="button"
                        onClick={handleTestImap}
                        disabled={busy}
                        className="min-h-[44px] px-4 rounded-xl border border-[#DDD4C6] dark:border-[#3A342D] text-sm font-semibold flex items-center gap-2 hover:bg-[#FAF7F2] dark:hover:bg-[#24201B]"
                      >
                        <ShieldCheck className="h-4 w-4 text-[#15803D]" />
                        <span>Test connection</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSubmitForm}
                      disabled={busy}
                      className="min-h-[44px] px-5 rounded-xl bg-[#C85028] hover:bg-[#B04320] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                    >
                      <MailPlus className="h-4 w-4" />
                      <span>{busy ? 'Adding...' : 'Add account'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
