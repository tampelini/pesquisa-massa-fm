import { lazy, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MassaApp } from './totem/MassaApp';
import { useMassa } from './core/store';

const AdminApp = lazy(() => import('./admin/AdminApp'));

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/** Duas rotas: o totem (padrão) e o painel administrativo em #/admin. */
function Router() {
  const { ready } = useMassa();
  const hash = useHashRoute();
  const isAdmin = hash.startsWith('#/admin');

  useEffect(() => {
    document.documentElement.classList.toggle('kiosk', !isAdmin);
  }, [isAdmin]);

  if (!ready) return <div className="massa-root" aria-busy="true" />;
  if (isAdmin) {
    return (
      <Suspense fallback={<div className="admin-root p-6">Carregando…</div>}>
        <AdminApp />
      </Suspense>
    );
  }
  return <MassaApp />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router />
    </ErrorBoundary>
  );
}
