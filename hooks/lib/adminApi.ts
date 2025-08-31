/**
 * @fileoverview An abstraction layer for all admin-related API calls.
 * This module detects whether the app is in backend or frontend-only mode
 * and directs requests to either the live server or a localStorage simulation.
 */

import { BACKEND_MODE, API_BASE_URL } from '../../config';
import { AdminUserView, UserData } from '../../types';
import { LOCAL_STORAGE_KEYS } from './constants';

// The shape of the detailed user object stored in localStorage in frontend-only mode.
interface StoredUser {
    id: number;
    password: string;
    isAdmin?: boolean;
    is_banned?: boolean;
}

// Helper to get all stored user objects from localStorage.
const getLocalUsers = (): Record<string, StoredUser> => {
    try {
        const users = localStorage.getItem(LOCAL_STORAGE_KEYS.USERS);
        return users ? JSON.parse(users) : {};
    } catch {
        return {};
    }
};

// Helper to save all stored user objects back to localStorage.
const setLocalUsers = (users: Record<string, StoredUser>) => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(users));
};

/**
 * A helper function to process API responses and throw meaningful errors.
 * @param {Response} res The fetch response object.
 * @param {string} defaultErrorMessage The message to use if the server provides no specific error.
 */
const handleApiError = async (res: Response, defaultErrorMessage: string) => {
    if (!res.ok) {
        let message = defaultErrorMessage;
        try {
            // Try to parse a JSON error message from the server
            const errorData = await res.json();
            if (errorData && errorData.message) {
                message = errorData.message;
            }
        } catch (e) {
            // Ignore JSON parsing errors, the default message is fine
        }
        throw new Error(message);
    }
};


// --- API Abstractions ---

export const fetchAllUsers = async (): Promise<AdminUserView[]> => {
    if (BACKEND_MODE) {
        const res = await fetch(`${API_BASE_URL}/admin/users`, { credentials: 'include' });
        await handleApiError(res, 'Failed to fetch users from server.');
        return res.json();
    } else {
        // Frontend-only: Read from localStorage and format the data.
        const users = getLocalUsers();
        return Object.entries(users).map(([username, data]) => ({
            id: data.id,
            username,
            is_banned: data.is_banned || false,
        }));
    }
};

export const fetchUserDataForAdmin = async (userId: number): Promise<UserData> => {
    if (BACKEND_MODE) {
        const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/data`, { credentials: 'include' });
        await handleApiError(res, 'Failed to fetch user data from server.');
        return res.json();
    } else {
        // Frontend-only: Find the user by ID and get their specific data.
        const users = getLocalUsers();
        const userEntry = Object.entries(users).find(([, data]) => data.id === userId);
        if (!userEntry) throw new Error('User not found in localStorage.');
        
        const [username] = userEntry;
        const userDataString = localStorage.getItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${username}`);
        return userDataString ? JSON.parse(userDataString) : { favorites: [], statuses: {}, reviews: {}, episodeReviews: {} };
    }
};

export const toggleUserBan = async (userId: number, ban: boolean): Promise<void> => {
    if (BACKEND_MODE) {
        const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/ban`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ban }),
            credentials: 'include',
        });
        await handleApiError(res, 'Failed to update ban status on server.');
    } else {
        // Frontend-only: Update the is_banned flag in the user object.
        const users = getLocalUsers();
        const userEntry = Object.entries(users).find(([, data]) => data.id === userId);
        if (!userEntry) throw new Error('User not found in localStorage.');

        const [username, userData] = userEntry;
        // Mirror backend logic: prevent banning admins.
        if (userData.isAdmin) {
            throw new Error('Cannot ban an administrator.');
        }

        users[username].is_banned = ban;
        setLocalUsers(users);
    }
};

export const deleteUser = async (userId: number): Promise<void> => {
    if (BACKEND_MODE) {
        const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, { method: 'DELETE', credentials: 'include' });
        await handleApiError(res, 'Failed to delete user on server.');
    } else {
        // Frontend-only: Remove the user and their associated data.
        const users = getLocalUsers();
        const userEntry = Object.entries(users).find(([, data]) => data.id === userId);
        if (!userEntry) throw new Error('User not found in localStorage.');

        const [username, userData] = userEntry;
        
        // Mirror backend logic: prevent deleting admins.
        if (userData.isAdmin) {
            throw new Error('Cannot delete an administrator.');
        }

        delete users[username];
        setLocalUsers(users);
        localStorage.removeItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${username}`);
    }
};

export const resetUserPassword = async (userId: number): Promise<{ newPassword: string }> => {
    if (BACKEND_MODE) {
        const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/reset-password`, { method: 'POST', credentials: 'include' });
        await handleApiError(res, 'Failed to reset password on server.');
        return res.json();
    } else {
        // Frontend-only: Generate a random password and update the user object.
        const users = getLocalUsers();
        const userEntry = Object.entries(users).find(([, data]) => data.id === userId);
        if (!userEntry) throw new Error('User not found in localStorage.');

        const [username] = userEntry;
        const newPassword = Math.random().toString(36).slice(-8);
        users[username].password = newPassword; // Note: Passwords are not hashed in local mode.
        setLocalUsers(users);
        return { newPassword };
    }
};
