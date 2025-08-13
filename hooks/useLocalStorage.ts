/**
 * @fileoverview A custom React hook for persisting state to window.localStorage.
 * This abstracts the logic for reading from and writing to local storage,
 * making components cleaner and state persistence reusable. It is a generic
 * hook that can store any serializable data type.
 */
import { useState } from 'react';

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
     * This function can accept a new value directly or a function that receives the current state
     * and returns the new state, just like the standard `useState` setter.
     *
     * @param {T | ((val: T) => T)} value The new value or a function that returns the new value.
     */
    const setValue = (value: T | ((val: T) => T)) => {
        try {
            // Allow the value to be a function, providing the same API as the standard useState setter.
            // This is important for updates that depend on the previous state.
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            // Update the component's state, which will trigger a re-render.
            setStoredValue(valueToStore);
            // Persist the new value to local storage as a JSON string.
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
            // Log any errors that occur during the process, e.g., if localStorage is full.
            console.error(`Error setting localStorage key “${key}”:`, error);
        }
    };

    return [storedValue, setValue];
};
