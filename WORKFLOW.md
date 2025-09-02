# Dramaverse: Architecture & Workflow

This document outlines the architecture, data flow, and development workflow for the Dramaverse application.

## Application Architecture

The application employs a modern React architecture centered around **custom hooks** for state and logic management, and a **custom client-side router** for navigation and state persistence in the URL. The `App.tsx` component acts as a high-level orchestrator, composing these hooks and passing URL-derived data down to presentational components.

*   **Project Structure**: The project is organized into a modular structure to promote separation of concerns, reusability, and maintainability. Key directories include `components/`, `hooks/`, and `public/data/`.

*   **URL-Driven State & Routing**:
    *   **`useRouter.ts`**: This new hook is the single source of truth for navigation. It parses the current browser URL into a structured `location` object, listens for browser back/forward events (`popstate`), and provides a `navigate` function to programmatically change the URL using the History API.
    *   **The URL is the State**: All significant application state—the current view, active filters, search terms, pagination, and even the stack of open modals—is stored in the URL's path and query parameters. This enables deep linking, refresh persistence, and intuitive browser history navigation.

*   **State Management via Hooks**:
    *   **`useDramas.ts`**: This hook is responsible for all drama-related data. It fetches `dramas.json`, manages loading and error states, and performs the complex filtering and weighted sorting logic based on parameters derived from the URL.
    *   **`useAuth.ts`**: Encapsulates all authentication and user data logic. It manages the current user, handles login/registration, and provides functions to modify user data (favorites, statuses).
    *   **`useLocalStorage.ts`**: A generic hook for persisting UI preferences (like filter and sort settings) across sessions, acting as a fallback when no settings are present in the URL.

*   **Component Composition**:
    *   `App.tsx` initializes all the core hooks, including the new `useRouter`.
    *   It derives the entire application state (active view, filters, modals, etc.) directly from the `location` object provided by `useRouter`.
    *   It renders the main layout and conditionally renders the active view or modals based on the URL-derived state.
    *   Handlers passed down as props from `App.tsx` now trigger URL changes via the router's `navigate` function, which in turn causes the app to re-render with the new state.

*   **Filtering and Sorting**:
    *   The user's filter and sort preferences are stored as query parameters in the URL.
    *   `App.tsx` parses these parameters and passes them to the `useDramas` hook.
    *   `useDramas` contains a `useMemo` hook that re-calculates the displayed drama list whenever these URL-derived preferences change, ensuring high performance.

## Development Workflow

This section outlines the typical process for adding new features or making changes to the application.

### 1. Understanding the Core Files

-   **`types.ts`**: **Start here for data changes.** Defines all the core data structures (`Drama`, `User`, `Filters`).
-   **`App.tsx`**: The central hub. It reads the URL from `useRouter` and renders the appropriate components based on the URL's state.
-   **`/hooks/useRouter.ts`**: The core of navigation. Changes to how the URL is structured or managed happen here.
-   **`/hooks`**: Where the application's business logic lives (e.g., `useDramas`, `useAuth`).
-   **`/components`**: Where the UI is built. Components receive state as props and call handler functions to trigger URL changes.
-   **`/public/data/dramas.json`**: The static database for the application.

### 2. Example: Adding a "Reviews" Feature

Let's imagine we want to allow users to write a review for a drama.

1.  **Define the Data Structure (`types.ts`)**:
    -   Add a `UserReview` interface: `interface UserReview { rating: number; text: string; }`
    -   Add a `reviews` property to the `UserData` interface: `reviews: Record<string, UserReview>; // key is drama url`

2.  **Update the Logic (`hooks/useAuth.ts`)**:
    -   Add an initial empty `reviews: {}` object to the default `UserData` state.
    -   Create a new function, `addUserReview(dramaUrl: string, review: UserReview)`, inside the `useAuth` hook. This function will update the user's data.

3.  **Create the UI Component (`components/`)**:
    -   Create a new file: `components/ReviewSection.tsx`.
    -   This component would contain a form with a star rating input and a textarea.
    -   It would take the current review (if any) and the `addUserReview` function as props.

4.  **Integrate into the Application**:
    -   In `App.tsx`, get the new `addUserReview` function from the `useAuth` hook.
    -   Pass this function down as a prop to `DramaDetailModal`. The modal itself is rendered based on the `modal_stack` parameter in the URL.
    -   In `DramaDetailModal.tsx`, import `ReviewSection` and render it. Pass the necessary props.

### 3. Styling Guidelines

-   The application uses **Tailwind CSS** for utility-first styling.
-   Custom brand colors and fonts are configured directly in the `<script>` tag in `index.html`.
-   For more complex, reusable styles, global CSS is added in the `<style>` tag in `index.html`.

### 4. Updating the Data

-   The entire drama library is sourced from `/public/data/dramas.json`.
-   To add, remove, or update a drama, you must edit this file directly.
-   Ensure any new entries conform to the `Drama` interface defined in `types.ts`.