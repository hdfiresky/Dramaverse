import React, { useState } from 'react';
import ReactDOM from 'react-dom';

interface PasswordChangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onChangePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
}

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({ isOpen, onClose, onChangePassword }) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
        }
        if (newPassword.length < 6) {
            setError("New password must be at least 6 characters long.");
            return;
        }

        const result = await onChangePassword(currentPassword, newPassword);
        if (result) {
            setError(result);
        } else {
            setSuccess("Password changed successfully!");
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => {
                onClose();
                setSuccess(''); // Reset for next time
            }, 2000);
        }
    };

    const handleClose = () => {
        setError('');
        setSuccess('');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
    };
    
    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div 
            className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center"
            onClick={handleClose}
        >
            <div 
                className="bg-brand-secondary p-8 rounded-lg w-full max-w-sm" 
                onClick={e => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold text-center mb-4">Change Password</h2>
                {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
                {success && <p className="text-green-400 text-sm text-center mb-4">{success}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="password" placeholder="Current Password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"/>
                    <input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"/>
                    <input type="password" placeholder="Confirm New Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full bg-brand-primary p-3 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none"/>
                    <button type="submit" className="w-full bg-brand-accent hover:bg-brand-accent-hover text-white font-bold py-3 rounded-md transition-colors">Update Password</button>
                </form>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};