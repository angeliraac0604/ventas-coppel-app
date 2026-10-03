import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary capturó un error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto my-8 p-6 bg-red-50 border border-red-200 rounded-3xl shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-red-900 text-base">
                {this.props.fallbackTitle || "Ocurrió un error inesperado"}
              </h3>
              <p className="text-xs text-red-700">
                La aplicación evitó una pantalla en blanco. Detalles del error:
              </p>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-red-100 font-mono text-xs text-red-800 break-words">
            {this.state.error?.message || "Error desconocido"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
