import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import SingleLineHeadings from './components/SingleLineHeadings';
import './index.css';
import './heading-layout.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <SingleLineHeadings />
  </StrictMode>,
);
