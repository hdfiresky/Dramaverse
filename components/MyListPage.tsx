/**
 * @fileoverview Defines the MyListPage component, which displays the user's
 * personalized collections of dramas in a tabbed view. This page is only
 * accessible to logged-in users.
 */
import React, { useState, useMemo } from 'react';
import { Drama, UserData, DramaStatus } from '../types';
import { DramaCard } from './DramaCard';
import { useWindowSize } from '../hooks/useWindowSize';
import { EyeIcon, BookmarkIcon, CheckCircleIcon, HeartIcon, PauseIcon, XCircleIcon } from './Icons';

interface MyListPageProps {
    /** The complete list of all dramas, used to look up drama details from URLs. */
    allDramas: Drama[];
    /** The current user's data, containing their lists (favorites, statuses). */
    userData: UserData;
    /** Callback to open the detail modal for a selected drama. */
    onSelectDrama: (drama: Drama) => void;
    /** Callback to toggle a drama's favorite status. */
    onToggleFavorite: (url: string) => void;
    /** Callback to toggle a drama's 'Plan to Watch' status. */
    onTogglePlanToWatch: (url: string) => void;
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

// Defines the order of the tabs in the navigation.
const TABS_ORDER: (DramaStatus | 'Favorites')[] = [
    DramaStatus.Watching, 
    DramaStatus.PlanToWatch, 
    DramaStatus.Completed, 
    'Favorites', 
    DramaStatus.OnHold, 
    DramaStatus.Dropped
];

/**
 * A component that renders a multi-tabbed view of a user's personal drama lists.
 * This includes tabs for Watching, Plan to Watch, Completed, Favorites, and more.
 *
 * @param {MyListPageProps} props - The props for the MyListPage component.
 * @returns {React.ReactElement} The rendered My List page.
 */
export const MyListPage: React.FC<MyListPageProps> = ({ allDramas, userData, onSelectDrama, onToggleFavorite, onTogglePlanToWatch }) => {
    // State to keep track of the currently active tab. Defaults to 'Watching'.
    const [activeTab, setActiveTab] = useState<DramaStatus | 'Favorites'>(DramaStatus.Watching);
    const { width } = useWindowSize();
    const isMobile = width < 768; // Tailwind's 'md' breakpoint.

    // Memoize the categorized lists of dramas to prevent re-computation on every render.
    // This only recalculates if the source drama list or the user's data changes.
    const dramasByStatus = useMemo(() => {
        // Initialize an object to hold an array of dramas for each status category.
        const lists: Record<DramaStatus | 'Favorites', Drama[]> = { [DramaStatus.Watching]: [], [DramaStatus.Completed]: [], [DramaStatus.OnHold]: [], [DramaStatus.Dropped]: [], [DramaStatus.PlanToWatch]: [], Favorites: [] };
        
        // Create a Map for efficient O(1) average time complexity lookups of drama details by URL.
        const dramaMap = new Map(allDramas.map(d => [d.url, d]));

        // Populate lists based on the user's statuses.
        for (const url in userData.statuses) {
            const drama = dramaMap.get(url);
            if (drama) {
                lists[userData.statuses[url].status].push(drama);
            }
        }
        // Populate the separate Favorites list.
        for (const url of userData.favorites) {
            const drama = dramaMap.get(url);
            if (drama) {
                lists.Favorites.push(drama);
            }
        }
        return lists;
    }, [allDramas, userData]);

    const activeList = dramasByStatus[activeTab];

    return (
        <div className="w-full animate-fade-in">
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-brand-text-primary">
                    My List: {activeTab}
                </h2>
                <p className="text-md text-brand-text-secondary mt-1">
                    {activeList.length} {activeList.length === 1 ? 'drama' : 'dramas'}
                </p>
            </div>
            {/* Tab Navigation Bar - responsive */}
            <div className="border-b border-gray-700 mb-6">
                <nav className={isMobile ? "flex justify-around" : "-mb-px flex space-x-6 overflow-x-auto custom-scrollbar"}>
                    {TABS_ORDER.map(tabKey => {
                        const config = tabConfig[tabKey];
                        const count = dramasByStatus[tabKey].length;
                        const isActive = activeTab === tabKey;
                        
                        return (
                            <button
                                key={tabKey}
                                onClick={() => setActiveTab(tabKey)}
                                title={`${config.label} (${count})`}
                                aria-label={`${config.label} (${count})`}
                                className={
                                    isMobile
                                        ? `flex flex-col items-center justify-center flex-1 gap-1 p-2 rounded-lg transition-colors duration-200 ${
                                            isActive ? 'text-brand-accent' : 'text-brand-text-secondary hover:text-brand-text-primary'
                                        }`
                                        : `whitespace-nowrap py-4 px-2 border-b-2 text-sm transition-colors ${
                                            isActive
                                                ? 'border-brand-accent text-brand-text-primary font-semibold'
                                                : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:border-slate-400 font-medium'
                                        }`
                                }
                            >
                                {isMobile ? (
                                    <>
                                        <config.icon className="w-6 h-6" />
                                        <span className={`text-xs ${isActive ? 'font-bold' : ''}`}>{count}</span>
                                    </>
                                ) : (
                                    `${config.label} (${count})`
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>
            {/* Grid to display the dramas for the currently active tab */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                {activeList.length > 0 ? (
                    activeList.map(drama => (
                         <DramaCard key={drama.url} drama={drama} onSelect={onSelectDrama} userData={userData} onToggleFavorite={onToggleFavorite} onTogglePlanToWatch={onTogglePlanToWatch}/>
                    ))
                ) : (
                    // Display a message if the current list is empty.
                    <p className="col-span-full text-center text-brand-text-secondary py-10">No dramas in this list yet.</p>
                )}
            </div>
        </div>
    );
};