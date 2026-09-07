import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorPage from './components/ErrorPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      fallback={
        <ErrorPage
          code={500}
          title="Application Error"
          message="An unexpected error occurred. Please try refreshing the page."
          onRetry={() => window.location.reload()}
        />
      }
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
