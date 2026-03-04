import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { PoolListPage } from './pages/PoolListPage';
import { PoolDetailPage } from './pages/PoolDetailPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { OptionDetailPage } from './pages/OptionDetailPage';
import { TransactionHistoryPage } from './pages/TransactionHistoryPage';
import { AboutPage } from './pages/AboutPage';
import { TransactionProvider } from './contexts/TransactionContext';

function App() {
  return (
    <TransactionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="pools" element={<PoolListPage />} />
            <Route path="pools/:address" element={<PoolDetailPage />} />
            <Route path="pools/:addr/options/:id" element={<OptionDetailPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="transactions" element={<TransactionHistoryPage />} />
            <Route path="about" element={<AboutPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TransactionProvider>
  );
}

export default App;
