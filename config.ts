/**
 * @fileoverview Central configuration for the application.
 */

/**
 * The base path where the application is deployed.
 * For root deployments, change this to '/'.
 * For deployments in a subdirectory, it should be '/subdirectory/'.
 * IMPORTANT: Must start and end with a slash.
 */
export const BASE_PATH = '/dramaverse/';

/**
 * Determines if the application should run in backend mode.
 * In backend mode, it communicates with an Express server for data and authentication.
 * In frontend-only mode, it uses a static JSON file for drama data and localStorage for user data.
 *
 * To enable backend mode:
 * 1. Set this flag to `true`.
 * 2. Ensure the backend server is running (see backend.md).
 */
export const BACKEND_MODE = false;

/**
 * Enables verbose, color-coded logging for the Socket.IO connection in the browser console.
 * Set to `false` for production to avoid cluttering the console.
 */
export const ENABLE_DEBUG_LOGGING = true;

/**
 * The base URL for the backend API.
 * This is only used when BACKEND_MODE is true.
 * It is constructed from the BASE_PATH constant to work correctly in subdirectories.
 */
export const API_BASE_URL = `${BASE_PATH}api`.replace('//', '/');

/**
 * The URL for the backend WebSocket server.
 * This is only used when BACKEND_MODE is true.
 *
 * An empty string is the correct and intended value for most deployments.
 * It instructs the Socket.IO client to connect to the same host and port
 * that served the web page. This works seamlessly when the frontend
 * and backend are served from the same domain.
 *
 * Note: The connection *path* is configured dynamically in `hooks/useAuth.ts` using BASE_PATH.
 */
export const WEBSOCKET_URL = '';