/**
 * @fileoverview This file contains all the TypeScript type definitions and interfaces
 * used throughout the Dramaverse application. Centralizing these types ensures
 * data consistency and provides a single source of truth for the app's data structures.
 */

/**
 * Represents a single cast member in a drama.
 */
export interface CastMember {
  /** The full name of the actor. */
  actor_name: string;
  /** The name of the character they portray. */
  character_name: string;
  /** The type of role (e.g., "Main Role", "Support Role"). */
  role_type: string;
  /** The URL for the actor's image. */
  actor_image: string;
  /** The URL to the actor's profile page on MyDramaList. */
  profile_url: string;
}

/**
 * Represents a curated recommendation for a drama.
 */
export interface Recommendation {
  /** The title of the recommended drama. */
  title: string;
  /** The URL to the recommended drama's page on MyDramaList. */
  url: string;
  /** The URL for the recommended drama's cover image. */
  image_url: string;
}

/**
 * The core interface representing a single drama, containing all its metadata.
 */
export interface Drama {
  /** The unique URL for the drama's page on MyDramaList, used as a primary key. */
  url: string;
  /** The primary title of the drama. */
  title: string;
  /** An array of alternative or international names for the drama. */
  alternative_names: string[];
  /** The country of origin. */
  country: string;
  /** The format type (e.g., "Drama", "Movie"). */
  type: string;
  /** The total number of episodes. */
  episodes: number;
  /** The airing date range as a string. */
  aired_date: string;
  /** The days of the week the drama aired on. */
  aired_on: string;
  /** The original television network or streaming platform. */
  original_network: string;
  /** The duration of a typical episode. */
  duration: string;
  /** The content rating (e.g., "15+ - Teens 15 or older"). */
  content_rating: string;
  /** An array of genres associated with the drama. */
  genres: string[];
  /** An array of tags or keywords describing the drama's themes and plot points. */
  tags: string[];
  /** A detailed synopsis of the drama. */
  description: string;
  /** The URL for the drama's primary cover image. */
  cover_image: string;
  /** The average user rating, typically on a scale of 1-10. */
  rating: number;
  /** The total number of users who have rated the drama. */
  rating_count: number;
  /** The number of users who have the drama on their watchlist. */
  watchers: number;
  /** The drama's rank in popularity. A lower number is more popular. */
  popularity_rank: number;
  /** An array of `CastMember` objects for the drama. */
  cast: CastMember[];
  /** An array of curated `Recommendation` objects for the drama. */
  recommendations: Recommendation[];
}

/**
 * Represents a registered user.
 */
export interface User {
  /** The unique username for the user. */
  username: string;
  /** A flag indicating if the user has administrative privileges. */
  isAdmin?: boolean;
}

/**
 * Represents the view of a user from the admin's perspective.
 */
export interface AdminUserView {
    id: number;
    username: string;
    is_banned: boolean;
}

/**
 * Enumeration of possible statuses a user can assign to a drama.
 */
export enum DramaStatus {
  Watching = 'Watching',
  Completed = 'Completed',
  OnHold = 'On-Hold',
  Dropped = 'Dropped',
  PlanToWatch = 'Plan to Watch',
}

/**
 * Represents the status and progress a user has for a specific drama.
 */
export interface UserDramaStatus {
  /** The status assigned from the `DramaStatus` enum. */
  status: DramaStatus;
  /** The episode number the user is currently on (optional). */
  currentEpisode?: number;
}

/**
 * Represents a user's review for a drama.
 */
export interface UserReview {
  /** The user's rating for the drama (e.g., 1-10). */
  rating: number;
  /** The text content of the review. */
  text: string;
}

/**
 * Represents a single episode review, including content and timestamp.
 */
export interface EpisodeReview {
  /** The text content of the review. */
  text: string;
  /** A UTC timestamp of when the review was last updated. */
  updatedAt: number;
}

/**
 * Represents all personalized data for a single user.
 */
export interface UserData {
  /** An array of drama URLs that the user has marked as a favorite. */
  favorites: string[];
  /** A record mapping a drama URL to its `UserDramaStatus`. */
  statuses: Record<string, UserDramaStatus>;
  /** A record mapping a drama URL to its `UserReview`. */
  reviews: Record<string, UserReview>;
  /** A record mapping a drama URL to its episode-specific reviews. */
  episodeReviews: Record<string, Record<number, EpisodeReview>>; // { dramaUrl: { episodeNumber: reviewObject } }
}

/**
 * Represents the complete set of filters that can be applied to the drama list.
 */
export interface Filters {
  /** An array of genres to include. Dramas must have ALL of these genres. */
  genres: string[];
  /** An array of genres to exclude. Dramas must have NONE of these genres. */
  excludeGenres: string[];
  /** An array of tags to include. Dramas must have ALL of these tags. */
  tags: string[];
  /** An array of tags to exclude. Dramas must have NONE of these tags. */
  excludeTags: string[];
  /** An array of countries to include. Dramas can be from ANY of these countries. */
  countries: string[];
  /** An array of cast members to include. Dramas must feature ALL of these actors. */
  cast: string[];
  /** The minimum user rating a drama must have to be included. */
  minRating: number;
}

/**
 * The keys that can be used for sorting, used in the weighted sort system.
 */
export type SortKey = 'rating' | 'popularity_rank' | 'title' | 'aired_date' | 'watchers';
export type NumericSortKey = 'rating' | 'popularity_rank' | 'aired_date' | 'watchers';
export type SortOrder = 'asc' | 'desc';

/**
 * Represents a single priority level in the weighted sorting configuration.
 */
export interface SortPriority {
  key: NumericSortKey;
  order: SortOrder;
}

/**
 * Represents the data needed to resolve a sync conflict.
 */
export interface ConflictData {
  endpoint: string;
  clientPayload: any; // The data the client tried to save
  serverVersion: any; // The conflicting data from the server
}

/**
 * Represents an item in the modal navigation stack.
 * Used to manage the history of opened modals.
 */
export type ModalStackItem = 
  { type: 'drama'; drama: Drama } | 
  { type: 'cast'; actorName: string } |
  { type: 'reviews'; drama: Drama } |
  { type: 'conflict'; data: ConflictData };