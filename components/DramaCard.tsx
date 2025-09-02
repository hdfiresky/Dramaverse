/**
 * @fileoverview Defines the DramaCard component, a key visual element for displaying
 * a summary of a drama in the main grid view.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Drama, UserData, DramaStatus, UserDramaStatus } from '../types';
import { StarIcon, HeartIcon, BookmarkIcon, EyeIcon, CheckCircleIcon, PauseIcon, XCircleIcon, ChatBubbleOvalLeftEllipsisIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';

interface DramaCardProps {
    /** The drama object containing all data to display. */
    drama: Drama;
    /** Callback function triggered when the card is clicked, usually to show details. */
    onSelect: (drama: Drama) => void;
    /** The current user's data, used to show favorite/watchlist status. Optional. */
    userData?: UserData;
    /** A boolean indicating if a user is currently logged in. */
    isUserLoggedIn?: boolean;
    /** Callback to toggle the drama's favorite status. */
    onToggleFavorite: (dramaUrl: string) => void;
    /** Callback to set the user's status for a drama. */
    onSetStatus: (url: string, statusInfo: Omit<UserDramaStatus, 'updatedAt'>) => void;
    /** Callback to save a review and automatically track user progress. */
    onSetReviewAndTrackProgress: (drama: Drama, episodeNumber: number, text: string) => void;
}

const statusConfig: Record<DramaStatus, { icon: React.FC<any>; label: string }> = {
    [DramaStatus.Watching]: { icon: EyeIcon, label: 'Watching' },
    [DramaStatus.Completed]: { icon: CheckCircleIcon, label: 'Completed' },
    [DramaStatus.OnHold]: { icon: PauseIcon, label: 'On-Hold' },
    [DramaStatus.Dropped]: { icon: XCircleIcon, label: 'Dropped' },
    [DramaStatus.PlanToWatch]: { icon: BookmarkIcon, label: 'Plan to Watch' },
};
const statusOrder = [DramaStatus.Watching, DramaStatus.Completed, DramaStatus.OnHold, DramaStatus.Dropped, DramaStatus.PlanToWatch];


/**
 * A component that renders a visual card for a single drama.
 * It shows the cover image, title, rating, and year. It also displays
 * action buttons for favoriting and adding to the watchlist if a user is logged in.
 *
 * @param {DramaCardProps} props - The props for the DramaCard component.
 * @returns {React.ReactElement} The rendered drama card.
 */
export const DramaCard: React.FC<DramaCardProps> = ({ drama, onSelect, userData, isUserLoggedIn, onToggleFavorite, onSetStatus, onSetReviewAndTrackProgress }) => {
    const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
    const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
    const [currentReviewEpisode, setCurrentReviewEpisode] = useState(1);
    const [reviewText, setReviewText] = useState('');

    const statusWrapperRef = useRef<HTMLDivElement>(null);
    const reviewWrapperRef = useRef<HTMLDivElement>(null);

    const isFavorite = userData?.favorites.includes(drama.url) ?? false;
    const currentStatusInfo = userData?.statuses[drama.url];
    const currentStatus = currentStatusInfo?.status;

    const getYear = (dateStr: string) => {
        const year = new Date(dateStr.split(' - ')[0]).getFullYear();
        return isNaN(year) ? 'TBA' : year;
    }

    const handleStatusUpdate = (e: React.MouseEvent, newStatus: DramaStatus | null) => {
        e.stopPropagation();
        const existingEpisode = currentStatusInfo?.currentEpisode || 0;
        // If moving to completed, automatically set progress to max.
        const newEpisode = newStatus === DramaStatus.Completed ? drama.episodes : existingEpisode;
        onSetStatus(drama.url, { status: newStatus as any, currentEpisode: newEpisode });
        setStatusPopoverOpen(false);
    };
    
    const handleReviewSave = useCallback(() => {
        const savedText = userData?.episodeReviews?.[drama.url]?.[currentReviewEpisode]?.text || '';
        if (reviewText !== savedText) {
            onSetReviewAndTrackProgress(drama, currentReviewEpisode, reviewText);
        }
    }, [userData, drama, currentReviewEpisode, reviewText, onSetReviewAndTrackProgress]);
    
    // FIX: This logic is refactored to ensure the "smart" episode finder only runs when the popover opens.
    // The navigation inside the popover is now simple increment/decrement.
    const handleToggleReviewPopover = (e: React.MouseEvent) => {
        e.stopPropagation();
        const willBeOpen = !reviewPopoverOpen;

        if (willBeOpen) {
             // Smart logic to find the next un-reviewed episode, runs only when opening.
            if (userData && drama) {
                const reviewsForDrama = userData.episodeReviews?.[drama.url] || {};
                const reviewedEpisodes = Object.keys(reviewsForDrama).map(Number);
                const lastReviewedEp = reviewedEpisodes.length > 0 ? Math.max(...reviewedEpisodes) : 0;
                const currentProgress = currentStatusInfo?.currentEpisode || 0;
                // Start at the episode after the latest of your progress or your last review
                const nextEp = Math.max(lastReviewedEp, currentProgress) + 1;
                setCurrentReviewEpisode(Math.min(nextEp, drama.episodes));
            }
        } else {
            // Popover is closing, save the current review.
            handleReviewSave();
        }
        setReviewPopoverOpen(willBeOpen);
    };
    
    // Handles navigation inside the review popover.
    // It saves the current review before changing the episode.
    const handleReviewNavigation = (direction: 'next' | 'prev') => {
        handleReviewSave();
        if (direction === 'next') {
            setCurrentReviewEpisode(p => Math.min(drama.episodes, p + 1));
        } else {
            setCurrentReviewEpisode(p => Math.max(1, p - 1));
        }
    };


    // Effect to sync local textarea state with global userData when episode changes
    useEffect(() => {
        if (reviewPopoverOpen) {
            const savedText = userData?.episodeReviews?.[drama.url]?.[currentReviewEpisode]?.text || '';
            setReviewText(savedText);
        }
    }, [reviewPopoverOpen, currentReviewEpisode, userData, drama.url]);

    // Close popovers on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (statusWrapperRef.current && !statusWrapperRef.current.contains(event.target as Node)) {
                setStatusPopoverOpen(false);
            }
            if (reviewWrapperRef.current && !reviewWrapperRef.current.contains(event.target as Node)) {
                if (reviewPopoverOpen) {
                    handleReviewSave(); // Save on close
                }
                setReviewPopoverOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [reviewPopoverOpen, handleReviewSave]);
    
    const StatusIcon = currentStatus ? statusConfig[currentStatus].icon : BookmarkIcon;

    const handleCardClick = () => {
        // Only trigger the main card click action if no popovers are open.
        if (!statusPopoverOpen && !reviewPopoverOpen) {
            onSelect(drama);
        }
    };

    // NEW: Handler for the progress +/- buttons.
    const handleProgressChange = (increment: number) => (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentStatusInfo) return;

        const currentEpisode = currentStatusInfo.currentEpisode || 0;
        let newEpisode = currentEpisode + increment;
        newEpisode = Math.max(0, Math.min(newEpisode, drama.episodes)); // Clamp between 0 and total episodes

        // If progress reaches max, auto-complete. If it's decremented from max, revert to Watching.
        let newStatus = currentStatusInfo.status;
        if (newEpisode === drama.episodes) {
            newStatus = DramaStatus.Completed;
        } else if (currentEpisode === drama.episodes && newEpisode < drama.episodes) {
            newStatus = DramaStatus.Watching;
        }
        
        onSetStatus(drama.url, { status: newStatus, currentEpisode: newEpisode });
    };

    return (
        <div 
            className={`bg-brand-secondary rounded-lg overflow-hidden shadow-lg transform hover:-translate-y-1 transition-all duration-300 group ${!statusPopoverOpen && !reviewPopoverOpen ? 'cursor-pointer' : ''}`}
            onClick={handleCardClick}
            role="button"
            aria-label={`View details for ${drama.title}`}
        >
            <div className="relative">
                <img src={drama.cover_image} alt={drama.title} className="w-full h-80 object-cover" />
                <div className="absolute top-2 right-2 flex flex-col gap-2">
                    {userData && (
                        <>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(drama.url); }} 
                            className={`p-2 rounded-full transition-colors ${isFavorite ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-black/50 text-white hover:bg-red-400'}`} 
                            title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                            aria-label={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                        >
                            <HeartIcon className="w-5 h-5" />
                        </button>
                        
                        <div className="relative" ref={statusWrapperRef}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setStatusPopoverOpen(p => !p); }}
                                className={`p-2 rounded-full transition-colors ${currentStatus ? 'bg-brand-accent text-white hover:bg-brand-accent-hover' : 'bg-black/50 text-white hover:bg-sky-300'}`}
                                title="Set Status" aria-haspopup="true" aria-expanded={statusPopoverOpen}
                            >
                                <StatusIcon className="w-5 h-5" />
                            </button>
                            {statusPopoverOpen && (
                                <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-48 bg-brand-secondary rounded-md shadow-lg z-20 py-1 ring-1 ring-black/5 animate-fade-in" style={{ animationDuration: '150ms' }}>
                                    {statusOrder.map(status => {
                                        const IconComponent = statusConfig[status].icon;
                                        return (
                                            <button key={status} onClick={(e) => handleStatusUpdate(e, status)} className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors ${currentStatus === status ? 'bg-brand-accent text-white' : 'hover:bg-brand-primary'}`}>
                                                <IconComponent className="w-4 h-4" />
                                                <span>{statusConfig[status].label}</span>
                                            </button>
                                        );
                                    })}
                                    <div className="my-1 h-px bg-slate-200 dark:bg-slate-700"></div>
                                    <button onClick={(e) => handleStatusUpdate(e, null)} className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-brand-primary text-red-500">
                                        <XCircleIcon className="w-4 h-4" />
                                        <span>Remove from list</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        {isUserLoggedIn && (
                            <div className="relative" ref={reviewWrapperRef}>
                                <button
                                    onClick={handleToggleReviewPopover}
                                    className={`p-2 rounded-full transition-colors bg-black/50 text-white hover:bg-green-400`}
                                    title="Add/Edit Review" aria-haspopup="true" aria-expanded={reviewPopoverOpen}
                                >
                                    <ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5" />
                                </button>
                                {reviewPopoverOpen && (
                                    <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-64 bg-brand-secondary rounded-md shadow-lg z-20 p-3 ring-1 ring-black/5 animate-fade-in" style={{ animationDuration: '150ms' }}>
                                        <div className="flex justify-between items-center mb-2">
                                            <button 
                                                onClick={() => handleReviewNavigation('prev')}
                                                disabled={currentReviewEpisode === 1}
                                                className="p-1 rounded-full hover:bg-brand-primary disabled:opacity-50"
                                                aria-label="Previous episode review"
                                            >
                                                <ChevronLeftIcon className="w-5 h-5" />
                                            </button>
                                            <p className="text-sm font-semibold">Episode {currentReviewEpisode} / {drama.episodes}</p>
                                            <button 
                                                onClick={() => handleReviewNavigation('next')}
                                                disabled={currentReviewEpisode === drama.episodes}
                                                className="p-1 rounded-full hover:bg-brand-primary disabled:opacity-50"
                                                aria-label="Next episode review"
                                            >
                                                <ChevronRightIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <textarea
                                            value={reviewText}
                                            onChange={(e) => setReviewText(e.target.value)}
                                            rows={5}
                                            placeholder="Your thoughts..."
                                            onBlur={handleReviewSave}
                                            className="w-full bg-brand-primary p-2 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none text-sm resize-y"
                                            aria-label={`Review text for episode ${currentReviewEpisode}`}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                        </>
                    )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <h3 className="text-md font-bold truncate text-white">{drama.title}</h3>
                    <div className="flex items-center text-sm text-slate-300 mt-1">
                        <StarIcon className="w-4 h-4 text-yellow-400 mr-1" />
                        <span>{drama.rating.toFixed(1)}</span>
                        <span className="mx-2">|</span>
                        <span>{getYear(drama.aired_date)}</span>
                    </div>

                    {/* NEW: Progress display and controls for "Watching" status */}
                    {currentStatusInfo?.status === DramaStatus.Watching && (
                        <div className="mt-2 text-white transition-all duration-300">
                            <div className="flex justify-between items-center text-xs mb-1">
                                <span>Progress: Ep {currentStatusInfo.currentEpisode || 0} / {drama.episodes}</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleProgressChange(-1)} disabled={(currentStatusInfo.currentEpisode || 0) <= 0} className="w-6 h-6 flex items-center justify-center bg-white/20 rounded-full disabled:opacity-50 hover:bg-white/40 font-mono text-lg leading-none pb-0.5" aria-label="Decrement episode progress">-</button>
                                    <button onClick={handleProgressChange(1)} disabled={(currentStatusInfo.currentEpisode || 0) >= drama.episodes} className="w-6 h-6 flex items-center justify-center bg-white/20 rounded-full disabled:opacity-50 hover:bg-white/40 font-mono text-lg leading-none pb-0.5" aria-label="Increment episode progress">+</button>
                                </div>
                            </div>
                            <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-sky-400 h-1.5 rounded-full transition-all duration-300" style={{ width: `${((currentStatusInfo.currentEpisode || 0) / drama.episodes) * 100}%` }}></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};