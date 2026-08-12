import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, Bug } from 'lucide-react';
import { captureClientError } from '../utils/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    captureClientError(error, {
      componentStack: errorInfo.componentStack,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0e1118] text-white flex items-center justify-center p-4 font-sans">
          <div className="bg-[#171c28] border border-red-500/30 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Обнаружена ошибка интерфейса</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                    SENTRY LOGGED
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Система Sentry перехватила исключение и сохранила стек вызовов.
                </p>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-2xl p-4 text-xs font-mono space-y-2 overflow-x-auto max-h-48 scrollbar-thin">
              <div className="flex items-center gap-1.5 text-red-400 font-bold">
                <Bug className="w-4 h-4 shrink-0" />
                <span>{this.state.error?.name || 'Error'}: {this.state.error?.message}</span>
              </div>
              {this.state.error?.stack && (
                <pre className="text-[11px] text-slate-400 whitespace-pre-wrap break-all pt-1 border-t border-white/5">
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-slate-400">
                Все несохраненные данные защищены
              </p>
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Перезапустить приложение</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
