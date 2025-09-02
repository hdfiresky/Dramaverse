# Component Library

This document provides an overview of the React components used in the Dramaverse application.

## Component Hierarchy

The application follows a logical component hierarchy, with `App.tsx` serving as the root container. `App.tsx` uses the `useRouter` hook to derive the application's state from the URL and passes this state down to its children.

` ` `
- App.tsx (manages state via `useRouter`, `useDramas`, `useAuth`)
  - Header.tsx
  - FilterSidebar.tsx
    - FilterSection.tsx
  - HomePage.tsx
    - ActiveFiltersDisplay.tsx
      - (FilterBadge)
    - DramaCard.tsx
    - Pagination.tsx
  - MyListPage.tsx
    - DramaCard.tsx
  - AllReviewsPage.tsx
  - RecommendationsPage.tsx
  - AdminPanel.tsx
  - BottomNavBar.tsx
  - AuthModal.tsx
  - ChangePasswordModal.tsx
  - ConflictResolutionModal.tsx
  - DramaDetailModal.tsx
    - (RecommendationCard)
  - CastDetailModal.tsx
    - DramaCard.tsx
  - EpisodeReviewsModal.tsx
  - Skeletons.tsx
  - Icons.tsx (Used throughout)
` ` `

## Component Breakdown

### Main Layout & Pages

-   **`App.tsx`**
    -   **Role**: The main application container. It orchestrates all custom hooks, derives the application's state from the current URL, and renders the appropriate view and modals.
    -   **Key Logic**: Contains all handler functions that trigger navigation and state changes by updating the URL.

-   **`HomePage.tsx`**
    -   **Role**: Renders the main discovery page, including the search bar, filter controls, drama grid, and pagination.
    -   **Key Props**: Receives all its data and state (dramas, currentPage, etc.) from `App.tsx`, which is derived from the URL.

-   **`MyListPage.tsx`**
    -   **Role**: Renders the personalized user lists for logged-in users. Its visibility is controlled by the URL path.
    -   **Key Props**: `userData`, `onSelectDrama`.

### Core UI Elements

-   **`Header.tsx`**
    -   **Role**: The sticky top navigation bar. Navigation clicks trigger URL changes.
    -   **Key Props**: `currentUser`, `onGoTo...` navigation handlers.

-   **`DramaCard.tsx`**
    -   **Role**: The primary visual representation of a drama in a grid. Clicking it opens the detail modal by updating the URL.
    -   **Key Props**: `drama`, `userData`, `onSelect`.

-   **`Pagination.tsx`**
    -   **Role**: Provides page navigation controls. Page clicks update the `page` query parameter in the URL.
    -   **Key Props**: `currentPage`, `totalItems`, `itemsPerPage`, `onPageChange`.

### Filtering & Sorting

-   **`FilterSidebar.tsx`**
    -   **Role**: A slide-in panel containing all advanced filtering and sorting controls. Changes here update the URL's query parameters.
    -   **Key Props**: `isOpen`, `onClose`, `metadata`, `filters`, `onFiltersChange`.

### Modals

All modals are rendered using React Portals and their visibility is controlled by query parameters in the URL.

-   **`AuthModal.tsx`**
    -   **Role**: A modal form for user login and registration.

-   **`DramaDetailModal.tsx`**
    -   **Role**: A comprehensive modal that displays all information about a single drama.
    -   **Key Props**: `drama`, `onClose`, `onSelectActor`.

-   **`CastDetailModal.tsx`**
    -   **Role**: A modal that displays all dramas in the library featuring a specific actor.
    -   **Key Props**: `actorName`, `onClose`, `onSelectDrama`.

### Utility

-   **`Icons.tsx`**
    -   **Role**: A centralized collection of all SVG icons used in the application.