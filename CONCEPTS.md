# Core Concepts & Architecture

This document explains the key architectural patterns and programming concepts used in the Dramaverse application. It's intended to help new developers understand the "why" behind the code structure.

## 1. URL-Driven Architecture & Routing

The application's architecture is now centered around the **browser URL as the single source of truth**. Instead of managing navigation and view state internally, all significant state (the current page, active filters, open modals) is encoded into the URL. This provides a robust foundation for a modern single-page application.

### Key Custom Hooks for Architecture:

-   **`useRouter`**: The new heart of navigation and state management.
    -   **Responsibility**: It parses the current `window.location` into a clean `location` object (`{ pathname, query }`). It listens for browser back/forward button clicks (the `popstate` event) and updates its state accordingly, triggering a re-render. It also provides a `navigate` function that uses the HTML5 History API (`pushState`/`replaceState`) to update the URL without a full page reload.
    -   **Benefit**: This hook makes the entire application URL-aware, enabling deep linking, refresh persistence, and predictable browser history behavior.

-   **`useDramas`**: The core of data management.
    -   **Responsibility**: Fetches the master `dramas.json` file and performs all filtering and sorting logic.
    -   **URL-Driven**: It no longer receives state directly from `useState` hooks in `App.tsx`. Instead, it receives props (like filters and the current page) that have been parsed from the URL by the `useRouter` hook.

-   **`useAuth`**: Handles all user-related functionality.
    -   **Responsibility**: Manages the current user's session, provides `login`, `logout`, and `register` functions, and handles all modifications to a user's personal data.
    -   **Persistence**: It uses the `useLocalStorage` hook for frontend-only mode data persistence.

## 2. Unidirectional Data Flow (Driven by the URL)

The application follows a strict unidirectional data flow, with the URL at the top.

1.  **URL is the State**: The `useRouter` hook reads the URL.
2.  **State is Derived**: In `App.tsx`, the `location` object from the router is used to derive all application state (the active view, filters, modal stack, etc.) using `useMemo` for performance.
3.  **Data flows down**: This derived state is passed down to child components as props.
4.  **Actions flow up to change the URL**: When a user interacts with a component (e.g., clicks a filter), the component calls a handler function passed down as a prop. This handler (which lives in `App.tsx`) constructs a new URL and calls the router's `navigate` function.
5.  **Router triggers re-render**: The `navigate` function updates the browser's URL and updates the router's internal state, causing a re-render. The new state is then derived from the new URL, and the cycle repeats.

This makes the application's state changes predictable and easy to debug by simply looking at the URL.

## 3. Modals via React Portals and URL State

Modals are now part of the URL state, typically stored in a query parameter (e.g., `?modal_stack=...`).

-   **URL State**: When a modal is opened, its type and necessary data (like a drama's ID) are added to the `modal_stack` query parameter in the URL.
-   **React Portals**: The modal components are still rendered using `ReactDOM.createPortal` into a dedicated `<div id="modal-root"></div>`. This solves CSS `z-index` and stacking issues by rendering the modal outside the main component hierarchy.
-   **Benefit**: This combination means modals are persistent on refresh, can be deep-linked, and work correctly with the browser's back button.

## 4. Client-Side Processing

All complex computations are performed on the client-side after the initial data load. This includes:
-   Filtering the drama list based on criteria from the URL.
-   Calculating weighted scores for sorting.
-   Calculating similarity scores for the recommendation engine.

The use of `useMemo` is critical to ensure these computations are only run when the relevant parts of the URL change, maintaining a smooth user experience.