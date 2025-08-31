/**
 * @fileoverview A custom React hook for persisting state to window.localStorage.
 * This abstracts the logic for reading from and writing to local storage,
 * making components cleaner and state persistence reusable. It is a generic
 * hook that can store any serializable data type.
 */
import { useState, useCallback } from 'react';

/**
 * A custom hook that syncs a state value with localStorage.
 * It initializes state from localStorage if available, or with a provided initial value.
 * Any update to the state is automatically persisted back to localStorage.
 *
 * @template T The type of the value to be stored.
 * @param {string} key The key under which the value is stored in localStorage.
 * @param {T} initialValue The initial value to use if nothing is found in localStorage or if an error occurs.
 * @returns {[T, React.Dispatch<React.SetStateAction<T>>]} A stateful value, and a function to update it, identical to the `useState` hook signature.
 */
export const useLocalStorage = <T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
    // Pass a lazy initializer function to useState. This function will only be
    // executed once on the initial render, improving performance.
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            // Attempt to retrieve the value from local storage using the provided key.
            const item = window.localStorage.getItem(key);
            // Parse the stored JSON. If no item exists (item is null), return the initial value.
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            // If any error occurs during parsing (e.g., corrupted data), log it and default to the initial value.
            console.error(`Error reading localStorage key “${key}”:`, error);
            return initialValue;
        }
    });

    /**
     * A wrapped version of useState's setter function that also persists the new value to localStorage.
     * This function is memoized with `useCallback` to ensure it has a stable identity across re-renders,
     * preventing it from causing unnecessary re-renders or infinite loops in dependency arrays.
     *
     * @param {T | ((val: T) => T)} value The new value or a function that returns the new value.
     */
    const setValue = useCallback((value: T | ((val: T) => T)) => {
        try {
            // Use the functional update form of `useState`'s setter. This allows us to get the
            // previous state without having to include `storedValue` in the `useCallback` dependency array.
            setStoredValue(prevValue => {
                const valueToStore = value instanceof Function ? value(prevValue) : value;
                // Persist the new value to local storage as a JSON string.
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
                // Return the new value to update the state.
                return valueToStore;
            });
        } catch (error) {
            // Log any errors that occur during the process, e.g., if localStorage is full.
            console.error(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key]); // The key is the only dependency. Since it's stable, `setValue` will be created only once.

    return [storedValue, setValue];
};