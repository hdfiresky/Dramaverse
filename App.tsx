/**
 * @fileoverview The main application component, acting as the root container.
 * It orchestrates the entire application by composing custom hooks for state management
 * and rendering the primary layout and components. This component is responsible for
 * connecting the data and logic from hooks to the presentational components.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Filters, SortPriority, UserData, UserDramaStatus, Drama, ModalStackItem } from './types';
import { useAuth } from './hooks/useAuth';
import { useDramas } from './hooks/useDramas';
import { useDebounce } from './hooks/useDebounce';
import { useWindowSize } from './hooks/useWindowSize';
import { useRouter, ActiveView } from './hooks/useRouter';
import { useDramaDetails } from './hooks/useDramaDetails';
import { BASE_ITEMS_PER_PAGE } from './hooks/lib/constants';

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
import { EpisodeReviewsModal } from './components/EpisodeReviewsModal';
import { Footer } from './components/Footer';
import { LegalPage } from './components/LegalPage';
import { PrivacyPolicyContent } from './components/PrivacyPolicyContent';
import { TermsOfServiceContent } from './components/TermsOfServiceContent';


export default function App() {
    const { location, navigate, updateQuery, activeView, modalStack, theme, toggleTheme } = useRouter();
    
    // --- AUTHENTICATION & USER DATA ---
    const [conflictData, setConflictData] = useState<any>(null);
    const [isAuthModalOpen, setAuthModalOpen] = useState(false);
    const [isChangePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
    const {
        currentUser, userData, isAuthLoading,
        login, logout, register,
        toggleFavorite, setDramaStatus, setReviewAndTrackProgress, setEpisodeReview,
        resolveConflict, changePassword,
    } = useAuth(() => setAuthModalOpen(false), (data) => setConflictData(data));
    
    // --- ROUTE PROTECTION ---
    useEffect(() => {
        const publicViews: ActiveView[] = ['home', 'privacy-policy', 'terms-of-service'];
        const currentViewIsPublic = publicViews.includes(activeView);
        const currentViewIsAdmin = activeView === 'admin';

        if (!currentUser && !currentViewIsPublic) {
            navigate('/home');
        }
        if (currentViewIsAdmin && !currentUser?.isAdmin) {
            navigate('/home');
        }
    }, [activeView, currentUser, navigate]);

    // --- FILTERS & SORT (State derived from URL) ---
    const query = location.query;

    const filters = useMemo<Filters>(() => ({
        genres: query.get('genres')?.split(',').filter(Boolean) || [],
        excludeGenres: query.get('excludeGenres')?.split(',').filter(Boolean) || [],
        tags: query.get('tags')?.split(',').filter(Boolean) || [],
        excludeTags: query.get('excludeTags')?.split(',').filter(Boolean) || [],
        countries: query.get('countries')?.split(',').filter(Boolean) || [],
        cast: query.get('cast')?.split(',').filter(Boolean) || [],
        minRating: parseFloat(query.get('minRating') || '0'),
    }), [query]);

    const sortPriorities = useMemo<SortPriority[]>(() => 
        query.get('sort') ? JSON.parse(query.get('sort')!) : [{ key: 'popularity_rank', order: 'desc' }, { key: 'rating', order: 'desc' }]
    , [query]);

    const sortMode = useMemo<'weighted' | 'random'>(() => 
        (query.get('sortMode') as 'weighted' | 'random') || 'weighted'
    , [query]);
    
    const urlSearchTerm = query.get('q') || '';
    const [searchTerm, setSearchTerm] = useState(urlSearchTerm);
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const currentPage = parseInt(query.get('page') || '1', 10);
    const [isFilterSidebarOpen, setFilterSidebarOpen] = useState(false);
    const [randomSeed, setRandomSeed] = useState(() => Date.now());

    // Effect to sync the input field's state if the URL changes (e.g. back/forward button)
    useEffect(() => {
        if (urlSearchTerm !== searchTerm) {
            setSearchTerm(urlSearchTerm);
        }
    }, [urlSearchTerm, searchTerm]);

    // Effect to sync the URL if the user's debounced input changes
    useEffect(() => {
        // This condition prevents the effect from firing when other query params (like 'page') change.
        if (debouncedSearchTerm !== urlSearchTerm) {
            updateQuery({ q: debouncedSearchTerm || undefined, page: '1' });
        }
    }, [debouncedSearchTerm, urlSearchTerm, updateQuery]);
    
    // Dynamically calculate items per page for full rows
    const { width } = useWindowSize();
    const itemsPerPage = useMemo(() => {
        const baseCount = BASE_ITEMS_PER_PAGE;
        let columns = 1;
        if (width >= 1536) columns = 6;
        else if (width >= 1280) columns = 5;
        else if (width >= 1024) columns = 4;
        else if (width >= 768) columns = 3;
        else if (width >= 640) columns = 2;
        const remainder = baseCount % columns;
        return remainder === 0 ? baseCount : baseCount + (columns - remainder);
    }, [width]);

    const { 
        displayDramas, totalDramas, metadata, isLoading, dataError, hasInitiallyLoaded
    } = useDramas(filters, debouncedSearchTerm, sortPriorities, currentPage, sortMode, randomSeed, itemsPerPage);

    // Effect to handle out-of-bounds page numbers.
    // If the current page from the URL is greater than the max possible page for the current filters,
    // this will automatically redirect the user to the last valid page.
    useEffect(() => {
        // We only run this check after the initial data has loaded and we are not in a loading state.
        // This prevents redirects before the total number of dramas is known.
        if (hasInitiallyLoaded && !isLoading && totalDramas > 0) {
            const maxPage = Math.ceil(totalDramas / itemsPerPage);
            if (currentPage > maxPage) {
                // The `replace` flag is set to true to avoid adding the invalid page URL to the browser history.
                updateQuery({ page: String(maxPage) }, true);
            }
        }
    }, [currentPage, totalDramas, itemsPerPage, hasInitiallyLoaded, isLoading, updateQuery]);
    
    // --- ON-DEMAND DATA FETCHING FOR MODALS ---
    const modalDramaUrls = useMemo(() => 
        modalStack.filter(item => item.type === 'drama' || item.type === 'reviews').map(item => (item as any).dramaUrl)
    , [modalStack]);

    const { dramaDetails: modalDramaDetails } = useDramaDetails(modalDramaUrls);

    // --- NAVIGATION & MODAL HANDLERS ---
    const handleNavigate = (view: ActiveView) => navigate(`/${view}`);

    const handleSelectDrama = useCallback((drama: Drama) => {
        const newItem: ModalStackItem = { type: 'drama', dramaUrl: drama.url };
        updateQuery({ modal_stack: [...modalStack, newItem] });
    }, [modalStack, updateQuery]);
    
    const handleSelectActor = useCallback((actorName: string) => {
        const newItem: ModalStackItem = { type: 'cast', actorName };
        updateQuery({ modal_stack: [...modalStack, newItem] });
    }, [modalStack, updateQuery]);

    const handleOpenReviews = useCallback((drama: Drama) => {
        if (!currentUser) return setAuthModalOpen(true);
        const newItem: ModalStackItem = { type: 'reviews', dramaUrl: drama.url };
        updateQuery({ modal_stack: [...modalStack, newItem] });
    }, [modalStack, updateQuery, currentUser]);

    const popModal = useCallback(() => {
        updateQuery({ modal_stack: modalStack.slice(0, -1) });
    }, [modalStack, updateQuery]);

    const closeAllModals = useCallback(() => {
        updateQuery({ modal_stack: [] });
    }, [updateQuery]);
    
    // --- FILTER & SORT HANDLERS ---
    const handleFiltersChange = useCallback((newFilterValues: Partial<Filters>) => {
        const updatedFilters = { ...filters, ...newFilterValues };
        updateQuery({
            genres: updatedFilters.genres.length > 0 ? updatedFilters.genres.join(',') : undefined,
            excludeGenres: updatedFilters.excludeGenres.length > 0 ? updatedFilters.excludeGenres.join(',') : undefined,
            tags: updatedFilters.tags.length > 0 ? updatedFilters.tags.join(',') : undefined,
            excludeTags: updatedFilters.excludeTags.length > 0 ? updatedFilters.excludeTags.join(',') : undefined,
            countries: updatedFilters.countries.length > 0 ? updatedFilters.countries.join(',') : undefined,
            cast: updatedFilters.cast.length > 0 ? updatedFilters.cast.join(',') : undefined,
            minRating: updatedFilters.minRating > 0 ? String(updatedFilters.minRating) : undefined,
            page: '1',
        }, true);
    }, [filters, updateQuery]);

    const handleSortPrioritiesChange = useCallback((priorities: SortPriority[]) => {
        updateQuery({ sort: JSON.stringify(priorities), sortMode: 'weighted', page: '1' }, true);
    }, [updateQuery]);

    const handleSetSortMode = useCallback((mode: 'weighted' | 'random') => {
        updateQuery({ sortMode: mode, page: '1' }, true);
    }, [updateQuery]);

    const handleSetQuickFilter = useCallback((type: 'genre' | 'tag', value: string) => {
        const key = type === 'genre' ? 'genres' : 'tags';
        const excludeKey = type === 'genre' ? 'excludeGenres' : 'excludeTags';
        const currentValues = filters[key];
        const newValues = currentValues.includes(value) ? currentValues.filter(v => v !== value) : [...currentValues, value];
        const newExcludeValues = newValues.length > currentValues.length ? filters[excludeKey].filter(v => v !== value) : filters[excludeKey];
        handleFiltersChange({ [key]: newValues, [excludeKey]: newExcludeValues });
    }, [filters, handleFiltersChange]);
    
    // --- AUTH-RELATED HANDLERS ---
    const handleToggleFavorite = useCallback((dramaUrl: string) => {
        if (!toggleFavorite(dramaUrl)) setAuthModalOpen(true);
    }, [toggleFavorite]);
    
    const handleSetStatus = useCallback((...args: Parameters<typeof setDramaStatus>) => {
        if (!setDramaStatus(...args)) setAuthModalOpen(true);
    }, [setDramaStatus]);
    
    const handleSetReviewAndTrackProgress = useCallback((...args: Parameters<typeof setReviewAndTrackProgress>) => {
        if (!setReviewAndTrackProgress(...args)) setAuthModalOpen(true);
    }, [setReviewAndTrackProgress]);
    
    const handleSetEpisodeReview = useCallback((...args: Parameters<typeof setEpisodeReview>) => {
        if (!setEpisodeReview(...args)) setAuthModalOpen(true);
    }, [setEpisodeReview]);

    const handleLogout = () => {
        logout();
        navigate('/home');
    };

    // --- RENDER LOGIC ---
    const activeModalData = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;

    const renderActiveView = () => {
        switch (activeView) {
            case 'home':
                return <HomePage dramas={displayDramas} isLoading={isLoading} dataError={dataError} totalDramas={totalDramas} userData={userData} filters={filters} searchTerm={searchTerm} currentPage={currentPage} itemsPerPage={itemsPerPage} isUserLoggedIn={!!currentUser} hasInitiallyLoaded={hasInitiallyLoaded} onSelectDrama={handleSelectDrama} onToggleFavorite={handleToggleFavorite} onSetStatus={handleSetStatus} onSearchChange={setSearchTerm} onPageChange={(p) => updateQuery({ page: String(p) })} onOpenFilters={() => setFilterSidebarOpen(true)} onFiltersChange={handleFiltersChange} onSetReviewAndTrackProgress={handleSetReviewAndTrackProgress} />;
            case 'my-list':
                if (currentUser) return <MyListPage userData={userData} onSelectDrama={handleSelectDrama} onToggleFavorite={handleToggleFavorite} onSetStatus={handleSetStatus} onSetReviewAndTrackProgress={handleSetReviewAndTrackProgress} />;
                return null;
            case 'all-reviews':
                if (currentUser) return <AllReviewsPage userData={userData} onSelectDrama={handleSelectDrama} />;
                return null;
            case 'recommendations':
                if (currentUser) return <RecommendationsPage userData={userData} onSelectDrama={handleSelectDrama} onToggleFavorite={handleToggleFavorite} onSetStatus={handleSetStatus} onSetReviewAndTrackProgress={handleSetReviewAndTrackProgress} />;
                return null;
            case 'admin':
                if (currentUser?.isAdmin) return <AdminPanel currentUser={currentUser} />;
                return null;
            case 'privacy-policy':
                return <LegalPage title="Privacy Policy"><PrivacyPolicyContent /></LegalPage>;
            case 'terms-of-service':
                return <LegalPage title="Terms of Service"><TermsOfServiceContent /></LegalPage>;
            default:
                return null;
        }
    };
    
    if (isAuthLoading) {
        return <div className="min-h-screen font-sans flex items-center justify-center bg-brand-primary"><div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-brand-accent"></div></div>;
    }

    return (
        <div className="min-h-screen font-sans flex flex-col">
            <Header onGoHome={() => handleNavigate('home')} onGoToMyList={() => handleNavigate('my-list')} onGoToRecommendations={() => handleNavigate('recommendations')} onGoToAllReviews={() => handleNavigate('all-reviews')} onGoToAdminPanel={() => handleNavigate('admin')} currentUser={currentUser} onLoginClick={() => setAuthModalOpen(true)} onLogout={handleLogout} onOpenChangePassword={() => setChangePasswordModalOpen(true)} theme={theme} toggleTheme={toggleTheme} />
            <FilterSidebar isOpen={isFilterSidebarOpen} onClose={() => setFilterSidebarOpen(false)} metadata={metadata} filters={filters} onFiltersChange={handleFiltersChange} sortPriorities={sortPriorities} onSortPrioritiesChange={handleSortPrioritiesChange} sortMode={sortMode} onSetSortMode={handleSetSortMode} onSetRandomSeed={setRandomSeed} />
            <main className={`flex-grow min-w-0 py-8 px-4 sm:px-6 lg:px-8 ${currentUser ? 'pb-24 md:pb-8' : 'pb-8'}`}>{renderActiveView()}</main>
            <Footer onNavigate={handleNavigate} />
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} onLogin={login} onRegister={register} />
            <ChangePasswordModal isOpen={isChangePasswordModalOpen} onClose={() => setChangePasswordModalOpen(false)} onChangePassword={changePassword} />
            <ConflictResolutionModal isOpen={!!conflictData} data={conflictData} onClose={() => setConflictData(null)} onResolve={resolveConflict} />
            
            {activeModalData?.type === 'drama' && (
                <DramaDetailModal drama={modalDramaDetails.get(activeModalData.dramaUrl)} onCloseAll={closeAllModals} onPopModal={popModal} onSelectDrama={handleSelectDrama} onSetQuickFilter={handleSetQuickFilter} onSelectActor={handleSelectActor} filters={filters} showBackButton={modalStack.length > 1} currentUser={currentUser} userData={userData} onSetStatus={handleSetStatus} onOpenReviews={handleOpenReviews} />
            )}
            {activeModalData?.type === 'cast' && (
                <CastDetailModal actorName={activeModalData.actorName} onCloseAll={closeAllModals} onPopModal={popModal} onSelectDrama={handleSelectDrama} userData={userData} isUserLoggedIn={!!currentUser} onToggleFavorite={handleToggleFavorite} onSetStatus={handleSetStatus} onSetReviewAndTrackProgress={handleSetReviewAndTrackProgress} showBackButton={modalStack.length > 1} />
            )}
            {activeModalData?.type === 'reviews' && (
                <EpisodeReviewsModal drama={modalDramaDetails.get(activeModalData.dramaUrl)} userData={userData} onCloseAll={closeAllModals} onPopModal={popModal} onSetEpisodeReview={handleSetEpisodeReview} showBackButton={modalStack.length > 1} />
            )}
            
            {currentUser && <BottomNavBar activeView={activeView} onNavigate={handleNavigate} currentUser={currentUser} />}
        </div>
    );
}