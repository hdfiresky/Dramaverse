# Dramaverse 🎭

![Dramaverse UI Showcase](https://i.imgur.com/gKafB1q.png)

> An advanced drama finder application that allows users to explore, filter, sort, and manage a vast library of dramas. Features include local user accounts, personalized watchlists, ratings, and an intelligent similarity-based recommendation system.

This project is a high-fidelity prototype built with React, TypeScript, and Tailwind CSS, demonstrating modern frontend architecture patterns and a sophisticated, feature-rich user interface. All data processing, including advanced filtering and similarity-based recommendations, is performed entirely on the client side.

---

## ✨ Key Features

Dramaverse is packed with features designed to provide a seamless and powerful drama discovery experience.

### 🔍 Discovery & Advanced Filtering
-   **Instant Search**: A debounced search bar for quickly finding dramas by title.
-   **Weighted Sorting**: A unique drag-and-drop interface to prioritize multiple sort criteria (e.g., sort by Rating, then by Popularity).
-   **Multi-Select & Exclusion Filters**: Include or exclude dramas based on specific genres, tags, cast, and country of origin.
-   **Dynamic UI**: An active filter display shows the current selections as removable badges for easy management.

### 👤 Personalization & Tracking
-   **Local User Accounts**: Simple client-side authentication for a personalized experience.
-   **My List**: A dedicated, tabbed page for users to track dramas.
-   **Drama Statuses**: Keep track of progress with statuses like `Watching`, `Completed`, `On-Hold`, `Dropped`, and `Plan to Watch`.
-   **Favorites**: Maintain a separate list of all-time favorite dramas.
-   **Episode-level Reviews**: Write and view personal notes for every single episode of a drama.

### 🧠 Intelligent Recommendations
-   **Curated Recommendations**: Displays pre-defined recommendations from the data source.
-   **Powerful Similarity Engine**: A powerful recommendation engine that allows users to find similar dramas based on user-selected criteria.
    -   **Configurable Criteria**: Mix and match attributes like _Genres_, _Tags_, _Description_, _Cast_, and _Rating_ to find the perfect match.
    -   **Weighted Scoring**: The engine calculates a similarity score to rank the most relevant results.

### 📱 Modern UI/UX
-   **Fully Responsive**: A seamless experience across desktop and mobile devices.
-   **Dark & Light Modes**: A theme toggle for user comfort.
-   **Smooth Animations**: Subtle transitions for modals, sidebars, and hover effects.
-   **Accessible**: ARIA attributes and semantic HTML are used to enhance accessibility.
-   **Modal-based Navigation**: A robust modal stack allows for deep navigation into drama details, cast filmographies, and reviews without losing context.

---

## 🛠️ Architecture & Tech Stack

This project is built with a focus on clean, scalable, and maintainable code, leveraging modern frontend technologies.

-   **Framework**: **React** (with Hooks)
-   **Language**: **TypeScript**
-   **Styling**: **Tailwind CSS**
-   **State Management**: **Custom React Hooks** for a clean, decentralized state model.

### Hook-Driven Architecture

Instead of a monolithic state management library, the application's logic is encapsulated in custom hooks, promoting separation of concerns. The main `App.tsx` component acts as an orchestrator, composing these hooks.

-   `useDramas`: The core data hook. It fetches the drama library, manages metadata, and performs all complex client-side filtering and weighted sorting. It is heavily memoized for performance.
-   `useAuth`: Handles all authentication and user data logic, including registration, login, favorites, and drama statuses. It persists data to `localStorage`.
-   `useRouter`: The core of navigation and state management. It treats the browser URL as the single source of truth, deriving the active view, filters, and modal state from the path and query parameters. It provides functions to programmatically navigate and update the URL.
-   `useLocalStorage`: A generic utility hook for easily persisting state to `localStorage`.
-   `useDebounce`: A performance hook used to debounce user input for the search field.

---

## 📂 Project Structure

The project is organized into a modular structure that separates concerns and enhances maintainability.

```
/
├── public/
│   └── data/
│       └── dramas.json      # The core drama database (static)
├── src/
│   ├── components/          # Reusable React components (UI)
│   ├── hooks/               # Custom hooks for state and logic
│   ├── App.tsx              # Main application orchestrator
│   ├── index.tsx            # Application entry point
│   └── types.ts             # Centralized TypeScript type definitions
├── README.md                # You are here!
└── index.html               # Main HTML file with Tailwind config
```

---

## 🚀 Exploring the Code

As a serverless, client-side application, there is no complex build step required to explore it.

1.  **Start with `types.ts`**: To understand the shape of the application's data, especially the `Drama`, `User`, and `Filters` interfaces.
2.  **Look at `public/data/dramas.json`**: This is the raw "database" that powers the entire application.
3.  **Explore the `hooks/` directory**: This is where all the application's business logic lives. `useDramas.ts` is the most complex hook, handling all filtering and sorting, while `useAuth.ts` manages all user-specific data.
4.  **Trace props from `App.tsx`**: Observe how state and handlers from the hooks are composed and passed down to the presentational `components/`. This clearly illustrates the unidirectional data flow.