/**
 * @fileoverview A custom hook to report the current window size.
 * It's useful for creating responsive components that adapt their layout
 * or behavior based on the viewport dimensions, without needing CSS media queries in JavaScript.
 */
import { useState, useEffect } from 'react';

interface WindowSize {
    width: number;
    height: number;
}

/**
 * A custom hook that tracks the browser's window dimensions.
 * It sets up an event listener for the 'resize' event and updates its state accordingly.
 * @returns {WindowSize} An object containing the current `width` and `height` of the window.
 */
export const useWindowSize = (): WindowSize => {
    const [windowSize, setWindowSize] = useState<WindowSize>({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    useEffect(() => {
        // A handler function to be called whenever the window is resized.
        const handleResize = () => {
            setWindowSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        // Set up the event listener on the window object.
        window.addEventListener('resize', handleResize);

        // Clean up the event listener when the component that uses this hook unmounts.
        // This is crucial to prevent memory leaks.
        return () => window.removeEventListener('resize', handleResize);
    }, []); // The empty dependency array `[]` ensures this effect runs only once on mount and cleans up on unmount.

    return windowSize;
};
