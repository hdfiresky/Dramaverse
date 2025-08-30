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
export const BACKEND_MODE = false;

/**
 * The base URL for the backend API.
 * This is only used when BACKEND_MODE is true.
 */
export const API_BASE_URL = 'http://localhost:3001/api';
