import React from 'react';

interface LegalPageProps {
    title: string;
    children: React.ReactNode;
}

export const LegalPage: React.FC<LegalPageProps> = ({ title, children }) => {
    return (
        <div className="max-w-4xl mx-auto animate-fade-in bg-brand-secondary p-6 sm:p-8 rounded-lg shadow-lg">
            <h1 className="text-3xl font-bold mb-6 text-brand-text-primary">{title}</h1>
            <div className="space-y-6 text-brand-text-secondary leading-relaxed legal-content">
                {children}
            </div>
        </div>
    );
};
