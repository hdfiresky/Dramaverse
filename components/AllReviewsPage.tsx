/**
 * @fileoverview Defines the AllReviewsPage component, which displays a sortable,
 * comprehensive list of all episode reviews written by the user.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { Drama, UserData, EpisodeReview } from '../types';
import { ChevronRightIcon } from './Icons';
import { BACKEND_MODE, API_BASE_URL } from '../config';


interface AllReviewsPageProps {
    /** The complete list of all dramas. Used only in frontend-only mode. */
    allDramas: Drama[];
    /** The current user's data containing their reviews. */
    userData: UserData;
    /** Callback to open the detail modal for a selected drama. */
    onSelectDrama: (drama: Drama) => void;
}

/** The processed data structure for a drama that has reviews. */
interface ReviewedDrama {
    drama: Drama;
    reviews: {
        episodeNumber: number;
        text: string;
        updatedAt: number;
    }[];
    reviewCount: number;
    maxUpdatedAt: number;
}

/**
 * A helper function to format a timestamp into a human-readable "time ago" string.
 * @param {number} timestamp - The UTC timestamp.
 * @returns {string} The formatted string (e.g., "2 days ago").
 */
const timeAgo = (timestamp: number): string => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    
    if (seconds < 60) return "just now";
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    
    return Math.floor(seconds) + " seconds ago";
};

/**
 * An interactive, collapsible card component for displaying the reviews of a single drama.
 */
const ReviewedDramaCard: React.FC<{
    reviewedDrama: ReviewedDrama;
    onSelectDrama: (drama: Drama) => void;
}> = ({ reviewedDrama, onSelectDrama }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { drama, reviews, reviewCount, maxUpdatedAt } = reviewedDrama;

    return (
        <div className="bg-brand-secondary rounded-lg overflow-hidden shadow-md transition-all duration-300">
            <div className="p-4 flex flex-col sm:flex-row gap-4">
                <img 
                    src={drama.cover_image} 
                    alt={drama.title} 
                    className="w-24 h-36 object-cover rounded-md flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onSelectDrama(drama)}
                />
                <div className="flex-1">
                    <h3 
                        className="text-lg font-bold text-brand-text-primary cursor-pointer hover:text-brand-accent transition-colors"
                        onClick={() => onSelectDrama(drama)}
                    >
                        {drama.title}
                    </h3>
                    <p className="text-sm text-brand-text-secondary mt-1">
                        You've reviewed <span className="font-bold text-brand-text-primary">{reviewCount}</span> episode{reviewCount > 1 ? 's' : ''}.
                    </p>
                    <p className="text-xs text-brand-text-secondary mt-1">
                        Last review updated: {timeAgo(maxUpdatedAt)}
                    </p>
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)} 
                        className="mt-3 text-sm font-semibold text-brand-accent hover:text-brand-accent-hover flex items-center gap-1"
                        aria-expanded={isExpanded}
                    >
                        {isExpanded ? 'Hide Reviews' : 'Show Reviews'}
                        <ChevronRightIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className="bg-brand-primary/50 px-4 py-2 animate-fade-in">
                     <div className="border-t border-gray-700 my-2"></div>
                    <div className="space-y-3 p-2 max-h-60 overflow-y-auto custom-scrollbar">
                        {reviews.sort((a,b) => a.episodeNumber - b.episodeNumber).map(review => (
                            <div key={review.episodeNumber}>
                                <p className="font-semibold text-sm text-brand-text-primary">Episode {review.episodeNumber}</p>
                                <p className="text-sm text-brand-text-secondary pl-2 border-l-2 border-gray-600 ml-1 mt-1 italic">
                                    "{review.text}"
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


/**
 * The main page component for displaying all user reviews.
 */
export const AllReviewsPage: React.FC<AllReviewsPageProps> = ({ allDramas, userData, onSelectDrama }) => {
    type SortByType = 'latest' | 'mostReviews' | 'alpha';
    const [sortBy, setSortBy] = useState<SortByType>('latest');
    const [dramaDetails, setDramaDetails] = useState<Map<string, Drama>>(new Map());
    const [isLoading, setIsLoading] = useState(BACKEND_MODE);

    useEffect(() => {
        const fetchDramaDetails = async () => {
            if (!BACKEND_MODE) return;
            
            const reviewUrls = Object.keys(userData.episodeReviews);
            if (reviewUrls.length === 0) {
                setIsLoading(false);
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/dramas/by-urls`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', },
                    credentials: 'include',
                    body: JSON.stringify({ urls: reviewUrls })
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
    }, [userData.episodeReviews]);


    const reviewedDramas = useMemo<ReviewedDrama[]>(() => {
        const dramaMap = BACKEND_MODE ? dramaDetails : new Map(allDramas.map(d => [d.url, d]));
        if (dramaMap.size === 0 && BACKEND_MODE && !isLoading) return [];
        
        const result: ReviewedDrama[] = [];

        for (const dramaUrl in userData.episodeReviews) {
            const drama = dramaMap.get(dramaUrl);
            const reviewsData = userData.episodeReviews[dramaUrl];

            if (drama && reviewsData) {
                const reviews = Object.entries(reviewsData).map(([epNum, review]) => ({
                    episodeNumber: parseInt(epNum, 10),
                    text: (review as EpisodeReview).text,
                    updatedAt: (review as EpisodeReview).updatedAt,
                }));

                if (reviews.length > 0) {
                    const maxUpdatedAt = Math.max(...reviews.map(r => r.updatedAt));
                    result.push({
                        drama,
                        reviews,
                        reviewCount: reviews.length,
                        maxUpdatedAt,
                    });
                }
            }
        }
        return result;
    }, [allDramas, userData, dramaDetails, isLoading]);
    
    const totalReviewsCount = useMemo(() => {
        return reviewedDramas.reduce((acc, drama) => acc + drama.reviewCount, 0);
    }, [reviewedDramas]);

    const sortedDramas = useMemo(() => {
        const sorted = [...reviewedDramas];
        switch (sortBy) {
            case 'latest':
                return sorted.sort((a, b) => b.maxUpdatedAt - a.maxUpdatedAt);
            case 'mostReviews':
                return sorted.sort((a, b) => b.reviewCount - a.reviewCount || a.drama.title.localeCompare(b.drama.title));
            case 'alpha':
                return sorted.sort((a, b) => a.drama.title.localeCompare(b.drama.title));
            default:
                return sorted;
        }
    }, [reviewedDramas, sortBy]);
    
    const dramasCount = sortedDramas.length;

    return (
        <div className="w-full animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-brand-text-primary">
                        My Episode Reviews
                    </h2>
                    <p className="text-md text-brand-text-secondary mt-1">
                        {dramasCount} {dramasCount === 1 ? 'Drama' : 'Dramas'} &bull; {totalReviewsCount} {totalReviewsCount === 1 ? 'Review' : 'Reviews'}
                    </p>
                </div>
                {sortedDramas.length > 0 && (
                    <div className="flex items-center gap-2">
                        <label htmlFor="sort-reviews" className="text-sm font-medium text-brand-text-secondary">Sort by:</label>
                        <select
                            id="sort-reviews"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as SortByType)}
                            className="bg-brand-secondary p-2 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none text-sm"
                        >
                            <option value="latest">Latest Review</option>
                            <option value="mostReviews">Most Reviews</option>
                            <option value="alpha">Alphabetical</option>
                        </select>
                    </div>
                )}
            </div>

            {isLoading ? (
                 <div className="flex justify-center items-center h-64">
                    <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-brand-accent"></div>
                </div>
            ) : sortedDramas.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {sortedDramas.map(rd => (
                        <ReviewedDramaCard 
                            key={rd.drama.url} 
                            reviewedDrama={rd}
                            onSelectDrama={onSelectDrama}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20">
                    <p className="text-brand-text-secondary">You haven't written any episode reviews yet.</p>
                    <p className="text-brand-text-secondary mt-1">Start watching a drama and use the "Review Episodes" button to add your thoughts!</p>
                </div>
            )}
        </div>
    );
};