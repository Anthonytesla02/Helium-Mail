import { AlertTriangle, Send, Trash2, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  icon?: 'send' | 'trash' | 'warning';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  icon = 'warning',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const IconComponent = icon === 'send' ? Send : icon === 'trash' ? Trash2 : AlertTriangle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#FFFEFB] dark:bg-[#1E1B18] border border-[#E5DDD0] dark:border-[#332E28] shadow-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                tone === 'danger'
                  ? 'bg-[#BE123C]/10 text-[#BE123C]'
                  : 'bg-[#C85028]/10 text-[#C85028]'
              }`}
            >
              <IconComponent className="h-5 w-5" />
            </div>
            <h2
              id="confirm-dialog-title"
              className="font-serif-editorial text-xl font-bold text-[#1C1917] dark:text-[#F5F0E8]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close confirmation dialog"
            className="min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-[#78716C] hover:bg-[#F3EDE3] dark:hover:bg-[#2C2722]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-[#57534E] dark:text-[#C4BCB0]">
          {description}
        </p>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] px-4 rounded-xl border border-[#DDD4C6] dark:border-[#3A342D] text-sm font-semibold text-[#44403C] dark:text-[#E7E0D4] hover:bg-[#F5EFE6] dark:hover:bg-[#2A2520] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              tone === 'danger'
                ? 'bg-[#BE123C] hover:bg-[#9F1239]'
                : 'bg-[#C85028] hover:bg-[#B04320]'
            }`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
