import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth';
import { LangProvider } from './i18n';
import { SessionProvider } from './session';
import './style.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <LangProvider>
        <SessionProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </SessionProvider>
      </LangProvider>
    </QueryClientProvider>
  </StrictMode>,
);
