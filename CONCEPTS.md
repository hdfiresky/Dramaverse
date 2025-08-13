# Core Concepts & Architecture

This document explains the key architectural patterns and programming concepts used in the Dramaverse application. It's intended to help new developers understand the "why" behind the code structure.

## 1. Hook-Driven Logic & State Management

The application's architecture is centered around **React Hooks**. Instead of placing all logic within components, we abstract it into reusable, self-contained custom hooks. This promotes separation of concerns, making components primarily responsible for rendering UI, while the hooks manage state and business logic.

The main `App.tsx` component acts as an **orchestrator**. It initializes all the major hooks and passes down the state and handler functions they provide to the rest of the component tree as props.

### Key Custom Hooks:

-   **`useDramas`**: The heart of data management.
    -   **Responsibility**: Fetches the master `dramas.json` file, manages loading/error states, and performs all filtering and sorting logic.
    -   **Performance**: It uses `useMemo` extensively to prevent costly re-calculations. The filtered and sorted list of dramas is only re-computed when the source data, filters, search term, or sort priorities change.

-   **`useAuth`**: Handles all user-related functionality.
    -   **Responsibility**: Manages the current user's session, provides `login`, `logout`, and `register` functions, and handles all modifications to a user's personal data (favorites, statuses).
    -   **Persistence**: It uses the `useLocalStorage` hook to persist user accounts and session information across browser reloads. User-specific data is stored under a unique key (`dramaverse_userdata_{username}`).

-   **`useUIState`**: Manages the state of the UI itself.
    -   **Responsibility**: Tracks which view is active (`home` or `my-list`), which modals are open (`Auth`, `DramaDetail`, `CastDetail`), and the current pagination page.
    -   **Separation**: This cleanly separates the volatile state of the UI (e.g., a modal being open) from the application's core data state (e.g., the list of dramas).

-   **`useLocalStorage`**: A generic utility hook.
    -   **Responsibility**: Provides a simple `useState`-like interface for any piece of state that needs to be persisted in the browser's `localStorage`. It handles the serialization (`JSON.stringify`) and deserialization (`JSON.parse`) automatically.

-   **`useDebounce`**: A performance optimization hook.
    -   **Responsibility**: Delays updating a value until a certain amount of time has passed without it changing. This is used on the search input to prevent re-filtering the drama list on every single keystroke, waiting instead until the user has stopped typing.

## 2. Unidirectional Data Flow

The application follows React's standard unidirectional data flow model.

1.  **State lives high up**: State is managed in the custom hooks initialized in `App.tsx`.
2.  **Data flows down**: State values (like `filteredAndSortedDramas` or `currentUser`) are passed down to child components as props.
3.  **Actions flow up**: When a user interacts with a component (e.g., clicks a "Favorite" button), the component calls a handler function (e.g., `onToggleFavorite`) that was passed down as a prop. This handler function, which lives in `App.tsx` and originates from a hook, is the only thing that can update the state.
4.  **Re-render**: The state update triggers a re-render, and the new state flows back down the component tree.

This makes the application predictable and easier to debug.

## 3. Modals via React Portals

All modals (`AuthModal`, `DramaDetailModal`, etc.) are rendered using `ReactDOM.createPortal`.

-   **Why?**: A portal renders its children into a different part of the DOM tree, outside of the main parent component. We use a dedicated `<div id="modal-root"></div>` in `index.html` for this.
-   **Benefit**: This solves common CSS problems with modals, such as `z-index` stacking conflicts and `overflow: hidden` on parent containers. It ensures the modal is always on top of the rest of the application content, as intended.

## 4. Client-Side Processing

All complex computations are performed on the client-side after the initial data load. This includes:
-   Filtering the drama list based on multiple criteria.
-   Calculating weighted scores for sorting.
-   Calculating similarity scores for the recommendation engine.

This approach simplifies the application by not requiring a backend server, but it relies on the user's browser having sufficient processing power. The use of `useMemo` is critical to ensure these computations are only run when absolutely necessary, maintaining a smooth user experience.
