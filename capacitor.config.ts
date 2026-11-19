import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.heliummail.client',
  appName: 'Helium Mail',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    allowNavigation: ['accounts.google.com', '*.googleapis.com', '*.firebaseapp.com', '*.run.app'],
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#FAF7F2',
      overlaysWebView: false,
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
};

export default config;
