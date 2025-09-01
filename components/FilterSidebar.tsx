import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Filters, NumericSortKey, SortPriority } from '../types';
import { FilterSection } from './FilterSection';
import { CloseIcon, Bars3Icon, ArrowLongUpIcon, ArrowLongDownIcon, SearchIcon, ArrowPathIcon } from './Icons';

/**
 * @fileoverview Defines the FilterSidebar component.
 * This component contains all the controls for sorting and filtering the drama list.
 * It's designed to be a slide-in overlay panel, accessible on all screen sizes.
 */

interface FilterSidebarProps {
    /** Whether the sidebar is visible. */
    isOpen: boolean;
    /** Callback to close the sidebar. */
    onClose: () => void;
    /** The metadata containing all available genres, tags, countries, and cast. */
    metadata: { genres: string[], tags: string[], countries: string[], cast: string[] };
    /** The current state of the filters. */
    filters: Filters;
    /** Callback to update filter values with a partial Filters object. */
    onFiltersChange: (updates: Partial<Filters>) => void;
    /** The current list of sort priorities. */
    sortPriorities: SortPriority[];
    /** Callback to update the list of sort priorities. */
    onSortPrioritiesChange: (priorities: SortPriority[]) => void;
    /** The current sort mode. */
    sortMode: 'weighted' | 'random';
    /** Callback to set the sort mode. */
    onSetSortMode: (mode: 'weighted' | 'random') => void;
    /** Callback to trigger a new randomization by setting a seed. */
    onSetRandomSeed: (seed: number) => void;
}

const SORTABLE_KEYS: { key: NumericSortKey; label: string }[] = [
    { key: 'popularity_rank', label: 'Popularity' },
    { key: 'rating', label: 'Rating' },
    { key: 'watchers', label: 'Watchers' },
    { key: 'aired_date', label: 'Aired Date' },
];

const CAST_RENDER_LIMIT = 100;
const TAGS_RENDER_LIMIT = 100;
const GENRES_RENDER_LIMIT = 100;

/**
 * A universal sidebar component that provides UI for sorting and filtering the main drama list.
 * It appears as a full-height overlay that slides in from the left, and can be toggled
 * on any screen size for a consistent user experience.
 * @param {FilterSidebarProps} props - The props for the FilterSidebar component.
 * @returns {React.ReactElement} The rendered sidebar.
 */
export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    isOpen,
    onClose,
    metadata,
    filters,
    onFiltersChange,
    sortPriorities,
    onSortPrioritiesChange,
    sortMode,
    onSetSortMode,
    onSetRandomSeed,
}) => {
    
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [newPriorityKey, setNewPriorityKey] = useState<NumericSortKey | ''>('');
    const [castSearchTerm, setCastSearchTerm] = useState('');
    const [castDisplayCount, setCastDisplayCount] = useState(CAST_RENDER_LIMIT);
    const castScrollContainerRef = useRef<HTMLDivElement>(null);


    /**
     * Handles toggling the "included" state for a genre or tag.
     */
    const handleIncludeToggle = (type: 'genre' | 'tag', item: string) => {
        const includeKey = type === 'genre' ? 'genres' : 'tags';
        const excludeKey = type === 'genre' ? 'excludeGenres' : 'excludeTags';
        const currentIncludes = filters[includeKey];
        const currentExcludes = filters[excludeKey];
        
        let newIncludes = [...currentIncludes];
        let newExcludes = [...currentExcludes];

        if (newIncludes.includes(item)) {
            newIncludes = newIncludes.filter(i => i !== item);
        } else {
            newIncludes.push(item);
            newExcludes = newExcludes.filter(e => e !== item);
        }
        
        onFiltersChange({ [includeKey]: newIncludes, [excludeKey]: newExcludes });
    };

    /**
     * Handles toggling the "excluded" state for a genre or tag.
     */
    const handleExcludeToggle = (type: 'genre' | 'tag', item: string) => {
        const includeKey = type === 'genre' ? 'genres' : 'tags';
        const excludeKey = type === 'genre' ? 'excludeGenres' : 'excludeTags';
        const currentIncludes = filters[includeKey];
        const currentExcludes = filters[excludeKey];

        let newIncludes = [...currentIncludes];
        let newExcludes = [...currentExcludes];

        if (newExcludes.includes(item)) {
            newExcludes = newExcludes.filter(e => e !== item);
        } else {
            newExcludes.push(item);
            newIncludes = newIncludes.filter(i => i !== item);
        }
        
        onFiltersChange({ [includeKey]: newIncludes, [excludeKey]: newExcludes });
    };

    const handleCountryChange = (country: string) => {
        const currentValues = filters.countries;
        const newValues = currentValues.includes(country)
            ? currentValues.filter(v => v !== country)
            : [...currentValues, country];
        onFiltersChange({ countries: newValues });
    };
    
    const handleCastChange = (actor: string) => {
        const currentValues = filters.cast;
        const newValues = currentValues.includes(actor)
            ? currentValues.filter(v => v !== actor)
            : [...currentValues, actor];
        onFiltersChange({ cast: newValues });
    };

    // --- Sort Priority Handlers ---

    const handleAddPriority = () => {
        if (!newPriorityKey) return;
        const newOrder = 'desc';
        onSortPrioritiesChange([...sortPriorities, { key: newPriorityKey, order: newOrder }]);
        setNewPriorityKey('');
    };

    const handleRemovePriority = (index: number) => {
        onSortPrioritiesChange(sortPriorities.filter((_, i) => i !== index));
    };

    const handleToggleOrder = (index: number) => {
        const newPriorities = [...sortPriorities];
        newPriorities[index].order = newPriorities[index].order === 'asc' ? 'desc' : 'asc';
        onSortPrioritiesChange(newPriorities);
    };

    const handleDragStart = (index: number) => setDraggedIndex(index);
    
    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        
        const items = [...sortPriorities];
        const [reorderedItem] = items.splice(draggedIndex, 1);
        items.splice(index, 0, reorderedItem);
        
        onSortPrioritiesChange(items);
        setDraggedIndex(index);
    };
    
    const handleDragEnd = () => setDraggedIndex(null);

    // --- Randomization Handler ---
    const handleRandomClick = () => {
        if (sortMode === 'random') {
            // Already in random mode, just trigger a new shuffle.
            onSetRandomSeed(Date.now());
        } else {
            // Switching to random mode.
            onSetSortMode('random');
            onSetRandomSeed(Date.now()); // Set a fresh seed.
        }
        onClose();
    };


    // Memoize derived data to prevent recalculation on every render
    const availableKeys = useMemo(() => 
        SORTABLE_KEYS.filter(k => !sortPriorities.some(p => p.key === k.key)),
        [sortPriorities]
    );
    
    const filteredCast = useMemo(() => 
        metadata.cast.filter(c => c.toLowerCase().includes(castSearchTerm.toLowerCase())),
        [metadata.cast, castSearchTerm]
    );

    useEffect(() => {
        setCastDisplayCount(CAST_RENDER_LIMIT);
    }, [filteredCast]);

    const displayCast = useMemo(() => {
        if (castSearchTerm) {
            return filteredCast;
        }
        return filteredCast.slice(0, castDisplayCount);
    }, [castSearchTerm, filteredCast, castDisplayCount]);

    const handleCastScroll = () => {
        if (castSearchTerm) return;
        const container = castScrollContainerRef.current;
        if (container) {
            const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 50;
            if (isNearBottom && castDisplayCount < filteredCast.length) {
                setCastDisplayCount(prevCount => Math.min(prevCount + CAST_RENDER_LIMIT, filteredCast.length));
            }
        }
    };


    return ReactDOM.createPortal(
        <>
            <div 
                className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            ></div>
            <aside 
                className={`fixed top-0 left-0 w-80 h-full bg-brand-secondary z-50 transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="filter-sidebar-heading"
            >
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 id="filter-sidebar-heading" className="text-xl font-bold">Filters & Sort</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-brand-primary" aria-label="Close filters">
                        <CloseIcon className="w-6 h-6"/>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {/* --- Sorting Controls --- */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-semibold">Sorting</h3>
                        </div>
                         <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => onSetSortMode('weighted')}
                                className={`w-full py-2 text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${sortMode === 'weighted' ? 'bg-brand-accent text-white' : 'bg-brand-primary text-brand-text-secondary hover:bg-slate-700'}`}
                                aria-pressed={sortMode === 'weighted'}
                            >
                                Weighted
                            </button>
                            <button
                                onClick={handleRandomClick}
                                className={`w-full py-2 text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${sortMode === 'random' ? 'bg-brand-accent text-white' : 'bg-brand-primary text-brand-text-secondary hover:bg-slate-700'}`}
                                aria-pressed={sortMode === 'random'}
                            >
                                <ArrowPathIcon className="w-4 h-4" />
                                <span>{sortMode === 'random' ? 'Again' : 'Random'}</span>
                            </button>
                        </div>
                         <div className={`transition-opacity duration-300 mt-3 ${sortMode === 'random' ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                            <p className="text-xs text-brand-text-secondary mb-3">Drag to re-order priority. Higher items have more weight.</p>
                            <div className="space-y-2">
                                {sortPriorities.map((p, index) => {
                                    const label = SORTABLE_KEYS.find(k => k.key === p.key)?.label || p.key;
                                    return (
                                        <div 
                                            key={p.key}
                                            draggable
                                            onDragStart={() => handleDragStart(index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDragEnd={handleDragEnd}
                                            className={`flex items-center gap-2 p-2 rounded-md bg-brand-primary border border-gray-700 transition-opacity ${draggedIndex === index ? 'opacity-50' : 'opacity-100'}`}
                                        >
                                            <Bars3Icon className="w-5 h-5 text-gray-500 cursor-grab"/>
                                            <span className="flex-grow font-medium text-sm">{label}</span>
                                            <button onClick={() => handleToggleOrder(index)} className="p-1 hover:bg-brand-secondary rounded-md" title={`Toggle order`}>
                                                {p.order === 'asc' ? <ArrowLongUpIcon className="w-5 h-5 text-green-400"/> : <ArrowLongDownIcon className="w-5 h-5 text-yellow-400"/>}
                                            </button>
                                            <button onClick={() => handleRemovePriority(index)} className="p-1 hover:bg-brand-secondary rounded-md" title="Remove criterion">
                                                <CloseIcon className="w-5 h-5 text-red-500"/>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            {availableKeys.length > 0 && (
                                <div className="flex gap-2 mt-3">
                                    <select 
                                        value={newPriorityKey} 
                                        onChange={e => setNewPriorityKey(e.target.value as NumericSortKey)} 
                                        className="w-full bg-brand-primary p-2 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none text-sm"
                                    >
                                        <option value="" disabled>Add criterion...</option>
                                        {availableKeys.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                                    </select>
                                    <button onClick={handleAddPriority} className="px-4 py-2 text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover rounded-md transition-colors whitespace-nowrap">Add</button>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Filtering Sections */}
                    <FilterSection 
                        title="Genres" 
                        items={metadata.genres} 
                        included={filters.genres} 
                        excluded={filters.excludeGenres} 
                        onIncludeToggle={(g) => handleIncludeToggle('genre', g)} 
                        onExcludeToggle={(g) => handleExcludeToggle('genre', g)}
                        initialRenderLimit={GENRES_RENDER_LIMIT}
                    />
                    <FilterSection 
                        title="Tags" 
                        items={metadata.tags} 
                        included={filters.tags} 
                        excluded={filters.excludeTags} 
                        onIncludeToggle={(t) => handleIncludeToggle('tag', t)} 
                        onExcludeToggle={(t) => handleExcludeToggle('tag', t)}
                        initialRenderLimit={TAGS_RENDER_LIMIT}
                    />
                    
                     <div>
                        <h3 className="text-lg font-semibold mb-3">Country</h3>
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {metadata.countries.map(country => (
                                <label key={country} className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input
                                        type="checkbox"
                                        checked={filters.countries.includes(country)}
                                        onChange={() => handleCountryChange(country)}
                                        className="form-checkbox h-4 w-4 rounded bg-brand-primary border-gray-600 text-brand-accent focus:ring-brand-accent"
                                    />
                                    <span className="text-brand-text-secondary hover:text-brand-text-primary flex-1">{country}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <h3 className="text-lg font-semibold mb-3">Cast</h3>
                         <div className="relative mb-3">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                <SearchIcon className="h-4 w-4 text-gray-400" />
                            </span>
                            <input
                                type="text"
                                placeholder="Search Cast..."
                                value={castSearchTerm}
                                onChange={e => setCastSearchTerm(e.target.value)}
                                className="w-full bg-brand-primary p-2 pl-9 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none text-sm"
                            />
                        </div>
                        <div 
                            ref={castScrollContainerRef}
                            onScroll={handleCastScroll}
                            className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar"
                        >
                            {displayCast.map(actor => (
                                <label key={actor} className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input
                                        type="checkbox"
                                        checked={filters.cast.includes(actor)}
                                        onChange={() => handleCastChange(actor)}
                                        className="form-checkbox h-4 w-4 rounded bg-brand-primary border-gray-600 text-brand-accent focus:ring-brand-accent"
                                    />
                                    <span className="text-brand-text-secondary hover:text-brand-text-primary flex-1">{actor}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold mb-3">Minimum Rating: {filters.minRating.toFixed(1)}</h3>
                        <input type="range" min="0" max="10" step="0.1" value={filters.minRating} onChange={e => onFiltersChange({ minRating: parseFloat(e.target.value) })} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-accent"/>
                    </div>
                </div>
            </aside>
        </>,
        document.getElementById('modal-root')!
    );
};