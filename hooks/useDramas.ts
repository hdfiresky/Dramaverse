/**
 * @fileoverview A custom hook to manage all drama data.
 * This hook is responsible for fetching the raw data, deriving metadata for filters,
 * and performing all filtering and sorting logic based on user inputs.
 * It uses `useMemo` extensively to optimize performance by caching computations.
 */
import { useState, useEffect, useMemo } from 'react';
import { Drama, Filters, SortPriority } from '../types';
import { BACKEND_MODE, API_BASE_URL } from '../config';

/**
 * A custom hook that serves as the single source of truth for drama data and its derived states.
 *
 * @param {Filters} filters - The current filter configuration from the UI.
 * @param {string} searchTerm - The current search term from the search bar.
 * @param {SortPriority[]} sortPriorities - The user-defined sort configuration.
 * @param {number} currentPage - The current page number for pagination.
 * @param {'weighted' | 'random'} sortMode - The sorting strategy to apply.
 * @param {number} randomSeed - A changing value to trigger re-randomization.
 * @param {number} itemsPerPage - The dynamic number of items to show per page.
 * @returns An object containing the raw drama list, the filtered/sorted list, loading/error states, and filter metadata.
 */
export const useDramas = (filters: Filters, searchTerm: string, sortPriorities: SortPriority[], currentPage: number, sortMode: 'weighted' | 'random', randomSeed: number, itemsPerPage: number) => {
    // This state holds the full, unprocessed list of dramas for FRONTEND-ONLY mode.
    const [rawDramas, setRawDramas] = useState<Drama[]>([]);
    
    // This state holds the dramas to be displayed in the main grid.
    const [displayDramas, setDisplayDramas] = useState<Drama[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<{ genres: string[]; tags: string[]; countries: string[]; cast: string[] }>({ genres: [], tags: [], countries: [], cast: [] });
    
    // This state holds the total count of dramas matching the current filters,
    // which is essential for the pagination component.
    const [totalDramas, setTotalDramas] = useState(0);
    const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);


    // Effect to fetch initial data. Behavior differs based on the application mode.
    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                if (BACKEND_MODE) {
                    // In backend mode, fetch the pre-calculated metadata from the server.
                    const metaRes = await fetch(`${API_BASE_URL}/dramas/metadata`);
                    if (!metaRes.ok) throw new Error('Failed to fetch metadata from server.');
                    setMetadata(await metaRes.json());
                } else {
                    // In frontend-only mode, fetch the static JSON to power the entire app.
                    const dramaRes = await fetch('data/dramas.json');
                    if (!dramaRes.ok) throw new Error(`Failed to fetch drama data file from 'data/dramas.json'.`);
                    const dramaData: Drama[] = await dramaRes.json();
                    setRawDramas(dramaData);
                }
            } catch (error) {
                console.error(error);
                setDataError("Could not load initial drama library. Please try again later.");
            } finally {
                // Loading is only fully complete after the first data fetch in backend mode.
                if (!BACKEND_MODE) {
                    setIsLoading(false);
                }
                setHasInitiallyLoaded(true);
            }
        };
        fetchInitialData();
    }, []);

    // Effect to derive metadata specifically for frontend-only mode.
    // This runs once after the raw drama data has been loaded.
    useEffect(() => {
        if (!BACKEND_MODE && rawDramas.length > 0) {
            const allGenres = new Set<string>();
            const allTags = new Set<string>();
            const allCountries = new Set<string>();
            const allCast = new Set<string>();
    
            rawDramas.forEach(d => {
                d.genres.forEach(g => allGenres.add(g));
                d.tags.forEach(t => allTags.add(t));
                allCountries.add(d.country);
                d.cast.forEach(c => allCast.add(c.actor_name));
            });
    
            setMetadata({
                genres: Array.from(allGenres).sort(),
                tags: Array.from(allTags).sort(),
                countries: Array.from(allCountries).sort(),
                cast: Array.from(allCast).sort(),
            });
        }
    }, [rawDramas]);

    // Memoized, pre-processed dramas for efficient client-side filtering (frontend-only mode).
    const processedDramas = useMemo(() => {
        if (BACKEND_MODE) return [];
        return rawDramas.map(drama => ({
            ...drama,
            genresSet: new Set(drama.genres),
            tagsSet: new Set(drama.tags),
            castSet: new Set(drama.cast.map(c => c.actor_name)),
        }));
    }, [rawDramas, BACKEND_MODE]);

    // This effect handles all data fetching and processing when filters/search/pagination change.
    useEffect(() => {
        const applyFiltersAndSort = async () => {
            if (BACKEND_MODE) {
                // In backend mode, delegate all work to the server.
                if (!hasInitiallyLoaded) return; // Don't fetch if initial metadata isn't ready
                
                setIsLoading(true);
                try {
                    const params = new URLSearchParams({
                        page: String(currentPage),
                        limit: String(itemsPerPage),
                        search: searchTerm,
                        minRating: String(filters.minRating),
                        sortMode, // Pass the sort mode to the backend
                        sort: sortMode === 'weighted' ? JSON.stringify(sortPriorities) : '[]',
                    });
                    if (filters.genres.length > 0) params.set('genres', filters.genres.join(','));
                    if (filters.excludeGenres.length > 0) params.set('excludeGenres', filters.excludeGenres.join(','));
                    if (filters.tags.length > 0) params.set('tags', filters.tags.join(','));
                    if (filters.excludeTags.length > 0) params.set('excludeTags', filters.excludeTags.join(','));
                    if (filters.countries.length > 0) params.set('countries', filters.countries.join(','));
                    if (filters.cast.length > 0) params.set('cast', filters.cast.join(','));

                    const response = await fetch(`${API_BASE_URL}/dramas?${params.toString()}`);
                    if (!response.ok) throw new Error('Failed to fetch filtered drama data from server.');
                    
                    const data = await response.json();
                    setDisplayDramas(data.dramas);
                    setTotalDramas(data.totalItems);
                } catch (error) {
                    console.error(error);
                    setDataError("Could not load filtered dramas. Please try again.");
                } finally {
                    setIsLoading(false);
                }
            } else {
                // In frontend mode, do all processing in the browser.
                let result = processedDramas;
                if (searchTerm) {
                    const lowercasedSearchTerm = searchTerm.toLowerCase();
                    result = result.filter(d => 
                        d.title.toLowerCase().includes(lowercasedSearchTerm) ||
                        d.alternative_names.some(name => name.toLowerCase().includes(lowercasedSearchTerm)) ||
                        d.cast.some(member => member.actor_name.toLowerCase().includes(lowercasedSearchTerm))
                    );
                }
                const hasActiveFilters = filters.genres.length > 0 || filters.excludeGenres.length > 0 || filters.tags.length > 0 || filters.excludeTags.length > 0 || filters.countries.length > 0 || filters.cast.length > 0 || filters.minRating > 0;
                if (hasActiveFilters) {
                    result = result.filter(d =>
                        (d.rating >= filters.minRating) &&
                        (filters.countries.length === 0 || filters.countries.includes(d.country)) &&
                        (filters.genres.length === 0 || filters.genres.every(g => d.genresSet.has(g))) &&
                        (filters.excludeGenres.length === 0 || !filters.excludeGenres.some(g => d.genresSet.has(g))) &&
                        (filters.tags.length === 0 || filters.tags.every(t => d.tagsSet.has(t))) &&
                        (filters.excludeTags.length === 0 || !filters.excludeTags.some(t => d.tagsSet.has(t))) &&
                        (filters.cast.length === 0 || filters.cast.every(actor => d.castSet.has(actor)))
                    );
                }
                
                // Apply sorting based on sortMode
                if (sortMode === 'random') {
                    // In-place Fisher-Yates shuffle for randomization
                    for (let i = result.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [result[i], result[j]] = [result[j], result[i]];
                    }
                } else if (sortPriorities.length > 0 && result.length > 0) {
                    // Weighted sort logic
                    const stats = { rating: { min: Infinity, max: -Infinity }, popularity_rank: { min: Infinity, max: -Infinity }, watchers: { min: Infinity, max: -Infinity }, aired_date: { min: Infinity, max: -Infinity }};
                    result.forEach(d => {
                        stats.rating.min = Math.min(stats.rating.min, d.rating); stats.rating.max = Math.max(stats.rating.max, d.rating);
                        stats.popularity_rank.min = Math.min(stats.popularity_rank.min, d.popularity_rank); stats.popularity_rank.max = Math.max(stats.popularity_rank.max, d.popularity_rank);
                        stats.watchers.min = Math.min(stats.watchers.min, d.watchers); stats.watchers.max = Math.max(stats.watchers.max, d.watchers);
                        const dateTimestamp = new Date(d.aired_date.split(' - ')[0]).getTime();
                        if (!isNaN(dateTimestamp)) { stats.aired_date.min = Math.min(stats.aired_date.min, dateTimestamp); stats.aired_date.max = Math.max(stats.aired_date.max, dateTimestamp); }
                    });
                    const higherIsBetterKeys: (keyof typeof stats)[] = ['rating', 'watchers', 'aired_date'];
                    const scoredDramas = result.map(d => {
                        let score = 0; const maxWeight = sortPriorities.length;
                        sortPriorities.forEach((p, index) => {
                            const { key, order } = p; const weight = maxWeight - index; const keyStats = stats[key]; const range = keyStats.max - keyStats.min; if (range === 0) return;
                            let value = key === 'aired_date' ? (new Date(d.aired_date.split(' - ')[0]).getTime() || keyStats.min) : d[key];
                            let normalized = (value - keyStats.min) / range;
                            if (!higherIsBetterKeys.includes(key)) { normalized = 1 - normalized; }
                            if (order === 'asc') { normalized = 1 - normalized; }
                            score += normalized * weight;
                        });
                        return { ...d, score };
                    });
                    scoredDramas.sort((a, b) => { if (b.score !== a.score) { return b.score - a.score; } return a.title.localeCompare(b.title); });
                    result = scoredDramas;
                } else {
                    result = [...result].sort((a, b) => a.popularity_rank - b.popularity_rank);
                }

                const paginatedResult = result.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
                setDisplayDramas(paginatedResult);
                setTotalDramas(result.length);
            }
        };

        applyFiltersAndSort();
    }, [
        BACKEND_MODE, 
        hasInitiallyLoaded,
        processedDramas, // For frontend mode
        filters, 
        searchTerm, 
        sortPriorities, 
        currentPage,
        sortMode,
        randomSeed,
        itemsPerPage,
    ]);

    return {
        displayDramas,
        totalDramas,
        metadata,
        isLoading,
        dataError,
        hasInitiallyLoaded,
    };
};