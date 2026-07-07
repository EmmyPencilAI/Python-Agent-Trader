import React, { useState, useEffect } from 'react';
import { Terminal, CheckCircle2, AlertTriangle, RefreshCw, X, AlertCircle, ShieldAlert } from 'lucide-react';

interface Route {
  path: string;
  method: string;
  description: string;
}

interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  ip: string;
  errorMessage?: string;
}

interface RouteDiagnosticsDashboardProps {
  BASE_URL: string;
  onClose?: () => void;
}

export const RouteDiagnosticsDashboard: React.FC<RouteDiagnosticsDashboardProps> = ({ BASE_URL, onClose }) => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fullUrl = BASE_URL ? `${BASE_URL}/api/route-diagnostics` : '/api/route-diagnostics';
      const res = await fetch(fullUrl);
      if (res.ok) {
        const data = await res.json();
        setRoutes(data.routes || []);
        setLogs(data.logs || []);
      } else {
        setError(`Failed to retrieve diagnostics: Server returned status ${res.status}`);
      }
    } catch (err: any) {
      setError(`Failed to reach server diagnostics: ${err.message || 'Offline'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, [BASE_URL]);

  // Identify specific 404 errors for the requested critical endpoints
  const criticalEndpoints = [
    '/api/bot/sync-balance',
    '/api/auth/login',
    '/api/admin/clean-data',
    '/api/bot/activate'
  ];

  const critical404s = logs.filter(log => 
    log.statusCode === 404 && 
    criticalEndpoints.some(endpoint => log.path.includes(endpoint))
  );

  return (
    <div id="route_diagnostics_panel" className="bg-zinc-950 border border-white/5 rounded-3xl p-6 md:p-8 text-white max-w-4xl w-full mx-auto relative shadow-2xl">
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute right-6 top-6 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-zinc-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
        <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
          <Terminal className="w-5 h-5 text-emerald-500 animate-pulse" />
        </div>
        <div>
          <h3 className="text-lg font-black tracking-tight uppercase">Route diagnostics console</h3>
          <p className="text-[10px] text-zinc-500 font-mono tracking-[0.2em] uppercase mt-0.5">Verification of server-side routing configuration</p>
        </div>
        <button 
          onClick={fetchDiagnostics}
          disabled={isLoading}
          className="ml-auto p-2 bg-white/5 hover:bg-emerald-500/15 border border-white/5 hover:border-emerald-500/20 rounded-xl transition-all text-zinc-400 hover:text-emerald-400 flex items-center gap-1.5 text-xs font-bold cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-2xl text-rose-400 text-xs font-mono mb-6">
          <AlertCircle className="w-4 h-4 flex-shrink-0 animate-bounce" />
          <span>{error}</span>
        </div>
      )}

      {/* Critical 404 Alerts Banner */}
      {critical404s.length > 0 ? (
        <div className="p-5 bg-rose-950/20 border border-rose-500/30 rounded-2xl mb-6 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
            <ShieldAlert size={14} className="animate-pulse text-rose-500" />
            ⚠️ CRITICAL ROUTING ERRORS DETECTED
          </div>
          <p className="text-xs text-zinc-300">
            The following requested endpoints registered 404 Not Found errors on the server. Please verify your Express routing declarations:
          </p>
          <ul className="space-y-1.5 font-mono text-[11px] text-rose-300">
            {critical404s.map((log, idx) => (
              <li key={idx} className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-2 flex justify-between items-center">
                <span>{log.method} {log.path}</span>
                <span className="font-bold bg-rose-500/10 px-2 py-0.5 rounded text-[10px]">STATUS: 404</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl mb-6 flex items-center gap-3 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span className="text-xs font-semibold">ALL CRITICAL API ROUTE ROUTING TESTS NOMINAL (NO 404s LOGGED)</span>
        </div>
      )}

      {/* Diagnostics Tabs / Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Registered Routes */}
        <div className="lg:col-span-6 space-y-4">
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Registered API Route Blueprint
          </div>
          <div className="bg-zinc-900/30 border border-white/5 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.02] text-[10px] uppercase text-zinc-500 tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Method</th>
                    <th className="px-4 py-3 font-semibold">Endpoint</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {routes.map((route, i) => (
                    <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          route.method === 'POST' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>{route.method}</span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-300 font-medium">{route.path}</td>
                      <td className="px-4 py-2.5 text-emerald-500 font-bold flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>ONLINE</span>
                      </td>
                    </tr>
                  ))}
                  {routes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-zinc-600 font-medium">No registered routes returned.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Request Traffic Logs */}
        <div className="lg:col-span-6 space-y-4">
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-emerald-500" />
            Real-time API Traffic Logs
          </div>
          <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-4 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 space-y-3 font-mono text-[11px]">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-zinc-600 font-medium">No API traffic logged yet. Trigger some actions in the app to log logs.</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="bg-black/30 border border-white/5 p-3 rounded-xl space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                      log.statusCode < 300 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {log.statusCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${
                      log.method === 'POST' ? 'text-blue-400' : 'text-emerald-400'
                    }`}>{log.method}</span>
                    <span className="text-zinc-200 truncate">{log.path}</span>
                  </div>
                  {log.errorMessage && (
                    <div className="text-[10px] text-rose-400/90 bg-rose-500/5 p-1.5 rounded-lg border border-rose-500/5 mt-1">
                      Error: {log.errorMessage}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
