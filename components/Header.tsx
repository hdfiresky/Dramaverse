import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { HomeIcon, ListBulletIcon, UserCircleIcon, SunIcon, MoonIcon, ChatBubbleOvalLeftEllipsisIcon, ChevronDownIcon, KeyIcon } from './Icons';

/**
 * @fileoverview Defines the Header component for the application.
 * It includes navigation, the site title, and user authentication status/actions.
 */

interface ThemeToggleProps {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, toggleTheme }) => {
    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-full text-brand-text-secondary hover:text-brand-accent hover:bg-brand-secondary/50 dark:hover:bg-brand-primary transition-colors duration-200"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? (
                <MoonIcon className="w-6 h-6" />
            ) : (
                <SunIcon className="w-6 h-6" />
            )}
        </button>
    );
};

interface HeaderProps {
    /** Function to handle navigation to the home page. */
    onGoHome: () => void;
    /** Function to handle navigation to the user's list page. */
    onGoToMyList: () => void;
    /** Function to handle navigation to the all reviews page. */
    onGoToAllReviews: () => void;
    /** Function to handle navigation to the admin panel. */
    onGoToAdminPanel: () => void;
    /** The current user object, or null if no one is logged in. */
    currentUser: User | null;
    /** Function to open the authentication modal. */
    onLoginClick: () => void;
    /** Function to log the current user out. */
    onLogout: () => void;
    /** The current theme ('light' or 'dark'). */
    theme: 'light' | 'dark';
    /** Function to toggle the theme. */
    toggleTheme: () => void;
    /** Function to open the password change modal. */
    onOpenPasswordChangeModal: () => void;
}

/**
 * The main header component for the application. It is sticky and provides top-level navigation.
 * It adapts its display based on whether a user is logged in.
 * @param {HeaderProps} props - The props for the Header component.
 * @returns {React.ReactElement} The rendered header element.
 */
export const Header: React.FC<HeaderProps> = ({ onGoHome, onGoToMyList, onGoToAllReviews, onGoToAdminPanel, currentUser, onLoginClick, onLogout, theme, toggleTheme, onOpenPasswordChangeModal }) => {
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Effect to close the user menu when clicking outside of it.
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="bg-brand-secondary/80 backdrop-blur-sm sticky top-0 z-30 shadow-md dark:shadow-none">
            <div className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Site Title/Logo - navigates home on click */}
                <h1 onClick={onGoHome} className="text-2xl font-bold text-brand-accent cursor-pointer">Dramaverse</h1>

                {/* Navigation Links */}
                <nav className="flex items-center gap-2 sm:gap-4">
                    
                    {/* --- Desktop Navigation (for logged in users) --- */}
                    {currentUser && (
                        <div className="hidden md:flex items-center gap-2 sm:gap-4">
                            <button 
                                onClick={onGoHome} 
                                className="p-2 rounded-full text-brand-text-secondary hover:text-brand-accent hover:bg-brand-secondary/50 dark:hover:bg-brand-primary transition-colors"
                                title="Home"
                                aria-label="Go to home page"
                            >
                                <HomeIcon className="w-6 h-6" />
                            </button>
                            <button 
                                onClick={onGoToMyList} 
                                className="p-2 rounded-full text-brand-text-secondary hover:text-brand-accent hover:bg-brand-secondary/50 dark:hover:bg-brand-primary transition-colors"
                                title="My List"
                                aria-label="Go to my list"
                            >
                                <ListBulletIcon className="w-6 h-6" />
                            </button>
                            <button 
                                onClick={onGoToAllReviews} 
                                className="p-2 rounded-full text-brand-text-secondary hover:text-brand-accent hover:bg-brand-secondary/50 dark:hover:bg-brand-primary transition-colors"
                                title="All Reviews"
                                aria-label="Go to all reviews page"
                            >
                                <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6" />
                            </button>
                            {currentUser.isAdmin && (
                                <button 
                                    onClick={onGoToAdminPanel}
                                    className="px-3 py-2 text-sm font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 rounded-md transition-colors"
                                    title="Admin Panel"
                                    aria-label="Go to Admin Panel"
                                >
                                    Admin
                                </button>
                            )}
                        </div>
                    )}
                    
                    {/* --- Mobile/Unauthenticated Navigation (Home Button) --- */}
                    {!currentUser && (
                        <button 
                            onClick={onGoHome} 
                            className="p-2 rounded-full text-brand-text-secondary hover:text-brand-accent hover:bg-brand-secondary/50 dark:hover:bg-brand-primary transition-colors"
                            title="Home"
                            aria-label="Go to home page"
                        >
                            <HomeIcon className="w-6 h-6" />
                        </button>
                    )}


                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

                    {/* Auth-related UI */}
                    {currentUser ? (
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setIsUserMenuOpen(prev => !prev)}
                                className="flex items-center gap-2 p-2 rounded-md text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-primary transition-colors"
                                aria-haspopup="true"
                                aria-expanded={isUserMenuOpen}
                            >
                                <UserCircleIcon className="w-6 h-6" />
                                <span className="text-sm font-semibold hidden sm:inline">{currentUser.username}</span>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isUserMenuOpen && (
                                <div className="absolute right-0 mt-2 w-56 bg-brand-secondary rounded-md shadow-lg py-1 z-50 animate-fade-in border border-slate-700/50">
                                    <button
                                        onClick={() => {
                                            onOpenPasswordChangeModal();
                                            setIsUserMenuOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-brand-text-primary hover:bg-brand-primary flex items-center gap-3 transition-colors"
                                    >
                                        <KeyIcon className="w-5 h-5 text-brand-text-secondary"/>
                                        Change Password
                                    </button>
                                     <div className="border-t border-slate-200 dark:border-slate-700/50 my-1"></div>
                                    <button
                                        onClick={() => {
                                            onLogout();
                                            setIsUserMenuOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-brand-primary transition-colors"
                                    >
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button 
                            onClick={onLoginClick} 
                            className="p-2 rounded-full text-brand-text-secondary hover:text-brand-accent hover:bg-brand-secondary/50 dark:hover:bg-brand-primary transition-colors"
                            title="Login or Register"
                            aria-label="Login or Register"
                        >
                            <UserCircleIcon className="w-6 h-6" />
                        </button>
                    )}
                </nav>
            </div>
        </header>
    );
};