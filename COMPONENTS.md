# Component Library

This document provides an overview of the React components used in the Dramaverse application.

## Component Hierarchy

The application follows a logical component hierarchy, with `App.tsx` serving as the root container.

` ` `
- App.tsx
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
  - AuthModal.tsx
  - DramaDetailModal.tsx
    - (RecommendationCard)
  - CastDetailModal.tsx
    - DramaCard.tsx
  - Icons.tsx (Used throughout)
` ` `

## Component Breakdown

### Main Layout & Pages

-   **`App.tsx`**
    -   **Role**: The main application container. It doesn't render much UI itself but orchestrates all the custom hooks and passes state and handlers down to child components.
    -   **Key Logic**: Manages which main view (`HomePage` or `MyListPage`) and which modals are currently displayed.

-   **`HomePage.tsx`**
    -   **Role**: Renders the main discovery page, including the search bar, filter controls, drama grid, and pagination.
    -   **Key Props**: `dramas`, `isLoading`, `totalDramas`, `currentPage`, `onPageChange`, `onSearchChange`, `onSelectDrama`.

-   **`MyListPage.tsx`**
    -   **Role**: Renders the personalized user lists in a tabbed interface for logged-in users.
    -   **Key Props**: `allDramas`, `userData`, `onSelectDrama`, `onToggleFavorite`.

### Core UI Elements

-   **`Header.tsx`**
    -   **Role**: The sticky top navigation bar. Displays the app title, navigation links, and user login/logout controls.
    -   **Key Props**: `currentUser`, `onGoHome`, `onGoToMyList`, `onLoginClick`, `onLogout`.

-   **`DramaCard.tsx`**
    -   **Role**: The primary visual representation of a drama in a grid. Displays the cover image, title, rating, and user action buttons (favorite, plan to watch).
    -   **Key Props**: `drama`, `userData`, `onSelect`, `onToggleFavorite`.

-   **`Pagination.tsx`**
    -   **Role**: Provides page navigation controls (Previous, Next, page numbers) for paginated content.
    -   **Key Props**: `currentPage`, `totalItems`, `itemsPerPage`, `onPageChange`.

### Filtering & Sorting

-   **`FilterSidebar.tsx`**
    -   **Role**: A slide-in panel containing all advanced filtering and sorting controls.
    -   **Key Props**: `isOpen`, `onClose`, `metadata`, `filters`, `onFiltersChange`, `sortPriorities`, `onSortPrioritiesChange`.

-   **`FilterSection.tsx`**
    -   **Role**: A reusable component within the `FilterSidebar` for a single filter category (e.g., Genres, Tags). Includes search and include/exclude functionality.
    -   **Key Props**: `title`, `items`, `included`, `excluded`, `onIncludeToggle`, `onExcludeToggle`.

-   **`ActiveFiltersDisplay.tsx`**
    -   **Role**: Displays currently active filters as a series of removable badges above the main drama grid.
    -   **Key Props**: `filters`, `onFiltersChange`.

### Modals

All modals are rendered using React Portals into `<div id="modal-root">`.

-   **`AuthModal.tsx`**
    -   **Role**: A modal form for user login and registration.
    -   **Key Props**: `onClose`, `onLogin`, `onRegister`.

-   **`DramaDetailModal.tsx`**
    -   **Role**: A comprehensive modal that displays all information about a single drama, including its cast, description, and recommendation engines.
    -   **Key Props**: `drama`, `allDramas`, `onClose`, `userData`, `onSetStatus`, `onSelectActor`.

-   **`CastDetailModal.tsx`**
    -   **Role**: A modal that displays all dramas in the library featuring a specific actor.
    -   **Key Props**: `actorName`, `allDramas`, `onClose`, `onSelectDrama`.

### Utility

-   **`Icons.tsx`**
    -   **Role**: A centralized collection of all SVG icons used in the application, exported as React components. This keeps UI components cleaner and makes icons easy to manage.
