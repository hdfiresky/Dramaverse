/**
 * @fileoverview A custom hook for fetching full drama details by their URLs.
 * It manages a cache to avoid redundant network requests and handles loading states,
 * making it a centralized and efficient way to get drama data on-demand, which is
 * crucial for backend mode functionality.
 */
import { useState, useEffect, useMemo } from 'react';
import { Drama } from '../types';
import { BACKEND_MODE, API_BASE_URL } from '../config';

// A simple in-memory cache to store fetched drama details.
const dramaCache = new Map<string, Drama>();

/**
 * Custom hook to fetch detailed information for a list of drama URLs.
 *
 * @param {string[]} urls - An array of drama URLs to fetch details for.
 * @returns An object containing the fetched drama details as a Map and a loading state boolean.
 */
export const useDramaDetails = (urls: string[]) => {
    const [dramaDetails, setDramaDetails] = useState<Map<string, Drama>>(new Map());
    const [isLoading, setIsLoading] = useState(false);

    // Memoize the unique set of URLs to prevent unnecessary effect runs.
    const uniqueUrls = useMemo(() => [...new Set(urls)], [urls]);

    useEffect(() => {
        // This hook is only active in backend mode. In frontend-only mode,
        // all data is already available client-side.
        if (!BACKEND_MODE) {
            // In frontend-only mode, we can simply return the existing cache,
            // though the app's structure should ideally provide the full data set.
            // For now, we do nothing as the app will source from the main `useDramas` hook.
            return;
        }

        const fetchDetails = async () => {
            // Determine which URLs are not already in our cache.
            const urlsToFetch = uniqueUrls.filter(url => !dramaCache.has(url));
            
            // If all requested dramas are already cached, we can update the state and exit early.
            if (urlsToFetch.length === 0) {
                const newDetails = new Map<string, Drama>();
                uniqueUrls.forEach(url => {
                    const cachedDrama = dramaCache.get(url);
                    if (cachedDrama) {
                        newDetails.set(url, cachedDrama);
                    }
                });
                setDramaDetails(newDetails);
                return;
            }

            setIsLoading(true);
            try {
                // Fetch the details for the uncached URLs from the backend.
                const res = await fetch(`${API_BASE_URL}/dramas/by-urls`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ urls: urlsToFetch }),
                });

                if (!res.ok) {
                    throw new Error("Failed to fetch drama details.");
                }

                const dramas: Drama[] = await res.json();
                
                // Update the global cache with the newly fetched dramas.
                dramas.forEach(drama => dramaCache.set(drama.url, drama));

                // Reconstruct the details map for the current request, ensuring we include
                // both newly fetched and previously cached items.
                const newDetails = new Map<string, Drama>();
                uniqueUrls.forEach(url => {
                    const drama = dramaCache.get(url);
                    if (drama) {
                        newDetails.set(url, drama);
                    }
                });
                setDramaDetails(newDetails);

            } catch (error) {
                console.error("Error fetching drama details:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [uniqueUrls]); // The effect re-runs only when the set of unique URLs changes.

    return { dramaDetails, isLoading };
};