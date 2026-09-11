import { useContext } from 'react';
import { type MarketStream } from '@/services/websocket/market-stream';
import { MarketStreamContext } from './market-stream-context';

export function useMarketStream(): MarketStream {
  const stream = useContext(MarketStreamContext);
  if (!stream) throw new Error('useMarketStream must be used within MarketStreamProvider');
  return stream;
}
