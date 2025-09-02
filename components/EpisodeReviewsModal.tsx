/**
 * @fileoverview Defines a modal for writing and viewing reviews for each episode of a drama.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import {
    Drama,
    UserData
} from '../types';
import {
    CloseIcon,
    ChevronLeftIcon
} from './Icons';

interface EpisodeReviewsModalProps {
    /** The drama to show reviews for. Can be null if data is loading. */
    drama: Drama | null | undefined;
    /** The current user's data to retrieve existing reviews from. */
    userData: UserData;
    /** Callback to close all modals. */
    onCloseAll: () => void;
    /** Callback to pop the current modal from the stack (go back). */
    onPopModal: () => void;
    /** Callback to save or update an episode review. */
    onSetEpisodeReview: (dramaUrl: string, episodeNumber: number, text: string) => void;
    /** If true, shows a "Back" button instead of a "Close" icon. */
    showBackButton: boolean;
}

/**
 * A modal component that displays a list of episodes for a given drama,
 * each with a textarea for users to write or edit their reviews.
 * Reviews are saved on blur.
 *
 * @param {EpisodeReviewsModalProps} props - The props for the component.
 * @returns {React.ReactElement} The rendered modal, attached to the modal root.
 */
export const EpisodeReviewsModal: React.FC<EpisodeReviewsModalProps> = ({
    drama,
    userData,
    onCloseAll,
    onPopModal,
    onSetEpisodeReview,
    showBackButton = false
}) => {
    // If drama data isn't loaded yet, show a loading state.
    if (!drama) {
        return ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-brand-accent"></div>
            </div>,
             document.getElementById('modal-root')!
        );
    }
    
    // Generate an array of episode numbers from 1 to the total number of episodes.
    const episodes = Array.from({
        length: drama.episodes
    }, (_, i) => i + 1);

    /**
     * Handles saving the review text when the user clicks away from a textarea.
     * @param {number} episodeNumber - The episode number the review is for.
     * @param {string} text - The content of the review.
     */
    const handleSaveReview = (episodeNumber: number, text: string) => {
        onSetEpisodeReview(drama.url, episodeNumber, text);
    };

    return ReactDOM.createPortal(
        <div 
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in"
            onClick={onCloseAll}
        >
            <div 
                className="bg-brand-secondary rounded-lg w-full max-w-2xl h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex-shrink-0 p-4 flex items-center justify-between border-b border-gray-700">
                    <div className="flex items-center gap-4 min-w-0">
                        {showBackButton && (
                            <button onClick={onPopModal} className="p-2 rounded-full hover:bg-brand-primary flex-shrink-0" aria-label="Go back">
                                <ChevronLeftIcon className="w-5 h-5"/>
                            </button>
                        )}
                        <h2 className="text-xl font-bold text-brand-text-primary truncate">
                            Episode Reviews: <span className="text-brand-accent">{drama.title}</span>
                        </h2>
                    </div>
                    
                    <button onClick={onCloseAll} className="p-2 rounded-full hover:bg-brand-primary flex-shrink-0 ml-4" aria-label="Close episode reviews">
                        <CloseIcon className="w-6 h-6"/>
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="space-y-6">
                        {episodes.map(epNum => (
                            <div key={epNum}>
                                <label htmlFor={`review-ep-${epNum}`} className="block text-md font-semibold text-brand-text-primary mb-2">
                                    Episode {epNum}
                                </label>
                                <textarea
                                    id={`review-ep-${epNum}`}
                                    rows={4}
                                    defaultValue={userData.episodeReviews?.[drama.url]?.[epNum]?.text || ''}
                                    onBlur={(e) => handleSaveReview(epNum, e.target.value)}
                                    placeholder="Your thoughts on this episode..."
                                    className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none text-sm text-brand-text-secondary resize-y"
                                    aria-label={`Review for episode ${epNum}`}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};