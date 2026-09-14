import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers';
import { createAppRouter } from './app/router';
import './styles/index.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root container "#root" is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={createAppRouter()} />
    </AppProviders>
  </StrictMode>,
);
