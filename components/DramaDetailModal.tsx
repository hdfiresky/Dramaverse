/**
 * @fileoverview Defines the modal component for displaying detailed information about a drama.
 * This includes metadata, user actions (like setting status), and both curated and
 * dynamically generated similarity-based recommendations.
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Drama, UserData, User, UserDramaStatus, DramaStatus, Filters, Recommendation, CastMember } from '../types';
import {
    CloseIcon, HeartIcon, StarIcon, EyeIcon, BookmarkIcon, CheckCircleIcon, PauseIcon, XCircleIcon, ChevronLeftIcon
} from './Icons';

interface DramaDetailModalProps {
    /** The drama object to display details for. */
    drama: Drama;
    /** The complete list of all dramas, for looking up recommendations. */
    allDramas: Drama[];
    /** Callback to close all modals in the stack. */
    onCloseAll: () => void;
    /** Callback to pop the current modal from the stack (go back). */
    onPopModal: () => void;
    /** Callback to open the details modal for another drama (e.g., from recommendations). */
    onSelectDrama: (drama: Drama) => void;
    /** Callback to set a quick filter based on a genre or tag. */
    onSetQuickFilter: (type: 'genre' | 'tag', value: string) => void;
    /** Callback to open the modal for a specific actor. */
    onSelectActor: (actorName: string) => void;
    /** The current user's data. */
    userData: UserData;
    /** Callback to set the user's status for this drama. */
    onSetStatus: (url: string, status: UserDramaStatus) => void;
    /** Callback to toggle the favorite status for this drama. */
    onToggleFavorite: (url: string) => void;
    /** The currently logged-in user, or null. */
    currentUser: User | null;
    /** The current filter state, used to provide visual feedback on tags/genres. */
    filters: Filters;
    /** Callback to open the modal for episode reviews */
    onOpenEpisodeReviews: (drama: Drama) => void;
    /** If true, shows a "Back" button in the header. */
    showBackButton: boolean;
}

/** A decorated recommendation object that includes the full drama data if it exists. */
interface DisplayRecommendation extends Recommendation {
    fullDrama?: Drama;
}


// --- Similarity Engine Logic ---

// A simple list of common English words to ignore when comparing descriptions for similarity.
const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'of', 'for', 'to', 'with', 'and', 'or', 'is', 'was', 'were', 'it', 'i', 'you', 'he', 'she', 'they', 'we', 'has', 'had', 'have', 'but', 'not']);

/**
 * Calculates the Jaccard similarity coefficient between two sets of strings.
 * Jaccard Similarity = (size of intersection) / (size of union)
 * @param {Set<string>} setA The first set.
 * @param {Set<string>} setB The second set.
 * @returns {number} A similarity score between 0 (no similarity) and 1 (identical).
 */
const jaccardSimilarity = (setA: Set<string>, setB: Set<string>): number => {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
};

// Criteria available for user selection in the recommendation engine.
const CRITERIA_OPTIONS: { id: 'genres' | 'tags' | 'description' | 'cast' | 'rating' | 'rating_count', label: string }[] = [
    { id: 'genres', label: 'Genres' },
    { id: 'tags', label: 'Tags' },
    { id: 'description', label: 'Description' },
    { id: 'cast', label: 'Cast' },
    { id: 'rating', label: 'Rating' },
    { id: 'rating_count', label: 'Rating Count' },
];

const actionButtonsConfig: {
    type: 'status' | 'favorite';
    status?: DramaStatus;
    icon: React.FC<any>;
    label: string;
}[] = [
    { type: 'status', status: DramaStatus.Watching, icon: EyeIcon, label: 'Watching' },
    { type: 'status', status: DramaStatus.PlanToWatch, icon: BookmarkIcon, label: 'Plan to Watch' },
    { type: 'status', status: DramaStatus.Completed, icon: CheckCircleIcon, label: 'Completed' },
    { type: 'status', status: DramaStatus.OnHold, icon: PauseIcon, label: 'On-Hold' },
    { type: 'status', status: DramaStatus.Dropped, icon: XCircleIcon, label: 'Dropped' },
    { type: 'favorite', icon: HeartIcon, label: 'Favorite' },
];

/**
 * A helper component to render a drama card within the recommendation section.
 * It's a simplified version of DramaCard, optimized for this context.
 */
const RecommendationCard: React.FC<{
    title: string;
    imageUrl: string;
    onClick?: () => void;
    score?: number;
}> = ({ title, imageUrl, onClick, score }) => (
    <div 
        className={`bg-brand-primary rounded-lg overflow-hidden shadow-md transform transition-all duration-300 group animate-fade-in ${onClick ? 'hover:shadow-xl hover:-translate-y-1 cursor-pointer' : 'cursor-default'}`}
        onClick={onClick}
        aria-label={title}
        role={onClick ? 'button' : 'img'}
    >
        <div className="relative">
            <img src={imageUrl} alt={title} className="w-full h-48 md:h-64 object-cover" />

            {/* Display the similarity score if provided */}
            {score !== undefined && (
                <div className="absolute top-2 right-2 bg-brand-accent text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                    <span>{score}</span>
                </div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                <h3 className="text-sm font-semibold truncate text-brand-text-primary">{title}</h3>
            </div>
        </div>
    </div>
);


/**
 * A large modal component that provides a comprehensive view of a single drama.
 * It features a two-column layout for details, user-specific actions, and a
 * tabbed recommendation section with both curated and similarity-based results.
 * @param {DramaDetailModalProps} props - The props for the DramaDetailModal component.
 * @returns {React.ReactElement} The rendered detail modal.
 */
export const DramaDetailModal: React.FC<DramaDetailModalProps> = ({ drama, allDramas, onCloseAll, onPopModal, onSelectDrama, onSetQuickFilter, onSelectActor, userData, onSetStatus, onToggleFavorite, currentUser, filters, onOpenEpisodeReviews, showBackButton }) => {
    const isFavorite = drama ? userData.favorites.includes(drama.url) : false;
    const currentStatus = drama ? userData.statuses[drama.url] : undefined;
    
    const [activeTab, setActiveTab] = useState<'curated' | 'similarity'>('curated');
    const [selectedCriteria, setSelectedCriteria] = useState<string[]>(['genres', 'tags', 'rating']); // Sensible default selection
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Effect to reset internal state when the drama changes, ensuring the modal is fresh.
    useEffect(() => {
        if (drama) {
            setActiveTab('curated');
            setSelectedCriteria(['genres', 'tags', 'rating']);
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
            }
        }
    }, [drama]);

    const toggleCriterion = (criterionId: string) => {
        setSelectedCriteria(prev => 
            prev.includes(criterionId) 
            ? prev.filter(c => c !== criterionId)
            : [...prev, criterionId]
        );
    };

    /**
     * Memoized calculation for the "Curated" recommendations from the JSON data.
     * It maps all recommendations and attaches the full Drama object if it can be found.
     */
    const curatedRecommendations = useMemo<DisplayRecommendation[]>(() => {
        if (!drama) return [];
        const dramaMap = new Map(allDramas.map(d => [d.url, d]));
        return drama.recommendations.map(rec => ({
            ...rec,
            fullDrama: dramaMap.get(rec.url), // Look up the full drama object
        }));
    }, [drama, allDramas]);

    /**
     * Memoized calculation for similarity-based recommendations. This is the core of the engine.
     * It runs only when the base drama, all dramas list, or selected criteria change.
     */
    const similarityRecommendations = useMemo(() => {
        if (!drama || selectedCriteria.length === 0) return [];

        // Weights assigned to each criterion to tune the importance of each factor in the final score.
        const weights = { genres: 25, tags: 30, description: 15, cast: 15, rating: 10, rating_count: 5 };

        // Pre-calculate data for the base drama to avoid redundant work inside the loop.
        const baseDramaData = {
            genres: new Set(drama.genres),
            tags: new Set(drama.tags),
            description: new Set(drama.description.toLowerCase().split(/\s+/).filter(word => !stopWords.has(word) && word.length > 2)),
            cast: new Set(drama.cast.map(c => c.actor_name)),
            rating: drama.rating,
            // Use log to handle the large range of rating counts more effectively.
            rating_count: drama.rating_count > 0 ? Math.log(drama.rating_count) : 0,
        };
        
        // Find min/max log rating count across all dramas for normalization.
        const logRatingCounts = allDramas.map(d => (d.rating_count > 0 ? Math.log(d.rating_count) : 0)).filter(l => l > 0);
        const maxLogRatingCount = Math.max(...logRatingCounts);
        const minLogRatingCount = Math.min(...logRatingCounts);
        const logRatingCountRange = maxLogRatingCount - minLogRatingCount;

        const scoredDramas = allDramas
            .filter(d => d.url !== drama.url) // Exclude the drama itself
            .map(candidate => {
                let totalScore = 0;

                // For each selected criterion, calculate a score and add it to the total.
                if (selectedCriteria.includes('genres')) {
                    totalScore += jaccardSimilarity(baseDramaData.genres, new Set(candidate.genres)) * weights.genres;
                }
                if (selectedCriteria.includes('tags')) {
                    totalScore += jaccardSimilarity(baseDramaData.tags, new Set(candidate.tags)) * weights.tags;
                }
                if (selectedCriteria.includes('description')) {
                    const candidateDesc = new Set(candidate.description.toLowerCase().split(/\s+/).filter(word => !stopWords.has(word) && word.length > 2));
                    totalScore += jaccardSimilarity(baseDramaData.description, candidateDesc) * weights.description;
                }
                if (selectedCriteria.includes('cast')) {
                    totalScore += jaccardSimilarity(baseDramaData.cast, new Set(candidate.cast.map(c => c.actor_name))) * weights.cast;
                }
                if (selectedCriteria.includes('rating')) {
                    // Score is based on how close the ratings are (normalized).
                    const diff = Math.abs(baseDramaData.rating - candidate.rating);
                    totalScore += (1 - (diff / 10)) * weights.rating; // Max rating is 10.
                }
                if (selectedCriteria.includes('rating_count')) {
                    const candidateLogCount = candidate.rating_count > 0 ? Math.log(candidate.rating_count) : 0;
                    if (candidateLogCount > 0 && logRatingCountRange > 0) {
                        const diff = Math.abs(baseDramaData.rating_count - candidateLogCount);
                        const score = 1 - (diff / logRatingCountRange);
                        totalScore += (score > 0 ? score : 0) * weights.rating_count;
                    }
                }
                
                return { drama: candidate, score: Math.round(totalScore) };
            })
            .filter(item => item.score > 10) // Only show dramas with a meaningful similarity score.
            .sort((a, b) => b.score - a.score) // Sort by highest score first.
            .slice(0, 10); // Take the top 10 results.

        return scoredDramas;
    }, [drama, allDramas, selectedCriteria]);

    const handleProgressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!drama || !currentStatus) return;
        const newEpisode = parseInt(e.target.value, 10);
        const newStatus = newEpisode === drama.episodes ? DramaStatus.Completed : currentStatus.status;
        onSetStatus(drama.url, { status: newStatus, currentEpisode: newEpisode });
    }, [drama, currentStatus, onSetStatus]);

    // Memoize rendered UI elements like tag lists to prevent re-mapping on every render.
    const genrePills = useMemo(() => drama ? drama.genres.map(g => (
        <button key={g} onClick={() => onSetQuickFilter('genre', g)} 
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${filters.genres.includes(g) ? "bg-sky-500/50 text-sky-200 cursor-default" : "bg-brand-primary hover:bg-brand-accent"}`}>
            {g}
        </button>
    )) : [], [drama, filters.genres, onSetQuickFilter]);

    const tagPills = useMemo(() => drama ? drama.tags.map(t => (
        <button key={t} onClick={() => onSetQuickFilter('tag', t)} 
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${filters.tags.includes(t) ? "bg-sky-500/50 text-sky-200 cursor-default" : "bg-brand-primary hover:bg-brand-accent"}`}>
            {t}
        </button>
    )) : [], [drama, filters.tags, onSetQuickFilter]);
    
    const castList = useMemo(() => drama ? drama.cast.map((member: CastMember) => (
        <div key={member.actor_name} onClick={() => onSelectActor(member.actor_name)} className="bg-brand-primary rounded-lg text-center p-2 transform hover:-translate-y-1 transition-transform duration-200 cursor-pointer group">
            <img src={member.actor_image} alt={member.actor_name} className="w-24 h-24 rounded-full mx-auto object-cover shadow-lg mb-2 border-2 border-transparent group-hover:border-brand-accent transition-colors"/>
            <p className="font-bold text-sm text-brand-text-primary truncate">{member.actor_name}</p>
            <p className="text-xs text-brand-text-secondary truncate">{member.character_name}</p>
        </div>
    )) : [], [drama, onSelectActor]);

    const showProgressTracker = currentStatus && [DramaStatus.Watching, DramaStatus.OnHold, DramaStatus.Completed].includes(currentStatus.status);


    return ReactDOM.createPortal(
        <div className={`fixed inset-0 bg-black/70 z-40 flex items-center justify-center transition-opacity duration-300 ${drama ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onCloseAll}>
            {drama && (
                <div className="bg-brand-secondary rounded-lg w-full max-w-4xl h-[90vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
                    <header className="flex-shrink-0 p-4 flex justify-between items-center">
                         {showBackButton ? (
                            <button onClick={onPopModal} className="p-2 rounded-full hover:bg-brand-primary" aria-label="Go back">
                                <ChevronLeftIcon className="w-5 h-5"/>
                            </button>
                        ) : (
                            <div /> // Spacer to keep close button on the right
                        )}
                        <button onClick={onCloseAll} className="p-2 rounded-full hover:bg-brand-primary" aria-label="Close details"><CloseIcon className="w-6 h-6"/></button>
                    </header>
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
                        <section aria-labelledby="drama-title" className="flex flex-col lg:flex-row gap-8">
                            <div className="lg:w-1/3 flex-shrink-0">
                                <img src={drama.cover_image} alt={drama.title} className="rounded-lg shadow-xl w-full" />
                            </div>
                            <div className="lg:w-2/3">
                                <h1 id="drama-title" className="text-3xl lg:text-4xl font-bold">{drama.title}</h1>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-3 mb-4 text-sm text-brand-text-secondary">
                                    <div className="flex items-center gap-1 font-medium">
                                        <StarIcon className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                                        <span className="text-brand-text-primary">{drama.rating.toFixed(1)}</span>
                                        <span className="text-xs">({drama.rating_count.toLocaleString()})</span>
                                    </div>
                                    <div><strong className="text-brand-text-primary">Popularity:</strong> #{drama.popularity_rank}</div>
                                    <div><strong className="text-brand-text-primary">Country:</strong> {drama.country}</div>
                                    <div><strong className="text-brand-text-primary">Episodes:</strong> {drama.episodes}</div>
                                    <div className="sm:col-span-2"><strong className="text-brand-text-primary">Duration:</strong> {drama.duration}</div>
                                    <div className="col-span-2 sm:col-span-3"><strong className="text-brand-text-primary">Aired:</strong> {drama.aired_date}</div>
                                </div>
                                <div className="mb-4">
                                    <h4 className="font-semibold text-brand-text-primary mb-2">Genres</h4>
                                    <div className="flex flex-wrap gap-2">{genrePills}</div>
                                </div>
                                <div className="mb-6">
                                    <h4 className="font-semibold text-brand-text-primary mb-2">Tags</h4>
                                    <div className="flex flex-wrap gap-2">{tagPills}</div>
                                </div>
                                <p className="text-brand-text-secondary leading-relaxed mb-6">{drama.description}</p>
                                
                                {currentUser && (
                                     <div className="bg-brand-primary p-4 rounded-lg mb-6">
                                        <h4 className="font-semibold text-brand-text-primary mb-4 text-lg">My Actions</h4>
                                        <div className="grid grid-cols-3 gap-3">
                                            {actionButtonsConfig.map(({ type, status, icon: Icon, label }) => {
                                                const isActive = type === 'status' ? currentStatus?.status === status : isFavorite;
                                                
                                                const activeClasses = type === 'favorite' 
                                                    ? 'bg-red-500 text-white shadow-lg'
                                                    : 'bg-brand-accent text-white shadow-lg';
                                                
                                                const inactiveClasses = 'bg-brand-secondary text-brand-text-secondary hover:bg-slate-200 dark:hover:bg-slate-700';
                                                
                                                const action = () => {
                                                    if (type === 'status' && status) {
                                                        const newStatus = isActive ? { status: '' as DramaStatus } : { status, currentEpisode: currentStatus?.currentEpisode || 0 };
                                                        onSetStatus(drama.url, newStatus as any);
                                                    } else if (type === 'favorite') {
                                                        onToggleFavorite(drama.url);
                                                    }
                                                };
                                                
                                                const title = type === 'status'
                                                    ? (isActive ? `Remove from '${label}'` : `Set as '${label}'`)
                                                    : (isActive ? 'Remove from Favorites' : 'Add to Favorites');

                                                return (
                                                    <button
                                                        key={label}
                                                        onClick={action}
                                                        title={title}
                                                        className={`p-3 rounded-lg transition-all duration-200 flex flex-col items-center justify-center gap-2 h-28 transform hover:-translate-y-0.5
                                                            ${isActive
                                                                ? activeClasses
                                                                : inactiveClasses
                                                            }`
                                                        }
                                                    >
                                                        <Icon className="w-7 h-7" />
                                                        <span className="text-xs font-semibold leading-tight text-center">{label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {showProgressTracker && (
                                            <div className="mt-6">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label htmlFor="episode-progress" className="text-sm font-medium text-brand-text-secondary">Progress</label>
                                                    <span className="text-sm font-bold text-brand-text-primary">{currentStatus.currentEpisode || 0} / {drama.episodes}</span>
                                                </div>
                                                <input
                                                    id="episode-progress"
                                                    type="range"
                                                    min="0"
                                                    max={drama.episodes}
                                                    value={currentStatus.currentEpisode || 0}
                                                    onChange={handleProgressChange}
                                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-accent"
                                                />
                                            </div>
                                        )}
                                        {currentStatus?.status && currentStatus.status !== DramaStatus.PlanToWatch && (
                                            <button onClick={() => onOpenEpisodeReviews(drama)} className="mt-4 w-full text-center py-2 px-4 rounded-md bg-brand-accent/30 text-brand-accent font-semibold hover:bg-brand-accent/50 transition-colors">
                                                Review Episodes
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>
                        
                        {drama.cast.length > 0 && (
                            <section className="mt-8">
                                <h2 className="text-2xl font-bold mb-4">Cast</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{castList}</div>
                            </section>
                        )}

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold mb-4">Recommendations</h2>
                            <div className="border-b border-gray-700 mb-6">
                                <nav className="-mb-px flex space-x-6" role="tablist" aria-label="Recommendation type">
                                    <button role="tab" aria-selected={activeTab === 'curated'} onClick={() => setActiveTab('curated')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'curated' ? 'border-brand-accent text-brand-accent' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}>Curated</button>
                                    <button role="tab" aria-selected={activeTab === 'similarity'} onClick={() => setActiveTab('similarity')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'similarity' ? 'border-brand-accent text-brand-accent' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}>Similarity Engine</button>
                                </nav>
                            </div>

                            {activeTab === 'curated' && (
                                <div className="animate-fade-in" role="tabpanel">
                                    {curatedRecommendations.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                            {curatedRecommendations.map(rec => (
                                                <RecommendationCard key={rec.url} title={rec.title} imageUrl={rec.image_url} onClick={rec.fullDrama ? () => onSelectDrama(rec.fullDrama!) : undefined} />
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-center text-brand-text-secondary py-10">No curated recommendations available for this drama.</p>
                                    )}
                                </div>
                            )}

                            {activeTab === 'similarity' && (
                                <div className="animate-fade-in" role="tabpanel">
                                    <p className="text-sm text-brand-text-secondary mb-4">Select criteria to find dramas with similar attributes. More criteria can yield more precise results.</p>
                                    
                                    <div className="bg-brand-primary p-4 rounded-lg mb-6">
                                        <div className="flex space-x-2 overflow-x-auto pb-2 -mb-2 custom-scrollbar">
                                            {CRITERIA_OPTIONS.map(criterion => (
                                                <button key={criterion.id} onClick={() => toggleCriterion(criterion.id)} className={`flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${selectedCriteria.includes(criterion.id) ? 'bg-brand-accent text-white shadow-lg' : 'bg-brand-secondary text-brand-text-secondary hover:bg-gray-700'}`} aria-pressed={selectedCriteria.includes(criterion.id)}>
                                                    {criterion.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {similarityRecommendations.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                            {similarityRecommendations.map(({ drama: rec, score }) => (
                                                <RecommendationCard key={rec.url} title={rec.title} imageUrl={rec.cover_image} score={score} onClick={() => onSelectDrama(rec)} />
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-center text-brand-text-secondary py-10">
                                            {selectedCriteria.length > 0 ? 'No similar dramas found. Try adjusting your criteria.' : 'Select one or more criteria above to generate recommendations.'}
                                        </p>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            )}
        </div>,
        document.getElementById('modal-root')!
    );
};