/**
 * @fileoverview Central configuration for the application.
 */

/**
 * Determines if the application should run in backend mode.
 * In backend mode, it communicates with an Express server for data and authentication.
 * In frontend-only mode, it uses a static JSON file for drama data and localStorage for user data.
 *
 * To enable backend mode:
 * 1. Set this flag to `true`.
 * 2. Ensure the backend server is running (see backend.md).
 */
export const BACKEND_MODE = true;

/**
 * The base URL for the backend API.
 * This is only used when BACKEND_MODE is true.
 * Using a relative path makes the app work correctly when served
 * behind a reverse proxy (e.g., Nginx), especially in a sub-directory.
 */
export const API_BASE_URL = 'api';

/**
 * The URL for the backend WebSocket server.
 * This is only used when BACKEND_MODE is true.
 *
 * An empty string is the correct and intended value for most deployments.
 * It instructs the Socket.IO client to connect to the same host and port
 * that served the web page. This works seamlessly when the frontend
 * and backend are served from the same domain, typically using a
 * reverse proxy like Nginx to route `/socket.io/` requests to the Node.js server.
 */
export const WEBSOCKET_URL = '';