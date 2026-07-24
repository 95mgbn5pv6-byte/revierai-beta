import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'at.revierai.app',
  appName: 'RevierAI',
  webDir: 'www',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#07100b'
  }
};

export default config;
