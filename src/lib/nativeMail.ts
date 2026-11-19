import { Capacitor, registerPlugin } from '@capacitor/core';
import type { EmailMessage } from '../types/mail';

export interface NativeTestConnectionOptions {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

export interface NativeSyncImapOptions {
  accountId: string;
  email: string;
  displayName: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  limit?: number;
}

export interface NativeSendSmtpOptions {
  email: string;
  displayName: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
}

export interface NativeMailPluginInterface {
  testConnection(
    options: NativeTestConnectionOptions
  ): Promise<{ ok: boolean; message: string }>;
  syncImap(options: NativeSyncImapOptions): Promise<{ messages: EmailMessage[] }>;
  sendSmtp(options: NativeSendSmtpOptions): Promise<{ ok: boolean }>;
}

const NativeMailPlugin = registerPlugin<NativeMailPluginInterface>('NativeMail');

export function isNativeMailSupported(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === 'android' &&
      Capacitor.isPluginAvailable('NativeMail')
    );
  } catch {
    return false;
  }
}

export { NativeMailPlugin };
