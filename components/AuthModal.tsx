/**
 * @fileoverview Defines the authentication modal component for user login and registration.
 * It is rendered using a React Portal to avoid CSS stacking issues.
 */
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

interface AuthModalProps {
    /** A boolean to control the visibility of the modal. */
    isOpen: boolean;
    /** Callback function to close the modal. */
    onClose: () => void;
    /**
     * Login handler function provided by the `useAuth` hook.
     * @param {string} username - The user's username.
     * @param {string} password - The user's password.
     * @returns {Promise<string | null>} A promise that resolves to an error message string if login fails, otherwise null.
     */
    onLogin: (username: string, password: string) => Promise<string | null>;
    /**
     * Registration handler function provided by the `useAuth` hook.
     * @param {string} username - The desired username.
     * @param {string} password - The desired password.
     * @returns {Promise<string | null>} A promise that resolves to an error message string if registration fails, otherwise null.
     */
    onRegister: (username: string, password: string) => Promise<string | null>;
}

/**
 * A modal component that provides a form for users to either log in or register.
 * It manages its own internal state for the form fields, error messages, and success messages.
 *
 * @param {AuthModalProps} props - The props for the AuthModal component.
 * @returns {React.ReactElement} The rendered authentication modal, portal-ed to #modal-root.
 */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin, onRegister }) => {
    // State to toggle between the login and registration form views.
    const [isLogin, setIsLogin] = useState(true);
    // State for the controlled form inputs.
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    // State for displaying feedback (errors or success messages) to the user.
    const [error, setError] = useState('');

    // Effect to reset the modal to its default (login) state whenever it becomes visible.
    // This ensures a consistent user experience.
    useEffect(() => {
        if (isOpen) {
            setIsLogin(true);
            setError('');
            setUsername('');
            setPassword('');
        }
    }, [isOpen]);

    /**
     * Handles the form submission for both login and registration.
     * @param {React.FormEvent} e - The form submission event.
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (isLogin) {
            const loginError = await onLogin(username, password);
            if (loginError) {
                setError(loginError);
            }
            // onLoginSuccess (which is closeAuthModal) is called from the useAuth hook.
        } else {
            const registerError = await onRegister(username, password);
            if (registerError) {
                setError(registerError);
            }
            // If registration is successful, the useAuth hook will automatically log the user in
            // and the onLoginSuccess callback will close the modal.
        }
    };

    /**
     * Toggles the form between login and registration views and resets all form state.
     */
    const handleSwitchForm = () => {
        setIsLogin(!isLogin);
        setError('');
        setUsername('');
        setPassword('');
    }
    
    // The modal is rendered into the 'modal-root' div in index.html using a Portal.
    // This avoids z-index issues and keeps the modal outside the main component hierarchy.
    if (!isOpen) return null;
    
    return ReactDOM.createPortal(
        <div 
            className={`fixed inset-0 bg-black/70 z-50 flex justify-center items-center transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={onClose} // Allow closing the modal by clicking the backdrop.
        >
            <div 
                className="bg-brand-secondary p-8 rounded-lg w-full max-w-sm animate-fade-in" 
                onClick={e => e.stopPropagation()} // Prevent clicks inside the modal from closing it.
            >
                <h2 className="text-2xl font-bold text-center mb-4">{isLogin ? "Login" : "Register"}</h2>
                {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"/>
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"/>
                    <button type="submit" className="w-full bg-brand-accent hover:bg-brand-accent-hover text-white font-bold py-3 rounded-md transition-colors">{isLogin ? "Login" : "Create Account"}</button>
                </form>
                <p className="text-center text-sm mt-4">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={handleSwitchForm} className="font-semibold text-brand-accent hover:underline ml-2">
                        {isLogin ? "Register" : "Login"}
                    </button>
                </p>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};