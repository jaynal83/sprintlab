import { Header } from './components/layout/Header';
import { Dashboard } from './components/layout/Dashboard';

declare global {
  interface Window {
    electronAPI?: {
      onBackendReady: (cb: () => void) => void;
      onFullscreenChange: (cb: (isFullscreen: boolean) => void) => void;
      exitFullscreen: () => void;
    };
  }
}

export function App() {
  return (
    <div className="flex flex-col h-full">
      <Header />
      <Dashboard />
    </div>
  );
}

export default App;
