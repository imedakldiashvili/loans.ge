import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/auth';
import { Shell } from './layout/shell';
import { LoginPage } from './pages/login';
import { OrgsPage } from './pages/orgs';
import { ProductFieldsPage, ProductsPage } from './pages/products';
import { RefsPage } from './pages/refs';
import { SettingsPage } from './pages/settings';
import { UsersPage } from './pages/users';

/** Pages not built yet show this. */
const Soon = ({ title }: { title: string }) => (
  <div className="lp-top">
    <div className="lp-title">
      <h2>{title}</h2>
      <p>მზადდება</p>
    </div>
  </div>
);

export function App() {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!me) return <LoginPage />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/monitor" replace />} />
        <Route path="/monitor" element={<Soon title="მონიტორინგი" />} />
        <Route path="/apps" element={<Soon title="განაცხადები" />} />
        <Route path="/offers" element={<Soon title="შეთავაზებები" />} />
        <Route path="/orgs" element={<OrgsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id/:uid" element={<ProductFieldsPage />} />
        <Route path="/refs/:key" element={<RefsPage />} />
        <Route path="/users/:key" element={<UsersPage />} />
        <Route path="/settings/:key" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/monitor" replace />} />
      </Routes>
    </Shell>
  );
}
