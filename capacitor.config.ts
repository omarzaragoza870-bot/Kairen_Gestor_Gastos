import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kairen.finanzas',
  appName: 'Kairen Finanzas',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
