import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { PoolListPage } from './pages/PoolListPage';
import { PoolDetailPage } from './pages/PoolDetailPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { OptionDetailPage } from './pages/OptionDetailPage';
import { TransactionHistoryPage } from './pages/TransactionHistoryPage';
import { AboutPage } from './pages/AboutPage';
import { TransactionProvider } from './contexts/TransactionContext';

function PoolRedirect() {
  const { address } = useParams();
  return <Navigate to={`/markets/${address ?? ''}`} replace />;
}

function App() {
  return (
    <TransactionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="markets" element={<PoolListPage />} />
            <Route path="markets/:address" element={<PoolDetailPage />} />
            <Route path="markets/:addr/options/:id" element={<OptionDetailPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            {/* Redirects from old routes */}
            <Route path="pools" element={<Navigate to="/markets" replace />} />
            <Route path="pools/:address" element={<PoolRedirect />} />
            <Route path="strategies" element={<Navigate to="/markets" replace />} />
            <Route path="transactions" element={<TransactionHistoryPage />} />
            <Route path="about" element={<AboutPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TransactionProvider>
  );
}

export default App;
