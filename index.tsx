import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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

console.log('--- INDEX.TSX STARTING ---');

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("FATAL: Could not find root element");
  throw new Error("Could not find root element to mount to");
}

rootElement.innerHTML = '<div style="padding: 20px; font-family: sans-serif;">Iniciando sistema...</div>';

try {
  console.log('Creating React Root...');
  const root = ReactDOM.createRoot(rootElement);
  console.log('Rendering App...');
  root.render(
    <React.StrictMode>
      {posthogToken ? (
        <PostHogProvider client={posthog}>
          <App />
        </PostHogProvider>
      ) : (
        <App />
      )}
    </React.StrictMode>
  );
  console.log('Render Called Successfully');
} catch (err) {
  console.error('REACT MOUNT ERROR:', err);
  rootElement.innerHTML = `<div style="color:red; padding: 20px;">Error crítico al iniciar: ${err}</div>`;
}