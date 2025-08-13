/**
 * @fileoverview Defines a pagination component for navigating through a list of items.
 * It is responsive and includes logic to display page numbers intelligently.
 */
import React, { useMemo } from 'react';
import { useWindowSize } from '../hooks/useWindowSize';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

interface PaginationProps {
    /** The currently active page number (1-indexed). */
    currentPage: number;
    /** The total number of items across all pages. */
    totalItems: number;
    /** The number of items displayed per page. */
    itemsPerPage: number;
    /** Callback function triggered when a new page is selected. */
    onPageChange: (page: number) => void;
}

const DOTS = '...';

/**
 * Helper function to generate a range of numbers.
 * @param {number} start - The starting number of the range.
 * @param {number} end - The ending number of the range.
 * @returns {number[]} An array of numbers from start to end.
 */
const range = (start: number, end: number) => {
    let length = end - start + 1;
    return Array.from({ length }, (_, idx) => idx + start);
};


/**
 * A custom hook that calculates the pagination range to be displayed.
 * It intelligently adds ellipses ('...') to avoid showing too many page numbers.
 * @param {object} options - The pagination configuration.
 * @returns {Array<number | string>} The pagination range array (e.g., [1, '...', 4, 5, 6, '...', 10]).
 */
const usePagination = ({
    totalItems,
    itemsPerPage,
    siblingCount,
    currentPage
}: {
    totalItems: number;
    itemsPerPage: number;
    siblingCount: number;
    currentPage: number;
}) => {
    const paginationRange = useMemo(() => {
        const totalPageCount = Math.ceil(totalItems / itemsPerPage);

        // The number of page items to display is siblingCount + firstPage + lastPage + currentPage + 2*DOTS
        const totalPageNumbers = siblingCount + 5;

        // Case 1: If the total number of pages is less than the number of pages we want to show,
        // we just return the full range of pages.
        if (totalPageNumbers >= totalPageCount) {
            return range(1, totalPageCount);
        }

        // Calculate the left and right sibling indices, ensuring they are within the page bounds.
        const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
        const rightSiblingIndex = Math.min(
            currentPage + siblingCount,
            totalPageCount
        );

        // Determine if we need to show the left or right dots.
        const shouldShowLeftDots = leftSiblingIndex > 2;
        const shouldShowRightDots = rightSiblingIndex < totalPageCount - 2;

        const firstPageIndex = 1;
        const lastPageIndex = totalPageCount;

        // Case 2: No left dots, but right dots are needed.
        if (!shouldShowLeftDots && shouldShowRightDots) {
            let leftItemCount = 3 + 2 * siblingCount;
            let leftRange = range(1, leftItemCount);
            return [...leftRange, DOTS, totalPageCount];
        }

        // Case 3: Left dots are needed, but no right dots.
        if (shouldShowLeftDots && !shouldShowRightDots) {
            let rightItemCount = 3 + 2 * siblingCount;
            let rightRange = range(
                totalPageCount - rightItemCount + 1,
                totalPageCount
            );
            return [firstPageIndex, DOTS, ...rightRange];
        }
         
        // Case 4: Both left and right dots are needed.
        if (shouldShowLeftDots && shouldShowRightDots) {
            let middleRange = range(leftSiblingIndex, rightSiblingIndex);
            return [firstPageIndex, DOTS, ...middleRange, DOTS, lastPageIndex];
        }

        return []; // Should not happen with the logic above, but good for safety.
    }, [totalItems, itemsPerPage, siblingCount, currentPage]);

    return paginationRange;
};

/**
 * A component that provides pagination controls (Previous/Next buttons, page numbers).
 * It is responsive, showing fewer page numbers on smaller screens.
 * @param {PaginationProps} props - The props for the Pagination component.
 * @returns {React.ReactElement | null} The rendered pagination controls, or null if there is only one page.
 */
export const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalItems,
    itemsPerPage,
    onPageChange,
}) => {
    const { width } = useWindowSize();
    
    // Adjust the number of sibling page numbers shown based on screen width for a better responsive experience.
    const siblingCount = useMemo(() => (width < 640 ? 0 : 1), [width]);

    const paginationRange = usePagination({
        currentPage,
        totalItems,
        itemsPerPage,
        siblingCount
    });

    // If there's only one page or less, no pagination is needed, so we render nothing.
    if (currentPage === 0 || paginationRange.length < 2) {
        return null;
    }

    const onNext = () => {
        onPageChange(currentPage + 1);
    };

    const onPrevious = () => {
        onPageChange(currentPage - 1);
    };

    const lastPage = paginationRange[paginationRange.length - 1];
    
    return (
        <nav className="flex justify-center items-center gap-2 sm:gap-4 mt-8" aria-label="Pagination">
            <button
                disabled={currentPage === 1}
                onClick={onPrevious}
                className="w-10 h-10 flex items-center justify-center bg-brand-secondary rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-accent-hover transition-colors"
                aria-label="Go to previous page"
            >
                <ChevronLeftIcon className="w-5 h-5"/>
            </button>
            <div className="flex items-center gap-1 sm:gap-2">
                {paginationRange.map((pageNumber, index) => {
                    // If the page number is a dot, render it as a non-interactive element.
                    if (pageNumber === DOTS) {
                        return <span key={DOTS + index} className="px-2 py-2 text-brand-text-secondary select-none">...</span>;
                    }

                    // Otherwise, render a clickable page number button.
                    return (
                        <button
                            key={pageNumber}
                            onClick={() => onPageChange(pageNumber as number)}
                            className={`w-10 h-10 text-sm rounded-full transition-colors ${
                                currentPage === pageNumber
                                    ? 'bg-brand-accent text-white font-bold'
                                    : 'bg-brand-secondary hover:bg-brand-accent-hover'
                            }`}
                            // ARIA attribute to indicate the current page for accessibility.
                            aria-current={currentPage === pageNumber ? 'page' : undefined}
                            aria-label={`Go to page ${pageNumber}`}
                        >
                            {pageNumber}
                        </button>
                    );
                })}
            </div>
            <button
                disabled={currentPage === lastPage}
                onClick={onNext}
                className="w-10 h-10 flex items-center justify-center bg-brand-secondary rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-accent-hover transition-colors"
                aria-label="Go to next page"
            >
                <ChevronRightIcon className="w-5 h-5"/>
            </button>
        </nav>
    );
};
