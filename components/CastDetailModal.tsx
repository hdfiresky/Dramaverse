/**
 * @fileoverview Defines a modal for displaying all dramas a specific actor has been in.
 * This allows for actor-centric discovery.
 */
import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Drama, UserData, UserDramaStatus } from '../types';
import { DramaCard } from './DramaCard';
import { CloseIcon, ChevronLeftIcon } from './Icons';

interface CastDetailModalProps {
    /** The name of the actor to display dramas for. */
    actorName: string;
    /** The complete list of all dramas in the library. */
    allDramas: Drama[];
    /** Callback to close all modals. */
    onCloseAll: () => void;
    /** Callback to pop the current modal from the stack. */
    onPopModal: () => void;
    /** Callback to open the main detail modal for a selected drama from this view. */
    onSelectDrama: (drama: Drama) => void;
    /** The current user's data, for passing to DramaCards to show status. */
    userData: UserData;
    /** Callback to toggle a drama's favorite status. */
    onToggleFavorite: (url: string) => void;
    /** Callback to set the user's status for a drama. */
    onSetStatus: (url: string, statusInfo: Omit<UserDramaStatus, 'updatedAt'>) => void;
    /** If true, shows a "Back" button instead of a "Close" icon. */
    showBackButton: boolean;
    /** Callback to save a review and automatically track user progress. */
    onSetReviewAndTrackProgress: (drama: Drama, episodeNumber: number, text: string) => void;
}

/**
 * A modal component that shows a grid of dramas featuring a selected actor.
 * It is rendered using a React Portal to the #modal-root DOM element.
 *
 * @param {CastDetailModalProps} props - The props for the CastDetailModal component.
 * @returns {React.ReactElement} The rendered cast detail modal.
 */
export const CastDetailModal: React.FC<CastDetailModalProps> = ({
    actorName,
    allDramas,
    onCloseAll,
    onPopModal,
    onSelectDrama,
    userData,
    onToggleFavorite,
    onSetStatus,
    showBackButton = false,
    onSetReviewAndTrackProgress
}) => {
    // Memoize the list of dramas for the selected actor to avoid re-filtering on every render.
    // The calculation only runs if the `allDramas` list or `actorName` changes.
    const actorDramas = useMemo(() => {
        return allDramas
            .filter(drama => 
                // Check if the actor's name is in the drama's cast list.
                drama.cast.some(castMember => castMember.actor_name === actorName)
            )
            // Sort the actor's dramas by rating in descending order for relevance.
            .sort((a,b) => b.rating - a.rating);
    }, [allDramas, actorName]);

    return ReactDOM.createPortal(
        <div 
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in" 
            onClick={onCloseAll} // Close modal on backdrop click.
        >
            <div 
                className="bg-brand-secondary rounded-lg w-full max-w-4xl h-[90vh] flex flex-col" 
                onClick={e => e.stopPropagation()} // Prevent clicks inside from closing the modal.
            >
                <div className="flex-shrink-0 p-4 flex items-center justify-between border-b border-gray-700">
                    <div className="flex items-center gap-4 min-w-0">
                        {showBackButton && (
                            <button onClick={onPopModal} className="p-2 rounded-full hover:bg-brand-primary flex items-center gap-1 text-sm font-semibold flex-shrink-0" aria-label="Go back">
                                <ChevronLeftIcon className="w-5 h-5"/>
                                <span className="hidden sm:inline">Back</span>
                            </button>
                        )}
                        <div className="min-w-0">
                            <h2 className="text-xl font-bold text-brand-text-primary truncate">
                                Dramas featuring <span className="text-brand-accent">{actorName}</span>
                            </h2>
                            <p className="text-sm text-brand-text-secondary">
                                {actorDramas.length} {actorDramas.length === 1 ? 'drama' : 'dramas'}
                            </p>
                        </div>
                    </div>
                    
                    <button onClick={onCloseAll} className="p-2 rounded-full hover:bg-brand-primary flex-shrink-0 ml-4" aria-label="Close cast details">
                        <CloseIcon className="w-6 h-6"/>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {actorDramas.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {actorDramas.map(drama => (
                                // Re-use the standard DramaCard component for a consistent look and feel.
                                <DramaCard
                                    key={drama.url}
                                    drama={drama}
                                    onSelect={onSelectDrama}
                                    userData={userData}
                                    onToggleFavorite={onToggleFavorite}
                                    onSetStatus={onSetStatus}
                                    onSetReviewAndTrackProgress={onSetReviewAndTrackProgress}
                                />
                            ))}
                        </div>
                    ) : (
                        // Display a message if no dramas for the actor are found in the dataset.
                        <p className="text-center text-brand-text-secondary py-10">
                            No other dramas featuring {actorName} were found in the library.
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};