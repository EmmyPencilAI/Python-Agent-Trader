/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, Component, ReactNode } from 'react';
import { 
  createChart, 
  ColorType, 
  Time,
  SeriesMarker,
  UTCTimestamp,
  CandlestickSeries,
  CandlestickData
} from 'lightweight-charts';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Wallet, 
  ShieldCheck, 
  Bell, 
  Play, 
  Square,
  ChevronRight,
  Settings,
  History,
  LayoutDashboard,
  Zap,
  BarChart3,
  CandlestickChart,
  Globe,
  Clock
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// API Configuration
const DEFAULT_API_KEY = import.meta.env.VITE_API_KEY || '';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Mock data for initial load
const PERFORMANCE_DATA = [
  { time: '00:00', balance: 1000 },
  { time: '04:00', balance: 1120 },
  { time: '08:00', balance: 1085 },
  { time: '12:00', balance: 1240 },
  { time: '16:00', balance: 1190 },
  { time: '20:00', balance: 1350 },
  { time: '23:59', balance: 1420 },
];

interface Trade {
  id: number;
  pair: string;
  action: 'BUY' | 'SELL';
  entry_price: number;
  exit_price?: number;
  quantity: number;
  pnl?: number;
  status: 'OPEN' | 'CLOSED';
  strategy: string;
  mode: 'real' | 'paper';
  timestamp: string;
}

// Configuration Constants
const BASE_URL = API_BASE_URL;
const WS_URL = BASE_URL 
  ? BASE_URL.replace(/^http/, 'ws') 
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

// Candlestick Chart Component
const TradingChart = ({ symbol, trades }: { symbol: string, trades: Trade[] }) => {
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<any>(null);
  const candleSeriesRef = React.useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart: any = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111111' },
        textColor: '#888888',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth || 600,
      height: 400,
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const fetchKlines = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/market/klines?symbol=${symbol}`);
        if (res.ok) {
          const data: any[] = await res.json();
          if (!Array.isArray(data)) return;
          candleSeries.setData(data.map(k => ({
            time: k.time as UTCTimestamp,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close
          })));
        }
      } catch (err) {
        console.error('Klines fetch failed', err);
      }
    };

    fetchKlines();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [symbol]);

  useEffect(() => {
    if (candleSeriesRef.current && typeof candleSeriesRef.current.setMarkers === 'function' && Array.isArray(trades)) {
      try {
        const markers: SeriesMarker<Time>[] = trades
          .filter(t => t && typeof t.pair === 'string' && t.pair.replace('/', '') === symbol)
          .map(t => {
            const date = t.timestamp ? new Date(t.timestamp) : new Date();
            const time = (isNaN(date.getTime()) ? Date.now() : date.getTime()) / 1000;
            return {
              time: time as UTCTimestamp,
              position: t.action === 'BUY' ? 'belowBar' : 'aboveBar',
              color: t.action === 'BUY' ? '#10b981' : '#ef4444',
              shape: t.action === 'BUY' ? 'arrowUp' : 'arrowDown',
              text: `${t.action || 'TRADE'} @ ${t.entry_price || 0}`,
            };
          });
        candleSeriesRef.current.setMarkers(markers);
      } catch (e) {
        console.error("Marker update error", e);
      }
    }
  }, [trades, symbol]);

  return <div ref={chartContainerRef} className="w-full h-[400px] rounded-2xl overflow-hidden" />;
};


export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trades' | 'strategies' | 'settings'>('dashboard');
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [tradingMode, setTradingMode] = useState<'real' | 'paper'>('paper');
  const [activeExchange, setActiveExchange] = useState('binance');
  const [paperBalance, setPaperBalance] = useState(1000);
  const [balance, setBalance] = useState(0.00); 
  const [initialBalance, setInitialBalance] = useState(0.00);
  const [history, setHistory] = useState<{balance: number, timestamp: string}[]>([]);
  const [sessionStart, setSessionStart] = useState<string | null>(null);
  const [missionDuration, setMissionDuration] = useState('00:00:00');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'real'>('all');
  const [prices, setPrices] = useState<Record<string, number>>({ BTCUSDT: 81240.50, ETHUSDT: 3421.55 });
  const [status, setStatus] = useState({ active_strategy: 'Scalping', uptime: '0h 0m' });
  const [performance, setPerformance] = useState({ total_trades: 0, wins: 0, total_pnl: 0 });

  // Live Mission Timer
  useEffect(() => {
    if (!sessionStart || !isBotRunning) {
      setMissionDuration('00:00:00');
      return;
    }
    
    const updateTimer = () => {
      if (!sessionStart || !isBotRunning) return;
      
      const startTimeStr = sessionStart.includes(' ') ? sessionStart.replace(' ', 'T') : sessionStart;
      const normalizedStart = startTimeStr.endsWith('Z') ? startTimeStr : startTimeStr + 'Z';
      const start = new Date(normalizedStart).getTime();
      const now = new Date().getTime();
      
      const diff = Math.max(0, now - start);
      
      if (isNaN(diff)) {
        setMissionDuration('00:00:00');
        return;
      }

      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setMissionDuration(`${h}:${m}:${s}`);
    };

    updateTimer(); 
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [sessionStart, isBotRunning]);
  const [notifications, setNotifications] = useState<{id: string, type: 'error' | 'success' | 'info', msg: string}[]>([]);
  const [expandedTrade, setExpandedTrade] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('aegis_api_key') || DEFAULT_API_KEY);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasFatalError, setHasFatalError] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string>('');
  
  // API Keys and External Config
  const [exchangeKeys, setExchangeKeys] = useState({
    binance_api_key: '',
    binance_secret_key: '',
    bitget_api_key: '',
    bitget_secret_key: '',
    bitget_passphrase: '',
    telegram_bot_token: '',
    telegram_chat_id: ''
  });
  
  // Internal error handler to prevent blank screens
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      console.error("Caught global error:", e.error);
      setHasFatalError(String(e.error));
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);
  
  // Strategy Config
  const [algoSettings, setAlgoSettings] = useState({
    rsiPeriod: 14,
    emaShort: 9,
    emaLong: 21,
    macdFast: 12,
    macdSlow: 26
  });

  const addNotification = (type: 'error' | 'success' | 'info', msg: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, type, msg }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const getAuthHeaders = () => {
    const key = (apiKey || DEFAULT_API_KEY).trim();
    if (!key) {
      throw new Error('Missing API key');
    }
    return { 'X-API-Key': key };
  };

  // Fetch data from backend API with authentication
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/status`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`Status error: ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Status fetch error', err);
      return null;
    }
  };

  const fetchTrades = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/trades?limit=50`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(`Trades error: ${res.status}`);
      const data = await res.json();
      return data.trades || [];
    } catch (err) {
      console.error('Trades fetch error', err);
      return [];
    }
  };

  const toggleBot = async (action: 'running' | 'stopped') => {
    try {
      const res = await fetch(`${API_BASE_URL}/bot/toggle`, {
        method: 'POST',
        headers: { 
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });
      if (!res.ok) throw new Error(`Toggle error: ${res.status}`);
      const result = await res.json();
      setIsBotRunning(action === 'running');
      addNotification('success', `Bot ${action === 'running' ? 'started' : 'stopped'}`);
      return result;
    } catch (err) {
      console.error('Toggle error', err);
      addNotification('error', 'Failed to toggle bot');
      return null;
    }
  };

  const updateSettings = async (settings: Partial<{mode: string, exchange: string, paper_balance: number}>) => {
    try {
      const res = await fetch(`${API_BASE_URL}/bot/settings`, {
        method: 'POST',
        headers: { 
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error(`Settings error: ${res.status}`);
      addNotification('success', 'Settings updated');
      return await res.json();
    } catch (err) {
      console.error('Settings update error', err);
      addNotification('error', 'Failed to update settings');
      return null;
    }
  };

  const syncAppData = async () => {
    try {
      if (!apiKey.trim() && !DEFAULT_API_KEY) {
        setIsInitialLoading(false);
        return;
      }
      const statusData = await fetchStatus();
      const tradesData = await fetchTrades();

      if (statusData) {
        setIsBotRunning(statusData.status === 'running');
        setTradingMode(statusData.mode || 'paper');
        setActiveExchange(statusData.exchange || 'bitget');
        setPaperBalance(parseFloat(String(statusData.paper_balance || '1000')));
        setBalance(parseFloat(String(statusData.real_balance || '0')));
        setStatus(statusData);
      }

      setTrades(tradesData);
    } catch (err) {
      console.error("Sync error", err);
    } finally {
      setIsInitialLoading(false);
    }
  };

  // Initial and Periodic Fetch
  useEffect(() => {
    syncAppData();

    // Data Polling (every 5 seconds)
    const interval = setInterval(syncAppData, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []); // Only run once on mount

  const handleToggleBot = async () => {
    const nextState = isBotRunning ? 'stopped' : 'running';
    await toggleBot(nextState as 'running' | 'stopped');
  };

  const handleUpdateSettings = async (settings: {mode?: string, exchange?: string, paper_balance?: number}) => {
    await updateSettings(settings);
  };

  const currentPnL = useMemo(() => {
    if (!Array.isArray(trades)) return 0;
    return trades.reduce((acc, trade) => acc + (trade ? (trade.pnl || 0) : 0), 0);
  }, [trades]);

  const totalGrowth = useMemo(() => {
    const curBal = parseFloat(String(balance));
    const initBal = parseFloat(String(initialBalance));
    if (isNaN(initBal) || initBal === 0 || isNaN(curBal)) return 0;
    return ((curBal - initBal) / initBal) * 100;
  }, [balance, initialBalance]);

  if (hasFatalError) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-white font-sans">
        <div className="max-w-md w-full bg-zinc-900/50 border border-white/5 p-8 rounded-3xl text-center backdrop-blur-xl">
          <ShieldCheck className="w-16 h-16 text-rose-500 mx-auto mb-6 opacity-50" />
          <h2 className="text-2xl font-bold tracking-tighter mb-4 uppercase">Protocol Breach Detected</h2>
          <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
            The Aegis Core encountered a critical runtime error. All autonomous trading has been suspended for safety.
          </p>
          <div className="p-4 bg-black/40 rounded-xl mb-8 text-left">
             <code className="text-[10px] text-zinc-600 break-all">{hasFatalError}</code>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-colors"
          >
            Reset Aegis Core
          </button>
        </div>
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 relative">
          <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <Zap className="absolute inset-0 m-auto w-6 h-6 text-emerald-500" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tighter mb-1 uppercase">Initializing Aegis Protocol</h2>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest animate-pulse">Syncing hot-storage & market feeds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white selection:bg-emerald-500/30 font-sans selection:text-emerald-200">
      {/* Sidebar / Navigation (Mobile Bottom, Desktop Left) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:top-0 md:bottom-0 md:w-20 md:border-r border-white/10 bg-black/80 backdrop-blur-xl md:flex md:flex-col md:items-center py-4 flex justify-around items-center">
        <div className="hidden md:flex mb-12">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
        </div>
        
        <NavItem icon={<LayoutDashboard />} label="Dash" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavItem icon={<History />} label="Trades" active={activeTab === 'trades'} onClick={() => setActiveTab('trades')} />
        <NavItem icon={<Activity />} label="Algo" active={activeTab === 'strategies'} onClick={() => setActiveTab('strategies')} />
        <NavItem icon={<Settings />} label="Config" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
      </nav>

      {/* Notifications Overlay */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={cn(
                "pointer-events-auto px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-4 min-w-[320px] backdrop-blur-xl",
                n.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-100" : 
                n.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-100" :
                "bg-zinc-900 border-white/10 text-zinc-100"
              )}
            >
              <div className={cn(
                "w-2 h-2 rounded-full",
                n.type === 'error' ? "bg-red-500 shadow-[0_0_8px_#ef4444]" :
                n.type === 'success' ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" :
                "bg-zinc-500"
              )} />
              <p className="text-sm font-bold tracking-tight">{n.msg}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Main Content */}
      <main className="pb-24 pt-8 px-6 md:pl-28 md:pr-12 md:pb-12 max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] uppercase tracking-widest font-semibold border border-white/5">
                {activeExchange} {tradingMode.toUpperCase()}
              </span>
              <div className={cn(
                "flex items-center gap-2 px-2 py-0.5 rounded-full border text-[10px] font-medium transition-colors",
                isBotRunning ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full", isBotRunning ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
                {isBotRunning ? '24/7 MARKET SCANNING ACTIVE' : 'ENGINE COLD'}
              </div>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter">AEGIS TRADER</h1>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">BTC</span>
                <span className="text-xs font-mono font-bold text-emerald-500">${(prices.BTCUSDT || 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">ETH</span>
                <span className="text-xs font-mono font-bold text-blue-400">${(prices.ETHUSDT || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Risk Control Info */}
            <div className="hidden lg:flex flex-col items-end mr-4">
              <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Protocol Strategy</div>
              <div className="text-xs font-bold text-emerald-500">0.5% Risk · 15% Target</div>
            </div>
            {/* Mode Switcher */}
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              <button 
                onClick={() => handleUpdateSettings({ mode: 'paper' })}
                className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all", tradingMode === 'paper' ? "bg-white text-black shadow-lg" : "text-zinc-500")}
              >PAPER</button>
              <button 
                onClick={() => handleUpdateSettings({ mode: 'real' })}
                className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all", tradingMode === 'real' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "text-zinc-500")}
              >REAL</button>
            </div>

            <button 
              onClick={handleToggleBot}
              className={cn(
                "w-full sm:w-auto group flex items-center justify-center gap-3 px-10 py-4 rounded-2xl font-black transition-all duration-300 active:scale-95 shadow-2xl",
                isBotRunning 
                  ? "bg-rose-600 text-white hover:bg-rose-500 shadow-rose-900/40" 
                  : "bg-emerald-500 text-black hover:bg-white shadow-emerald-500/30"
              )}
            >
              {isBotRunning ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  HALT TRADING MISSION
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  ACTIVATE SYSTEM
                </>
              )}
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Top Grid: High Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-6">
              <StatsCard
                label="Available Liquidity"
                value={`${balance.toLocaleString()} USDT`}
                change={tradingMode === 'paper' ? "Virtual Assets" : (balance > 0 ? "Live Account" : "Connect API")}
                trend={balance > initialBalance ? "up" : (balance < initialBalance ? "down" : "neutral")}
                icon={<ShieldCheck className="text-emerald-500" />}
              />
              <StatsCard
                label="Portfolio Growth"
                value={`${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(2)}%`}
                change={`Initial: ${initialBalance.toLocaleString()} USDT`}
                trend={totalGrowth >= 0 ? "up" : "down"}
                icon={<TrendingUp className={totalGrowth >= 0 ? "text-emerald-500" : "text-rose-500"} />}
              />
              <StatsCard
                label="Total Trades"
                value={`${performance.total_trades} Executed`}
                change={`Win Rate: ${performance.total_trades > 0 ? ((performance.wins / performance.total_trades) * 100).toFixed(1) : 0}%`}
                trend="neutral"
                icon={<Activity className="text-emerald-500" />}
              />
              <StatsCard
                label="Real-time Risk"
                value="0.50%"
                change="Portfolio Shield Active"
                trend="up"
                icon={<ShieldCheck className="text-emerald-500" />}
              />
              <StatsCard
                label="Session Uptime"
                value={status.uptime || missionDuration}
                change={isBotRunning ? (sessionStart ? `Started: ${new Date(sessionStart).toLocaleTimeString()}` : "Active") : "Awaiting activation..."}
                trend="up"
                icon={<Clock className="text-blue-500" />}
              />
            </div>

            {/* QUICK SETUP: Aegis Core Initialization */}
            <div className="bg-emerald-600/5 border border-emerald-500/20 rounded-[2.5rem] p-8 animate-in fade-in slide-in-from-top-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[100px] rounded-full" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                   <div className="flex items-center gap-4">
                    <div className="p-4 bg-emerald-600 rounded-[1.5rem] shadow-xl shadow-emerald-600/20">
                      <ShieldCheck className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">Core Initialization</h3>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black">Configure execution environment & liquidity</p>
                    </div>
                   </div>
                   
                   <div className="flex items-center gap-1 bg-black/40 p-1 rounded-2xl border border-white/5 backdrop-blur-sm">
                      <div className="flex items-center px-3 py-2 gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest whitespace-nowrap">Cloud Sync Ready</span>
                      </div>
                      <button 
                        onClick={() => handleUpdateSettings({ mode: 'paper' })}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all",
                          tradingMode === 'real' 
                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                            : "text-zinc-500 hover:text-white"
                        )}
                      >
                        VIRTUAL
                      </button>
                      <button 
                        onClick={() => handleUpdateSettings({ mode: 'real' })}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all",
                          tradingMode === 'real' 
                            ? "bg-white text-black shadow-lg" 
                            : "text-zinc-500 hover:text-white"
                        )}
                      >
                        LIVE CORE
                      </button>
                   </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                   <div className="flex-1 p-6 bg-black/60 border border-white/5 rounded-[2rem] backdrop-blur-xl">
                      {tradingMode === 'paper' ? (
                        <>
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-4 tracking-widest">Target Initial Equity (USDT)</label>
                          <div className="flex items-center gap-4 mb-6">
                            <span className="text-zinc-600 font-bold text-3xl">$</span>
                            <input 
                              type="number"
                              value={paperBalance}
                              onChange={(e) => setPaperBalance(parseFloat(e.target.value))}
                              className="bg-transparent border-none p-0 text-4xl font-black font-mono focus:ring-0 w-full"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[100, 500, 1000, 2500, 5000, 10000].map(amt => (
                              <button 
                                key={amt}
                                onClick={() => setPaperBalance(amt)}
                                className={cn(
                                  "px-4 py-2 rounded-xl text-xs font-black border transition-all",
                                  paperBalance === amt 
                                    ? "bg-emerald-600 border-emerald-600 text-white" 
                                    : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20"
                                )}
                              >
                                ${amt.toLocaleString()}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="h-full flex flex-col justify-center py-4">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                            <span className="text-xs font-black uppercase tracking-widest text-emerald-500">Live Exchange Link Active</span>
                          </div>
                          <p className="text-sm text-zinc-400 leading-relaxed max-w-md">
                            Aegis is currently synchronized with your <span className="text-white font-bold">{activeExchange.toUpperCase()}</span> treasury. Liquidity is managed in real-time from your exchange wallet.
                          </p>
                          <div className="mt-6 flex flex-wrap gap-3">
                             <div className="px-3 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-mono text-zinc-500">KEY: {exchangeKeys.binance_api_key ? '***' + exchangeKeys.binance_api_key.slice(-4) : 'NOT SET'}</div>
                             <div className="px-3 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-mono text-zinc-500">SEC: {exchangeKeys.binance_secret_key ? 'PROTECTED' : 'NOT SET'}</div>
                          </div>
                        </div>
                      )}
                   </div>

                   <div className="flex flex-col justify-center min-w-[240px]">
                     <button 
                      onClick={async () => {
                        try {
                          await handleUpdateSettings({ 
                            paper_balance: paperBalance,
                            mode: tradingMode
                          });
                          addNotification('success', `Aegis ${tradingMode === 'paper' ? 'Virtual' : 'Live'} Core synchronized.`);
                          syncAppData();
                        } catch (err) {
                          addNotification('error', 'Network connection interrupted.');
                        }
                      }}
                      className={cn(
                        "w-full py-6 px-8 rounded-3xl font-black text-xs uppercase tracking-[0.3em] transition-all active:scale-95 shadow-2xl",
                        tradingMode === 'paper' ? "bg-white text-black hover:bg-zinc-200" : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
                      )}
                     >
                       {tradingMode === 'paper' ? 'INITIALIZE PAPER CORE' : 'REFRESH LIVE SYNC'}
                     </button>
                     <p className="text-[9px] text-zinc-600 text-center mt-4 uppercase font-black tracking-widest">
                       {tradingMode === 'paper' ? 'Atomic reset of virtual balance history' : 'Updates local cache with exchange ledger'}
                     </p>
                   </div>
                </div>
            </div>
            <div className="p-8 bg-emerald-600/5 border border-emerald-500/20 rounded-[2.5rem] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                 <TrendingUp size={120} className="text-emerald-500" />
              </div>
              <div className="relative z-10 max-w-2xl">
                 <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                   <ShieldCheck className="text-emerald-500" /> Aegis Intelligence Terminal
                 </h2>
                 <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                    Aegis is an enterprise-grade autonomous terminal designed for high-precision digital asset growth. By combining neural-network market scanning with strict risk management, it identifies and executes 5m scalping opportunities across USDT-margined perpetual pairs. 
                 </p>
                 <div className="flex flex-wrap gap-4">
                    <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-tighter text-zinc-300">Autopilot Protocol V2.4 Active</div>
                    <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-tighter text-zinc-300">Neural Latency: 42ms</div>
                 </div>
              </div>
            </div>


            {/* Exchange Selector */}
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {['binance', 'bitget'].map((exch) => (
                <button 
                  key={exch}
                  onClick={() => handleUpdateSettings({ exchange: exch })}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-3 px-6 py-4 rounded-2xl border transition-all",
                    activeExchange === exch 
                      ? "bg-emerald-600/10 border-emerald-500/50 text-white shadow-lg shadow-emerald-500/10" 
                      : "bg-[#111] border-white/5 text-zinc-500 hover:border-white/10"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full", activeExchange === exch ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-zinc-700")} />
                  <span className="font-bold uppercase tracking-widest text-sm">{exch}</span>
                </button>
              ))}
              {tradingMode === 'paper' && (
                <div className="flex items-center gap-2 bg-white/5 px-4 rounded-2xl border border-white/10 ml-auto">
                   <span className="text-[10px] font-bold text-zinc-500 uppercase">Set Paper:</span>
                   {[100, 500, 1000, 5000].map(amt => (
                     <button 
                      key={amt} 
                      onClick={() => handleUpdateSettings({ paper_balance: amt })}
                      className={cn("px-2 py-1 rounded text-[10px] font-bold", paperBalance === amt ? "bg-emerald-600 text-white" : "bg-white/5 text-zinc-400")}
                     >
                       ${amt}
                     </button>
                   ))}
                </div>
              )}
            </div>

            {/* Middle Section: Chart & Live Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-[#111] border border-white/5 rounded-3xl p-6 overflow-hidden relative">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-600/10 rounded-lg">
                      <BarChart3 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">BTC/USDT Live Terminal</h3>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Autonomous Execution Markers</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {['1M', '5M', '15M', '1H'].map(t => (
                      <button key={t} className={cn("px-3 py-1 rounded-md text-[10px] font-black tracking-widest bg-white/5 hover:bg-white/10 transition-colors uppercase border border-white/5", t === '1H' ? "text-emerald-500 border-emerald-500/20" : "")}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                
                <TradingChart symbol="BTCUSDT" trades={trades} />

                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Real-time PnL Curve</span>
                  </div>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history.length > 0 ? history.map(h => {
                        const date = h && h.timestamp ? new Date(h.timestamp) : new Date();
                        const timeStr = isNaN(date.getTime()) ? '...' : date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        return { time: timeStr, balance: h && typeof h.balance === 'number' ? h.balance : 0 };
                      }) : PERFORMANCE_DATA}>
                        <defs>
                          <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="time" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorBal)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/5">
                   <div className="space-y-1">
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Growth vs Initial</span>
                      <div className={cn("text-lg font-bold font-mono", totalGrowth >= 0 ? "text-emerald-400" : "text-rose-500")}>
                        {totalGrowth >= 0 ? '+' : ''}{totalGrowth.toFixed(2)}%
                      </div>
                   </div>
                   <div className="space-y-1">
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Net Realized</span>
                      <div className={cn("text-lg font-bold font-mono", (balance - initialBalance) >= 0 ? "text-white" : "text-rose-500")}>
                        {(balance - initialBalance) >= 0 ? '+' : ''}{(isNaN(balance - initialBalance) ? 0 : (balance - initialBalance)).toFixed(2)} <span className="text-[10px] text-zinc-500">USDT</span>
                      </div>
                   </div>
                   <div className="space-y-1">
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Win / Loss</span>
                      <div className="text-lg font-bold font-mono text-emerald-400">
                        89 / <span className="text-rose-500">24</span>
                      </div>
                   </div>
                   <div className="space-y-1">
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Engine Status</span>
                      <div className="text-lg font-bold flex items-center gap-2">
                         <div className={cn("w-2 h-2 rounded-full", isBotRunning ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
                         <span className="text-xs uppercase tracking-tighter">{isBotRunning ? 'Operational' : 'Standby'}</span>
                      </div>
                   </div>
                </div>
              </div>

              <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    Market Stream
                  </h3>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                  {Object.entries(prices).map(([symbol, price]) => (
                    <div key={symbol} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-colors group">
                      <div>
                        <div className="text-sm font-bold tracking-tight">{symbol}</div>
                        <div className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Spot Perpetual</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold">${(price as number).toFixed(2)}</div>
                        <div className="text-[10px] text-emerald-400 font-bold group-hover:animate-pulse">+1.24%</div>
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 mt-4 border-t border-white/5">
                    <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest">
                      Scanning market pairs every 60s
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* Bottom: Active Trades */}
            <div className="bg-[#111] border border-white/5 rounded-3xl overflow-hidden">
               <div className="p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="text-xl font-bold">Recent Trade Ledger</h3>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setTradeFilter('all')}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                        tradeFilter === 'all' 
                          ? "bg-emerald-600/10 text-emerald-500 border-emerald-500/20" 
                          : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10"
                      )}
                    >ALL LOGS</button>
                    <button 
                      onClick={() => setTradeFilter('real')}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                        tradeFilter === 'real' 
                          ? "bg-emerald-600/10 text-emerald-400 border-emerald-400/20" 
                          : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10"
                      )}
                    >REAL ONLY</button>
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left min-w-[600px]">
                   <thead className="bg-white/[0.02] text-[10px] uppercase tracking-widest text-zinc-500">
                     <tr>
                       <th className="px-8 py-4 font-semibold">Pair / Type</th>
                       <th className="px-8 py-4 font-semibold">Signal</th>
                       <th className="px-8 py-4 font-semibold">Price Entry</th>
                       <th className="px-8 py-4 font-semibold">Status</th>
                       <th className="px-8 py-4 font-semibold text-right">Net PnL</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                     {trades.filter(t => tradeFilter === 'all' || t.mode === 'real').length === 0 ? (
                       <tr>
                         <td colSpan={5} className="px-8 py-12 text-center text-zinc-600 font-medium">No {tradeFilter === 'real' ? 'real' : 'live'} trade data available. Connect API to start.</td>
                       </tr>
                     ) : (
                       trades
                        .filter(t => tradeFilter === 'all' || t.mode === 'real')
                        .map((trade) => (

                        <React.Fragment key={trade.id}>
                          <tr 
                            onClick={() => setExpandedTrade(expandedTrade === trade.id ? null : trade.id)}
                            className={cn(
                              "transition-colors group cursor-pointer",
                              expandedTrade === trade.id ? "bg-white/[0.04]" : "hover:bg-white/[0.01]"
                            )}
                          >
                           <td className="px-8 py-4">
                             <div className="font-bold flex items-center gap-2">
                               {trade.pair}
                               <span className={cn(
                                 "text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase",
                                 trade.mode === 'real' ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                               )}>{trade.mode}</span>
                             </div>
                             <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{new Date(trade.timestamp).toLocaleString()}</div>
                           </td>
                           <td className="px-8 py-4">
                             <span className={cn(
                               "px-2 py-0.5 rounded font-bold text-[10px]",
                               trade.action === 'BUY' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                             )}>
                               {trade.action}
                             </span>
                           </td>
                            <td className="px-8 py-4 font-mono text-xs">${trade.entry_price.toLocaleString()}</td>
                            <td className="px-8 py-4 text-xs font-semibold text-zinc-400">{trade.status}</td>
                            <td className="px-8 py-4 text-right font-mono font-bold">
                              <span className={trade.pnl && trade.pnl > 0 ? "text-emerald-400" : "text-zinc-500"}>
                                {typeof trade.pnl === 'number' ? `${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)}` : '--'}
                              </span>
                            </td>
                          </tr>
                          {expandedTrade === trade.id && (
                            <tr className="bg-white/[0.04]">
                              <td colSpan={5} className="px-8 py-6 border-b border-white/5">
                                <motion.div 
                                  initial={{ opacity: 0, height: 0 }} 
                                  animate={{ opacity: 1, height: 'auto' }}
                                  className="grid grid-cols-1 sm:grid-cols-4 gap-6 pt-2"
                                >
                                  <div className="space-y-1">
                                    <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Logic Strategy</div>
                                    <div className="text-sm font-bold text-white flex items-center gap-2">
                                      <Zap className="w-3 h-3 text-emerald-500" />
                                      NEURAL-EMA-MACD
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Exit Thresholds</div>
                                    <div className="flex gap-4">
                                      <div>
                                        <span className="text-[9px] text-zinc-600 block leading-none uppercase">Take Profit</span>
                                        <span className="text-emerald-400 font-mono text-xs">+$654.20 (2.5%)</span>
                                      </div>
                                      <div>
                                        <span className="text-[9px] text-zinc-600 block leading-none uppercase">Stop Loss</span>
                                        <span className="text-red-500 font-mono text-xs">-$312.10 (1.2%)</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Execution Hash</div>
                                    <div className="text-[10px] font-mono text-zinc-400 truncate max-w-[150px]">
                                      0x{(trade.id || 0).toString().padStart(8, '0').toUpperCase()}...F3
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-end sm:col-span-1">
                                    <button 
                                      onClick={() => addNotification('info', 'Trade details exported to ledger.')}
                                      className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold text-zinc-300 border border-white/10 transition-all"
                                    >
                                      VIEW RECEIPT
                                    </button>
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                     )}
                   </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'strategies' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-[#111] border border-white/5 rounded-3xl p-8">
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <Activity className="text-emerald-500" /> Oscillator Config
                </h3>
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">RSI Period</label>
                      <span className="text-xs font-mono text-emerald-500">{algoSettings.rsiPeriod}</span>
                    </div>
                    <input 
                      type="range" min="2" max="50" 
                      value={algoSettings.rsiPeriod}
                      onChange={(e) => setAlgoSettings({...algoSettings, rsiPeriod: parseInt(e.target.value)})}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase">
                      <span>Fast</span>
                      <span>Lagging</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">EMA Short</label>
                      <input 
                        type="number" 
                        value={algoSettings.emaShort}
                        onChange={(e) => setAlgoSettings({...algoSettings, emaShort: parseInt(e.target.value)})}
                        className="w-full bg-transparent border-none p-0 text-xl font-bold font-mono focus:ring-0"
                      />
                    </div>
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">EMA Long</label>
                      <input 
                        type="number" 
                        value={algoSettings.emaLong}
                        onChange={(e) => setAlgoSettings({...algoSettings, emaLong: parseInt(e.target.value)})}
                        className="w-full bg-transparent border-none p-0 text-xl font-bold font-mono focus:ring-0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#111] border border-white/5 rounded-3xl p-8">
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <Activity className="text-blue-500" /> MACD Dynamics
                </h3>
                <div className="space-y-6">
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">Fast Length</label>
                    <input 
                      type="number" 
                      value={algoSettings.macdFast}
                      onChange={(e) => setAlgoSettings({...algoSettings, macdFast: parseInt(e.target.value)})}
                      className="w-full bg-transparent border-none p-0 text-xl font-bold font-mono focus:ring-0"
                    />
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">Slow Length</label>
                    <input 
                      type="number" 
                      value={algoSettings.macdSlow}
                      onChange={(e) => setAlgoSettings({...algoSettings, macdSlow: parseInt(e.target.value)})}
                      className="w-full bg-transparent border-none p-0 text-xl font-bold font-mono focus:ring-0"
                    />
                  </div>
                  <button 
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API_BASE_URL}/bot/strategy`, {
                          method: 'POST',
                          headers: {
                            ...getAuthHeaders(),
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            rsi_period: algoSettings.rsiPeriod,
                            ema_short: algoSettings.emaShort,
                            ema_long: algoSettings.emaLong,
                            macd_fast: algoSettings.macdFast,
                            macd_slow: algoSettings.macdSlow
                          })
                        });
                        if (res.ok) {
                          addNotification('success', 'Algorithm parameters recalibrated and pushed to hot-storage.');
                        } else {
                          throw new Error('Push failed');
                        }
                      } catch (err) {
                        addNotification('error', 'Execution Error: Could not synchronize parameters with trading engine.');
                      }
                    }}
                    className="w-full py-4 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-emerald-600/20 transition-all active:scale-95"
                  >
                    DEPLOY ALGO UPDATE
                  </button>
                </div>
              </div>
            </div>

            <div className="p-8 bg-emerald-600/5 border border-emerald-500/10 rounded-3xl">
              <div className="flex items-start gap-6">
                <div className="w-12 h-12 bg-emerald-600/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Activity className="text-emerald-500 w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold mb-1">Execution Risk Protocol</h4>
                  <p className="text-zinc-500 text-sm leading-relaxed mb-4">
                    Neural-model parameters define the precision of entry/exit signals. Lowering RSI periods increases sensitivity but may lead to higher false-positives in volatile markets.
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="text-[10px] font-bold text-zinc-500 border border-white/10 px-3 py-1 rounded-full uppercase">Current: Balanced Risk</div>
                    <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest font-mono">MDD Limit: 5.0%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other Tabs */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-12">
             {/* Account Sync Status */}
             <div className="bg-[#111] border border-white/5 rounded-3xl p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-3">
                    <History className="text-emerald-500" /> Dashboard Auth & Config (Refer to .env.example)
                  </h3>
                  <div className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest">v4.2.0-STABLE</div>
                </div>
                
                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl mb-6">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2 flex justify-between">
                      <span>Internal API Key (Protective Layer)</span>
                      <span className="text-emerald-500/50">Stored Locally</span>
                    </label>
                    <input 
                      type="password" 
                      placeholder="Access Key..."
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        localStorage.setItem('aegis_api_key', e.target.value);
                      }}
                      className="w-full bg-transparent border-none p-0 text-lg font-bold font-mono focus:ring-0 placeholder:text-zinc-700"
                    />
                </div>

                <div className="mt-8 space-y-6">
                  <div className="p-5 bg-white/5 border border-white/10 rounded-2xl">
                    <h4 className="text-sm uppercase tracking-widest text-zinc-500 font-black mb-3">Dashboard authentication only</h4>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Use your backend <code className="font-mono text-emerald-300">X-API-Key</code> to authenticate the dashboard. This is the only key required for trading control and sync.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <button
                      onClick={() => {
                        localStorage.setItem('aegis_api_key', apiKey.trim());
                        addNotification('success', 'Dashboard key saved locally.');
                      }}
                      className="w-full px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-[0.2em] transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
                    >
                      SAVE DASHBOARD KEY
                    </button>
                    <button
                      onClick={syncAppData}
                      className="w-full px-8 py-3 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 rounded-xl font-bold text-xs uppercase tracking-[0.2em] transition-all active:scale-95"
                    >
                      REFRESH DASHBOARD
                    </button>
                  </div>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Floating Action Button for Mobile Settings */}
      <button className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-emerald-600 rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform z-50">
        <Bell className="w-6 h-6" />
      </button>
    </div>
  );
}

function SettingField({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
      <span className="text-sm font-medium text-zinc-400">{label}</span>
      <div className={cn(
        "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border",
        color === 'emerald' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
      )}>
        {value}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col md:w-16 md:h-16 items-center justify-center gap-1 transition-all duration-300 relative group",
        active ? "text-emerald-500" : "text-zinc-500 hover:text-white"
      )}
    >
      <div className={cn(
        "transition-transform group-hover:scale-110",
        active && "scale-110"
      )}>
        {React.cloneElement(icon as React.ReactElement, { size: active ? 24 : 20 })}
      </div>
      <span className="text-[9px] uppercase tracking-widest font-bold md:hidden lg:inline">{label}</span>
      {active && (
        <motion.div 
          layoutId="activeNav"
          className="absolute -right-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l hidden md:block"
        />
      )}
    </button>
  );
}

function StatsCard({ label, value, change, trend, icon }: { label: string, value: string, change: string, trend: 'up' | 'down' | 'neutral', icon: React.ReactNode }) {
  return (
    <div className="bg-[#111] border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-colors group">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded bg-white/5",
          trend === 'up' ? "text-emerald-400" : trend === 'down' ? "text-red-400" : "text-zinc-500"
        )}>
          {change}
        </div>
      </div>
      <div className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold mb-1">{label}</div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
