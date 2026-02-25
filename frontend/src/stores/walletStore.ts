import { create } from 'zustand';

interface WalletState {
  connected: boolean;
  address: string | null;
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  connected: false,
  address: null,
  publicKey: null,
  connecting: false,
  error: null,

  connect: async () => {
    set({ connecting: true, error: null });
    
    try {
      // Check if OPWallet is installed
      if (typeof window !== 'undefined' && (window as any).opwallet) {
        const wallet = (window as any).opwallet;
        const accounts = await wallet.request({ method: 'eth_requestAccounts' });
        
        if (accounts && accounts.length > 0) {
          set({
            connected: true,
            address: accounts[0],
            publicKey: null,
            connecting: false,
          });
        }
      } else {
        set({
          error: 'OPWallet not detected. Please install OPWallet extension.',
          connecting: false,
        });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to connect wallet',
        connecting: false,
      });
    }
  },

  disconnect: () => {
    set({
      connected: false,
      address: null,
      publicKey: null,
      error: null,
    });
  },
}));
