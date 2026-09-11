import { createContext } from 'react';
import { type MarketStream } from '@/services/websocket/market-stream';

export const MarketStreamContext = createContext<MarketStream | null>(null);
