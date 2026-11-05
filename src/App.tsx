import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { BootGate } from '@/app/BootGate';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { useAppearance } from '@/app/theme';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { UpdateNotifier } from '@/app/UpdateNotifier';
import { ToastProvider } from '@/ui';

// Settings (backup/zod, pack UI) is rarely opened first, so it loads on demand to keep the initial bundle small.
const SettingsScreen = lazy(() =>
  import('@/features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);

// The Song screen carries the engine's display code (Hepburn tables, overlay, Word sheet); it loads when first opened.
const SongScreen = lazy(() =>
  import('@/features/song/SongScreen').then((m) => ({ default: m.SongScreen })),
);
const LicencesScreen = lazy(() =>
  import('@/features/about/LicencesScreen').then((m) => ({ default: m.LicencesScreen })),
);

export function AppRoutes() {
  useAppearance();
  return (
    <Routes>
      <Route path="/" element={<LibraryScreen />} />
      <Route
        path="/song/:id"
        element={
          <Suspense fallback={null}>
            <SongScreen />
          </Suspense>
        }
      />
      <Route
        path="/settings"
        element={
          <Suspense fallback={null}>
            <SettingsScreen />
          </Suspense>
        }
      />
      <Route
        path="/licences"
        element={
          <Suspense fallback={null}>
            <LicencesScreen />
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
        <UpdateNotifier />
        <BootGate>
          <BrowserRouter basename={basename}>
            <AppRoutes />
          </BrowserRouter>
        </BootGate>
      </ToastProvider>
    </ErrorBoundary>
  );
}
