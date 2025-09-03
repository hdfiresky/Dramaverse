/**
 * @fileoverview A custom hook for client-side routing and URL state management.
 * This hook centralizes all logic for interacting with the browser's History API,
 * parsing the URL, and providing a clean interface for navigation.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { ModalStackItem } from '../types';
import { BASE_PATH } from '../config';

export type ActiveView = 'home' | 'my-list' | 'all-reviews' | 'admin' | 'recommendations' | 'privacy-policy' | 'terms-of-service';

// Helper to safely encode and decode the modal stack for the URL.
const encodeModalStack = (stack: ModalStackItem[]): string => {
    return encodeURIComponent(JSON.stringify(stack));
};

const decodeModalStack = (param: string | null): ModalStackItem[] => {
    if (!param) return [];
    try {
        const decoded = decodeURIComponent(param);
        const parsed = JSON.parse(decoded);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Failed to parse modal_stack:", e);
        return [];
    }
};

/**
 * A hook that provides routing capabilities and derives application state from the URL.
 * It is the single source of truth for the current location, active view, and modal stack.
 */
export const useRouter = () => {
    // State to hold the current location object, derived from window.location.
    const [location, setLocation] = useState({
        pathname: window.location.pathname,
        query: new URLSearchParams(window.location.search),
    });

    // Effect to listen for browser back/forward navigation events.
    useEffect(() => {
        const handlePopState = () => {
            setLocation({
                pathname: window.location.pathname,
                query: new URLSearchParams(window.location.search),
            });
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    
    // --- DERIVED STATE ---
    // Memoized values derived from the raw location state.

    /** The active main view, derived from the URL pathname. */
    const activeView = useMemo<ActiveView>(() => {
        const path = location.pathname.replace(BASE_PATH, '').replace(/\/$/, '');
        const view = path.split('/')[0] as ActiveView;
        const validViews: ActiveView[] = ['home', 'my-list', 'all-reviews', 'admin', 'recommendations', 'privacy-policy', 'terms-of-service'];
        if (validViews.includes(view)) return view;
        return 'home'; // Default to home
    }, [location.pathname]);

    /** The stack of open modals, parsed from the `modal_stack` query parameter. */
    const modalStack = useMemo<ModalStackItem[]>(() => {
        return decodeModalStack(location.query.get('modal_stack'));
    }, [location.query]);

    // --- THEME ---
    const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('dramaverse_theme', 
        () => (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
    );
     useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);
    const toggleTheme = useCallback(() => setTheme(p => p === 'light' ? 'dark' : 'light'), [setTheme]);

    // --- NAVIGATION ACTIONS ---

    /**
     * Programmatically navigates to a new path, replacing the history state.
     * @param {string} path - The new path to navigate to (e.g., '/home', '/my-list').
     */
    const navigate = useCallback((path: string) => {
        // Construct the full path including the base path
        const fullPath = (BASE_PATH + path).replace('//', '/');
        if (window.location.pathname !== fullPath) {
            // Preserve modal stack on main navigation, but clear other transient params like filters.
            const modalStackParam = location.query.get('modal_stack');
            const newQuery = new URLSearchParams();
            if (modalStackParam) {
                newQuery.set('modal_stack', modalStackParam);
            }
            const searchString = newQuery.toString() ? `?${newQuery.toString()}` : '';

            window.history.pushState({}, '', `${fullPath}${searchString}`);
            setLocation({
                pathname: fullPath,
                query: newQuery,
            });
        }
    }, [location.pathname, location.query]);

    /**
     * Updates one or more query parameters in the URL.
     * @param {object} paramsToUpdate - An object where keys are param names and values are their new values.
     * A value of `undefined` will remove the parameter. A value of type `ModalStackItem[]` will be specially encoded.
     * @param {boolean} [replace=false] - If true, uses `replaceState` instead of `pushState`, which does not create a new history entry.
     */
    const updateQuery = useCallback((paramsToUpdate: Record<string, any>, replace = false) => {
        const newQuery = new URLSearchParams(location.query);
        Object.entries(paramsToUpdate).forEach(([key, value]) => {
            if (value === undefined || value === null || (typeof value === 'string' && value === '')) {
                newQuery.delete(key);
            } else if (key === 'modal_stack') {
                if (Array.isArray(value) && value.length > 0) {
                    newQuery.set(key, encodeModalStack(value));
                } else {
                    newQuery.delete(key);
                }
            } else {
                newQuery.set(key, String(value));
            }
        });

        // Only update history if the query string has actually changed.
        if (newQuery.toString() !== location.query.toString()) {
            const newUrl = `${location.pathname}?${newQuery.toString()}`;
            const historyMethod = replace ? window.history.replaceState : window.history.pushState;
            historyMethod.call(window.history, {}, '', newUrl);
            setLocation({ pathname: location.pathname, query: newQuery });
        }
    }, [location.pathname, location.query]);

    return {
        location,
        navigate,
        updateQuery,
        activeView,
        modalStack,
        theme,
        toggleTheme,
    };
};