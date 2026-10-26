import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { DayViewPage } from './features/day-view/DayViewPage';
import { TripSetupPage } from './features/trip-setup/TripSetupPage';
import { TripProvider } from './state/TripProvider';
import { LoadError } from './ui/LoadError';
import { LoadingCards } from './ui/LoadingCards';
import './styles/tokens.css';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/setup" replace /> },
  { path: '/setup', element: <TripSetupPage /> },
  { path: '/trip/day/:dayNumber', element: <DayViewPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoadError>
      <Suspense fallback={<LoadingCards />}>
        <TripProvider>
          <RouterProvider router={router} />
        </TripProvider>
      </Suspense>
    </LoadError>
  </StrictMode>,
);
