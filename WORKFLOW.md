# Dramaverse: Architecture & Workflow

This document outlines the architecture, data flow, and development workflow for the Dramaverse application.

## Application Architecture

The application employs a modern React architecture centered around **custom hooks** for state and logic management. The `App.tsx` component acts as a high-level orchestrator, composing these hooks and passing data and handlers down to presentational components. This keeps `App.tsx` clean and separates concerns effectively.

*   **Project Structure**: The project is organized into a modular structure to promote separation of concerns, reusability, and maintainability. Key directories include `components/`, `hooks/`, and `public/data/`.

*   **State Management via Hooks**:
    *   **`useDramas.ts`**: This hook is responsible for all drama-related data. It fetches `dramas.json`, manages loading and error states, processes the data for filtering, and performs the complex filtering and weighted sorting logic. It exposes the final list of dramas to be rendered, along with metadata for the filter sidebar.
    *   **`useAuth.ts`**: Encapsulates all authentication and user data logic. It manages the current user, handles login/registration, and provides functions to modify user data (favorites, statuses). It syncs this data with `localStorage`.
    *   **`useUIState.ts`**: Manages the state of the UI itself, such as which view is active (`home` or `my-list`), which modals are open, and the current pagination page. It provides simple handler functions to manipulate this state.
    *   **`useLocalStorage.ts`**: A generic hook for persisting any piece of state (like filters and sort preferences) to `localStorage`, making the app's configuration durable across sessions.

*   **Component Composition**:
    *   `App.tsx` initializes all the core hooks.
    *   It renders the main layout, including the `Header` and `FilterSidebar`.
    *   Based on the `activeView` state from `useUIState`, it conditionally renders either the `HomePage` or `MyListPage` component.
    *   It also renders all modals (`AuthModal`, `DramaDetailModal`, `CastDetailModal`) and controls their visibility based on the state from `useUIState`.
    *   Handlers are passed down as props from `App.tsx` to child components, connecting user actions to the logic within the hooks. For example, a click on a `DramaCard` calls a function from `useUIState` to open the detail modal.

*   **Filtering and Sorting**:
    *   The user's filter and sort preferences are stored in `App.tsx` (using `useLocalStorage`).
    *   These preferences are passed as arguments to the `useDramas` hook.
    *   `useDramas` contains a `useMemo` hook that re-calculates the displayed drama list whenever these preferences change, ensuring high performance.
    *   **Weighted Sorting**: The `useDramas` hook calculates a score for each drama based on user-defined sort priorities. It normalizes each attribute (e.g., rating, popularity) and applies a weight based on priority order. The list is then sorted by this calculated score.

## Development Workflow

This section outlines the typical process for adding new features or making changes to the application.

### 1. Understanding the Core Files

-   **`types.ts`**: **Start here for data changes.** Defines all the core data structures (`Drama`, `User`, `Filters`). Any new data property should be added here first.
-   **`App.tsx`**: The central hub. New global state or major components will likely be integrated here.
-   **`/hooks`**: Where the application's logic lives. Changes to data handling, authentication, or UI state will happen in these files.
-   **`/components`**: Where the UI is built. New visual elements or pages will be created here.
-   **`/public/data/dramas.json`**: The static database for the application.

### 2. Example: Adding a "Reviews" Feature

Let's imagine we want to allow users to write a review for a drama.

1.  **Define the Data Structure (`types.ts`)**:
    -   Add a `UserReview` interface: `interface UserReview { rating: number; text: string; }`
    -   Add a `reviews` property to the `UserData` interface: `reviews: Record<string, UserReview>; // key is drama url`

2.  **Update the Logic (`hooks/useAuth.ts`)**:
    -   Add an initial empty `reviews: {}` object to the default `UserData` state.
    -   Create a new function, `addUserReview(dramaUrl: string, review: UserReview)`, inside the `useAuth` hook.
    -   This function will update the `userData` state and persist it to `localStorage`, similar to how `toggleFavorite` works.

3.  **Create the UI Component (`components/`)**:
    -   Create a new file: `components/ReviewSection.tsx`.
    -   This component would contain a form with a star rating input and a textarea.
    -   It would take the current review (if any) and the `addUserReview` function as props.

4.  **Integrate into the Application**:
    -   In `App.tsx`, get the new `addUserReview` function from the `useAuth` hook.
    -   Pass this function down as a prop to `DramaDetailModal`.
    -   In `DramaDetailModal.tsx`, import `ReviewSection` and render it in an appropriate place (e.g., below the user's status selector).
    -   Pass the necessary props to `<ReviewSection>`, including the drama's URL and the review handler.

### 3. Styling Guidelines

-   The application uses **Tailwind CSS** for utility-first styling.
-   Custom brand colors and fonts are configured directly in the `<script>` tag in `index.html`. To change the site's theme, modify the `tailwind.config` object there.
-   For more complex, reusable styles (like the custom scrollbar), global CSS is added in the `<style>` tag in `index.html`.
-   Components should be self-contained and not rely on global styles where possible.

### 4. Updating the Data

-   The entire drama library is sourced from `/public/data/dramas.json`.
-   To add, remove, or update a drama, you must edit this file directly.
-   Ensure any new entries conform to the `Drama` interface defined in `types.ts`.
