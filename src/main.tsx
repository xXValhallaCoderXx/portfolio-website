import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import './styles/styles.css';
import './features/home/route.css';
import './styles/demos.css';
import './features/experience/experience.css';
import './features/projects/project.css';
import './features/projects/projectMedia.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
