/**
 * @fileoverview The main application component, acting as the root container.
 * It orchestrates the entire application by composing custom hooks for state management
 * and rendering the primary layout and components. This component is responsible for
 * connecting the data and logic from hooks to the presentational components.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Filters, SortPriority, UserData, UserDramaStatus, Drama } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useUIState } from './hooks/useUIState';
import { useAuth } from './hooks/useAuth';
import { useDramas } from './hooks/useDramas';
import { useDebounce } from './hooks/useDebounce';
import { LOCAL_STORAGE_KEYS, ITEMS_PER_PAGE } from './hooks/lib/constants';

// Component Imports
import { Header } from './components/Header';
import { FilterSidebar } from './components/FilterSidebar';
import { MyListPage } from './components/MyListPage';
import { AuthModal } from './components/AuthModal';
import { DramaDetailModal } from './components/DramaDetailModal';
import { CastDetailModal } from './components/CastDetailModal';
import { HomePage } from './components/HomePage';
import { EpisodeReviewsModal } from './components/EpisodeReviewsModal';
import { AllReviewsPage } from './components/AllReviewsPage';
import { BottomNavBar } from './components/BottomNavBar';

export default function App() {
    // --- STATE MANAGEMENT via Custom Hooks ---
    // The App component composes various custom hooks to manage different aspects of the application state.

    // `useUIState`: Manages the state of the UI itself, like active views and open modals.
    const {
        activeView, navigateTo,
        modalStack, pushModal, popModal, closeAllModals,
        isAuthModalOpen, openAuthModal, closeAuthModal,
        isFilterSidebarOpen, toggleFilterSidebar,
        currentPage, setCurrentPage,
        theme, toggleTheme,
    } = useUIState();

    // `useAuth`: Encapsulates all logic related to user authentication and user-specific data.
    const {
        currentUser, userData,
        login, logout, register,
        toggleFavorite, setDramaStatus, togglePlanToWatch, setEpisodeReview
    } = useAuth(closeAuthModal); // Pass callback to close modal on successful login.

    // `useLocalStorage`: Persists filter and sort settings across browser sessions.
    const [filters, setFilters] = useLocalStorage<Filters>(LOCAL_STORAGE_KEYS.FILTERS, { genres: [], excludeGenres: [], tags: [], excludeTags: [], countries: [], cast: [], minRating: 0 });
    const [sortPriorities, setSortPriorities] = useLocalStorage<SortPriority[]>(LOCAL_STORAGE_KEYS.SORT_PRIORITIES, [
        { key: 'popularity_rank', order: 'desc' },
        { key: 'rating', order: 'desc' }
    ]);
    
    // `useState` and `useDebounce`: Manages the search term with a delay to prevent excessive re-renders.
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce search input for 300ms.

    // `useDramas`: Fetches and processes all drama data, including filtering and sorting.
    const { allDramas, filteredAndSortedDramas, metadata, isLoading, dataError } = useDramas(filters, debouncedSearchTerm, sortPriorities);

    // Effect to reset pagination to the first page whenever the data set changes due to new filters, search, or sorting.
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, filters, sortPriorities, setCurrentPage]);

    // --- HANDLER FUNCTIONS ---
    // These handlers connect user actions from child components to the state logic within the hooks.
    // They are defined here to be passed down as props.

    /** Handles opening a drama modal by pushing it onto the stack. */
    const handleSelectDrama = useCallback((drama: Drama) => {
        pushModal({ type: 'drama', drama });
    }, [pushModal]);

    /** Handles opening a cast modal by pushing it onto the stack. */
    const handleSelectActor = useCallback((actorName: string) => {
        pushModal({ type: 'cast', actorName });
    }, [pushModal]);
    
    /** Handles opening the episode reviews modal by pushing it onto the stack. */
    const handleOpenEpisodeReviews = useCallback((drama: Drama) => {
        pushModal({ type: 'reviews', drama });
    }, [pushModal]);

    /** Handles changes to the main search input field. */
    const handleSearchChange = (term: string) => {
        setSearchTerm(term);
    };

    /** Handles updates to the filter state. Wrapped in useCallback for performance. */
    const handleFiltersChange = useCallback((newFilterValues: Partial<Filters>) => {
        setFilters(prev => ({...prev, ...newFilterValues}));
    }, [setFilters]);

    /**
     * Handles a click on a genre or tag pill, toggling its inclusion in the filters.
     * This is a "quick filter" action from the DramaDetailModal.
     */
    const handleSetQuickFilter = useCallback((type: 'genre' | 'tag', value: string) => {
        setFilters(prev => {
            const key = type === 'genre' ? 'genres' : 'tags';
            const excludeKey = type === 'genre' ? 'excludeGenres' : 'excludeTags';
            const currentValues = prev[key];
            
            // If the value is already included, remove it. Otherwise, add it.
            const newValues = currentValues.includes(value)
                ? currentValues.filter(v => v !== value)
                : [...currentValues, value];
            
            // If we just added an include filter, ensure it's not in the exclude list.
            const newExcludeValues = newValues.length > currentValues.length
                ? prev[excludeKey].filter(v => v !== value)
                : prev[excludeKey];
            
            return { ...prev, [key]: newValues, [excludeKey]: newExcludeValues };
        });
    }, [setFilters]);

    // --- Authenticated Action Handlers ---
    // These handlers wrap actions that require a user to be logged in.
    // If the user is not logged in, they open the authentication modal.

    const handleToggleFavorite = useCallback((dramaUrl: string) => {
        if (!toggleFavorite(dramaUrl)) {
            openAuthModal(); // The hook returns false if there's no user.
        }
    }, [toggleFavorite, openAuthModal]);
    
    const handleSetStatus = useCallback((...args: Parameters<typeof setDramaStatus>) => {
        if (!setDramaStatus(...args)) {
            openAuthModal();
        }
    }, [setDramaStatus, openAuthModal]);
    
    const handleTogglePlanToWatch = useCallback((dramaUrl: string) => {
        if (!togglePlanToWatch(dramaUrl)) {
            openAuthModal();
        }
    }, [togglePlanToWatch, openAuthModal]);

    const handleSetEpisodeReview = useCallback((...args: Parameters<typeof setEpisodeReview>) => {
        if (!setEpisodeReview(...args)) {
            openAuthModal();
        }
    }, [setEpisodeReview, openAuthModal]);
    
    /** Logs the user out and navigates back to the home page. */
    const handleLogout = () => {
        logout();
        navigateTo('home');
    };

    // --- RENDER LOGIC ---
    const activeModal = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;

    // Paginate the final list of dramas to be displayed.
    const paginatedDramas = filteredAndSortedDramas.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const renderActiveView = () => {
        switch (activeView) {
            case 'home':
                return (
                    <HomePage
                        dramas={paginatedDramas}
                        isLoading={isLoading}
                        dataError={dataError}
                        totalDramas={filteredAndSortedDramas.length}
                        userData={userData}
                        filters={filters}
                        searchTerm={searchTerm}
                        currentPage={currentPage}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onSelectDrama={handleSelectDrama}
                        onToggleFavorite={handleToggleFavorite}
                        onTogglePlanToWatch={handleTogglePlanToWatch}
                        onSearchChange={handleSearchChange}
                        onPageChange={setCurrentPage}
                        onOpenFilters={() => toggleFilterSidebar(true)}
                        onFiltersChange={handleFiltersChange}
                    />
                );
            case 'my-list':
                return (
                    <MyListPage 
                        allDramas={allDramas} 
                        userData={userData} 
                        onSelectDrama={handleSelectDrama} 
                        onToggleFavorite={handleToggleFavorite}
                        onTogglePlanToWatch={handleTogglePlanToWatch}
                    />
                );
            case 'all-reviews':
                return (
                    <AllReviewsPage
                        allDramas={allDramas}
                        userData={userData}
                        onSelectDrama={handleSelectDrama}
                    />
                );
            default:
                return null;
        }
    };


    return (
        <div className="min-h-screen font-sans">
            <Header 
                onGoHome={() => navigateTo('home')} 
                onGoToMyList={() => navigateTo('my-list')}
                onGoToAllReviews={() => navigateTo('all-reviews')} 
                currentUser={currentUser} 
                onLoginClick={openAuthModal} 
                onLogout={handleLogout}
                theme={theme}
                toggleTheme={toggleTheme}
            />
            
             <FilterSidebar 
                isOpen={isFilterSidebarOpen}
                onClose={() => toggleFilterSidebar(false)}
                metadata={metadata} 
                filters={filters} 
                onFiltersChange={handleFiltersChange}
                sortPriorities={sortPriorities}
                onSortPrioritiesChange={setSortPriorities}
            />

            <main className={`min-w-0 py-8 px-4 sm:px-6 lg:px-8 ${currentUser ? 'pb-24 md:pb-8' : 'pb-8'}`}>
                {renderActiveView()}
            </main>

            <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} onLogin={login} onRegister={register} />

            {activeModal?.type === 'drama' && (
                <DramaDetailModal 
                    drama={activeModal.drama}
                    allDramas={allDramas} 
                    onCloseAll={closeAllModals}
                    onPopModal={popModal}
                    onSelectDrama={handleSelectDrama}
                    onSetQuickFilter={handleSetQuickFilter} 
                    onSelectActor={handleSelectActor} 
                    userData={userData} 
                    onSetStatus={handleSetStatus} 
                    onToggleFavorite={handleToggleFavorite} 
                    currentUser={currentUser} 
                    filters={filters}
                    onOpenEpisodeReviews={handleOpenEpisodeReviews}
                    showBackButton={modalStack.length > 1}
                />
            )}
            {activeModal?.type === 'cast' && (
                <CastDetailModal 
                    actorName={activeModal.actorName} 
                    allDramas={allDramas} 
                    onCloseAll={closeAllModals}
                    onPopModal={popModal}
                    onSelectDrama={handleSelectDrama} 
                    userData={userData} 
                    onToggleFavorite={handleToggleFavorite} 
                    onTogglePlanToWatch={handleTogglePlanToWatch} 
                    showBackButton={modalStack.length > 1}
                />
            )}
            {activeModal?.type === 'reviews' && (
                 <EpisodeReviewsModal 
                    drama={activeModal.drama}
                    userData={userData} 
                    onCloseAll={closeAllModals} 
                    onPopModal={popModal}
                    onSetEpisodeReview={handleSetEpisodeReview} 
                    showBackButton={modalStack.length > 1}
                />
            )}
            
            {currentUser && <BottomNavBar activeView={activeView} onNavigate={navigateTo} />}
        </div>
    );
}