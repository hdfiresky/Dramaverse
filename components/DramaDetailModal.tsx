/**
 * @fileoverview Defines the modal component for displaying detailed information about a drama.
 * This includes metadata, user actions (like setting status), and both curated and
 * dynamically generated similarity-based recommendations.
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Drama, Filters, Recommendation, CastMember, User } from '../types';
import {
    CloseIcon, StarIcon, ChevronLeftIcon, PencilSquareIcon
} from './Icons';
import { BACKEND_MODE, API_BASE_URL } from '../config';
import { RecommendationCardSkeleton } from './Skeletons';

interface DramaDetailModalProps {
    /** The drama object to display details for. */
    drama: Drama;
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
    /** The current filter state, used to provide visual feedback on tags/genres. */
    filters: Filters;
    /** If true, shows a "Back" button in the header. */
    showBackButton: boolean;
    /** The current logged-in user, to conditionally show user-specific actions. */
    currentUser: User | null;
    /** Callback to open the episode reviews modal for this drama. */
    onOpenReviews: () => void;
}

const CRITERIA_OPTIONS: { id: 'genres' | 'tags' | 'description' | 'cast' | 'rating' | 'rating_count', label: string }[] = [
    { id: 'genres', label: 'Genres' },
    { id: 'tags', label: 'Tags' },
    { id: 'description', label: 'Description' },
    { id: 'cast', label: 'Cast' },
    { id: 'rating', label: 'Rating' },
    { id: 'rating_count', label: 'Rating Count' },
];

/**
 * A helper component to render a drama card within the recommendation section.
 */
const RecommendationCard: React.FC<{
    drama: Drama;
    onClick?: (drama: Drama) => void;
    score?: number;
}> = ({ drama, onClick, score }) => (
    <div 
        className={`bg-brand-primary rounded-lg overflow-hidden shadow-md transform transition-all duration-300 group animate-fade-in ${onClick ? 'hover:shadow-xl hover:-translate-y-1 cursor-pointer' : 'cursor-default'}`}
        onClick={() => onClick?.(drama)}
        aria-label={drama.title}
        role={onClick ? 'button' : 'img'}
    >
        <div className="relative">
            <img src={drama.cover_image} alt={drama.title} className="w-full h-48 md:h-64 object-cover" />
            {score !== undefined && (
                <div className="absolute top-2 right-2 bg-brand-accent text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                    <span>{score}</span>
                </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                <h3 className="text-sm font-semibold truncate text-brand-text-primary">{drama.title}</h3>
            </div>
        </div>
    </div>
);


export const DramaDetailModal: React.FC<DramaDetailModalProps> = ({ drama, onCloseAll, onPopModal, onSelectDrama, onSetQuickFilter, onSelectActor, filters, showBackButton, currentUser, onOpenReviews }) => {
    const [activeTab, setActiveTab] = useState<'curated' | 'similarity'>('curated');
    const [selectedCriteria, setSelectedCriteria] = useState<string[]>(['genres', 'tags', 'rating']);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [isLoadingRecs, setIsLoadingRecs] = useState(false);
    const [recsError, setRecsError] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (drama) {
            setActiveTab('curated');
            setSelectedCriteria(['genres', 'tags', 'rating']);
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
        }
    }, [drama]);

    useEffect(() => {
        const getRecommendations = async () => {
            if (!drama || !BACKEND_MODE) return;

            setIsLoadingRecs(true);
            setRecsError(null);

            try {
                let endpoint = '';
                if (activeTab === 'curated') {
                    const params = new URLSearchParams({ url: drama.url });
                    endpoint = `${API_BASE_URL}/dramas/recommendations/curated?${params.toString()}`;
                } else { // similarity
                    if (selectedCriteria.length === 0) {
                        setRecommendations([]);
                        setIsLoadingRecs(false);
                        return;
                    }
                    const params = new URLSearchParams({ 
                        url: drama.url,
                        criteria: selectedCriteria.join(',') 
                    });
                    endpoint = `${API_BASE_URL}/dramas/recommendations/similar?${params.toString()}`;
                }
                
                const res = await fetch(endpoint, { credentials: 'include' });
                if (!res.ok) throw new Error("Failed to fetch recommendations.");
                const data = await res.json();
                setRecommendations(data);
            } catch (e) {
                setRecsError(e instanceof Error ? e.message : "Unknown error.");
            } finally {
                setIsLoadingRecs(false);
            }
        };

        getRecommendations();
    }, [drama, activeTab, selectedCriteria]);

    const toggleCriterion = (criterionId: string) => {
        setSelectedCriteria(prev => 
            prev.includes(criterionId) 
            ? prev.filter(c => c !== criterionId)
            : [...prev, criterionId]
        );
    };

    const genrePills = useMemo(() => drama ? drama.genres.map(g => (
        <button key={g} onClick={() => onSetQuickFilter('genre', g)} 
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${filters.genres.includes(g) ? "bg-sky-500/50 text-sky-200 cursor-default" : "bg-brand-primary hover:bg-brand-accent"}`}>
            {g}
        </button>
    )) : [], [drama, filters.genres, onSetQuickFilter]);

    const tagPills = useMemo(() => drama ? drama.tags.map(t => (
        <button key={t} onClick={() => onSetQuickFilter('tag', t)} 
            // FIX: Changed 'g' to 't' to correctly check if the tag is included in the filters.
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
                                    <div className="mt-6">
                                        <button
                                            onClick={onOpenReviews}
                                            className="w-full text-center py-3 px-4 bg-brand-primary hover:bg-brand-accent transition-colors rounded-lg font-semibold flex items-center justify-center gap-2"
                                        >
                                            <PencilSquareIcon className="w-5 h-5" />
                                            <span>Edit Episode Reviews</span>
                                        </button>
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

                            {isLoadingRecs ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {Array.from({ length: 5 }).map((_, index) => (
                                        <RecommendationCardSkeleton key={index} />
                                    ))}
                                </div>
                            ) : recsError ? (
                                <p className="text-center text-red-400 py-10">{recsError}</p>
                            ) : (
                                <>
                                    {activeTab === 'curated' && (
                                        <div className="animate-fade-in" role="tabpanel">
                                            {recommendations.length > 0 ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                    {recommendations.map((rec: Drama) => (
                                                        <RecommendationCard key={rec.url} drama={rec} onClick={onSelectDrama} />
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
                                            {recommendations.length > 0 ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                    {recommendations.map(({ drama: rec, score }: any) => (
                                                        <RecommendationCard key={rec.url} drama={rec} score={score} onClick={onSelectDrama} />
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-center text-brand-text-secondary py-10">
                                                    {selectedCriteria.length > 0 ? 'No similar dramas found. Try adjusting your criteria.' : 'Select one or more criteria above to generate recommendations.'}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </section>
                    </div>
                </div>
            )}
        </div>,
        document.getElementById('modal-root')!
    );
};