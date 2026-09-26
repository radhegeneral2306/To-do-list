import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { ThemeProvider } from './theme/ThemeProvider.jsx'
import { ToastProvider } from './components/ui.jsx'
import './styles.css'

// Keep the app's own files on the phone so it opens instantly (production only).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}

// HashRouter (#/page) because GitHub Pages can't route /page URLs to index.html.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <HashRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </HashRouter>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
