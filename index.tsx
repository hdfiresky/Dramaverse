/**
 * @fileoverview This is the main entry point for the React application.
 * It finds the root DOM element and renders the main <App /> component into it.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Find the root DOM element where the React app will be mounted.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Create a React root for the main application container.
const root = ReactDOM.createRoot(rootElement);

// Render the App component into the root.
// React.StrictMode is used to highlight potential problems in an application.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
