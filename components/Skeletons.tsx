/**
 * @fileoverview A centralized collection of skeleton loader components.
 * These components are used as placeholders while data is being fetched,
 * improving perceived performance by showing a content-aware layout.
 */
import React from 'react';

/** A base, pulsing gray box used to build more complex skeletons. */
const SkeletonBase: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`bg-slate-700/50 rounded-md animate-pulse ${className}`} />
);

/** A skeleton loader that mimics the layout of a `DramaCard`. */
export const DramaCardSkeleton: React.FC = () => (
    <div className="bg-brand-secondary rounded-lg overflow-hidden shadow-lg">
        <div className="relative">
            <SkeletonBase className="w-full h-80" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
                <SkeletonBase className="h-5 w-3/4 mb-2" />
                <SkeletonBase className="h-4 w-1/2" />
            </div>
        </div>
    </div>
);

/** A skeleton loader that mimics the layout of a `RecommendationCard` in the detail modal. */
export const RecommendationCardSkeleton: React.FC = () => (
    <div className="bg-brand-primary rounded-lg overflow-hidden shadow-md">
        <div className="relative">
            <SkeletonBase className="w-full h-48 md:h-64" />
             <div className="absolute bottom-0 left-0 right-0 p-2">
                <SkeletonBase className="h-4 w-full" />
            </div>
        </div>
    </div>
);

/** A skeleton loader that mimics the layout of a statistics card in the Admin Panel. */
export const StatCardSkeleton: React.FC = () => (
    <div className="bg-brand-secondary p-4 rounded-lg flex items-center gap-4 shadow-md animate-pulse">
        <div className="bg-brand-primary p-3 rounded-full w-14 h-14"></div>
        <div className="w-full space-y-2">
            <SkeletonBase className="h-4 w-1/2" />
            <SkeletonBase className="h-8 w-1/3" />
        </div>
    </div>
);

/** A skeleton loader that mimics the layout of a user list item in the Admin Panel. */
export const UserListItemSkeleton: React.FC = () => (
    <div className="p-3 flex items-center justify-between gap-3 animate-pulse">
        <div className="flex-1 min-w-0 space-y-2">
            <SkeletonBase className="h-5 w-1/3" />
            <div className="flex items-center gap-2">
                <SkeletonBase className="h-5 w-16 rounded-full" />
                <SkeletonBase className="h-5 w-12 rounded-full" />
            </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
            <SkeletonBase className="w-9 h-9 rounded-full" />
        </div>
    </div>
);

/** A skeleton loader that mimics the layout of a reviewed drama card on the All Reviews page. */
export const ReviewedDramaCardSkeleton: React.FC = () => (
    <div className="bg-brand-secondary rounded-lg overflow-hidden shadow-md animate-pulse">
        <div className="p-4 flex flex-col sm:flex-row gap-4">
            <SkeletonBase className="w-24 h-36 rounded-md flex-shrink-0" />
            <div className="flex-1 space-y-2">
                <SkeletonBase className="h-6 w-3/4" />
                <SkeletonBase className="h-4 w-1/2" />
                <SkeletonBase className="h-4 w-1/3" />
                <SkeletonBase className="h-5 w-24 mt-2" />
            </div>
        </div>
    </div>
);

/** A skeleton loader that mimics the layout of a recommendation engine card on the Recommendations page. */
export const RecommendationEngineCardSkeleton: React.FC = () => (
    <div className="bg-brand-secondary rounded-lg shadow-lg p-6 flex flex-col animate-pulse">
        <SkeletonBase className="h-7 w-1/2 mb-2" />
        <SkeletonBase className="h-4 w-full mb-1" />
        <SkeletonBase className="h-4 w-full mb-1" />
        <SkeletonBase className="h-4 w-3/4 mb-4" />
        <div className="flex-grow">
            <DramaCardSkeleton />
        </div>
    </div>
);