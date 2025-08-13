/**
 * @fileoverview Defines the sticky bottom navigation bar for mobile devices.
 * This component provides primary navigation for logged-in users on smaller screens.
 */
import React from 'react';
import { HomeIcon, ListBulletIcon, ChatBubbleOvalLeftEllipsisIcon } from './Icons';

interface BottomNavBarProps {
  activeView: 'home' | 'my-list' | 'all-reviews';
  onNavigate: (view: 'home' | 'my-list' | 'all-reviews') => void;
}

const navItems = [
    { view: 'home' as const, icon: HomeIcon, label: 'Home' },
    { view: 'my-list' as const, icon: ListBulletIcon, label: 'My List' },
    { view: 'all-reviews' as const, icon: ChatBubbleOvalLeftEllipsisIcon, label: 'Reviews' },
];

/**
 * A navigation bar that is fixed to the bottom of the viewport on mobile screens.
 * It is only intended to be displayed for logged-in users.
 *
 * @param {BottomNavBarProps} props - The props for the BottomNavBar component.
 * @returns {React.ReactElement} The rendered bottom navigation bar.
 */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeView, onNavigate }) => {
    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-brand-secondary/90 backdrop-blur-sm border-t border-slate-700/50 z-30 flex justify-around items-center shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
            {navItems.map(item => {
                const isActive = activeView === item.view;
                return (
                    <button
                        key={item.view}
                        onClick={() => onNavigate(item.view)}
                        className={`flex flex-col items-center justify-center w-full h-full transition-colors duration-200 ${isActive ? 'text-brand-accent' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}
                        aria-label={`Go to ${item.label}`}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        <item.icon className="w-6 h-6" />
                        <span className={`text-xs mt-1 ${isActive ? 'font-bold' : ''}`}>{item.label}</span>
                    </button>
                );
            })}
        </nav>
    );
};
