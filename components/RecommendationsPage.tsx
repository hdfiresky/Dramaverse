/**
 * @fileoverview Defines the Recommendations page, which presents personalized drama
 * suggestions to the user from multiple distinct recommendation engines.
 */
import React, { useState, useEffect } from 'react';
import { Drama, UserData, UserDramaStatus } from '../types';
import { DramaCard } from './DramaCard';
import { API_BASE_URL, BACKEND_MODE } from '../config';
import { RecommendationEngineCardSkeleton } from './Skeletons';
import { ArrowPathIcon } from './Icons';

interface RecommendationsPageProps {
    userData: UserData;
    onSelectDrama: (drama: Drama) => void;
    onToggleFavorite: (dramaUrl: string) => void;
    onSetStatus: (url: string, statusInfo: Omit<UserDramaStatus, 'updatedAt'>) => void;
    onSetReviewAndTrackProgress: (drama: Drama, episodeNumber: number, text: string) => void;
}

type RecommendationResults = {
    hiddenGem: Drama | null;
    genreSpecialist: { drama: Drama; genre: string } | null;
    starPower: { drama: Drama; actor: string } | null;
    peerPick: Drama | null;
};

// A sub-component for displaying a single recommendation engine's result.
const RecommendationEngineCard: React.FC<{
    title: string;
    description: string;
    result: Drama | null;
    resultSubtext?: string;
    props: RecommendationsPageProps;
}> = ({ title, description, result, resultSubtext, props }) => (
    <div className="bg-brand-secondary rounded-lg shadow-lg p-6 flex flex-col">
        <h3 className="text-xl font-bold text-brand-accent">{title}</h3>
        <p className="text-sm text-brand-text-secondary mt-1 mb-4 flex-grow">{description}</p>
        {result ? (
            <div>
                {resultSubtext && <p className="text-center text-sm font-semibold mb-2">{resultSubtext}</p>}
                {/* FIX: Explicitly pass props to DramaCard, mapping onSelectDrama to the required onSelect prop. */}
                <DramaCard
                    drama={result}
                    userData={props.userData}
                    isUserLoggedIn={true}
                    onSelect={props.onSelectDrama}
                    onToggleFavorite={props.onToggleFavorite}
                    onSetStatus={props.onSetStatus}
                    onSetReviewAndTrackProgress={props.onSetReviewAndTrackProgress}
                />
            </div>
        ) : (
            <div className="flex-grow flex items-center justify-center bg-brand-primary rounded-md p-4">
                <p className="text-center text-brand-text-secondary text-sm">
                    Not enough data to generate this recommendation.
                    <br />
                    Favorite and complete more dramas to get a suggestion!
                </p>
            </div>
        )}
    </div>
);

export const RecommendationsPage: React.FC<RecommendationsPageProps> = (props) => {
    const [recommendations, setRecommendations] = useState<RecommendationResults | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        const fetchRecommendations = async () => {
            if (!BACKEND_MODE) {
                setError("This feature requires the backend to be enabled.");
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                const res = await fetch(`${API_BASE_URL}/user/recommendations`, { credentials: 'include' });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.message || 'Failed to fetch recommendations.');
                }
                const data: RecommendationResults = await res.json();
                setRecommendations(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchRecommendations();
    }, [refreshTrigger]);

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-8">
                    <RecommendationEngineCardSkeleton />
                    <RecommendationEngineCardSkeleton />
                    <RecommendationEngineCardSkeleton />
                    <RecommendationEngineCardSkeleton />
                </div>
            );
        }

        if (error) {
            return <div className="text-center py-20 text-red-400">{error}</div>;
        }

        if (recommendations) {
            return (
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-8">
                    <RecommendationEngineCard
                        title="The Hidden Gem"
                        description="Finds a highly-rated drama that isn't very popular, based on your favorite genres and tags."
                        result={recommendations.hiddenGem}
                        props={props}
                    />
                    <RecommendationEngineCard
                        title="Your Next Favorite"
                        description="Identifies your most-watched genre and suggests the highest-rated drama within it that you haven't seen."
                        result={recommendations.genreSpecialist?.drama ?? null}
                        resultSubtext={recommendations.genreSpecialist ? `Top-rated in ${recommendations.genreSpecialist.genre}` : ''}
                        props={props}
                    />
                    <RecommendationEngineCard
                        title="Star Power"
                        description="Discovers your most-watched actor and recommends another popular show they starred in."
                        result={recommendations.starPower?.drama ?? null}
                        resultSubtext={recommendations.starPower ? `Featuring ${recommendations.starPower.actor}` : ''}
                        props={props}
                    />
                    <RecommendationEngineCard
                        title="Peer Pick"
                        description="Finds users with similar tastes and recommends a drama they loved that you haven't seen yet."
                        result={recommendations.peerPick}
                        props={props}
                    />
                </div>
            );
        }

        return null;
    };

    return (
        <div className="w-full animate-fade-in">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-brand-text-primary">
                        For You
                    </h2>
                    <p className="text-md text-brand-text-secondary mt-1">
                        Personalized recommendations based on your viewing habits.
                    </p>
                </div>
                 <button
                    onClick={() => setRefreshTrigger(t => t + 1)}
                    disabled={isLoading}
                    className="p-2 rounded-full text-brand-text-secondary hover:text-brand-accent hover:bg-brand-primary transition-colors disabled:opacity-50 disabled:cursor-wait"
                    title="Get new recommendations"
                    aria-label="Get new recommendations"
                >
                    <ArrowPathIcon className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>
            {renderContent()}
        </div>
    );
};