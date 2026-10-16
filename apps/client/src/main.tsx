import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth';
import { SessionProvider } from './session';
import './style.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
