import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/auth';
import { Shell } from './layout/shell';
import { AppsPage, ComparePage } from './pages/apps';
import { LoginPage } from './pages/login';
import { LogsPage } from './pages/logs';
import { MonitorPage } from './pages/monitor';
import { OffersPage } from './pages/offers';
import { OrgsPage } from './pages/orgs';
import { ProductFieldsPage, ProductsPage } from './pages/products';
import { RefsPage } from './pages/refs';
import { SettingsPage } from './pages/settings';
import { UsersPage } from './pages/users';

export function App() {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!me) return <LoginPage />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/monitor" replace />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/apps/:id/:uid/compare" element={<ComparePage />} />
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/orgs" element={<OrgsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id/:uid" element={<ProductFieldsPage />} />
        <Route path="/refs/:key" element={<RefsPage />} />
        <Route path="/users/:key" element={<UsersPage />} />
        <Route path="/settings/log" element={<Navigate to="/logs/actions" replace />} />
        <Route path="/settings/:key" element={<SettingsPage />} />
        <Route path="/logs/:key" element={<LogsPage />} />
        <Route path="*" element={<Navigate to="/monitor" replace />} />
      </Routes>
    </Shell>
  );
}
