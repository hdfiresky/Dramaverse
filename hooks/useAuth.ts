/**
 * @fileoverview A custom hook for managing user authentication and all user-specific data.
 * It encapsulates logic for registration, login, logout, and modifying user lists
 * like favorites and statuses. It persists data to `localStorage` in frontend-only mode
 * and communicates with a backend server in backend mode.
 */
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useLocalStorage } from './useLocalStorage';
import { User, UserData, UserDramaStatus, DramaStatus, ConflictData } from '../types';
import { LOCAL_STORAGE_KEYS } from './lib/constants';
import { BACKEND_MODE, API_BASE_URL, WEBSOCKET_URL } from '../config';

const EMPTY_USER_DATA: UserData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} };

/**
 * A hook to manage the application's authentication state and user data.
 * @param {() => void} [onLoginSuccess] - An optional callback function to be executed upon a successful login.
 * @param {(data: ConflictData) => void} [openConflictModal] - Callback to open the conflict resolution modal.
 * @returns An object containing the current user, user data, and functions to manage authentication and data.
 */
export const useAuth = (onLoginSuccess?: () => void, openConflictModal?: (data: ConflictData) => void) => {
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
                // On initial load in backend mode, we assume loading until session is validated.
                setIsAuthLoading(true);
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
                } else {
                     setIsAuthLoading(false);
                }
            } else {
                // Frontend-only mode logic is synchronous
                setIsAuthLoading(false);
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

    // Effect to manage the real-time WebSocket connection.
    useEffect(() => {
        // Only connect if in backend mode, user is logged in (has token), and online.
        if (BACKEND_MODE && authToken && navigator.onLine) {
            const newSocket: Socket = io(WEBSOCKET_URL, {
                auth: { token: authToken }
            });

            newSocket.on('connect', () => console.log('Connected to real-time server.'));
            newSocket.on('disconnect', () => console.log('Disconnected from real-time server.'));

            // The server will emit this event with the full, updated user data object.
            // This ensures the client state is always in sync with the database.
            newSocket.on('user_data_updated', (newUserData: UserData) => {
                console.log('Real-time data update received from server.');
                setUserData(newUserData);
            });

            // Cleanup function: disconnects the socket when the token changes (logout) or the component unmounts.
            return () => {
                newSocket.disconnect();
            };
        }
    }, [authToken]);


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
                // The useEffect watching authToken will handle fetching user data and setting the user.
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
        const newUserData = updateFn(oldUserData);
        setUserData(newUserData); // Optimistic UI update

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
                 if (res.status === 409) {
                    // CONFLICT DETECTED!
                    const conflictData = await res.json();
                    openConflictModal?.({
                        endpoint,
                        clientPayload: body,
                        serverVersion: conflictData.serverVersion
                    });
                    // Do not revert UI, let the user resolve it.
                } else if (!res.ok) {
                    // The server responded with a different error (e.g., 401, 500).
                    // This is not a network error, so the action failed permanently.
                    // We must revert the optimistic update.
                    console.error('API update failed with status:', res.status);
                    setUserData(oldUserData);
                }
                // If res.ok is true, the update was successful, so the optimistic state is correct.
                // The backend will emit a WebSocket event to update other clients.
            } catch (error) {
                // The fetch itself failed. This is a network error (e.g., user is offline).
                // The service worker's BackgroundSyncPlugin will queue this request.
                // We DO NOT revert the optimistic UI update.
                console.log('Network error detected. Request queued for background sync.', error);
            }
        } else {
             // In frontend mode, persist the optimistically updated data to localStorage.
            localStorage.setItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${currentUser.username}`, JSON.stringify(newUserData));
        }
        return true;
    }, [currentUser, authToken, userData, openConflictModal]);
    
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
        // Find the `updatedAt` of the current review to send to the server for conflict detection.
        const clientUpdatedAt = userData.episodeReviews?.[dramaUrl]?.[episodeNumber]?.updatedAt || 0;
        
        return authenticatedUpdate(
            '/user/reviews/episodes',
            { dramaUrl, episodeNumber, text, clientUpdatedAt }, // Send clientUpdatedAt with the payload
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
    }, [authenticatedUpdate, userData.episodeReviews]);

    const resolveReviewConflict = useCallback(async (
        clientPayload: { dramaUrl: string, episodeNumber: number, text: string },
        serverVersion: { text: string, updatedAt: number },
        resolution: 'client' | 'server'
    ) => {
        if (!currentUser) return;
    
        if (resolution === 'server') {
            // Revert the optimistic update to match the server's state.
            setUserData(currentData => {
                const newEpisodeReviews = JSON.parse(JSON.stringify(currentData.episodeReviews));
                if (!newEpisodeReviews[clientPayload.dramaUrl]) newEpisodeReviews[clientPayload.dramaUrl] = {};
                newEpisodeReviews[clientPayload.dramaUrl][clientPayload.episodeNumber] = serverVersion;
                
                // Persist the reverted state to localStorage in frontend-only mode.
                if (!BACKEND_MODE) {
                    localStorage.setItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${currentUser.username}`, JSON.stringify({ ...currentData, episodeReviews: newEpisodeReviews }));
                }
                return { ...currentData, episodeReviews: newEpisodeReviews };
            });
        } else { // resolution === 'client'
            // Re-submit the user's version, but this time with a `force` flag to bypass the conflict check.
            if (BACKEND_MODE) {
                try {
                    await fetch(`${API_BASE_URL}/user/reviews/episodes`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify({ ...clientPayload, force: true })
                    });
                } catch (error) {
                    // If this fails, the service worker will still pick it up.
                    console.error("Forced update failed, will be retried by background sync:", error);
                }
            }
            // In frontend-only mode, the optimistic update is already correct, so no action is needed.
        }
    }, [currentUser, authToken]);
    

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
        resolveReviewConflict,
    };
};