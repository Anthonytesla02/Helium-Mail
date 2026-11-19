import { useRef, useState, type PointerEvent } from 'react';
import { Archive, Check, Clock, MailOpen, Paperclip, Star, Trash2 } from 'lucide-react';
import type { EmailThread, MailAccount, SwipeAction } from '../types/mail';
import { formatMessageTimestamp, getInitialLetter } from '../lib/mailLogic';
import { triggerSwipeHaptic } from '../lib/nativeBridge';

interface ThreadRowProps {
  thread: EmailThread;
  account?: MailAccount;
  isSelected: boolean;
  isChecked: boolean;
  selectionMode: boolean;
  compactDensity: boolean;
  showAvatars: boolean;
  swipeRightAction: SwipeAction;
  swipeLeftAction: SwipeAction;
  onOpen: (thread: EmailThread) => void;
  onToggleCheck: (thread: EmailThread) => void;
  onToggleStar: (thread: EmailThread) => void;
  onSwipeAction: (thread: EmailThread, action: SwipeAction) => void;
}

function getSwipeVisual(action: SwipeAction) {
  switch (action) {
    case 'delete':
      return { bg: 'bg-[#DC2626]', Icon: Trash2 };
    case 'archive':
      return { bg: 'bg-[#2E8B57]', Icon: Archive };
    case 'star':
      return { bg: 'bg-[#CA8A04]', Icon: Star };
    case 'snooze':
      return { bg: 'bg-[#2563EB]', Icon: Clock };
    case 'read':
    default:
      return { bg: 'bg-[#475569]', Icon: MailOpen };
  }
}

export function ThreadRow({
  thread,
  account,
  isSelected,
  isChecked,
  selectionMode,
  compactDensity,
  showAvatars,
  swipeRightAction,
  swipeLeftAction,
  onOpen,
  onToggleCheck,
  onToggleStar,
  onSwipeAction,
}: ThreadRowProps) {
  const latest = thread.latestMessage;
  const senderLabel = latest.from.name || latest.from.email;
  const avatarColor = account?.color || '#C85028';

  const [dragX, setDragX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const dragXRef = useRef(0);
  const hapticFiredRef = useRef(false);
  const axisLockedRef = useRef<'x' | 'y' | null>(null);
  const draggingRef = useRef(false);

  const SWIPE_THRESHOLD = 72;
  const MAX_DRAG = 132;

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-no-swipe="true"]')) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    dragXRef.current = 0;
    hapticFiredRef.current = false;
    axisLockedRef.current = null;
    draggingRef.current = false;
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null || startYRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    if (!axisLockedRef.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) >= Math.abs(dy)) {
        axisLockedRef.current = 'x';
        draggingRef.current = true;
        setIsSwiping(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if synthetic event lacks pointerId
        }
      } else {
        axisLockedRef.current = 'y';
        return;
      }
    }

    if (axisLockedRef.current === 'x') {
      const clamped = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
      dragXRef.current = clamped;
      setDragX(clamped);
      if (Math.abs(clamped) >= SWIPE_THRESHOLD && !hapticFiredRef.current) {
        hapticFiredRef.current = true;
        triggerSwipeHaptic();
      } else if (Math.abs(clamped) < SWIPE_THRESHOLD) {
        hapticFiredRef.current = false;
      }
    }
  };

  const finishSwipe = (e: PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const currentDrag = dragXRef.current;

    if (axisLockedRef.current === 'x') {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    }

    if (currentDrag >= SWIPE_THRESHOLD) {
      onSwipeAction(thread, swipeRightAction);
    } else if (currentDrag <= -SWIPE_THRESHOLD) {
      onSwipeAction(thread, swipeLeftAction);
    }

    startXRef.current = null;
    startYRef.current = null;
    dragXRef.current = 0;
    axisLockedRef.current = null;
    setIsSwiping(false);
    setDragX(0);
    window.setTimeout(() => {
      draggingRef.current = false;
    }, 60);
  };

  const handleRowClick = () => {
    if (draggingRef.current) return;
    if (selectionMode) {
      onToggleCheck(thread);
    } else {
      onOpen(thread);
    }
  };

  const rightVisual = getSwipeVisual(swipeRightAction);
  const leftVisual = getSwipeVisual(swipeLeftAction);
  const activeVisual = dragX > 0 ? rightVisual : leftVisual;
  const ActiveIcon = activeVisual.Icon;
  const isThresholdMet = Math.abs(dragX) >= SWIPE_THRESHOLD;

  return (
    <div className="relative mx-2 my-0.5 rounded-3xl overflow-hidden">
      {/* Curved Pill Swipe Backdrop matching reference screenshots */}
      {dragX !== 0 && (
        <div
          className={`absolute inset-0 rounded-3xl flex items-center text-white ${activeVisual.bg} ${
            dragX > 0 ? 'justify-start pl-6' : 'justify-end pr-6'
          }`}
          aria-hidden="true"
        >
          <ActiveIcon
            className={`h-6 w-6 transition-transform duration-150 ${
              isThresholdMet ? 'scale-115' : 'scale-95 opacity-90'
            }`}
          />
        </div>
      )}

      <div
        data-testid={`thread-row-${thread.threadId}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: isSwiping ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`group relative touch-pan-y select-none flex items-start gap-3.5 px-3 transition-colors border-b border-[#EDE6DA]/75 dark:border-[#2A2520] ${
          dragX !== 0
            ? 'rounded-3xl ring-1 ring-[#E4DDD0] dark:ring-[#2E2924] shadow-sm border-transparent'
            : ''
        } ${compactDensity ? 'py-2.5' : 'py-3.5'} ${
          isSelected
            ? 'bg-[#F2EAE0] dark:bg-[#28231E]'
            : isChecked
            ? 'bg-[#C85028]/8 dark:bg-[#C85028]/15'
            : 'bg-[#FAF7F2] dark:bg-[#141210] hover:bg-[#F5EFE6] dark:hover:bg-[#1C1916]'
        }`}
      >
        {showAvatars && (
          <button
            type="button"
            data-no-swipe="true"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheck(thread);
            }}
            aria-label={isChecked ? `Deselect ${thread.subject}` : `Select ${thread.subject}`}
            style={{ backgroundColor: isChecked ? '#18181B' : avatarColor }}
            className="mt-0.5 h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-white font-semibold text-base shadow-xs transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85028]"
          >
            {isChecked ? <Check className="h-5 w-5" /> : getInitialLetter(senderLabel)}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={handleRowClick}
            className="w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85028] rounded-md"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`truncate text-[15.5px] ${
                    thread.isUnread
                      ? 'font-bold text-[#181615] dark:text-[#FAF7F2]'
                      : 'font-medium text-[#292524] dark:text-[#D6CFC5]'
                  }`}
                >
                  {senderLabel}
                </span>
                {thread.messages.length > 1 && (
                  <span className="text-xs font-medium text-[#78716C] tabular-nums shrink-0">
                    {thread.messages.length}
                  </span>
                )}
              </div>

              <span
                className={`text-[12.5px] shrink-0 tabular-nums ${
                  thread.isUnread
                    ? 'font-semibold text-[#C85028]'
                    : 'font-normal text-[#78716C]'
                }`}
              >
                {formatMessageTimestamp(latest.timestamp)}
              </span>
            </div>

            <div className="mt-0.5 flex items-center gap-1.5 pr-9">
              <span
                className={`truncate text-[14.5px] ${
                  thread.isUnread
                    ? 'font-semibold text-[#1C1917] dark:text-[#F5F0E8]'
                    : 'font-normal text-[#44403C] dark:text-[#B8B0A4]'
                }`}
              >
                {latest.subject}
              </span>
              {thread.hasAttachments && (
                <Paperclip className="h-3.5 w-3.5 text-[#78716C] shrink-0" aria-label="Has attachment" />
              )}
            </div>

            <p className="mt-0.5 pr-9 truncate text-[13.5px] text-[#6B655E] dark:text-[#9A9287]">
              {latest.snippet}
            </p>

            <div className="mt-1 flex items-center gap-2 text-[12px] text-[#78716C] dark:text-[#8A8277] truncate">
              <span className="truncate">{account?.email || latest.to[0]?.email}</span>
              {thread.labels.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate font-medium text-[#57534E] dark:text-[#A8A095]">
                    {thread.labels.join(' · ')}
                  </span>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Right star toggle + desktop quick hover actions */}
        <div className="flex flex-col items-end justify-between self-stretch shrink-0">
          <div className="hidden lg:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              data-no-swipe="true"
              onClick={(e) => {
                e.stopPropagation();
                onSwipeAction(thread, 'archive');
              }}
              aria-label={`Archive ${thread.subject}`}
              title="Archive"
              className="h-8 w-8 rounded-full flex items-center justify-center text-[#78716C] hover:bg-[#E7DFD3] dark:hover:bg-[#2F2A24] hover:text-[#1C1917]"
            >
              <Archive className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-no-swipe="true"
              onClick={(e) => {
                e.stopPropagation();
                onSwipeAction(thread, 'delete');
              }}
              aria-label={`Delete ${thread.subject}`}
              title="Move to Trash"
              className="h-8 w-8 rounded-full flex items-center justify-center text-[#78716C] hover:bg-[#E7DFD3] dark:hover:bg-[#2F2A24] hover:text-[#BE123C]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            data-no-swipe="true"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(thread);
            }}
            aria-label={thread.isStarred ? `Unstar ${thread.subject}` : `Star ${thread.subject}`}
            className="mt-auto min-h-[40px] min-w-[40px] -mr-2 flex items-center justify-center rounded-full text-[#78716C] hover:bg-[#EDE6DA] dark:hover:bg-[#2A2520]"
          >
            <Star
              className={`h-[18px] w-[18px] transition-colors ${
                thread.isStarred
                  ? 'fill-[#EAB308] text-[#EAB308]'
                  : 'text-[#8C847A] hover:text-[#57534E]'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
