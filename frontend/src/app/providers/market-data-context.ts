import { createContext } from 'react';
import { type MarketDataClient } from '@/services/api';

export const MarketDataContext = createContext<MarketDataClient | null>(null);
