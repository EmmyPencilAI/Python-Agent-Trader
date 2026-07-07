import React, { useState } from 'react';
import { ShieldCheck, Lock, Key, Eye, EyeOff, Zap, AlertCircle, Trash2, RefreshCw, Terminal } from 'lucide-react';
import { RouteDiagnosticsDashboard } from './RouteDiagnosticsDashboard';

interface GatewayLoginProps {
  BASE_URL: string;
  onSuccess: (key: string) => void;
}

export const GatewayLogin: React.FC<GatewayLoginProps> = ({ BASE_URL, onSuccess }) => {
  const [inputPassword, setInputPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Clean / Wipe State
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipePassword, setWipePassword] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeSuccess, setWipeSuccess] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPassword.trim()) {
      setErrorMsg('Admin Password cannot be blank.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const fullUrl = `${BASE_URL}/api/auth/login`;
      const res = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: inputPassword.trim() })
      });

      if (res.status === 404) {
        console.error('[AEGIS DIAGNOSTIC] POST /api/auth/login returned 404. Server route configuration is missing or misordered.');
        setErrorMsg('API Route Not Found (404): POST /api/auth/login. Please consult Route Diagnostics to check endpoint health.');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setSuccessMsg('ACCESS GRANTED. DECRYPTING AEGIS ENVIRONMENT...');
        setTimeout(() => {
          onSuccess(data.key);
        }, 1200);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Access Denied: Invalid Security Password');
      }
    } catch (err: any) {
      setErrorMsg(`Gateway Timeout/Connection Error: ${err.message || 'Backend is currently offline.'}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleWipeData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wipePassword.trim()) {
      setWipeError('Please enter the Admin Password to authorize the wipe.');
      return;
    }

    setIsWiping(true);
    setWipeError(null);
    setWipeSuccess(null);

    try {
      const fullUrl = `${BASE_URL}/api/admin/clean-data`;
      const res = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': localStorage.getItem('aegis_api_key') || 'Cybunk2.0X'
        },
        body: JSON.stringify({ password: wipePassword.trim() })
      });

      if (res.status === 404) {
        console.error('[AEGIS DIAGNOSTIC] POST /api/admin/clean-data returned 404. Server route registration issue.');
        setWipeError('API Route Not Found (404): POST /api/admin/clean-data. Please check routing diagnostics.');
        return;
      }

      if (res.ok) {
        setWipeSuccess('ALL DATABASES WIPED. APP CLEAN AS NEW!');
        setWipePassword('');
        setTimeout(() => {
          setShowWipeModal(false);
          setWipeSuccess(null);
          // Refresh page to clear states
          window.location.reload();
        }, 2000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setWipeError(errData.error || 'Wipe Rejected: Invalid Admin Password');
      }
    } catch (err: any) {
      setWipeError(`Wipe Failure: ${err.message || 'Failed to contact reset route.'}`);
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div id="gateway_login_container" className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-white font-sans selection:bg-emerald-500/30 selection:text-emerald-200 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.04),transparent_70%)] pointer-events-none" />
      
      <div id="gateway_login_card" className="max-w-md w-full bg-zinc-950 border border-white/5 p-8 md:p-10 rounded-3xl relative overflow-hidden backdrop-blur-3xl shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
        
        {/* Header Visual */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-4 relative group">
            <div className="absolute inset-0 bg-emerald-500/5 rounded-2xl blur-lg group-hover:blur-xl transition-all" />
            <ShieldCheck className="w-8 h-8 text-emerald-500 relative z-10 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black tracking-tight uppercase">Aegis Core Gateway</h2>
          <p className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mt-1">SECURE TRADING DESK v2.0</p>
        </div>

        {!showWipeModal ? (
          <>
            {/* Form */}
            <form onSubmit={handleValidate} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Key className="w-3 h-3 text-emerald-500" />
                  Admin Access Password
                </label>
                <div className="relative">
                  <input
                    id="gateway_auth_key_input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter Admin Password (e.g. Cybunk2.0X)"
                    value={inputPassword}
                    onChange={(e) => setInputPassword(e.target.value)}
                    disabled={isVerifying || successMsg !== null}
                    className="w-full bg-zinc-900/50 border border-white/5 hover:border-white/10 focus:border-emerald-500/30 rounded-xl px-4 py-3.5 pr-12 text-sm font-mono text-emerald-400 outline-none transition-all placeholder:text-zinc-700"
                  />
                  <button
                    type="button"
                    id="gateway_toggle_visibility"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isVerifying || successMsg !== null}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Feedback Messages */}
              {errorMsg && (
                <div id="gateway_error_msg" className="flex items-center gap-2.5 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-medium animate-shake">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div id="gateway_success_msg" className="flex items-center gap-2.5 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-medium">
                  <Zap className="w-4 h-4 flex-shrink-0 animate-bounce" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                id="gateway_submit_button"
                disabled={isVerifying || successMsg !== null}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 cursor-pointer"
              >
                {isVerifying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                    <span>Decrypting Core Environment...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Decrypt & Access App</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center gap-2">
              <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest text-center">
                Env variables loaded silently from backend config
              </span>
              <button
                type="button"
                onClick={() => setShowWipeModal(true)}
                className="text-[10px] font-black text-rose-500/60 hover:text-rose-400 uppercase tracking-widest flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Wipe & Clean App as New
              </button>
              <button
                type="button"
                onClick={() => setShowDiagnostics(true)}
                className="text-[10px] font-black text-emerald-500/60 hover:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                View Core Diagnostics
              </button>
            </div>
          </>
        ) : (
          /* Wipe Modal / Panel */
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-rose-500/10 pb-4 mb-2">
              <Trash2 className="w-5 h-5 text-rose-500 animate-pulse" />
              <div>
                <h3 className="text-sm font-black text-rose-500 uppercase tracking-widest">PRISTINE APP WIPE</h3>
                <p className="text-[10px] text-zinc-500 font-mono">THIS WILL PURGE ALL SQLite DATA</p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Confirming this action will completely delete all simulated and real trades, logs, predictions, performance, balance history, and reset all app settings back to original defaults.
            </p>

            <form onSubmit={handleWipeData} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Key className="w-3 h-3" />
                  Enter Admin Password to Authorize
                </label>
                <input
                  type="password"
                  placeholder="Password..."
                  value={wipePassword}
                  onChange={(e) => setWipePassword(e.target.value)}
                  disabled={isWiping || wipeSuccess !== null}
                  className="w-full bg-zinc-900/50 border border-rose-500/20 focus:border-rose-500 rounded-xl px-4 py-3.5 text-sm font-mono text-rose-400 outline-none transition-all placeholder:text-zinc-800"
                />
              </div>

              {wipeError && (
                <div className="flex items-center gap-2.5 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{wipeError}</span>
                </div>
              )}

              {wipeSuccess && (
                <div className="flex items-center gap-2.5 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-medium">
                  <Zap className="w-4 h-4 flex-shrink-0 animate-bounce" />
                  <span>{wipeSuccess}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowWipeModal(false);
                    setWipeError(null);
                    setWipePassword('');
                  }}
                  disabled={isWiping || wipeSuccess !== null}
                  className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors border border-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWiping || wipeSuccess !== null}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/20 cursor-pointer"
                >
                  {isWiping ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Wiping...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Wipe Entire App
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {showDiagnostics && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <RouteDiagnosticsDashboard 
              BASE_URL={BASE_URL} 
              onClose={() => setShowDiagnostics(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
};
