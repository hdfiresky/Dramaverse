/**
 * @fileoverview This component represents the main landing page of the application.
 * It's responsible for displaying the search bar, filter controls, the grid of
 * drama cards, and pagination. It acts as a container for the core discovery experience.
 */
import React from 'react';
import { Drama, UserData, Filters, UserDramaStatus } from '../types';
import { DramaCard } from './DramaCard';
import { Pagination } from './Pagination';
import { FilterIcon } from './Icons';
import { ActiveFiltersDisplay } from './ActiveFiltersDisplay';

interface HomePageProps {
    /** The paginated list of dramas to display. */
    dramas: Drama[];
    /** A flag indicating if the initial data is still loading. */
    isLoading: boolean;
    /** An error message string if data fetching failed, otherwise null. */
    dataError: string | null;
    /** The total number of dramas that match the current filters (pre-pagination). */
    totalDramas: number;
    /** The current user's data, to show status on cards. */
    userData: UserData;
    /** The current filter state, passed to the ActiveFiltersDisplay. */
    filters: Filters;
    /** The current value of the search input. */
    searchTerm: string;
    /** The current active page number. */
    currentPage: number;
    /** The number of items displayed per page. */
    itemsPerPage: number;
    /** Callback to open the detail modal for a selected drama. */
    onSelectDrama: (drama: Drama) => void;
    /** Callback to toggle a drama's favorite status. */
    onToggleFavorite: (dramaUrl: string) => void;
    /** Callback to set the user's status for a drama. */
    onSetStatus: (url: string, statusInfo: Omit<UserDramaStatus, 'updatedAt'>) => void;
    /** Callback to handle changes in the search input. */
    onSearchChange: (term: string) => void;
    /** Callback to handle page changes from the Pagination component. */
    onPageChange: (page: number) => void;
    /** Callback to open the filter sidebar. */
    onOpenFilters: () => void;
    /** Callback to update filter values, passed to ActiveFiltersDisplay. */
    onFiltersChange: (updates: Partial<Filters>) => void;
}

/**
 * Renders the main discovery page of the application.
 * It handles the display of loading and error states, and composes the primary
 * UI elements for browsing, searching, and filtering dramas.
 * @param {HomePageProps} props - The props for the HomePage component.
 * @returns {React.ReactElement} The rendered home page.
 */
export const HomePage: React.FC<HomePageProps> = ({
    dramas,
    isLoading,
    dataError,
    totalDramas,
    userData,
    filters,
    searchTerm,
    currentPage,
    itemsPerPage,
    onSelectDrama,
    onToggleFavorite,
    onSetStatus,
    onSearchChange,
    onPageChange,
    onOpenFilters,
    onFiltersChange,
}) => {
    
    // Display a loading spinner while the initial data is being fetched.
    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-200px)]">
                <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-brand-accent"></div>
                <span className="sr-only">Loading...</span>
            </div>
        );
    }
    
    // Display an error message if the data could not be loaded.
    if (dataError) {
        return <div className="text-center py-20 text-red-400">{dataError}</div>;
    }
    
    return (
        <>
            <div className="mb-6 flex items-center justify-between gap-4">
                <input 
                    type="text" 
                    placeholder="Search by title..." 
                    value={searchTerm} 
                    onChange={e => onSearchChange(e.target.value)}
                    className="w-full bg-brand-secondary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    aria-label="Search by title"
                />
                <button 
                    onClick={onOpenFilters} 
                    className="flex-shrink-0 p-3 bg-brand-secondary rounded-md text-brand-text-primary hover:bg-brand-accent transition-colors" 
                    aria-label="Open filters"
                >
                    <FilterIcon className="w-5 h-5" />
                </button>
            </div>
            
            {/* Component to display and allow removal of active filters */}
            <ActiveFiltersDisplay filters={filters} onFiltersChange={onFiltersChange} />

            {/* Result count and message */}
            <div className="mb-4 text-sm text-brand-text-secondary">
                {totalDramas > 0 ? (
                    <span>
                        Showing{' '}
                        <strong>{((currentPage - 1) * itemsPerPage) + 1}</strong>
                        {' - '}
                        <strong>{Math.min(currentPage * itemsPerPage, totalDramas)}</strong>
                        {' of '}
                        <strong>{totalDramas}</strong> dramas
                    </span>
                ) : (
                    <span>No dramas found matching your criteria.</span>
                )}
            </div>

            {/* The main grid of drama cards */}
            {dramas.length > 0 ? (
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                    {dramas.map(drama => (
                        <DramaCard 
                            key={drama.url} 
                            drama={drama} 
                            onSelect={onSelectDrama} 
                            userData={userData} 
                            onToggleFavorite={onToggleFavorite} 
                            onSetStatus={onSetStatus}
                        />
                    ))}
                </div>
            ) : null}
            
            {/* Pagination controls, displayed at the bottom */}
            <Pagination 
                currentPage={currentPage} 
                totalItems={totalDramas} 
                itemsPerPage={itemsPerPage} 
                onPageChange={onPageChange} 
            />
        </>
    );
};