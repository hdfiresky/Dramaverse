import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SearchIcon, BanIcon } from './Icons';

/**
 * @fileoverview Defines a reusable component for a filterable list of items.
 * This is used in the FilterSidebar for genres and tags.
 * It includes a search input and separate controls for including or excluding each item.
 */

interface FilterSectionProps {
    /** The title of the section (e.g., "Genres", "Tags"). */
    title: string;
    /** The complete list of available items for this filter. */
    items: string[];
    /** The list of currently included items. */
    included: string[];
    /** The list of currently excluded items. */
    excluded: string[];
    /** Callback function to toggle an item's included state. */
    onIncludeToggle: (item: string) => void;
    /** Callback function to toggle an item's excluded state. */
    onExcludeToggle: (item: string) => void;
    /** The number of items to show per batch in the infinite scroll. */
    initialRenderLimit?: number;
}

/**
 * A self-contained component that displays a title, a search bar, and a list of filter items.
 * Each item has a checkbox for inclusion and a separate button for exclusion.
 * @param {FilterSectionProps} props - The props for the FilterSection component.
 * @returns {React.ReactElement} The rendered filter section.
 */
export const FilterSection: React.FC<FilterSectionProps> = ({ title, items, included, excluded, onIncludeToggle, onExcludeToggle, initialRenderLimit = 100 }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [displayCount, setDisplayCount] = useState(initialRenderLimit);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const filteredItems = useMemo(() =>
        items.filter(item => item.toLowerCase().includes(searchTerm.toLowerCase())),
        [items, searchTerm]
    );
    
    // Reset display count when the filterable list changes (e.g. search is cleared)
    useEffect(() => {
        setDisplayCount(initialRenderLimit);
    }, [filteredItems, initialRenderLimit]);

    const displayItems = useMemo(() => {
        if (searchTerm) {
            // If searching, show all results without truncation
            return filteredItems;
        }
        return filteredItems.slice(0, displayCount);
    }, [filteredItems, searchTerm, displayCount]);

    // Handler to implement infinite scroll
    const handleScroll = () => {
        if (searchTerm) return; // Do not trigger load-more when searching
        
        const container = scrollContainerRef.current;
        if (container) {
            // Check if user is near the bottom, with a buffer
            const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 50;
            if (isNearBottom && displayCount < filteredItems.length) {
                // Load next batch of items
                setDisplayCount(prevCount => Math.min(prevCount + initialRenderLimit, filteredItems.length));
            }
        }
    };

    return (
        <div>
            <h3 className="text-lg font-semibold mb-3">{title}</h3>
            {/* Search input to filter the list of items */}
            <div className="relative mb-3">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <SearchIcon className="h-4 w-4 text-gray-400" />
                </span>
                <input
                    type="text"
                    placeholder={`Search ${title}...`}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-brand-primary p-2 pl-9 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none text-sm"
                />
            </div>

            {/* Scrollable container for the list of filter options */}
            <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="max-h-60 overflow-y-auto space-y-1 pr-2 custom-scrollbar"
            >
                {displayItems.map(item => {
                    const isIncluded = included.includes(item);
                    const isExcluded = excluded.includes(item);
                    
                    const textClasses = isIncluded 
                        ? 'text-green-300' 
                        : isExcluded 
                        ? 'text-red-400 line-through' 
                        : 'text-brand-text-secondary';

                    return (
                       <div key={item} className="group flex items-center justify-between p-1 rounded-md hover:bg-brand-primary/60 transition-colors">
                            <label htmlFor={`filter-item-${title}-${item}`} className="flex-1 flex items-center gap-3 cursor-pointer p-1">
                                <input 
                                    id={`filter-item-${title}-${item}`}
                                    type="checkbox"
                                    checked={isIncluded}
                                    onChange={() => onIncludeToggle(item)}
                                    className="h-4 w-4 rounded bg-brand-primary border-gray-600 text-brand-accent focus:ring-brand-accent focus:ring-offset-0"
                                    disabled={isExcluded}
                                    aria-label={`Include ${item}`}
                                />
                                <span className={`text-sm ${textClasses}`}>
                                    {item}
                                </span>
                            </label>
                            <button 
                                onClick={() => onExcludeToggle(item)} 
                                className={`p-1 rounded-full hover:bg-red-900/50 disabled:text-gray-700 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-opacity duration-200 ${isExcluded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                                title={isExcluded ? 'Remove exclusion' : `Exclude ${item}`}
                                disabled={isIncluded}
                                aria-label={isExcluded ? `Remove exclusion for ${item}` : `Exclude ${item}`}
                            >
                                <BanIcon className={`w-5 h-5 transition-colors ${isExcluded ? 'text-red-500' : 'text-gray-500'}`} />
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}