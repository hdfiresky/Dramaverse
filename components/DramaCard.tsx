/**
 * @fileoverview Defines the DramaCard component, a key visual element for displaying
 * a summary of a drama in the main grid view.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Drama, UserData, DramaStatus, UserDramaStatus } from '../types';
import { StarIcon, HeartIcon, BookmarkIcon, EyeIcon, CheckCircleIcon, PauseIcon, XCircleIcon } from './Icons';

interface DramaCardProps {
    /** The drama object containing all data to display. */
    drama: Drama;
    /** Callback function triggered when the card is clicked, usually to show details. */
    onSelect: (drama: Drama) => void;
    /** The current user's data, used to show favorite/watchlist status. Optional. */
    userData?: UserData;
    /** Callback to toggle the drama's favorite status. */
    onToggleFavorite: (dramaUrl: string) => void;
    /** Callback to set the user's status for a drama. */
    onSetStatus: (url: string, statusInfo: Omit<UserDramaStatus, 'updatedAt'>) => void;
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
export const DramaCard: React.FC<DramaCardProps> = ({ drama, onSelect, userData, onToggleFavorite, onSetStatus }) => {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Determine the current status of the drama for the logged-in user to apply correct styling.
    const isFavorite = userData?.favorites.includes(drama.url) ?? false;
    const currentStatus = userData?.statuses[drama.url]?.status;

    // A helper to safely extract the year from the aired_date string.
    const getYear = (dateStr: string) => {
        const year = new Date(dateStr.split(' - ')[0]).getFullYear();
        return isNaN(year) ? 'TBA' : year;
    }

    const handleStatusUpdate = (e: React.MouseEvent, newStatus: DramaStatus | null) => {
        e.stopPropagation();
        const currentEpisode = userData?.statuses[drama.url]?.currentEpisode || 0;
        onSetStatus(drama.url, { status: newStatus as any, currentEpisode });
        setPopoverOpen(false);
    };

    // Close popover on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setPopoverOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);
    
    const StatusIcon = currentStatus ? statusConfig[currentStatus].icon : BookmarkIcon;

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
                        
                        <div className="relative" ref={wrapperRef}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPopoverOpen(prev => !prev);
                                }}
                                className={`p-2 rounded-full transition-colors ${currentStatus ? 'bg-brand-accent text-white hover:bg-brand-accent-hover' : 'bg-black/50 text-white hover:bg-sky-300'}`}
                                title="Set Status"
                                aria-label="Set drama status"
                                aria-haspopup="true"
                                aria-expanded={popoverOpen}
                            >
                                <StatusIcon className="w-5 h-5" />
                            </button>

                            {popoverOpen && (
                                <div
                                    onClick={e => e.stopPropagation()}
                                    className="absolute right-0 top-full mt-2 w-48 bg-brand-secondary rounded-md shadow-lg z-20 py-1 ring-1 ring-black/5 animate-fade-in"
                                    style={{ animationDuration: '150ms' }}
                                >
                                    {statusOrder.map(status => {
                                        const { icon: Icon, label } = statusConfig[status];
                                        const isActive = currentStatus === status;
                                        return (
                                            <button
                                                key={status}
                                                onClick={(e) => handleStatusUpdate(e, status)}
                                                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors ${isActive ? 'bg-brand-accent text-white' : 'hover:bg-brand-primary'}`}
                                            >
                                                <Icon className="w-4 h-4" />
                                                <span>{label}</span>
                                            </button>
                                        );
                                    })}
                                    <div className="my-1 h-px bg-slate-200 dark:bg-slate-700"></div>
                                    <button
                                        onClick={(e) => handleStatusUpdate(e, null)}
                                        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-brand-primary text-red-500"
                                    >
                                        <XCircleIcon className="w-4 h-4" />
                                        <span>Remove from list</span>
                                    </button>
                                </div>
                            )}
                        </div>
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