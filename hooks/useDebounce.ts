/**
 * @fileoverview A custom hook that debounces a value.
 * It's useful for delaying the execution of an effect or a computation
 * until a certain amount of time has passed without the value changing. This is
 * commonly used with user input, such as in a search field, to avoid making
 * expensive calculations on every keystroke.
 */
import { useState, useEffect } from 'react';

/**
 * A custom hook that delays updating a value until a specified time has passed
 * without that value changing.
 *
 * @template T The type of the value to debounce.
 * @param {T} value The value to debounce (e.g., the current text in a search input).
 * @param {number} delay The debounce delay in milliseconds.
 * @returns {T} The debounced value, which will only update after the delay.
 */
export const useDebounce = <T,>(value: T, delay: number): T => {
    // State to store the debounced value.
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Set up a timer to update the debounced value after the specified delay.
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // This is the cleanup function that React will run:
        // 1. Before executing the effect again (if `value` or `delay` changes).
        // 2. When the component unmounts.
        // This ensures that we cancel the previous timer, preventing the debounced
        // value from updating with an old, intermediate value.
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]); // This effect re-runs only when the `value` or `delay` changes.

    return debouncedValue;
};
