import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kairen.finanzas',
  appName: 'Kairen Finanzas',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*.googleusercontent.com']
  },
  plugins: {
    Deeplinks: {
      androidPathPrefix: '/auth/callback'
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0B0F1A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
}

export default config