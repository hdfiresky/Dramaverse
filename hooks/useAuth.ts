/**
 * @fileoverview A custom hook for managing user authentication and all user-specific data.
 * It encapsulates logic for registration, login, logout, and modifying user lists
 * like favorites and statuses. It persists data to `localStorage`.
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { User, UserData, UserDramaStatus, DramaStatus } from '../types';
import { LOCAL_STORAGE_KEYS } from './lib/constants';

/**
 * A hook to manage the application's authentication state and user data.
 * @param {() => void} [onLoginSuccess] - An optional callback function to be executed upon a successful login.
 * @returns An object containing the current user, user data, and functions to manage authentication and data.
 */
export const useAuth = (onLoginSuccess?: () => void) => {
    // `useLocalStorage` persists the logged-in user's session.
    const [currentUser, setCurrentUser] = useLocalStorage<User | null>(LOCAL_STORAGE_KEYS.LOGGED_IN_USER, null);
    
    // `useLocalStorage` stores all registered user accounts.
    // NOTE: In a real-world application, this would be handled by a secure backend, not localStorage.
    const [users, setUsers] = useLocalStorage<Record<string, { password: string }>>(LOCAL_STORAGE_KEYS.USERS, {});
    
    // `useState` holds the active user's data in memory.
    const [userData, setUserData] = useState<UserData>({ favorites: [], statuses: {}, reviews: {}, episodeReviews: {} });

    // This effect runs whenever `currentUser` changes (i.e., on login or logout).
    // It loads the corresponding user's data from localStorage or clears it.
    useEffect(() => {
        if (currentUser) {
            const data = localStorage.getItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${currentUser.username}`);
            setUserData(data ? JSON.parse(data) : { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} });
        } else {
            // If no user is logged in, reset userData to its default empty state.
            setUserData({ favorites: [], statuses: {}, reviews: {}, episodeReviews: {} });
        }
    }, [currentUser]);

    /**
     * Persists the current `userData` state to localStorage for the active user.
     * @param {UserData} newUserData - The user data object to save.
     */
    const persistUserData = (newUserData: UserData) => {
        if (currentUser) {
            localStorage.setItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${currentUser.username}`, JSON.stringify(newUserData));
        }
    };

    /**
     * Registers a new user.
     * @returns {string | null} An error message if the username already exists, otherwise null.
     */
    const register = useCallback((username: string, password: string): string | null => {
        if (!username || !password) return "Username and password cannot be empty.";
        if (users[username]) return "Username already exists.";
        setUsers({ ...users, [username]: { password } });
        return null;
    }, [users, setUsers]);

    /**
     * Logs in an existing user.
     * @returns {string | null} An error message on failure, otherwise null.
     */
    const login = useCallback((username: string, password: string): string | null => {
        if (!users[username] || users[username].password !== password) return "Invalid username or password.";
        setCurrentUser({ username });
        if (onLoginSuccess) onLoginSuccess();
        return null;
    }, [users, setCurrentUser, onLoginSuccess]);

    /** Logs out the current user by clearing the session. */
    const logout = useCallback(() => {
        setCurrentUser(null);
    }, [setCurrentUser]);

    /**
     * Toggles a drama's presence in the user's favorites list.
     * @returns {boolean} `true` if the action was performed, `false` if no user was logged in.
     */
    const toggleFavorite = useCallback((dramaUrl: string) => {
        if (!currentUser) return false;
        setUserData(currentData => {
            const isCurrentlyFavorite = currentData.favorites.includes(dramaUrl);
            const newFavorites = isCurrentlyFavorite
                ? currentData.favorites.filter(url => url !== dramaUrl)
                : [...currentData.favorites, dramaUrl];
            
            const newUserData = { ...currentData, favorites: newFavorites };
            persistUserData(newUserData);
            return newUserData;
        });
        return true;
    }, [currentUser]);

    /**
     * Sets or removes a drama's status (e.g., 'Watching', 'Completed').
     * @returns {boolean} `true` if the action was performed, `false` if no user was logged in.
     */
    const setDramaStatus = useCallback((dramaUrl: string, status: UserDramaStatus) => {
        if (!currentUser) return false;
        setUserData(currentData => {
            const newStatuses = { ...currentData.statuses };
            if (!status.status) { // If status is empty, remove it from the list.
                delete newStatuses[dramaUrl];
            } else {
                newStatuses[dramaUrl] = status;
            }
            const newUserData = { ...currentData, statuses: newStatuses };
            persistUserData(newUserData);
            return newUserData;
        });
        return true;
    }, [currentUser]);

    /**
     * Toggles a drama's status as 'Plan to Watch'. A convenience function.
     * @returns {boolean} `true` if the action was performed, `false` if no user was logged in.
     */
    const togglePlanToWatch = useCallback((dramaUrl: string) => {
        if (!currentUser) return false;
        setUserData(currentData => {
            const newStatuses = { ...currentData.statuses };
            const isCurrentlyPlanToWatch = newStatuses[dramaUrl]?.status === DramaStatus.PlanToWatch;

            if (isCurrentlyPlanToWatch) {
                // If it's already 'Plan to Watch', remove the status entirely.
                delete newStatuses[dramaUrl];
            } else {
                // Otherwise, set it to 'Plan to Watch'.
                newStatuses[dramaUrl] = { status: DramaStatus.PlanToWatch };
            }

            const newUserData = { ...currentData, statuses: newStatuses };
            persistUserData(newUserData);
            return newUserData;
        });
        return true;
    }, [currentUser]);

    /**
     * Saves or removes a review for a specific episode of a drama.
     * @returns {boolean} `true` if the action was performed, `false` if no user was logged in.
     */
    const setEpisodeReview = useCallback((dramaUrl: string, episodeNumber: number, text: string) => {
        if (!currentUser) return false;
        setUserData(currentData => {
            const newEpisodeReviews = JSON.parse(JSON.stringify(currentData.episodeReviews)); // Deep copy

            if (!newEpisodeReviews[dramaUrl]) {
                newEpisodeReviews[dramaUrl] = {};
            }

            if (text.trim() === '') {
                // If the review text is empty, delete the entry.
                delete newEpisodeReviews[dramaUrl][episodeNumber];
                // If the drama has no more episode reviews, remove the drama entry itself.
                if (Object.keys(newEpisodeReviews[dramaUrl]).length === 0) {
                    delete newEpisodeReviews[dramaUrl];
                }
            } else {
                newEpisodeReviews[dramaUrl][episodeNumber] = {
                    text,
                    updatedAt: Date.now()
                };
            }

            const newUserData = { ...currentData, episodeReviews: newEpisodeReviews };
            persistUserData(newUserData);
            return newUserData;
        });
        return true;
    }, [currentUser]);

    // Expose the state and action handlers for the App component to use.
    return {
        currentUser,
        userData,
        users,
        register,
        login,
        logout,
        toggleFavorite,
        setDramaStatus,
        togglePlanToWatch,
        setEpisodeReview,
    };
};