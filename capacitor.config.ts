import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kairen.finanzas',
  appName: 'Kairen Finanzas',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // App Links: usa el dominio real de Vercel en vez del esquema personalizado
    // com.kairen.finanzas:// — Android verifica que el dominio es dueño de la
    // app a través del archivo /.well-known/assetlinks.json en Vercel.
    Deeplinks: {
      androidPathPrefix: '/auth/callback'
    }
  }
}

export default config