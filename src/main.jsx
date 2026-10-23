import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { esNativo } from './lib/capacitor.js'
import './styles/theme.css'

// El service worker es solo para la PWA web. En la app nativa los archivos ya
// vienen dentro del APK/IPA, y un service worker serviría la versión anterior
// en caché después de cada actualización; se quita si quedó de antes.
if (esNativo()) {
  navigator.serviceWorker?.getRegistrations()
    .then(registros => registros.forEach(registro => registro.unregister()))
    .catch(() => {})
} else {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
