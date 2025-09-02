/**
 * @fileoverview Defines a modal to resolve data conflicts.
 * When a user edits data offline on two devices, this modal allows them
 * to choose which version to keep, preventing data loss.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { ConflictData } from '../types';
import { CloseIcon } from './Icons';

interface ConflictResolutionModalProps {
    /** Controls the visibility of the modal. */
    isOpen: boolean;
    /** The conflict data to display. */
    data: ConflictData | null;
    /** Callback to close the modal. */
    onClose: () => void;
    /**
     * Callback to resolve the conflict.
     * @param conflictData The original conflict data object.
     * @param resolution Indicates which version to keep ('client' or 'server').
     */
    onResolve: (conflictData: ConflictData, resolution: 'client' | 'server') => void;
}


/**
 * A modal component for resolving data synchronization conflicts for episode reviews.
 *
 * @param {ConflictResolutionModalProps} props - The props for the component.
 * @returns {React.ReactElement | null} The rendered modal, or null if not open.
 */
export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({ isOpen, data, onClose, onResolve }) => {
    if (!isOpen || !data) return null;

    const { clientPayload, serverVersion } = data;
    const { dramaUrl, episodeNumber } = clientPayload; // Assuming these are common properties

    const handleKeepMine = () => {
        onResolve(data, 'client');
        onClose();
    };

    const handleKeepServer = () => {
        onResolve(data, 'server');
        onClose();
    };

    const serverText = serverVersion?.text ?? '(No text saved)';

    return ReactDOM.createPortal(
        <div 
            className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center transition-opacity duration-300"
            // No onClose on backdrop click to force a choice from the user.
        >
            <div 
                className="bg-brand-secondary p-8 rounded-lg w-full max-w-2xl animate-fade-in" 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-red-400">Sync Conflict</h2>
                        <p className="text-brand-text-secondary mt-1">
                            The review for Episode {episodeNumber} was updated on another device.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-brand-primary" aria-label="Close conflict resolution">
                        <CloseIcon className="w-6 h-6"/>
                    </button>
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Your Version (Client) */}
                    <div>
                        <h3 className="font-semibold text-lg text-brand-text-primary mb-2">Your Version (from this device)</h3>
                        <div className="bg-brand-primary p-4 rounded-lg border border-brand-accent">
                             <p className="text-sm text-brand-text-secondary italic whitespace-pre-wrap">"{clientPayload.text}"</p>
                        </div>
                    </div>

                    {/* Server Version */}
                    <div>
                        <h3 className="font-semibold text-lg text-brand-text-primary mb-2">Server Version (from other device)</h3>
                        <div className="bg-brand-primary p-4 rounded-lg border border-gray-600">
                             <p className="text-sm text-brand-text-secondary italic whitespace-pre-wrap">"{serverText}"</p>
                        </div>
                    </div>
                </div>
                
                <p className="text-center text-sm text-brand-text-secondary mt-8">Which version would you like to keep?</p>
                <div className="mt-4 flex justify-center gap-4">
                    <button 
                        onClick={handleKeepServer}
                        className="px-6 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-700 rounded-md transition-colors text-white"
                    >
                        Keep Server Version
                    </button>
                    <button 
                        onClick={handleKeepMine}
                        className="px-6 py-2 text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover rounded-md transition-colors text-white"
                    >
                        Keep My Version
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};