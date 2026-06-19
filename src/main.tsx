import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AhrefsProvider } from '@/contexts/AhrefsContext'
import { SEOProvider } from '@/contexts/SEOContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SEOProvider>
        <AhrefsProvider>
          <App />
        </AhrefsProvider>
      </SEOProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
