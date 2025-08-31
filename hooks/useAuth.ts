/**
 * @fileoverview A custom hook for managing user authentication and all user-specific data.
 * It encapsulates logic for registration, login, logout, and modifying user lists
 * like favorites and statuses. It persists data to `localStorage` in frontend-only mode
 * and communicates with a backend server in backend mode.
 */
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useLocalStorage } from './useLocalStorage';
import { User, UserData, UserDramaStatus, DramaStatus, ConflictData, EpisodeReview } from '../types';
import { LOCAL_STORAGE_KEYS } from './lib/constants';
import { BASE_PATH, BACKEND_MODE, API_BASE_URL, WEBSOCKET_URL } from '../config';

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
    const [socket, setSocket] = useState<Socket | null>(null);

    // --- Frontend-Only Mode State ---
    const [localLoggedInUser, setLocalLoggedInUser] = useLocalStorage<User | null>(LOCAL_STORAGE_KEYS.LOGGED_IN_USER, null);
    const [localUsers, setLocalUsers] = useLocalStorage<Record<string, { password: string }>>(LOCAL_STORAGE_KEYS.USERS, {});
    
    // Effect to initialize auth state from storage, behavior depends on BACKEND_MODE
    useEffect(() => {
        const initialize = async () => {
            if (BACKEND_MODE) {
                setIsAuthLoading(true);
                if (authToken) {
                    try {
                        const res = await fetch(`${API_BASE_URL}/user/data`, {
                            headers: { 'Authorization': `Bearer ${authToken}` }
                        });
                        if (!res.ok) throw new Error('Invalid session');
                        // The backend now returns a comprehensive payload.
                        const { user, data } = await res.json();
                        setCurrentUser(user);
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

    // Effect to create and destroy the socket connection.
    useEffect(() => {
        if (BACKEND_MODE && authToken) {
            // Construct the WebSocket path from the BASE_PATH config to support subdirectories.
            // The server must be configured to listen on this same path.
            const socketPath = `${BASE_PATH}socket.io/`.replace('//', '/');

            const newSocket: Socket = io(WEBSOCKET_URL, {
                auth: { token: authToken },
                path: socketPath,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });
            setSocket(newSocket);

            // This cleanup function runs when authToken changes or the component unmounts
            return () => {
                newSocket.disconnect();
                setSocket(null);
            };
        }
    }, [authToken]);

    // Effect to manage socket event listeners for granular real-time updates.
    useEffect(() => {
        if (!socket) return;

        socket.on('connect', () => console.log('Socket connected.'));
        socket.on('disconnect', () => console.log('Socket disconnected.'));
        
        // Listener for favorite updates
        const handleFavoriteUpdate = ({ dramaUrl, isFavorite }: { dramaUrl: string, isFavorite: boolean }) => {
            setUserData(currentData => {
                const newFavorites = isFavorite
                    ? [...currentData.favorites, dramaUrl]
                    : currentData.favorites.filter(url => url !== dramaUrl);
                // Ensure no duplicates
                return { ...currentData, favorites: [...new Set(newFavorites)] };
            });
        };

        // Listener for status updates
        const handleStatusUpdate = ({ dramaUrl, statusInfo }: { dramaUrl: string, statusInfo: UserDramaStatus }) => {
            setUserData(currentData => {
                const newStatuses = { ...currentData.statuses };
                if (!statusInfo || !statusInfo.status) {
                    delete newStatuses[dramaUrl];
                } else {
                    newStatuses[dramaUrl] = statusInfo;
                }
                return { ...currentData, statuses: newStatuses };
            });
        };

        // Listener for episode review updates
        const handleEpisodeReviewUpdate = ({ dramaUrl, episodeNumber, review }: { dramaUrl: string, episodeNumber: number, review: EpisodeReview | null }) => {
            setUserData(currentData => {
                const newEpisodeReviews = JSON.parse(JSON.stringify(currentData.episodeReviews));
                if (!newEpisodeReviews[dramaUrl]) {
                    newEpisodeReviews[dramaUrl] = {};
                }
                if (review === null) {
                    delete newEpisodeReviews[dramaUrl][episodeNumber];
                     if (Object.keys(newEpisodeReviews[dramaUrl]).length === 0) {
                        delete newEpisodeReviews[dramaUrl];
                    }
                } else {
                    newEpisodeReviews[dramaUrl][episodeNumber] = review;
                }
                return { ...currentData, episodeReviews: newEpisodeReviews };
            });
        };

        socket.on('favorite_updated', handleFavoriteUpdate);
        socket.on('status_updated', handleStatusUpdate);
        socket.on('episode_review_updated', handleEpisodeReviewUpdate);

        // Cleanup listeners when the socket instance changes or component unmounts.
        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('favorite_updated', handleFavoriteUpdate);
            socket.off('status_updated', handleStatusUpdate);
            socket.off('episode_review_updated', handleEpisodeReviewUpdate);
        };
    }, [socket]);


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

                const token = data.token;
                if (!token) return "Registration failed: No token received from server.";
                
                // Set all state for the new user immediately.
                // New users have empty data, so no need for an extra fetch.
                setAuthToken(token);
                setCurrentUser(data.user);
                setUserData(EMPTY_USER_DATA);

                onLoginSuccess?.(); 
                return null;
            } catch (error) {
                return "Could not connect to the server.";
            }
        } else {
            if (localUsers[username]) return "Username already exists.";
            setLocalUsers({ ...localUsers, [username]: { password } });
            return null;
        }
    }, [localUsers, setLocalUsers, onLoginSuccess, setAuthToken]);

    const login = useCallback(async (username: string, password: string): Promise<string | null> => {
        if (BACKEND_MODE) {
            try {
                // 1. Authenticate and get token
                const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const loginData = await loginRes.json();
                if (!loginRes.ok) return loginData.message || "Login failed.";
                
                const token = loginData.token;
                if (!token) return "Login failed: No token received from server.";

                // 2. Immediately fetch user data with the new token
                const dataRes = await fetch(`${API_BASE_URL}/user/data`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!dataRes.ok) return "Login succeeded, but failed to fetch user data.";
                const { user, data } = await dataRes.json();
                
                // 3. Set all state at once to ensure UI updates correctly
                setAuthToken(token);
                setCurrentUser(user);
                setUserData(data);
                
                // 4. Call success callback to close modal
                onLoginSuccess?.();
                return null;

            } catch (error) {
                return "Could not connect to the server.";
            }
        } else {
            const usersFromStorage = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || '{}');
            if (!usersFromStorage[username] || usersFromStorage[username].password !== password) {
                return "Invalid username or password.";
            }
            setLocalLoggedInUser({ username });
            onLoginSuccess?.();
            return null;
        }
    }, [setAuthToken, onLoginSuccess, setLocalLoggedInUser]);

    const logout = useCallback(() => {
        if (BACKEND_MODE) {
            setAuthToken(null);
            setCurrentUser(null);
            setUserData(EMPTY_USER_DATA);
        } else {
            setLocalLoggedInUser(null);
        }
    }, [setAuthToken, setLocalLoggedInUser]);

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
                    const conflictData = await res.json();
                    openConflictModal?.({
                        endpoint,
                        clientPayload: body,
                        serverVersion: conflictData.serverVersion
                    });
                } else if (!res.ok) {
                    console.error('API update failed with status:', res.status);
                    setUserData(oldUserData);
                }
            } catch (error) {
                console.log('Network error detected. Request queued for background sync.', error);
            }
        } else {
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
        const clientUpdatedAt = userData.episodeReviews?.[dramaUrl]?.[episodeNumber]?.updatedAt || 0;
        
        return authenticatedUpdate(
            '/user/reviews/episodes',
            { dramaUrl, episodeNumber, text, clientUpdatedAt },
            (currentData) => {
                const newEpisodeReviews = JSON.parse(JSON.stringify(currentData.episodeReviews));
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
            setUserData(currentData => {
                const newEpisodeReviews = JSON.parse(JSON.stringify(currentData.episodeReviews));
                if (!newEpisodeReviews[clientPayload.dramaUrl]) newEpisodeReviews[clientPayload.dramaUrl] = {};
                newEpisodeReviews[clientPayload.dramaUrl][clientPayload.episodeNumber] = serverVersion;
                
                if (!BACKEND_MODE) {
                    localStorage.setItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${currentUser.username}`, JSON.stringify({ ...currentData, episodeReviews: newEpisodeReviews }));
                }
                return { ...currentData, episodeReviews: newEpisodeReviews };
            });
        } else { // resolution === 'client'
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
                    console.error("Forced update failed, will be retried by background sync:", error);
                }
            }
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