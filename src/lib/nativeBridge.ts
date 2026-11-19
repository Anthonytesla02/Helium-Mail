import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function syncNativeStatusBar(theme: 'warm-paper' | 'evening-ink'): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await StatusBar.setStyle({
      style: theme === 'evening-ink' ? Style.Dark : Style.Light,
    });
    await StatusBar.setBackgroundColor({
      color: theme === 'evening-ink' ? '#141210' : '#FAF7F2',
    });
  } catch {
    // Ignore on platforms where StatusBar method is unsupported
  }
}

export async function triggerSwipeHaptic(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Ignore if haptics unavailable
  }
}

export function registerNativeBackHandler(onBack: () => boolean): () => void {
  if (!isNativeApp()) return () => {};
  let removed = false;
  const handlePromise = CapApp.addListener('backButton', ({ canGoBack }) => {
    const handled = onBack();
    if (handled) return;
    if (canGoBack) {
      window.history.back();
    } else {
      CapApp.minimizeApp().catch(() => CapApp.exitApp());
    }
  });

  return () => {
    if (removed) return;
    removed = true;
    handlePromise.then((handle) => handle.remove()).catch(() => {});
  };
}
