import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './store';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.DEV) Object.assign(window, { __store: useStore });
