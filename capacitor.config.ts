import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'com.kairen.finanzas',
  appName: 'Kairen Finanzas',
  webDir: 'dist',
  server: {
    // iOS usa su esquema por defecto (capacitor://): WKWebView no admite https como esquema propio
    androidScheme: 'https',
    allowNavigation: ['*.googleusercontent.com']
  },
  plugins: {
    // @capacitor-firebase/messaging — solo aplica en iOS (notificaciones con la app abierta)
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
}
export default config
