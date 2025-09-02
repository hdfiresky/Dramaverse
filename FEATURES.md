# Dramaverse Features

This document outlines the key features implemented in the Dramaverse application.

## 1. Drama Discovery & Browsing
- **Homepage Grid**: A paginated, visually-rich grid displays all available dramas.
- **Loading & Error States**: The UI provides clear feedback to the user while data is loading or if an error occurs.
- **Search**: A real-time search bar allows users to instantly filter dramas by title. Input is debounced for performance.

## 2. Advanced Filtering & Sorting
- **Comprehensive Filter Sidebar**: A slide-in sidebar contains all filtering and sorting options.
- **Multi-Select Filters**: Users can include dramas based on multiple genres, tags, countries, and cast members.
- **Exclusion Filters**: Users can explicitly exclude dramas that contain certain genres or tags.
- **Minimum Rating Slider**: A range slider to filter out dramas below a certain user rating.
- **Weighted Sorting**: A unique, drag-and-drop interface allows users to define multiple sorting criteria (e.g., Popularity, Rating) and prioritize them. The application calculates a weighted score to rank results according to the user's precise preferences.
- **Active Filter Display**: A dedicated area on the homepage shows all active filters as removable badges, giving users a clear view of their current selection.

## 3. User Accounts & Personalization
- **Local Authentication**: A simple, client-side user account system (username/password) for demonstration purposes, with data stored in `localStorage`.
- **My List Page**: A dedicated, tabbed section for logged-in users to manage their personal drama collections.
- **Drama Statuses**: Users can track their progress by assigning statuses: `Watching`, `Completed`, `On-Hold`, `Dropped`, and `Plan to Watch`.
- **Favorites**: Users can maintain a separate list of their favorite dramas.

## 4. Detailed Drama View
- **Rich Detail Modal**: Clicking a drama card opens a comprehensive modal view.
- **Complete Metadata**: Displays all drama details, including title, description, rating, popularity, genres, tags, country, episodes, etc.
- **Interactive Tags/Genres**: Genres and tags in the detail view are clickable, allowing users to quickly apply them as filters on the main list.
- **Cast Display**: Shows the main cast with actor photos and character names. Clicking an actor opens a new modal showing all their dramas.

## 5. Recommendation Engines
- **Curated Recommendations**: Displays the pre-defined list of recommendations from the original data source.
- **Similarity Engine**: A powerful recommendation engine that allows users to find similar dramas based on a combination of criteria they select.
    - **Configurable Criteria**: Users can toggle criteria like Genres, Tags, Description, Cast, Rating, and Rating Count.
    - **Similarity Scoring**: The engine calculates a similarity score for every other drama in the library based on the selected criteria and their assigned weights.
    - **Dynamic Results**: The top 10 most similar dramas are displayed instantly.

## 6. Actor-Centric Discovery
- **Cast Detail Modal**: From any drama's detail page, users can click on an actor to see a dedicated modal.
- **Complete Filmography**: The modal displays a grid of all other dramas in the application that feature that specific actor.

## 7. Modern UI/UX
- **Responsive Design**: The application is fully responsive and works seamlessly on devices of all sizes.
- **Smooth Transitions & Animations**: Subtle animations for modal pop-ups, card hovers, and filter displays enhance the user experience.
- **Modal System**: Uses React Portals to ensure modals are rendered correctly in the DOM tree, preventing z-index issues.
- **Accessibility**: ARIA attributes are used on interactive elements like buttons, inputs, and modals to improve accessibility for screen readers.