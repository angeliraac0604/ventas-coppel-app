import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
if (posthogToken) {
  try {
    posthog.init(posthogToken, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      defaults: '2026-01-30',
    });
  } catch (err) {
    console.warn("PostHog initialization skipped:", err);
  }
}

// Global safety listener to prevent uncaught promise rejection crashes
window.addEventListener('unhandledrejection', (event) => {
  console.warn("Unhandled Promise Rejection prevented from crashing app:", event.reason);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("FATAL: Could not find root element");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary fallbackTitle="Error en la aplicación">
        {posthogToken ? (
          <PostHogProvider client={posthog}>
            <App />
          </PostHogProvider>
        ) : (
          <App />
        )}
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (err) {
  console.error('REACT MOUNT ERROR:', err);
  rootElement.innerHTML = `
    <div style="min-height: 100vh; background-color: #0f172a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; padding: 20px; text-align: center;">
      <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 12px;">Se presentó un problema al cargar</h2>
      <p style="color: #94a3b8; font-size: 14px; max-width: 400px; margin-bottom: 24px;">Presiona el botón para reiniciar la sesión y cargar nuevamente.</p>
      <button onclick="localStorage.clear(); window.location.reload();" style="background-color: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer;">
        Reiniciar Aplicación
      </button>
    </div>
  `;
}