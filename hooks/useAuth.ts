/**
 * @fileoverview A custom hook for managing user authentication and all user-specific data.
 * It encapsulates logic for registration, login, logout, and modifying user lists
 * like favorites and statuses. It persists data to `localStorage` in frontend-only mode
 * and communicates with a backend server in backend mode.
 */
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useLocalStorage } from './useLocalStorage';
import { User, UserData, UserDramaStatus, DramaStatus, ConflictData, EpisodeReview, Drama } from '../types';
import { LOCAL_STORAGE_KEYS } from './lib/constants';
import { BASE_PATH, BACKEND_MODE, API_BASE_URL, WEBSOCKET_URL, ENABLE_DEBUG_LOGGING } from '../config';

const EMPTY_USER_DATA: UserData = { favorites: [], statuses: {}, reviews: {}, episodeReviews: {}, listUpdateTimestamps: {} };

// A helper type for the user object stored in localStorage in frontend-only mode.
interface LocalStoredUser {
    id: number;
    password: string;
    isAdmin?: boolean;
    is_banned?: boolean;
}

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
    const [socket, setSocket] = useState<Socket | null>(null);

    // --- Frontend-Only Mode State ---
    const [localLoggedInUser, setLocalLoggedInUser] = useLocalStorage<User | null>(LOCAL_STORAGE_KEYS.LOGGED_IN_USER, null);
    const [localUsers, setLocalUsers] = useLocalStorage<Record<string, LocalStoredUser>>(LOCAL_STORAGE_KEYS.USERS, {});
    
    // Effect to seed default admin user in frontend-only mode on initial load.
    useEffect(() => {
        if (!BACKEND_MODE) {
            setLocalUsers(currentUsers => {
                // Check if 'admin' user already exists to prevent overwriting
                if (!currentUsers['admin']) {
                    console.log('Seeding default admin user for frontend-only mode.');
                    const newAdmin: LocalStoredUser = {
                        id: 0, // Use a consistent, predictable ID for the default admin
                        password: 'admin', // Default password as requested
                        isAdmin: true,
                        is_banned: false,
                    };
                    return { ...currentUsers, admin: newAdmin };
                }
                return currentUsers; // No change needed
            });
        }
    }, [setLocalUsers]); // This effect runs only once on component mount.

    // Effect to initialize auth state from storage, behavior depends on BACKEND_MODE
    useEffect(() => {
        const initialize = async () => {
            if (BACKEND_MODE) {
                setIsAuthLoading(true);
                try {
                    // In backend mode with cookies, we can't check for a token.
                    // Instead, we directly ask the server for the current user's data.
                    // The browser will automatically send the auth cookie if it exists.
                    const res = await fetch(`${API_BASE_URL}/user/data`, {
                        // This option is crucial for sending cookies with cross-origin requests.
                        credentials: 'include', 
                    });
                    if (!res.ok) {
                        // A 401 or other error means no valid session exists.
                        throw new Error('No active session');
                    }
                    const { user, data } = await res.json();
                    setCurrentUser(user);
                    setUserData(data);
                } catch (error) {
                    console.log("No active session found.");
                    setCurrentUser(null);
                    setUserData(EMPTY_USER_DATA);
                } finally {
                    setIsAuthLoading(false);
                }
            } else {
                // Frontend-only mode logic is synchronous and unchanged.
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
    }, [localLoggedInUser]);

    // Effect to create and destroy the socket connection. It now depends on `currentUser`.
    useEffect(() => {
        if (BACKEND_MODE && currentUser) {
            const socketPath = `${BASE_PATH}socket.io/`.replace('//', '/');

            if (ENABLE_DEBUG_LOGGING) {
                 console.log(`%c[Socket.IO] Initializing connection to endpoint: ${WEBSOCKET_URL || window.location.origin} with path: ${socketPath}`, 'color: #2196f3;');
            }

            // The socket no longer needs to send the token in `auth`, as the initial HTTP
            // handshake for the connection will include the auth cookie automatically.
            const newSocket: Socket = io(WEBSOCKET_URL, {
                path: socketPath,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                withCredentials: true, // Important: ensures cookies are sent with the connection request.
            });

            if (ENABLE_DEBUG_LOGGING) {
                newSocket.on('connect', () => console.log('%c[Socket.IO] Connected successfully.', 'color: #4caf50; font-weight: bold;'));
                newSocket.on('disconnect', (reason) => console.warn(`%c[Socket.IO] Disconnected. Reason: ${reason}`, 'color: #ff9800;'));
                newSocket.on('connect_error', (error) => console.error('%c[Socket.IO] Connection Error:', 'color: #f44336; font-weight: bold;', error));
                newSocket.io.on('reconnect_attempt', (attempt) => console.log(`%c[Socket.IO] Reconnect attempt #${attempt}`, 'color: #2196f3;'));
                newSocket.io.on('reconnect', (attempt) => console.log(`%c[Socket.IO] Reconnected after ${attempt} attempts.`, 'color: #4caf50; font-weight: bold;'));
                newSocket.io.on('reconnect_failed', () => console.error('%c[Socket.IO] Failed to reconnect.', 'color: #f44336; font-weight: bold;'));
            }

            setSocket(newSocket);

            return () => {
                if (ENABLE_DEBUG_LOGGING) console.log('%c[Socket.IO] Cleaning up and disconnecting socket.', 'color: #ff9800;');
                newSocket.disconnect();
                setSocket(null);
            };
        }
    }, [currentUser]);

    // Effect to manage socket event listeners for granular real-time updates.
    useEffect(() => {
        if (!socket) return;
        
        // Listener for favorite updates
        const handleFavoriteUpdate = ({ dramaUrl, isFavorite }: { dramaUrl: string, isFavorite: boolean }) => {
            if (ENABLE_DEBUG_LOGGING) console.log('%c[Socket.IO] Received event: favorite_updated', 'color: #9c27b0;', { dramaUrl, isFavorite });
            setUserData(currentData => {
                const newFavorites = isFavorite
                    ? [...currentData.favorites, dramaUrl]
                    : currentData.favorites.filter(url => url !== dramaUrl);
                // Ensure no duplicates
                return { ...currentData, favorites: [...new Set(newFavorites)] };
            });
        };

        // Listener for status updates
        const handleStatusUpdate = ({ dramaUrl, statusInfo }: { dramaUrl: string, statusInfo: UserDramaStatus | null }) => {
            if (ENABLE_DEBUG_LOGGING) console.log('%c[Socket.IO] Received event: status_updated', 'color: #9c27b0;', { dramaUrl, statusInfo });
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
            if (ENABLE_DEBUG_LOGGING) console.log('%c[Socket.IO] Received event: episode_review_updated', 'color: #9c27b0;', { dramaUrl, episodeNumber, review });
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
            socket.off('favorite_updated', handleFavoriteUpdate);
            socket.off('status_updated', handleStatusUpdate);
            socket.off('episode_review_updated', handleEpisodeReviewUpdate);
        };
    }, [socket]);

    const login = useCallback(async (username: string, password: string): Promise<string | null> => {
        if (BACKEND_MODE) {
            try {
                // Authenticate. The server will set the cookie and return all user data.
                const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                    credentials: 'include',
                });
                const responseData = await loginRes.json();
                if (!loginRes.ok) return responseData.message || "Login failed.";
                
                // The backend now returns user and data directly, so no second call is needed.
                const { user, data } = responseData;
                
                // Set all state at once.
                setCurrentUser(user);
                setUserData(data);
                
                onLoginSuccess?.();
                return null;

            } catch (error) {
                return "Could not connect to the server.";
            }
        } else {
            const userFromStorage = localUsers[username];
            if (!userFromStorage || userFromStorage.password !== password) {
                return "Invalid username or password.";
            }
            if (userFromStorage.is_banned) {
                return "This account has been banned.";
            }
            setLocalLoggedInUser({ username, isAdmin: userFromStorage.isAdmin || false });
            onLoginSuccess?.();
            return null;
        }
    }, [onLoginSuccess, setLocalLoggedInUser, localUsers]);

    const register = useCallback(async (username: string, password: string): Promise<string | null> => {
        if (!username || !password) return "Username and password cannot be empty.";
        
        if (BACKEND_MODE) {
            try {
                const res = await fetch(`${API_BASE_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                    credentials: 'include', // Important for register to set cookie
                });
                const responseData = await res.json();
                if (!res.ok) return responseData.message || "Registration failed.";

                // The backend now returns the full user payload on successful registration.
                // We can use this directly to set the state without a second API call.
                const { user, data } = responseData;

                setCurrentUser(user);
                setUserData(data);
                
                onLoginSuccess?.();
                return null;
            } catch (error) {
                return "Could not connect to the server.";
            }
        } else {
            if (localUsers[username]) return "Username already exists.";
            
            const newUser: LocalStoredUser = {
                id: Date.now(),
                password: password,
                isAdmin: false,
                is_banned: false,
            };

            const updatedUsers = { ...localUsers, [username]: newUser };
            setLocalUsers(updatedUsers);
            
            // Replicate login logic directly to avoid stale state issues.
            setLocalLoggedInUser({ username, isAdmin: false });
            setUserData(EMPTY_USER_DATA);
            onLoginSuccess?.();
            return null;
        }
    }, [localUsers, setLocalUsers, onLoginSuccess, setLocalLoggedInUser]);

    const logout = useCallback(async () => {
        if (BACKEND_MODE) {
            try {
                // Ask the server to clear the HttpOnly cookie
                await fetch(`${API_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    credentials: 'include',
                });
            } catch (error) {
                console.error("Logout request failed, but clearing client state anyway.", error);
            } finally {
                // Always clear client-side state regardless of API call success
                setCurrentUser(null);
                setUserData(EMPTY_USER_DATA);
            }
        } else {
            setLocalLoggedInUser(null);
        }
    }, [setLocalLoggedInUser]);

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
                    },
                    credentials: 'include', // This sends the cookie.
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
    }, [currentUser, userData, openConflictModal]);
    
    const toggleFavorite = useCallback((dramaUrl: string) => {
        const isFavorite = userData.favorites.includes(dramaUrl);
        return authenticatedUpdate(
            '/user/favorites',
            { dramaUrl, isFavorite: !isFavorite },
            (currentData) => {
                const newFavorites = isFavorite
                    ? currentData.favorites.filter(url => url !== dramaUrl)
                    : [dramaUrl, ...currentData.favorites];
                const newListUpdateTimestamps = {
                    ...currentData.listUpdateTimestamps,
                    ['Favorites']: Date.now(),
                };
                return { ...currentData, favorites: newFavorites, listUpdateTimestamps: newListUpdateTimestamps };
            }
        );
    }, [userData, authenticatedUpdate]);

    const setDramaStatus = useCallback((dramaUrl: string, statusInfo: Omit<UserDramaStatus, 'updatedAt'>) => {
        const oldStatus = userData.statuses[dramaUrl]?.status;
        const newStatus = statusInfo.status;
        const now = Date.now();
        const statusWithTimestamp: UserDramaStatus = { ...statusInfo, updatedAt: now };

        return authenticatedUpdate(
            '/user/statuses',
            { dramaUrl, status: statusInfo.status, currentEpisode: statusInfo.currentEpisode },
            (currentData) => {
                const newStatuses = { ...currentData.statuses };
                const newListUpdateTimestamps = { ...currentData.listUpdateTimestamps };
                
                if (!newStatus) { // Status is being removed
                    delete newStatuses[dramaUrl];
                    if (oldStatus) {
                        newListUpdateTimestamps[oldStatus] = now;
                    }
                } else { // Status is being added or changed
                    newStatuses[dramaUrl] = statusWithTimestamp;
                    newListUpdateTimestamps[newStatus] = now;
                    // Also update the timestamp for the list the drama was moved FROM
                    if (oldStatus && oldStatus !== newStatus) {
                        newListUpdateTimestamps[oldStatus] = now;
                    }
                }
                return { ...currentData, statuses: newStatuses, listUpdateTimestamps: newListUpdateTimestamps };
            }
        );
    }, [authenticatedUpdate, userData.statuses]);

    const setReviewAndTrackProgress = useCallback((drama: Drama, episodeNumber: number, text: string) => {
        const { url: dramaUrl, episodes: totalEpisodes } = drama;
        
        // This is a composite action. It updates reviews AND statuses.
        // We'll give it a unique endpoint conceptually, but handle it with a single optimistic update.
        return authenticatedUpdate(
            '/user/reviews/track_progress', // A new conceptual endpoint for clarity
            { dramaUrl, episodeNumber, text, totalEpisodes },
            (currentData) => {
                const newUserData = JSON.parse(JSON.stringify(currentData)); // deep clone
                const { episodeReviews, statuses, listUpdateTimestamps } = newUserData;
                const now = Date.now();
    
                // 1. Update review
                if (!episodeReviews[dramaUrl]) episodeReviews[dramaUrl] = {};
                if (text.trim() === '') {
                    delete episodeReviews[dramaUrl][episodeNumber];
                    if (Object.keys(episodeReviews[dramaUrl]).length === 0) {
                        delete episodeReviews[dramaUrl];
                    }
                } else {
                    episodeReviews[dramaUrl][episodeNumber] = { text, updatedAt: now };
                }
    
                // 2. Update status and progress (only if adding/editing a review)
                if (text.trim() !== '') {
                    const oldStatusInfo = statuses[dramaUrl];
                    const oldStatus = oldStatusInfo?.status;
                    
                    let newStatusInfo: UserDramaStatus = oldStatusInfo 
                        ? { ...oldStatusInfo } 
                        : { status: DramaStatus.PlanToWatch, currentEpisode: 0, updatedAt: 0 };
    
                    // Auto-set to 'Watching' if it was 'Plan to Watch' or unset
                    if (!newStatusInfo.status || newStatusInfo.status === DramaStatus.PlanToWatch) {
                        newStatusInfo.status = DramaStatus.Watching;
                    }
                    
                    // Update progress to the latest reviewed episode
                    newStatusInfo.currentEpisode = Math.max(newStatusInfo.currentEpisode || 0, episodeNumber);
    
                    // Auto-set to 'Completed' if they reviewed the last episode
                    if (episodeNumber === totalEpisodes) {
                        newStatusInfo.status = DramaStatus.Completed;
                        newStatusInfo.currentEpisode = totalEpisodes;
                    }
    
                    // If status or episode number has changed, update the status object and timestamps
                    if (!oldStatusInfo || newStatusInfo.status !== oldStatus || newStatusInfo.currentEpisode !== oldStatusInfo.currentEpisode) {
                        newStatusInfo.updatedAt = now;
                        statuses[dramaUrl] = newStatusInfo;
                        
                        // Update timestamp for the list the drama is NOW in
                        listUpdateTimestamps[newStatusInfo.status] = now;
                        // Also update timestamp for the list it was IN, to re-sort that list too
                        if (oldStatus && oldStatus !== newStatusInfo.status) {
                            listUpdateTimestamps[oldStatus] = now;
                        }
                    }
                }
                
                return newUserData;
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
        setReviewAndTrackProgress,
    };
};