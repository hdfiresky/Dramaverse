import React from 'react';

interface FooterProps {
  onNavigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => (
    <footer className="w-full text-center p-4 mt-8 border-t border-slate-700/50">
        <div className="text-sm text-brand-text-secondary">
            <span>© {new Date().getFullYear()} Dramaverse. All Rights Reserved.</span>
            <span className="mx-2">|</span>
            <button onClick={() => onNavigate('/privacy')} className="underline hover:text-brand-accent transition-colors">Privacy Policy</button>
            <span className="mx-2">|</span>
            <button onClick={() => onNavigate('/terms')} className="underline hover:text-brand-accent transition-colors">Terms of Service</button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
            This is a non-commercial fan project. Drama information is sourced from publicly available data.
        </p>
    </footer>
);
