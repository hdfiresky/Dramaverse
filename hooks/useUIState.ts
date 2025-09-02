/**
 * @fileoverview A custom hook for managing global UI state.
 * This hook centralizes state related to the presentation layer, such as which
 * view is active, which modals are open, and pagination. This separates UI concerns
 * from data-related logic (like `useDramas` or `useAuth`).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Drama, ModalStackItem, ConflictData } from '../types';
import { useLocalStorage } from './useLocalStorage';

export type ActiveView = 'home' | 'my-list' | 'all-reviews' | 'admin' | 'recommendations';

/**
 * A hook to manage the state of the application's user interface.
 * @returns An object containing UI state variables and functions to manipulate them.
 */
export const useUIState = () => {
    /** The active main view, either 'home' for discovery or 'my-list' for user collections. */
    const [activeView, setActiveView] = useState<ActiveView>('home');
    /** A stack to manage the history of opened modals for navigation. */
    const [modalStack, setModalStack] = useState<ModalStackItem[]>([]);
    /** Boolean flag for the visibility of the authentication (login/register) modal. */
    const [isAuthModalOpen, setAuthModalOpen] = useState(false);
    /** Boolean flag for the visibility of the filter sidebar. */
    const [isFilterSidebarOpen, setFilterSidebarOpen] = useState(false);
    /** The current page number for paginated views. */
    const [currentPage, setCurrentPage] = useState(1);
    /** State to hold data for the conflict resolution modal. */
    const [conflictData, setConflictData] = useState<ConflictData | null>(null);
    /** A ref to store the scroll position for each main view to restore on navigation. */
    const scrollPositions = useRef<Partial<Record<ActiveView, number>>>({});


    // --- Theme State Logic ---
    const getInitialTheme = useCallback(() => {
        if (typeof window !== 'undefined') {
            try {
                const item = window.localStorage.getItem('dramaverse_theme');
                // The stored value is a JSON string (e.g., '"dark"'), so we must parse it.
                const storedTheme = item ? JSON.parse(item) : null;
                if (storedTheme === 'light' || storedTheme === 'dark') {
                    return storedTheme;
                }
            } catch (e) {
                // Ignore parsing errors from malformed data.
            }

            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        }
        return 'light'; // Default to light theme
    }, []);
    
    const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('dramaverse_theme', getInitialTheme());

    useEffect(() => {
        const root = window.document.documentElement;
        // Use classList.toggle for a cleaner way to add/remove the class
        root.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    }, [setTheme]);


    // Effect to lock body scroll when any modal is open.
    useEffect(() => {
        const isModalOpen = modalStack.length > 0 || isAuthModalOpen || !!conflictData;
        if (isModalOpen) {
            document.body.classList.add('overflow-hidden');
        } else {
            document.body.classList.remove('overflow-hidden');
        }

        // Cleanup function to ensure the class is removed if the component unmounts
        // while a modal is open.
        return () => {
            document.body.classList.remove('overflow-hidden');
        };
    }, [modalStack, isAuthModalOpen, conflictData]);


    // All setter functions are wrapped in `useCallback` to ensure they have a stable identity
    // across re-renders. This is a performance optimization that prevents unnecessary re-renders
    // in child components that receive these functions as props.

    /**
     * Navigates to a different main view, saving the current scroll position
     * and restoring the new view's previous scroll position.
     */
    const navigateTo = useCallback((view: ActiveView) => {
        // Save the scroll position for the view we are leaving.
        scrollPositions.current[activeView] = window.scrollY;
        
        // Change the active view.
        setActiveView(view);
        setCurrentPage(1); // Always reset to page 1 when changing views.
    }, [activeView]); // Depends on activeView to know which key to save the scroll position to.
    
    // This effect runs after the view has changed to restore the scroll position.
    useEffect(() => {
        requestAnimationFrame(() => {
            // "My List" should always start from the top. For other pages, restore the scroll position.
            if (activeView === 'my-list' || activeView === 'recommendations') {
                window.scrollTo(0, 0);
            } else {
                window.scrollTo(0, scrollPositions.current[activeView] || 0);
            }
        });
    }, [activeView]);


    /** Pushes a new modal onto the navigation stack. */
    const pushModal = useCallback((item: ModalStackItem) => {
        setModalStack(prev => [...prev, item]);
    }, []);

    /** Pops the top-most modal from the navigation stack (goes "back"). */
    const popModal = useCallback(() => {
        setModalStack(prev => prev.slice(0, -1));
    }, []);
    
    /** Clears the entire modal stack, closing all modals. */
    const closeAllModals = useCallback(() => {
        setModalStack([]);
    }, []);
    
    /** Opens the authentication modal. */
    const openAuthModal = useCallback(() => setAuthModalOpen(true), []);
    /** Closes the authentication modal. */
    const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

    /** Toggles the filter sidebar's visibility, or sets it to a specific state. */
    const toggleFilterSidebar = useCallback((isOpen?: boolean) => {
        setFilterSidebarOpen(prev => isOpen === undefined ? !prev : isOpen);
    }, []);

    /** Opens the conflict resolution modal with the necessary data. */
    const openConflictModal = useCallback((data: ConflictData) => setConflictData(data), []);
    /** Closes the conflict resolution modal. */
    const closeConflictModal = useCallback(() => setConflictData(null), []);

    return {
        activeView,
        navigateTo,
        modalStack,
        pushModal,
        popModal,
        closeAllModals,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        isFilterSidebarOpen,
        toggleFilterSidebar,
        currentPage,
        setCurrentPage,
        theme,
        toggleTheme,
        conflictData,
        openConflictModal,
        closeConflictModal,
    };
};