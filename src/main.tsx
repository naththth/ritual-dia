import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
