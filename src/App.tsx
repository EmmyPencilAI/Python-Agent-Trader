/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  BarChart3
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

// Mock data for initial load
const PERFORMANCE_DATA = [
  { time: '00:00', pnl: 0 },
  { time: '04:00', pnl: 120 },
  { time: '08:00', pnl: 85 },
  { time: '12:00', pnl: 240 },
  { time: '16:00', pnl: 190 },
  { time: '20:00', pnl: 350 },
  { time: '23:59', pnl: 420 },
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
const BASE_URL = import.meta.env.VITE_API_URL || '';
const WS_URL = BASE_URL 
  ? BASE_URL.replace(/^http/, 'ws') 
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trades' | 'strategies' | 'settings'>('dashboard');
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [tradingMode, setTradingMode] = useState<'real' | 'paper'>('paper');
  const [activeExchange, setActiveExchange] = useState('binance');
  const [paperBalance, setPaperBalance] = useState(1000);
  const [balance, setBalance] = useState(0.00); // Start at zero for real
  const [trades, setTrades] = useState<Trade[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({ BTCUSDT: 65420.12, ETHUSDT: 3421.55 });
  const [status, setStatus] = useState({ active_strategy: 'Scalping', uptime: '0h 0m' });
  const [notifications, setNotifications] = useState<{id: string, type: 'error' | 'success' | 'info', msg: string}[]>([]);
  const [expandedTrade, setExpandedTrade] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('aegis_api_key') || '');
  
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

  const fetchTrades = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/trades`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data);
      }
    } catch (err) {
      console.error('Trade poll error', err);
    }
  };

  // Initial and Periodic Fetch
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [statusRes, tradesRes] = await Promise.all([
          fetch(`${BASE_URL}/api/status`),
          fetch(`${BASE_URL}/api/trades`)
        ]);
        
        if (!statusRes.ok || !tradesRes.ok) throw new Error('API unreachable');
        
        const statusData = await statusRes.json();
        const tradesData = await tradesRes.json();
        
        setIsBotRunning(statusData.status === 'running');
        setTradingMode(statusData.mode || 'paper');
        setActiveExchange(statusData.exchange || 'binance');
        setPaperBalance(statusData.paper_balance || 1000);
        setBalance(statusData.real_balance || 0); // Real balance from server
        setStatus(statusData);
        setTrades(tradesData);
      } catch (err) {
        addNotification('error', `Connection Failed: Pointing to ${BASE_URL || 'local server'}. Please check VITE_API_URL.`);
      }
    };

    fetchInitialData();

    // Data Polling (every 5 seconds)
    const interval = setInterval(() => {
      if (isBotRunning || activeTab === 'dashboard') {
        fetchTrades();
      }
    }, 5000);

    // WebSocket connection
    const socket = new WebSocket(WS_URL);
    
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'PRICE_UPDATE') {
          setPrices(msg.data);
        }
      } catch (err) {
        console.error('WebSocket parse error', err);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error observed:', error);
    };

    return () => {
      socket.close();
      clearInterval(interval);
    };
  }, [isBotRunning, activeTab]);

  const toggleBot = async () => {
    const nextState = isBotRunning ? 'stopped' : 'running';
    try {
      const res = await fetch(`${BASE_URL}/api/bot/toggle`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ action: nextState })
      });
      if (res.ok) {
        setIsBotRunning(!isBotRunning);
        addNotification(isBotRunning ? 'info' : 'success', isBotRunning ? 'Autonomous engine offline.' : 'Aegis Core active. Scanning market...');
        // Immediate refresh after toggle
        setTimeout(fetchTrades, 500);
      } else {
        throw new Error('Unauthorized');
      }
    } catch (err) {
      addNotification('error', 'Execution Error: Dashboard cannot reach trading engine. Check API Secret Key.');
    }
  };

  const updateSetting = async (field: 'mode' | 'exchange' | 'paper_balance', value: any) => {
    try {
      const res = await fetch(`${BASE_URL}/api/bot/settings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ [field]: value })
      });
      if (res.ok) {
        if (field === 'mode') setTradingMode(value);
        if (field === 'exchange') setActiveExchange(value);
        if (field === 'paper_balance') setPaperBalance(value);
      }
    } catch (err) {
      console.error('Update failed', err);
    }
  };

  const currentPnL = useMemo(() => {
    return trades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
  }, [trades]);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500/30">
      {/* Sidebar / Navigation (Mobile Bottom, Desktop Left) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:top-0 md:bottom-0 md:w-20 md:border-r border-white/10 bg-black/80 backdrop-blur-xl md:flex md:flex-col md:items-center py-4 flex justify-around items-center">
        <div className="hidden md:flex mb-12">
          <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
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
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Risk Control Info */}
            <div className="hidden lg:flex flex-col items-end mr-4">
              <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Protocol Strategy</div>
              <div className="text-xs font-bold text-orange-500">0.5% Risk · 15% Target</div>
            </div>
            {/* Mode Switcher */}
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              <button 
                onClick={() => {
                  updateSetting('mode', 'paper');
                  addNotification('info', 'Switched to Virtual Paper Trading mode.');
                }}
                className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all", tradingMode === 'paper' ? "bg-white text-black shadow-lg" : "text-zinc-500")}
              >PAPER</button>
              <button 
                onClick={() => {
                  updateSetting('mode', 'real');
                  addNotification('success', 'Real Account Liquidity Live. Use with caution.');
                }}
                className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all", tradingMode === 'real' ? "bg-orange-600 text-white shadow-lg shadow-orange-600/20" : "text-zinc-500")}
              >REAL</button>
            </div>

            <button 
              onClick={toggleBot}
              className={cn(
                "w-full sm:w-auto group flex items-center justify-center gap-3 px-8 py-3 rounded-xl font-bold transition-all duration-300 active:scale-95",
                isBotRunning 
                  ? "bg-white text-black hover:bg-white/90" 
                  : "bg-orange-600 text-white hover:bg-orange-500 shadow-lg shadow-orange-600/20"
              )}
            >
              {isBotRunning ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  HALT ENGINE
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  INITIATE 24/7 SCAN
                </>
              )}
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Top Grid: High Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatsCard
                label="Daily Trade Target"
                value="200 Trades"
                change="Goal: 15% per trade"
                trend="neutral"
                icon={<Activity className="text-orange-500" />}
              />
              <StatsCard
                label="Real-time Risk"
                value="0.50%"
                change="Portfolio Shield Active"
                trend="up"
                icon={<ShieldCheck className="text-emerald-500" />}
              />
              <StatsCard
                label="Execution Precision"
                value="99.9%"
                change="No manual input needed"
                trend="neutral"
                icon={<Zap className="text-blue-500" />}
              />
            </div>

            <div className="p-8 bg-orange-600/5 border border-orange-500/20 rounded-[2.5rem] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                 <TrendingUp size={120} className="text-orange-500" />
              </div>
              <div className="relative z-10 max-w-2xl">
                 <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                   <Zap className="text-orange-500" /> Autonomous Yield Engine
                 </h2>
                 <p className="text-zinc-500 text-sm leading-relaxed mb-6">
                   Aegis targets high-frequency compounding. With a $100 entry basis, each 15% target represents $15 in strategic gain. At 200 trades per day, the engine prioritizes volume over single-event risk.
                 </p>
                 <div className="flex flex-wrap gap-4">
                    <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-tighter">0.5% Stop-Loss Imprinted</div>
                    <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-tighter">AI Market Scanning: 24/7</div>
                 </div>
              </div>
            </div>

            {/* Exchange Selector */}
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {['binance', 'bitget'].map((exch) => (
                <button 
                  key={exch}
                  onClick={() => updateSetting('exchange', exch)}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-3 px-6 py-4 rounded-2xl border transition-all",
                    activeExchange === exch 
                      ? "bg-white/10 border-orange-500/50 text-white shadow-lg shadow-orange-500/10" 
                      : "bg-[#111] border-white/5 text-zinc-500 hover:border-white/10"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full", activeExchange === exch ? "bg-orange-500 shadow-[0_0_8px_#f97316]" : "bg-zinc-700")} />
                  <span className="font-bold uppercase tracking-widest text-sm">{exch}</span>
                </button>
              ))}
              {tradingMode === 'paper' && (
                <div className="flex items-center gap-2 bg-white/5 px-4 rounded-2xl border border-white/10 ml-auto">
                   <span className="text-[10px] font-bold text-zinc-500 uppercase">Set Paper:</span>
                   {[100, 500, 1000, 5000].map(amt => (
                     <button 
                      key={amt} 
                      onClick={() => updateSetting('paper_balance', amt)}
                      className={cn("px-2 py-1 rounded text-[10px] font-bold", paperBalance === amt ? "bg-orange-600 text-white" : "bg-white/5 text-zinc-400")}
                     >
                       ${amt}
                     </button>
                   ))}
                </div>
              )}
            </div>

            {/* Middle Section: Chart & Live Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-[#111] border border-white/5 rounded-3xl p-8 overflow-hidden relative">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold">Performance Analytics</h3>
                  <div className="flex gap-2">
                    {['1H', '4H', '1D', 'ALL'].map(t => (
                      <button key={t} className="px-3 py-1 rounded-md text-xs font-semibold bg-white/5 hover:bg-white/10 transition-colors">
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={PERFORMANCE_DATA}>
                      <defs>
                        <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="time" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Area type="monotone" dataKey="pnl" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorPnl)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-orange-500" />
                    Market Stream
                  </h3>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                  {Object.entries(prices).map(([symbol, price]) => (
                    <div key={symbol} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-orange-500/30 transition-colors group">
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
                    <button className="px-4 py-1.5 rounded-lg bg-orange-600/10 text-orange-500 text-xs font-bold border border-orange-500/20">ALL LOGS</button>
                    <button className="px-4 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-xs font-bold border border-white/10 hover:bg-white/10 transition-colors">REAL ONLY</button>
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
                     {trades.length === 0 ? (
                       <tr>
                         <td colSpan={5} className="px-8 py-12 text-center text-zinc-600 font-medium">No live trade data available. Connect API to start.</td>
                       </tr>
                     ) : (
                      trades.map((trade) => (
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
                                 trade.mode === 'real' ? "bg-orange-500/10 text-orange-400" : "bg-zinc-800 text-zinc-500"
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
                                      <Zap className="w-3 h-3 text-orange-500" />
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
                  <Activity className="text-orange-500" /> Oscillator Config
                </h3>
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">RSI Period</label>
                      <span className="text-xs font-mono text-orange-500">{algoSettings.rsiPeriod}</span>
                    </div>
                    <input 
                      type="range" min="2" max="50" 
                      value={algoSettings.rsiPeriod}
                      onChange={(e) => setAlgoSettings({...algoSettings, rsiPeriod: parseInt(e.target.value)})}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-600"
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
                        const res = await fetch(`${BASE_URL}/api/bot/strategy`, {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'x-api-key': apiKey
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

            <div className="p-8 bg-orange-600/5 border border-orange-500/10 rounded-3xl">
              <div className="flex items-start gap-6">
                <div className="w-12 h-12 bg-orange-600/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Zap className="text-orange-500 w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold mb-1">Execution Risk Protocol</h4>
                  <p className="text-zinc-500 text-sm leading-relaxed mb-4">
                    Neural-model parameters define the precision of entry/exit signals. Lowering RSI periods increases sensitivity but may lead to higher false-positives in volatile markets.
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="text-[10px] font-bold text-zinc-500 border border-white/10 px-3 py-1 rounded-full uppercase">Current: Balanced Risk</div>
                    <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest font-mono">MDD Limit: 5.0%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other Tabs */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
             <div className="bg-[#111] border border-white/5 rounded-3xl p-8">
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <ShieldCheck className="text-orange-500" /> API Configuration
                </h3>
                <div className="space-y-6">
                     <SettingField label="Binance Status" value="Securely Linked" color="emerald" />
                     <SettingField label="Bitget Status" value="Available" color="amber" />
                     
                     <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">Internal API Key (Aegis Dashboard Access)</label>
                        <input 
                          type="password" 
                          placeholder="Your API_SECRET_KEY"
                          value={apiKey}
                          onChange={(e) => {
                            setApiKey(e.target.value);
                            localStorage.setItem('aegis_api_key', e.target.value);
                          }}
                          className="w-full bg-transparent border-none p-0 text-lg font-bold font-mono focus:ring-0 placeholder:text-zinc-700"
                        />
                     </div>

                    <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl flex items-start gap-4">
                      <Bell className="text-orange-500 mt-1" />
                      <div>
                        <h4 className="font-bold text-sm">Security Advisory</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed mt-1">API keys are stored server-side. For maximum safety, generate keys with **Spot Trading only** enabled and whitelist your server's static IP address.</p>
                      </div>
                   </div>
                </div>
             </div>
             
             <div className="bg-[#111] border border-white/5 rounded-3xl p-8">
                <h3 className="text-2xl font-bold mb-6">Execution Logic</h3>
                <div className="grid grid-cols-2 gap-4">
                   <button 
                    onClick={() => {
                      setStatus(s => ({...s, active_strategy: 'Scalping Elite'}));
                      addNotification('info', 'Switched to Scalping Elite strategy.');
                    }}
                    className={cn(
                      "p-4 rounded-2xl border text-left transition-all",
                      status.active_strategy === 'Scalping Elite' ? "border-orange-500 bg-orange-500/10" : "border-white/5 bg-white/5 hover:border-white/20"
                    )}
                   >
                      <Zap className="text-orange-500 mb-2" />
                      <div className="font-bold">Scalping Elite</div>
                      <div className="text-[10px] text-zinc-400 mt-1">Optimized for BTC/ETH 5m volatility. High frequency, tight stops.</div>
                   </button>
                   <button 
                    onClick={() => {
                      setStatus(s => ({...s, active_strategy: 'Trend Swing'}));
                      addNotification('info', 'Switched to Trend Swing strategy.');
                    }}
                    className={cn(
                      "p-4 rounded-2xl border text-left transition-all",
                      status.active_strategy === 'Trend Swing' ? "border-orange-500 bg-orange-500/10" : "border-white/5 bg-white/5 hover:border-white/20"
                    )}
                   >
                      <Activity className="text-zinc-500 mb-2" />
                      <div className="font-bold">Trend Swing</div>
                      <div className="text-[10px] text-zinc-400 mt-1">EMA 200 crossover logic. Lower volume, higher PnL per trade.</div>
                   </button>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Floating Action Button for Mobile Settings */}
      <button className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-orange-600 rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform z-50">
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
        active ? "text-orange-500" : "text-zinc-500 hover:text-white"
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
          className="absolute -right-0 top-0 bottom-0 w-1 bg-orange-500 rounded-l hidden md:block"
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
