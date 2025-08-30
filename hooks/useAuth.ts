/**
 * @fileoverview A custom hook for managing user authentication and all user-specific data.
 * It encapsulates logic for registration, login, logout, and modifying user lists
 * like favorites and statuses. It persists data to `localStorage` in frontend-only mode
 * and communicates with a backend server in backend mode.
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { User, UserData, UserDramaStatus, DramaStatus } from '../types';
import { LOCAL_STORAGE_KEYS } from './lib/constants';
import { BACKEND_MODE, API_BASE_URL } from '../config';

const EMPTY_USER_DATA: UserData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} };

/**
 * A hook to manage the application's authentication state and user data.
 * @param {() => void} [onLoginSuccess] - An optional callback function to be executed upon a successful login.
 * @returns An object containing the current user, user data, and functions to manage authentication and data.
 */
export const useAuth = (onLoginSuccess?: () => void) => {
    // --- Common State ---
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData>(EMPTY_USER_DATA);
    const [isAuthLoading, setIsAuthLoading] = useState(BACKEND_MODE); // Only true on init in backend mode

    // --- Backend Mode State ---
    const [authToken, setAuthToken] = useLocalStorage<string | null>(LOCAL_STORAGE_KEYS.AUTH_TOKEN, null);

    // --- Frontend-Only Mode State ---
    const [localLoggedInUser, setLocalLoggedInUser] = useLocalStorage<User | null>(LOCAL_STORAGE_KEYS.LOGGED_IN_USER, null);
    const [localUsers, setLocalUsers] = useLocalStorage<Record<string, { password: string }>>(LOCAL_STORAGE_KEYS.USERS, {});
    
    // Effect to initialize auth state from storage, behavior depends on BACKEND_MODE
    useEffect(() => {
        const initialize = async () => {
            if (BACKEND_MODE) {
                if (authToken) {
                    try {
                        const res = await fetch(`${API_BASE_URL}/user/data`, {
                            headers: { 'Authorization': `Bearer ${authToken}` }
                        });
                        if (!res.ok) throw new Error('Invalid session');
                        const data = await res.json();
                        // A bit of a hack: The token only contains id/username, but we need the username for the UI.
                        // We can decode it without verification just for the username.
                        const payload = JSON.parse(atob(authToken.split('.')[1]));
                        setCurrentUser({ username: payload.username });
                        setUserData(data);
                    } catch (error) {
                        console.error("Session validation failed:", error);
                        setAuthToken(null); // Clear invalid token
                    } finally {
                        setIsAuthLoading(false);
                    }
                }
            } else {
                // Frontend-only mode logic
                setCurrentUser(localLoggedInUser);
                if (localLoggedInUser) {
                    const data = localStorage.getItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${localLoggedInUser.username}`);
                    setUserData(data ? JSON.parse(data) : EMPTY_USER_DATA);
                } else {
                    setUserData(EMPTY_USER_DATA);
                }
            }
        };
        initialize();
    }, [authToken, localLoggedInUser, setAuthToken]);

    const register = useCallback(async (username: string, password: string): Promise<string | null> => {
        if (!username || !password) return "Username and password cannot be empty.";
        
        if (BACKEND_MODE) {
            try {
                const res = await fetch(`${API_BASE_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (!res.ok) return data.message || "Registration failed.";
                return null;
            } catch (error) {
                return "Could not connect to the server.";
            }
        } else {
            if (localUsers[username]) return "Username already exists.";
            setLocalUsers({ ...localUsers, [username]: { password } });
            return null;
        }
    }, [localUsers, setLocalUsers]);

    const login = useCallback(async (username: string, password: string): Promise<string | null> => {
        if (BACKEND_MODE) {
            try {
                const res = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (!res.ok) return data.message || "Login failed.";
                setAuthToken(data.token);
                setCurrentUser(data.user);
                // User data will be fetched by the useEffect that watches authToken
                onLoginSuccess?.();
                return null;
            } catch (error) {
                return "Could not connect to the server.";
            }
        } else {
            if (!localUsers[username] || localUsers[username].password !== password) return "Invalid username or password.";
            setLocalLoggedInUser({ username });
            onLoginSuccess?.();
            return null;
        }
    }, [setAuthToken, onLoginSuccess, localUsers, setLocalLoggedInUser]);

    const logout = useCallback(() => {
        if (BACKEND_MODE) {
            setAuthToken(null);
            setCurrentUser(null);
            setUserData(EMPTY_USER_DATA);
        } else {
            setLocalLoggedInUser(null);
        }
    }, [setAuthToken, setLocalLoggedInUser]);

    // --- Generic function for authenticated data updates ---
    const authenticatedUpdate = useCallback(async (endpoint: string, body: object, updateFn: (data: UserData) => UserData) => {
        if (!currentUser) return false;
        
        const oldUserData = userData;
        setUserData(updateFn); // Optimistic UI update

        if (BACKEND_MODE) {
            try {
                const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('API update failed');
            } catch (error) {
                console.error(`Failed to update ${endpoint}:`, error);
                setUserData(oldUserData); // Rollback on failure
            }
        } else {
             // In frontend mode, persist the optimistically updated data
            const newUserData = updateFn(userData);
            localStorage.setItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${currentUser.username}`, JSON.stringify(newUserData));
        }
        return true;
    }, [currentUser, authToken, userData]);
    
    const toggleFavorite = useCallback((dramaUrl: string) => {
        const isFavorite = userData.favorites.includes(dramaUrl);
        return authenticatedUpdate(
            '/user/favorites',
            { dramaUrl, isFavorite: !isFavorite },
            (currentData) => {
                const newFavorites = isFavorite
                    ? currentData.favorites.filter(url => url !== dramaUrl)
                    : [...currentData.favorites, dramaUrl];
                return { ...currentData, favorites: newFavorites };
            }
        );
    }, [userData, authenticatedUpdate]);

    const setDramaStatus = useCallback((dramaUrl: string, statusInfo: UserDramaStatus) => {
        return authenticatedUpdate(
            '/user/statuses',
            { dramaUrl, status: statusInfo.status, currentEpisode: statusInfo.currentEpisode },
            (currentData) => {
                const newStatuses = { ...currentData.statuses };
                if (!statusInfo.status) {
                    delete newStatuses[dramaUrl];
                } else {
                    newStatuses[dramaUrl] = statusInfo;
                }
                return { ...currentData, statuses: newStatuses };
            }
        );
    }, [authenticatedUpdate]);

    const togglePlanToWatch = useCallback((dramaUrl: string) => {
        const isCurrentlyPlanToWatch = userData.statuses[dramaUrl]?.status === DramaStatus.PlanToWatch;
        const newStatusInfo = isCurrentlyPlanToWatch ? { status: '' as DramaStatus } : { status: DramaStatus.PlanToWatch };
        return setDramaStatus(dramaUrl, newStatusInfo as any);
    }, [userData, setDramaStatus]);

    const setEpisodeReview = useCallback((dramaUrl: string, episodeNumber: number, text: string) => {
        return authenticatedUpdate(
            '/user/reviews/episodes',
            { dramaUrl, episodeNumber, text },
            (currentData) => {
                const newEpisodeReviews = JSON.parse(JSON.stringify(currentData.episodeReviews)); // Deep copy
                if (!newEpisodeReviews[dramaUrl]) newEpisodeReviews[dramaUrl] = {};
                if (text.trim() === '') {
                    delete newEpisodeReviews[dramaUrl][episodeNumber];
                    if (Object.keys(newEpisodeReviews[dramaUrl]).length === 0) {
                        delete newEpisodeReviews[dramaUrl];
                    }
                } else {
                    newEpisodeReviews[dramaUrl][episodeNumber] = { text, updatedAt: Date.now() };
                }
                return { ...currentData, episodeReviews: newEpisodeReviews };
            }
        );
    }, [authenticatedUpdate]);

    return {
        currentUser,
        userData,
        isAuthLoading,
        register,
        login,
        logout,
        toggleFavorite,
        setDramaStatus,
        togglePlanToWatch,
        setEpisodeReview,
    };
};
