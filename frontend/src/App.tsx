import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { TradePage } from './pages/TradePage';
import { ChainPage } from './pages/ChainPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { OptionDetailPage } from './pages/OptionDetailPage';
import { TransactionHistoryPage } from './pages/TransactionHistoryPage';
import { AboutPage } from './pages/AboutPage';
import { TransactionProvider } from './contexts/TransactionContext';

/** Redirect /markets/:address → /chain?market=:address */
function MarketRedirect() {
  const { address } = useParams();
  return <Navigate to={address ? `/chain?market=${address}` : '/chain'} replace />;
}

/** Redirect /pools/:address → /chain?market=:address */
function PoolRedirect() {
  const { address } = useParams();
  return <Navigate to={address ? `/chain?market=${address}` : '/chain'} replace />;
}

function App() {
  return (
    <TransactionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="trade" element={<TradePage />} />
            <Route path="chain" element={<ChainPage />} />
            <Route path="chain/:addr/options/:id" element={<OptionDetailPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="transactions" element={<TransactionHistoryPage />} />
            <Route path="about" element={<AboutPage />} />
            {/* Redirects from old routes */}
            <Route path="markets" element={<Navigate to="/chain" replace />} />
            <Route path="markets/:address" element={<MarketRedirect />} />
            <Route path="markets/:addr/options/:id" element={<OptionDetailPage />} />
            <Route path="pools" element={<Navigate to="/chain" replace />} />
            <Route path="pools/:address" element={<PoolRedirect />} />
            <Route path="strategies" element={<Navigate to="/trade" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TransactionProvider>
  );
}

export default App;
