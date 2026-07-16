import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { AhrefsProvider } from '@/contexts/AhrefsContext'
import { SEOProvider } from '@/contexts/SEOContext'
import AppWithAuth from './AppWithAuth'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SEOProvider>
          <AhrefsProvider>
            <AppWithAuth />
          </AhrefsProvider>
        </SEOProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
