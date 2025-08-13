/**
 * @fileoverview A component to display the currently active filters to the user.
 * It shows badges for included and excluded genres, tags, etc., which can be removed
 * by the user to update the filter state.
 */
import React, { useMemo } from 'react';
import { Filters } from '../types';
import { CloseIcon } from './Icons';

interface ActiveFiltersDisplayProps {
    /** The current state of all filters. */
    filters: Filters;
    /** Callback to update filters with a partial Filters object. */
    onFiltersChange: (updates: Partial<Filters>) => void;
}

type BadgeType = 'country' | 'genre' | 'tag' | 'cast' | 'exclude';

// A map to define the colors for each type of filter badge for easy styling.
const badgeColors: Record<BadgeType, string> = {
    country: 'bg-emerald-500/20 text-emerald-300',
    genre: 'bg-sky-500/20 text-sky-300',
    tag: 'bg-indigo-500/20 text-indigo-300',
    cast: 'bg-purple-500/20 text-purple-300',
    exclude: 'bg-red-500/20 text-red-300',
};

/**
 * A small, reusable component to render a single filter badge with a remove button.
 * @param {object} props - The props for the FilterBadge component.
 * @returns {React.ReactElement} The rendered badge.
 */
const FilterBadge: React.FC<{
    label: string;
    onRemove: () => void;
    type: BadgeType;
}> = ({ label, onRemove, type }) => {
    const baseClasses = "flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full";
    const typeClasses = badgeColors[type];

    return (
        <span className={`${baseClasses} ${typeClasses}`}>
            <span>{label}</span>
            <button onClick={onRemove} className="p-0.5 rounded-full hover:bg-white/20 transition-colors" aria-label={`Remove filter: ${label}`}>
                <CloseIcon className="w-3 h-3" />
            </button>
        </span>
    );
};

/**
 * Renders a display area for all active filters, allowing users to see and remove them easily.
 * This component handles its own animation, smoothly transitioning in and out of view based
 * on whether any filters are active.
 * @param {ActiveFiltersDisplayProps} props - The props for the component.
 * @returns {React.ReactElement} The rendered component.
 */
export const ActiveFiltersDisplay: React.FC<ActiveFiltersDisplayProps> = ({ filters, onFiltersChange }) => {
    
    // useMemo is used here to prevent re-calculating the list of badges on every render.
    // The calculation only runs if the `filters` object changes.
    const { hasFilters, allBadges } = useMemo(() => {
        /**
         * Generic handler to remove an item from a filter array.
         * @param key The key of the filter in the `Filters` object.
         * @param itemToRemove The string value to remove from the array.
         */
        const handleRemove = (key: keyof Omit<Filters, 'minRating'>, itemToRemove: string) => {
            const currentValues = filters[key] as string[];
            const newValues = currentValues.filter(item => item !== itemToRemove);
            onFiltersChange({ [key]: newValues });
        };

        // Generate badge components for each active filter.
        const countryBadges = filters.countries.map(c => <FilterBadge key={`country-${c}`} label={c} onRemove={() => handleRemove('countries', c)} type="country" />);
        const genreBadges = filters.genres.map(g => <FilterBadge key={`genre-${g}`} label={g} onRemove={() => handleRemove('genres', g)} type="genre" />);
        const tagBadges = filters.tags.map(t => <FilterBadge key={`tag-${t}`} label={t} onRemove={() => handleRemove('tags', t)} type="tag" />);
        const castBadges = filters.cast.map(c => <FilterBadge key={`cast-${c}`} label={c} onRemove={() => handleRemove('cast', c)} type="cast" />);
        
        // Combine all exclusion filters into a single list of badges.
        const excludeBadges = [
            ...filters.excludeGenres.map(g => <FilterBadge key={`ex-genre-${g}`} label={g} onRemove={() => handleRemove('excludeGenres', g)} type="exclude" />),
            ...filters.excludeTags.map(t => <FilterBadge key={`ex-tag-${t}`} label={t} onRemove={() => handleRemove('excludeTags', t)} type="exclude" />),
        ];

        const combinedBadges = [...countryBadges, ...genreBadges, ...tagBadges, ...castBadges, ...excludeBadges];
        
        return {
            hasFilters: combinedBadges.length > 0,
            allBadges: combinedBadges,
        };
    }, [filters, onFiltersChange]);


    return (
        <div 
            // The component's visibility is controlled by changing max-height and opacity,
            // allowing for a smooth CSS transition.
            className={`transition-all duration-300 ease-in-out ${hasFilters ? 'max-h-40 opacity-100 mb-6' : 'max-h-0 opacity-0'}`}
        >
            <div className="p-4 bg-brand-secondary rounded-lg overflow-y-auto custom-scrollbar">
                {hasFilters && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {allBadges}
                    </div>
                )}
            </div>
        </div>
    );
};
