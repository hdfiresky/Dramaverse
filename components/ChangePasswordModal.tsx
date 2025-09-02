/**
 * @fileoverview Defines a modal for the logged-in user to change their own password.
 */
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { CloseIcon } from './Icons';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    onChangePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose, onChangePassword }) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setError('');
            setSuccessMessage('');
            setIsSubmitting(false);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (newPassword.length < 6) {
            setError('New password must be at least 6 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }

        setIsSubmitting(true);
        const resultError = await onChangePassword(currentPassword, newPassword);
        setIsSubmitting(false);

        if (resultError) {
            setError(resultError);
        } else {
            setSuccessMessage('Password changed successfully!');
            setTimeout(() => {
                onClose();
            }, 2000); // Close modal after 2 seconds on success
        }
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div 
            className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 transition-opacity duration-300"
            onClick={onClose}
        >
            <div 
                className="bg-brand-secondary p-8 rounded-lg w-full max-w-sm animate-fade-in" 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Change Password</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-brand-primary" aria-label="Close change password modal">
                        <CloseIcon className="w-6 h-6"/>
                    </button>
                </div>

                {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
                {successMessage && <p className="text-green-400 text-sm text-center mb-4">{successMessage}</p>}
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input 
                        type="password" 
                        placeholder="Current Password" 
                        value={currentPassword} 
                        onChange={e => setCurrentPassword(e.target.value)} 
                        required 
                        className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                    <input 
                        type="password" 
                        placeholder="New Password" 
                        value={newPassword} 
                        onChange={e => setNewPassword(e.target.value)} 
                        required 
                        className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                    <input 
                        type="password" 
                        placeholder="Confirm New Password" 
                        value={confirmPassword} 
                        onChange={e => setConfirmPassword(e.target.value)} 
                        required 
                        className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                    <button 
                        type="submit" 
                        disabled={isSubmitting || !!successMessage}
                        className="w-full bg-brand-accent hover:bg-brand-accent-hover text-white font-bold py-3 rounded-md transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};