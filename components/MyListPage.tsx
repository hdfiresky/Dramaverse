/**
 * @fileoverview Defines the MyListPage component, which displays the user's
 * personalized collections of dramas in a tabbed view. This page is only
 * accessible to logged-in users.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { Drama, UserData, DramaStatus, UserDramaStatus } from '../types';
import { DramaCard } from './DramaCard';
import { EyeIcon, BookmarkIcon, CheckCircleIcon, HeartIcon, PauseIcon, XCircleIcon } from './Icons';
import { BACKEND_MODE, API_BASE_URL } from '../config';
import { DramaCardSkeleton } from './Skeletons';

interface MyListPageProps {
    /** The complete list of all dramas, used to look up drama details from URLs. Only used in frontend-only mode. */
    allDramas: Drama[];
    /** The current user's data, containing their lists (favorites, statuses). */
    userData: UserData;
    /** Callback to open the detail modal for a selected drama. */
    onSelectDrama: (drama: Drama) => void;
    /** Callback to toggle a drama's favorite status. */
    onToggleFavorite: (url: string) => void;
    /** Callback to set the user's status for a drama. */
    onSetStatus: (url: string, statusInfo: Omit<UserDramaStatus, 'updatedAt'>) => void;
    /** Callback to save a review and automatically track user progress. */
    onSetReviewAndTrackProgress: (drama: Drama, episodeNumber: number, text: string) => void;
}

// Configuration object to map each status to its corresponding icon and label.
const tabConfig: Record<DramaStatus | 'Favorites', { icon: React.FC<any>, label: string }> = {
    [DramaStatus.Watching]: { icon: EyeIcon, label: DramaStatus.Watching },
    [DramaStatus.PlanToWatch]: { icon: BookmarkIcon, label: DramaStatus.PlanToWatch },
    [DramaStatus.Completed]: { icon: CheckCircleIcon, label: DramaStatus.Completed },
    'Favorites': { icon: HeartIcon, label: 'Favorites' },
    [DramaStatus.OnHold]: { icon: PauseIcon, label: DramaStatus.OnHold },
    [DramaStatus.Dropped]: { icon: XCircleIcon, label: DramaStatus.Dropped },
};

// Defines the default order of the filters in the navigation.
const FILTERS_ORDER: (DramaStatus | 'Favorites')[] = [
    DramaStatus.Watching, 
    DramaStatus.PlanToWatch, 
    DramaStatus.Completed, 
    'Favorites', 
    DramaStatus.OnHold, 
    DramaStatus.Dropped
];

/**
 * Helper function to determine which filter should be active by default.
 * It selects the filter corresponding to the list that was most recently updated.
 * @param {UserData} userData - The current user's data.
 * @returns {DramaStatus | 'Favorites'} The key of the filter to be activated.
 */
const getInitialFilter = (userData: UserData): DramaStatus | 'Favorites' => {
    const timestamps = userData.listUpdateTimestamps || {};
    const keysWithDramas = FILTERS_ORDER.filter(key => {
        if (key === 'Favorites') return userData.favorites.length > 0;
        return Object.values(userData.statuses).some(s => s.status === key);
    });
    
    if (keysWithDramas.length === 0) return FILTERS_ORDER[0];

    return keysWithDramas.reduce((a, b) => (timestamps[a] || 0) > (timestamps[b] || 0) ? a : b) as DramaStatus | 'Favorites';
};


/**
 * A component that renders a filterable view of a user's personal drama lists.
 * It features a dynamic filter bar that is more streamlined than the previous tab system.
 *
 * @param {MyListPageProps} props - The props for the MyListPage component.
 * @returns {React.ReactElement} The rendered My List page.
 */
export const MyListPage: React.FC<MyListPageProps> = ({ allDramas, userData, onSelectDrama, onToggleFavorite, onSetStatus, onSetReviewAndTrackProgress }) => {
    // State to keep track of the currently active filter, initialized with the most recently updated list.
    const [activeFilter, setActiveFilter] = useState<DramaStatus | 'Favorites'>(() => getInitialFilter(userData));
    const [dramaDetails, setDramaDetails] = useState<Map<string, Drama>>(new Map());
    const [isLoading, setIsLoading] = useState(BACKEND_MODE);
    
    // Effect to update the active filter if the user data changes (e.g., after an update on another tab).
    useEffect(() => {
        setActiveFilter(getInitialFilter(userData));
    }, [userData]);

    // Effect to fetch full drama objects in backend mode.
    useEffect(() => {
        const fetchDramaDetails = async () => {
            if (!BACKEND_MODE) return;

            const statusUrls = Object.keys(userData.statuses);
            const favoriteUrls = userData.favorites;
            const allUrls = [...new Set([...statusUrls, ...favoriteUrls])];

            if (allUrls.length === 0) {
                setIsLoading(false);
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/dramas/by-urls`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', },
                    credentials: 'include',
                    body: JSON.stringify({ urls: allUrls })
                });
                if (!res.ok) throw new Error("Failed to fetch drama details.");
                const dramas: Drama[] = await res.json();
                setDramaDetails(new Map(dramas.map(d => [d.url, d])));
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDramaDetails();
    }, [userData]);


    // Effect to scroll to the top of the page whenever the active filter changes.
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [activeFilter]);

    // Memoize the categorized and sorted lists of dramas to prevent re-computation on every render.
    const dramasByStatus = useMemo(() => {
        const lists: Record<DramaStatus | 'Favorites', Drama[]> = { [DramaStatus.Watching]: [], [DramaStatus.Completed]: [], [DramaStatus.OnHold]: [], [DramaStatus.Dropped]: [], [DramaStatus.PlanToWatch]: [], Favorites: [] };
        const dramaMap = BACKEND_MODE ? dramaDetails : new Map(allDramas.map(d => [d.url, d]));
        
        if (dramaMap.size === 0 && BACKEND_MODE && !isLoading) return lists;

        const tempStatusLists: Partial<Record<DramaStatus, { drama: Drama; updatedAt: number }[]>> = {};

        for (const url in userData.statuses) {
            const drama = dramaMap.get(url);
            const statusInfo = userData.statuses[url];
            if (drama && statusInfo?.status) {
                if (!tempStatusLists[statusInfo.status]) tempStatusLists[statusInfo.status] = [];
                tempStatusLists[statusInfo.status]!.push({ drama, updatedAt: statusInfo.updatedAt });
            }
        }
        
        for (const status in tempStatusLists) {
            const typedStatus = status as DramaStatus;
            lists[typedStatus] = tempStatusLists[typedStatus]!
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map(item => item.drama);
        }

        const favDramasWithTime = userData.favorites
            .map(url => ({ drama: dramaMap.get(url), ts: userData.listUpdateTimestamps[`Favorites-${url}`] || 0 }))
            .filter(item => item.drama);
        
        // This is a simplified sort for favorites. The backend now provides a timestamp for each favorite add/remove,
        // but for simplicity here we just reverse the array as `useAuth` prepends new favorites.
        // A more robust solution would involve storing a timestamp per favorite.
        lists.Favorites = userData.favorites.map(url => dramaMap.get(url)).filter((d): d is Drama => Boolean(d));

        return lists;
    }, [allDramas, userData, dramaDetails, isLoading]);

    const activeList = dramasByStatus[activeFilter];

    const totalDramasInAllLists = useMemo(() => {
        return FILTERS_ORDER.reduce((sum, key) => sum + dramasByStatus[key].length, 0);
    }, [dramasByStatus]);
    
    const sortedFilters = useMemo(() => {
        const timestamps = userData.listUpdateTimestamps || {};
        return [...FILTERS_ORDER].sort((a, b) => (timestamps[b] || 0) - (timestamps[a] || 0));
    }, [userData.listUpdateTimestamps]);


    return (
        <div className="w-full animate-fade-in">
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-brand-text-primary">
                    My List: {activeFilter}
                </h2>
                <p className="text-md text-brand-text-secondary mt-1">
                    {activeList.length} {activeList.length === 1 ? 'drama' : 'dramas'}
                </p>
            </div>

            <div className="mb-6">
                <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto custom-scrollbar pb-3 -mb-3">
                    {sortedFilters.map(filterKey => {
                        const config = tabConfig[filterKey];
                        const count = dramasByStatus[filterKey].length;
                        const isActive = activeFilter === filterKey;

                        if (count === 0 && totalDramasInAllLists > 0) return null;

                        return (
                            <button
                                key={filterKey}
                                onClick={() => setActiveFilter(filterKey)}
                                className={`flex-shrink-0 flex items-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 ${
                                    isActive ? 'bg-brand-accent text-white shadow-md' : 'bg-brand-secondary text-brand-text-secondary hover:bg-brand-primary hover:text-brand-text-primary'
                                }`}
                                aria-pressed={isActive}
                            >
                                <config.icon className="w-5 h-5" />
                                <span>{config.label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                    isActive ? 'bg-white/20' : 'bg-brand-primary'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <DramaCardSkeleton key={index} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                    {activeList.length > 0 ? (
                        activeList.map(drama => (
                             <DramaCard 
                                key={drama.url} 
                                drama={drama} 
                                onSelect={onSelectDrama} 
                                userData={userData} 
                                isUserLoggedIn={true}
                                onToggleFavorite={onToggleFavorite} 
                                onSetStatus={onSetStatus}
                                onSetReviewAndTrackProgress={onSetReviewAndTrackProgress}
                             />
                        ))
                    ) : (
                        <p className="col-span-full text-center text-brand-text-secondary py-10">No dramas in this list yet.</p>
                    )}
                </div>
            )}
        </div>
    );
};