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
import { BACKEND_MODE } from './config';


// Component Imports
import { Header } from './components/Header';
import { FilterSidebar } from './components/FilterSidebar';
import { MyListPage } from './components/MyListPage';
import { AuthModal } from './components/AuthModal';
import { DramaDetailModal } from './components/DramaDetailModal';
import { CastDetailModal } from './components/CastDetailModal';
import { HomePage } from './components/HomePage';
import { AllReviewsPage } from './components/AllReviewsPage';
import { BottomNavBar } from './components/BottomNavBar';
import { AdminPanel } from './components/AdminPanel';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { RecommendationsPage } from './components/RecommendationsPage';
import { ChangePasswordModal } from './components/ChangePasswordModal';


export default function App() {
    // --- STATE MANAGEMENT via Custom Hooks ---
    // The App component composes various custom hooks to manage different aspects of the application state.

    // `useUIState`: Manages the state of the UI itself, like active views and open modals.
    // NOTE: This is called first because other hooks depend on it.
    const {
        activeView, navigateTo,
        modalStack, pushModal, popModal, closeAllModals,
        isAuthModalOpen, openAuthModal, closeAuthModal,
        isChangePasswordModalOpen, openChangePasswordModal, closeChangePasswordModal,
        isFilterSidebarOpen, toggleFilterSidebar,
        currentPage, setCurrentPage,
        theme, toggleTheme,
        conflictData, openConflictModal, closeConflictModal,
    } = useUIState();

    // `useAuth`: Encapsulates all logic related to user authentication and user-specific data.
    const {
        currentUser, userData, isAuthLoading,
        login, logout, register,
        toggleFavorite, setDramaStatus, setReviewAndTrackProgress,
        resolveConflict,
        changePassword,
    } = useAuth(closeAuthModal, openConflictModal); // Pass callbacks.

    // `useLocalStorage`: Persists filter and sort settings across browser sessions.
    const [filters, setFilters] = useLocalStorage<Filters>(LOCAL_STORAGE_KEYS.FILTERS, { genres: [], excludeGenres: [], tags: [], excludeTags: [], countries: [], cast: [], minRating: 0 });
    const [sortPriorities, setSortPriorities] = useLocalStorage<SortPriority[]>(LOCAL_STORAGE_KEYS.SORT_PRIORITIES, [
        { key: 'popularity_rank', order: 'desc' },
        { key: 'rating', order: 'desc' }
    ]);
    
    // `useState` and `useDebounce`: Manages the search term with a delay to prevent excessive re-renders.
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce search input for 300ms.

    // State to manage the sorting mode. Can be 'weighted' for user-defined sort or 'random'.
    const [sortMode, setSortMode] = useState<'weighted' | 'random'>('weighted');
    // A seed value that can be changed to trigger a new randomization.
    const [randomSeed, setRandomSeed] = useState(() => Date.now());

    // `useDramas`: Fetches and processes all drama data, including filtering and sorting.
    const { 
        displayDramas, 
        totalDramas, 
        allDramas, // This will be empty in backend mode, used for frontend-only mode
        metadata, 
        isLoading, 
        dataError,
        hasInitiallyLoaded
    } = useDramas(filters, debouncedSearchTerm, sortPriorities, currentPage, sortMode, randomSeed);

    // Effect to reset pagination to the first page whenever the data set changes due to new filters, search, or sorting.
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, filters, sortPriorities, sortMode, randomSeed, setCurrentPage]);

    /** Handles opening a drama modal by pushing it onto the stack. */
    const handleSelectDrama = useCallback((drama: Drama) => {
        pushModal({ type: 'drama', drama });
    }, [pushModal]);

    /** Handles opening a cast modal by pushing it onto the stack. */
    const handleSelectActor = useCallback((actorName: string) => {
        pushModal({ type: 'cast', actorName });
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
     * A wrapper for updating sort priorities.
     * Any change to the weighted sort automatically switches the mode back to 'weighted'.
     */
    const handleSortPrioritiesChange = useCallback((priorities: SortPriority[]) => {
        setSortPriorities(priorities);
        setSortMode('weighted');
    }, [setSortPriorities, setSortMode]);

    /**
     * Handles a click on a genre or tag pill, toggling its inclusion in the filters.
     */
    const handleSetQuickFilter = useCallback((type: 'genre' | 'tag', value: string) => {
        setFilters(prev => {
            const key = type === 'genre' ? 'genres' : 'tags';
            const excludeKey = type === 'genre' ? 'excludeGenres' : 'excludeTags';
            const currentValues = prev[key];
            
            const newValues = currentValues.includes(value)
                ? currentValues.filter(v => v !== value)
                : [...currentValues, value];
            
            const newExcludeValues = newValues.length > currentValues.length
                ? prev[excludeKey].filter(v => v !== value)
                : prev[excludeKey];
            
            return { ...prev, [key]: newValues, [excludeKey]: newExcludeValues };
        });
    }, [setFilters]);

    const handleToggleFavorite = useCallback((dramaUrl: string) => {
        if (!toggleFavorite(dramaUrl)) openAuthModal();
    }, [toggleFavorite, openAuthModal]);
    
    const handleSetStatus = useCallback((...args: Parameters<typeof setDramaStatus>) => {
        if (!setDramaStatus(...args)) openAuthModal();
    }, [setDramaStatus, openAuthModal]);
    
    const handleSetReviewAndTrackProgress = useCallback((...args: Parameters<typeof setReviewAndTrackProgress>) => {
        if (!setReviewAndTrackProgress(...args)) openAuthModal();
    }, [setReviewAndTrackProgress, openAuthModal]);
    
    /** Logs the user out and navigates back to the home page. */
    const handleLogout = () => {
        logout();
        navigateTo('home');
    };

    // --- RENDER LOGIC ---
    const activeModal = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;

    const renderActiveView = () => {
        switch (activeView) {
            case 'home':
                return (
                    <HomePage
                        dramas={displayDramas}
                        isLoading={isLoading}
                        dataError={dataError}
                        totalDramas={totalDramas}
                        userData={userData}
                        filters={filters}
                        searchTerm={searchTerm}
                        currentPage={currentPage}
                        itemsPerPage={ITEMS_PER_PAGE}
                        isUserLoggedIn={!!currentUser}
                        hasInitiallyLoaded={hasInitiallyLoaded}
                        onSelectDrama={handleSelectDrama}
                        onToggleFavorite={handleToggleFavorite}
                        onSetStatus={handleSetStatus}
                        onSearchChange={handleSearchChange}
                        onPageChange={setCurrentPage}
                        onOpenFilters={() => toggleFilterSidebar(true)}
                        onFiltersChange={handleFiltersChange}
                        onSetReviewAndTrackProgress={handleSetReviewAndTrackProgress}
                    />
                );
            case 'my-list':
                return (
                    <MyListPage 
                        allDramas={allDramas} // Kept for frontend-only mode compatibility
                        userData={userData} 
                        onSelectDrama={handleSelectDrama} 
                        onToggleFavorite={handleToggleFavorite}
                        onSetStatus={handleSetStatus}
                        onSetReviewAndTrackProgress={handleSetReviewAndTrackProgress}
                    />
                );
            case 'all-reviews':
                return (
                    <AllReviewsPage
                        allDramas={allDramas} // Kept for frontend-only mode compatibility
                        userData={userData}
                        onSelectDrama={handleSelectDrama}
                    />
                );
            case 'recommendations':
                 if (currentUser) {
                    return (
                        <RecommendationsPage
                            userData={userData}
                            onSelectDrama={handleSelectDrama}
                            onToggleFavorite={handleToggleFavorite}
                            onSetStatus={handleSetStatus}
                            onSetReviewAndTrackProgress={handleSetReviewAndTrackProgress}
                        />
                    );
                 }
                 navigateTo('home');
                 return null;
            case 'admin':
                 if (currentUser?.isAdmin) {
                    return <AdminPanel currentUser={currentUser} />;
                }
                navigateTo('home');
                return null;
            default:
                return null;
        }
    };
    
    if (isAuthLoading) {
        return (
            <div className="min-h-screen font-sans flex items-center justify-center bg-brand-primary">
                 <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-brand-accent"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen font-sans">
            <Header 
                onGoHome={() => navigateTo('home')} 
                onGoToMyList={() => navigateTo('my-list')}
                onGoToRecommendations={() => navigateTo('recommendations')}
                onGoToAllReviews={() => navigateTo('all-reviews')} 
                onGoToAdminPanel={() => navigateTo('admin')}
                currentUser={currentUser} 
                onLoginClick={openAuthModal} 
                onLogout={handleLogout}
                onOpenChangePassword={openChangePasswordModal}
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
                onSortPrioritiesChange={handleSortPrioritiesChange}
                sortMode={sortMode}
                onSetSortMode={setSortMode}
                onSetRandomSeed={setRandomSeed}
            />

            <main className={`min-w-0 py-8 px-4 sm:px-6 lg:px-8 ${currentUser ? 'pb-24 md:pb-8' : 'pb-8'}`}>
                {renderActiveView()}
            </main>

            <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} onLogin={login} onRegister={register} />

            <ChangePasswordModal 
                isOpen={isChangePasswordModalOpen} 
                onClose={closeChangePasswordModal} 
                onChangePassword={changePassword} 
            />

            <ConflictResolutionModal
                isOpen={!!conflictData}
                data={conflictData}
                onClose={closeConflictModal}
                onResolve={resolveConflict}
            />
            
            {activeModal?.type === 'drama' && (
                <DramaDetailModal 
                    drama={activeModal.drama}
                    onCloseAll={closeAllModals}
                    onPopModal={popModal}
                    onSelectDrama={handleSelectDrama}
                    onSetQuickFilter={handleSetQuickFilter} 
                    onSelectActor={handleSelectActor} 
                    filters={filters}
                    showBackButton={modalStack.length > 1}
                />
            )}
            {activeModal?.type === 'cast' && (
                <CastDetailModal 
                    actorName={activeModal.actorName} 
                    onCloseAll={closeAllModals}
                    onPopModal={popModal}
                    onSelectDrama={handleSelectDrama} 
                    userData={userData} 
                    isUserLoggedIn={!!currentUser}
                    onToggleFavorite={handleToggleFavorite} 
                    onSetStatus={handleSetStatus} 
                    onSetReviewAndTrackProgress={handleSetReviewAndTrackProgress}
                    showBackButton={modalStack.length > 1}
                />
            )}
            
            {currentUser && <BottomNavBar activeView={activeView} onNavigate={navigateTo} currentUser={currentUser} />}
        </div>
    );
}