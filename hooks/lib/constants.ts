/**
 * @fileoverview This file contains constants used throughout the application.
 * Centralizing these values makes the code more maintainable, easier to update,
 * and less prone to errors from typos.
 */

/**
 * The base number of drama cards to display on a single page. Used for pagination logic.
 * The actual number of items per page will be dynamically adjusted based on screen size
 * to ensure full rows are always displayed.
 */
export const BASE_ITEMS_PER_PAGE = 24;

/**
 * A collection of keys used for storing and retrieving data from the browser's local storage.
 * Using a constant object prevents typos and ensures consistency across the app when
 * accessing `localStorage`.
 */
export const LOCAL_STORAGE_KEYS = {
    /** 
     * Key for storing the map of registered users and their (unencrypted) passwords.
     * Note: For a real application, passwords should never be stored this way. This is for demonstration purposes only.
     * This is ONLY used in frontend-only mode.
     */
    USERS: 'dramaverse_users',
    /** 
     * Prefix for storing user-specific data. It's combined with the username to create a unique key
     * for each user's data (e.g., 'dramaverse_userdata_john').
     * This is ONLY used in frontend-only mode.
     */
    USER_DATA_PREFIX: 'dramaverse_userdata_',
    /** Key for storing the user's last-used filter settings, allowing preferences to persist across sessions. */
    FILTERS: 'dramaverse_filters',
    /** Key for storing the user's last-used sort priority settings. */
    SORT_PRIORITIES: 'dramaverse_sort_priorities',
    /** 
     * Key for storing the currently logged-in user's information (e.g., `{ "username": "john" }`).
     * This is ONLY used in frontend-only mode.
     */
    LOGGED_IN_USER: 'dramaverse_loggedin_user',
};