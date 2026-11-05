import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { useAppearance } from '@/app/theme';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { ToastProvider } from '@/ui';

export function AppRoutes() {
  useAppearance();
  return (
    <Routes>
      <Route path="/" element={<LibraryScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter basename={basename}>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
