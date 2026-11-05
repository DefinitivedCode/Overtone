import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { BootGate } from '@/app/BootGate';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { useAppearance } from '@/app/theme';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { SongScreen } from '@/features/song/SongScreen';
import { ToastProvider } from '@/ui';

// Settings (backup/zod, pack UI) is rarely opened first, so it loads on demand to keep the initial bundle small.
const SettingsScreen = lazy(() =>
  import('@/features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);

export function AppRoutes() {
  useAppearance();
  return (
    <Routes>
      <Route path="/" element={<LibraryScreen />} />
      <Route path="/song/:id" element={<SongScreen />} />
      <Route
        path="/settings"
        element={
          <Suspense fallback={null}>
            <SettingsScreen />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BootGate>
          <BrowserRouter basename={basename}>
            <AppRoutes />
          </BrowserRouter>
        </BootGate>
      </ToastProvider>
    </ErrorBoundary>
  );
}
