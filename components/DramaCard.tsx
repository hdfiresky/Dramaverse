/**
 * @fileoverview Defines the DramaCard component, a key visual element for displaying
 * a summary of a drama in the main grid view.
 */
import React from 'react';
import { Drama, UserData, DramaStatus } from '../types';
import { StarIcon, HeartIcon, BookmarkIcon } from './Icons';

interface DramaCardProps {
    /** The drama object containing all data to display. */
    drama: Drama;
    /** Callback function triggered when the card is clicked, usually to show details. */
    onSelect: (drama: Drama) => void;
    /** The current user's data, used to show favorite/watchlist status. Optional. */
    userData?: UserData;
    /** Callback to toggle the drama's favorite status. */
    onToggleFavorite: (dramaUrl: string) => void;
    /** Callback to toggle the drama's 'Plan to Watch' status. */
    onTogglePlanToWatch: (dramaUrl: string) => void;
}

/**
 * A component that renders a visual card for a single drama.
 * It shows the cover image, title, rating, and year. It also displays
 * action buttons for favoriting and adding to the watchlist if a user is logged in.
 *
 * @param {DramaCardProps} props - The props for the DramaCard component.
 * @returns {React.ReactElement} The rendered drama card.
 */
export const DramaCard: React.FC<DramaCardProps> = ({ drama, onSelect, userData, onToggleFavorite, onTogglePlanToWatch }) => {
    // Determine the current status of the drama for the logged-in user to apply correct styling.
    const isFavorite = userData?.favorites.includes(drama.url) ?? false;
    const isPlanToWatch = userData?.statuses[drama.url]?.status === DramaStatus.PlanToWatch;

    // A helper to safely extract the year from the aired_date string.
    const getYear = (dateStr: string) => {
        // Attempt to parse the start date of the range.
        const year = new Date(dateStr.split(' - ')[0]).getFullYear();
        // Return the year if it's a valid number, otherwise return 'TBA' (To Be Announced).
        return isNaN(year) ? 'TBA' : year;
    }

    return (
        <div 
            className="bg-brand-secondary rounded-lg overflow-hidden shadow-lg transform hover:-translate-y-1 transition-all duration-300 group cursor-pointer"
            onClick={() => onSelect(drama)} // The entire card is clickable to open the detail modal.
            role="button"
            aria-label={`View details for ${drama.title}`}
        >
            <div className="relative">
                {/* Main image */}
                <img src={drama.cover_image} alt={drama.title} className="w-full h-80 object-cover" />

                {/* Quick action buttons overlay */}
                <div className="absolute top-2 right-2 flex flex-col gap-2">
                    {/* These buttons are only rendered if userData is provided (i.e., a user is logged in). */}
                    {userData && (
                        <>
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); // Prevent the card's onClick from firing, which would open the modal.
                                onToggleFavorite(drama.url); 
                            }} 
                            className={`p-2 rounded-full transition-colors ${isFavorite ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-black/50 text-white hover:bg-red-400'}`} 
                            title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                            aria-label={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                        >
                            <HeartIcon className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); // Prevent modal from opening when this button is clicked.
                                onTogglePlanToWatch(drama.url); 
                            }} 
                            className={`p-2 rounded-full transition-colors ${isPlanToWatch ? 'bg-brand-accent text-white hover:bg-brand-accent-hover' : 'bg-black/50 text-white hover:bg-sky-300'}`} 
                            title={isPlanToWatch ? 'Remove from Plan to Watch' : 'Add to Plan to Watch'}
                            aria-label={isPlanToWatch ? 'Remove from Plan to Watch' : 'Add to Plan to Watch'}
                        >
                            <BookmarkIcon className="w-5 h-5" />
                        </button>
                        </>
                    )}
                </div>

                {/* Information overlay at the bottom of the card with a subtle gradient background. */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <h3 className="text-md font-bold truncate text-brand-text-primary">{drama.title}</h3>
                    <div className="flex items-center text-sm text-brand-text-secondary mt-1">
                        <StarIcon className="w-4 h-4 text-yellow-400 mr-1" />
                        <span>{drama.rating.toFixed(1)}</span>
                        <span className="mx-2">|</span>
                        <span>{getYear(drama.aired_date)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
