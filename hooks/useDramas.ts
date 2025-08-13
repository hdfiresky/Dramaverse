/**
 * @fileoverview A custom hook to manage all drama data.
 * This hook is responsible for fetching the raw data, deriving metadata for filters,
 * and performing all filtering and sorting logic based on user inputs.
 * It uses `useMemo` extensively to optimize performance by caching computations.
 */
import { useState, useEffect, useMemo } from 'react';
import { Drama, Filters, SortPriority } from '../types';

/**
 * A custom hook that serves as the single source of truth for drama data and its derived states.
 *
 * @param {Filters} filters - The current filter configuration from the UI.
 * @param {string} searchTerm - The current search term from the search bar.
 * @param {SortPriority[]} sortPriorities - The user-defined sort configuration.
 * @returns An object containing the raw drama list, the filtered/sorted list, loading/error states, and filter metadata.
 */
export const useDramas = (filters: Filters, searchTerm: string, sortPriorities: SortPriority[]) => {
    const [allDramas, setAllDramas] = useState<Drama[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<{ genres: string[]; tags: string[]; countries: string[]; cast: string[] }>({ genres: [], tags: [], countries: [], cast: [] });

    // Effect to fetch and process the initial drama data from the JSON file.
    // This runs only once when the hook is first mounted.
    useEffect(() => {
        const fetchDramas = async () => {
            try {
                const response = await fetch('/data/dramas.json');
                if (!response.ok) throw new Error("Failed to fetch drama data.");
                const data: Drama[] = await response.json();
                
                // A small artificial delay to show the loading spinner.
                setTimeout(() => {
                    setAllDramas(data);
                    
                    // Derive metadata for filter options from the full dataset.
                    const allGenres = new Set<string>();
                    const allTags = new Set<string>();
                    const allCountries = new Set<string>();
                    const allCast = new Set<string>();

                    data.forEach(d => {
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
                    setIsLoading(false);
                }, 500);

            } catch (error) {
                console.error(error);
                setDataError("Could not load drama library. Please try again later.");
                setIsLoading(false);
            }
        };
        fetchDramas();
    }, []);
    
    // Memoize a processed version of the dramas with Sets for faster lookups during filtering.
    // This re-runs only when the raw `allDramas` array changes.
    const processedDramas = useMemo(() => {
        return allDramas.map(drama => ({
            ...drama,
            genresSet: new Set(drama.genres),
            tagsSet: new Set(drama.tags),
            castSet: new Set(drama.cast.map(c => c.actor_name)),
        }));
    }, [allDramas]);

    // This is the core logic of the hook. It memoizes the final filtered and sorted list.
    // It will only re-calculate when its dependencies (processedDramas, searchTerm, filters, sortPriorities) change.
    const filteredAndSortedDramas = useMemo(() => {
        let result = processedDramas;

        // 1. Apply search term filter
        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            result = result.filter(d => d.title.toLowerCase().includes(lowercasedSearchTerm));
        }

        // 2. Apply all other filters from the sidebar
        const hasActiveFilters = 
            filters.genres.length > 0 || filters.excludeGenres.length > 0 ||
            filters.tags.length > 0 || filters.excludeTags.length > 0 ||
            filters.countries.length > 0 || filters.cast.length > 0 || filters.minRating > 0;

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

        // 3. Apply weighted sorting if priorities are defined
        if (sortPriorities.length > 0 && result.length > 0) {
            // First, find the min/max for each numeric attribute across the *current* filtered results.
            // This is crucial for accurate normalization.
            const stats = {
                rating: { min: Infinity, max: -Infinity },
                popularity_rank: { min: Infinity, max: -Infinity },
                watchers: { min: Infinity, max: -Infinity },
                aired_date: { min: Infinity, max: -Infinity },
            };
            result.forEach(d => {
                stats.rating.min = Math.min(stats.rating.min, d.rating);
                stats.rating.max = Math.max(stats.rating.max, d.rating);
                stats.popularity_rank.min = Math.min(stats.popularity_rank.min, d.popularity_rank);
                stats.popularity_rank.max = Math.max(stats.popularity_rank.max, d.popularity_rank);
                stats.watchers.min = Math.min(stats.watchers.min, d.watchers);
                stats.watchers.max = Math.max(stats.watchers.max, d.watchers);
                const dateTimestamp = new Date(d.aired_date.split(' - ')[0]).getTime();
                if (!isNaN(dateTimestamp)) {
                    stats.aired_date.min = Math.min(stats.aired_date.min, dateTimestamp);
                    stats.aired_date.max = Math.max(stats.aired_date.max, dateTimestamp);
                }
            });

            const higherIsBetterKeys: (keyof typeof stats)[] = ['rating', 'watchers', 'aired_date'];

            const scoredDramas = result.map(d => {
                let score = 0;
                const maxWeight = sortPriorities.length;

                sortPriorities.forEach((p, index) => {
                    const { key, order } = p;
                    // Higher priority items (lower index) get a higher weight.
                    const weight = maxWeight - index;
                    const keyStats = stats[key];
                    const range = keyStats.max - keyStats.min;
                    
                    if (range === 0) return; // Avoid division by zero if all values are the same.

                    // Get the value for the current drama, converting date to timestamp.
                    let value = key === 'aired_date' ? (new Date(d.aired_date.split(' - ')[0]).getTime() || keyStats.min) : d[key];
                    
                    // Normalize the value to a 0-1 scale.
                    let normalized = (value - keyStats.min) / range;
                    
                    // For attributes where lower is better (like popularity_rank), invert the normalized score.
                    if (!higherIsBetterKeys.includes(key)) {
                        normalized = 1 - normalized;
                    }

                    // If the user wants ascending order, we invert the score again.
                    // This is because our final sort is always descending by score.
                    if (order === 'asc') {
                        normalized = 1 - normalized;
                    }
                    
                    // Add the weighted, normalized score to the total score for this drama.
                    score += normalized * weight;
                });
                return { ...d, score };
            });

            // Sort the dramas by their calculated score in descending order.
            // A secondary sort by title is used as a tie-breaker.
            scoredDramas.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return a.title.localeCompare(b.title);
            });
            return scoredDramas;
        }

        // If no sort priorities are set, use the default sort (by popularity).
        return [...result].sort((a,b) => a.popularity_rank - b.popularity_rank);

    }, [processedDramas, searchTerm, filters, sortPriorities]);
    
    return {
        allDramas,
        filteredAndSortedDramas,
        metadata,
        isLoading,
        dataError,
    };
};
