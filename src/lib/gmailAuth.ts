import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
] as const;

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

// In-memory token store only (never persisted to localStorage or sessionStorage)
const tokenByEmail = new Map<string, string>();
let latestUser: User | null = null;
let isSigningIn = false;

export function initGmailAuth(
  onUserChange?: (user: User | null, emailsWithTokens: string[]) => void
): () => void {
  // Capture redirect sign-in result if returning from mobile WebView redirect flow
  getRedirectResult(auth)
    .then((result) => {
      if (!result) return;
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const email = (result.user.email || '').toLowerCase();
      if (credential?.accessToken && email) {
        tokenByEmail.set(email, credential.accessToken);
        latestUser = result.user;
        if (onUserChange) onUserChange(result.user, Array.from(tokenByEmail.keys()));
      }
    })
    .catch(() => {
      // Redirect result ignored if none pending
    });

  return onAuthStateChanged(auth, (user) => {
    latestUser = user;
    if (!user && !isSigningIn) {
      tokenByEmail.clear();
    }
    if (onUserChange) {
      onUserChange(user, Array.from(tokenByEmail.keys()));
    }
  });
}

export interface GmailConnectResult {
  email: string;
  displayName: string;
  accessToken: string;
  photoURL?: string;
}

export async function connectGmailWithGoogle(): Promise<GmailConnectResult> {
  isSigningIn = true;
  try {
    const provider = new GoogleAuthProvider();
    for (const scope of GMAIL_SCOPES) {
      provider.addScope(scope);
    }
    provider.setCustomParameters({
      prompt: 'select_account',
    });

    let result;
    try {
      result = await signInWithPopup(auth, provider);
    } catch (popupErr: any) {
      if (
        popupErr?.code === 'auth/operation-not-supported-in-this-environment' ||
        popupErr?.code === 'auth/popup-blocked'
      ) {
        await signInWithRedirect(auth, provider);
        throw new Error('Redirecting to Google Sign-In…');
      }
      throw popupErr;
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in succeeded but no Gmail access token was returned.');
    }

    const email = (result.user.email || '').toLowerCase();
    if (!email) {
      throw new Error('Could not read the Gmail address from your Google account.');
    }

    tokenByEmail.set(email, credential.accessToken);
    latestUser = result.user;

    return {
      email,
      displayName: result.user.displayName || email.split('@')[0],
      accessToken: credential.accessToken,
      photoURL: result.user.photoURL || undefined,
    };
  } finally {
    isSigningIn = false;
  }
}

export function getGmailToken(email: string): string | null {
  return tokenByEmail.get(email.toLowerCase()) ?? null;
}

export function getConnectedGmailEmails(): string[] {
  return Array.from(tokenByEmail.keys());
}

export function getCurrentFirebaseUser(): User | null {
  return latestUser;
}

export async function signOutAllGmail(): Promise<void> {
  tokenByEmail.clear();
  await signOut(auth);
}
