/**
 * @fileoverview A modal for the drama data import workflow.
 */
import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Drama } from '../types';
import { CloseIcon, ArrowUpTrayIcon, PencilSquareIcon, DocumentDuplicateIcon } from './Icons';
import { importDramas, uploadDramaFilePreview } from '../hooks/lib/adminApi';

type ImportStep = 'upload' | 'preview' | 'importing' | 'success' | 'error';
type PreviewData = {
    new: Drama[];
    updated: { old: Drama; new: Drama }[];
    unchanged: Drama[];
    errors: { index: number; drama: any; error: string }[];
};

interface DataImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

const EditableRow: React.FC<{
    errorItem: { index: number, drama: any, error: string },
    onSave: (index: number, correctedDrama: Drama) => void,
}> = ({ errorItem, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [jsonText, setJsonText] = useState(() => JSON.stringify(errorItem.drama, null, 2));
    const [editError, setEditError] = useState('');

    const handleSave = () => {
        try {
            const correctedDrama = JSON.parse(jsonText);
            // Basic validation before saving
            if (!correctedDrama.url || !correctedDrama.title) {
                throw new Error("Corrected data must include 'url' and 'title'.");
            }
            onSave(errorItem.index, correctedDrama);
            setEditError('');
            setIsEditing(false);
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Invalid JSON format.");
        }
    };

    return (
        <div className="bg-brand-secondary p-3 rounded-lg">
            <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">Row {errorItem.index + 2}: {errorItem.drama.title || '(No Title)'}</p>
                    <p className="text-xs text-red-400">{errorItem.error}</p>
                </div>
                <button onClick={() => setIsEditing(!isEditing)} className="p-2 hover:bg-brand-primary rounded-full ml-2">
                    <PencilSquareIcon className="w-5 h-5 text-brand-accent"/>
                </button>
            </div>
            {isEditing && (
                <div className="mt-3">
                    <textarea 
                        className="w-full h-48 bg-slate-900 font-mono text-xs p-2 rounded-md focus:ring-1 focus:ring-brand-accent focus:outline-none"
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                    />
                    {editError && <p className="text-xs text-red-400 mt-1">{editError}</p>}
                    <div className="flex justify-end gap-2 mt-2">
                         <button onClick={() => setIsEditing(false)} className="px-3 py-1 text-xs font-semibold rounded-md bg-slate-600 hover:bg-slate-700">Cancel</button>
                         <button onClick={handleSave} className="px-3 py-1 text-xs font-semibold rounded-md bg-brand-accent hover:bg-brand-accent-hover">Save Correction</button>
                    </div>
                </div>
            )}
        </div>
    );
};


export const DataImportModal: React.FC<DataImportModalProps> = ({ isOpen, onClose, onImportComplete }) => {
    const [step, setStep] = useState<ImportStep>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [finalMessage, setFinalMessage] = useState('');
    const [downloadLinks, setDownloadLinks] = useState<{ new: string, backup: string }>({ new: '', backup: '' });

    const resetState = useCallback(() => {
        setStep('upload');
        setFile(null);
        setPreviewData(null);
        setFinalMessage('');
        setDownloadLinks({ new: '', backup: '' });
    }, []);

    const handleClose = () => {
        resetState();
        onClose();
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setStep('importing'); // Use 'importing' as a generic loading state for preview
        setFinalMessage('Analyzing file...');
        try {
            const data = await uploadDramaFilePreview(file);
            setPreviewData(data);
            setStep('preview');
        } catch (e) {
            setFinalMessage(e instanceof Error ? e.message : 'Upload failed.');
            setStep('error');
        }
    };

    const handleSaveCorrection = (index: number, correctedDrama: Drama) => {
        if (!previewData) return;
        const newPreviewData = { ...previewData };
        const errorIndex = newPreviewData.errors.findIndex(e => e.index === index);
        if (errorIndex > -1) {
            newPreviewData.errors.splice(errorIndex, 1);
            // Re-validate the corrected drama (simplified: just add to new/updated)
            const isExisting = [...previewData.updated.map(u => u.new.url), ...previewData.unchanged.map(u => u.url)].includes(correctedDrama.url);
            if(isExisting) {
                 newPreviewData.updated.push({ old: correctedDrama, new: correctedDrama }); // Simplified for UI
            } else {
                newPreviewData.new.push(correctedDrama);
            }
            setPreviewData(newPreviewData);
        }
    };

    const handleConfirmImport = async (skipErrors = false) => {
        if (!previewData) return;
        setStep('importing');
        setFinalMessage('Importing data...');
        
        let dramasToImport = [...previewData.new, ...previewData.updated.map(u => u.new)];
        if (skipErrors) {
            // dramasToImport is already correct as it doesn't include errored items.
        } else if (previewData.errors.length > 0) {
            setFinalMessage('Please correct all errors before confirming.');
            setStep('preview');
            return;
        }

        try {
            const result = await importDramas(dramasToImport);
            setFinalMessage(result.message);
            setDownloadLinks({
                new: `dramas.json`,
                backup: result.backupFilename
            });
            setStep('success');
            onImportComplete(); // Refresh admin panel data
        } catch (e) {
            setFinalMessage(e instanceof Error ? e.message : 'Import failed.');
            setStep('error');
        }
    };

    const renderContent = () => {
        switch (step) {
            case 'upload':
                return (
                    <>
                        <p className="text-center text-brand-text-secondary mb-4">Upload a `dramas.json` file to add new or update existing drama information.</p>
                        <div className="flex items-center justify-center w-full">
                            <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-48 border-2 border-slate-600 border-dashed rounded-lg cursor-pointer bg-brand-primary hover:bg-slate-700">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <ArrowUpTrayIcon className="w-10 h-10 mb-3 text-slate-400"/>
                                    <p className="mb-2 text-sm text-slate-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                    <p className="text-xs text-slate-500">JSON file (MAX. 10MB)</p>
                                </div>
                                <input id="dropzone-file" type="file" className="hidden" accept=".json" onChange={handleFileChange} />
                            </label>
                        </div> 
                        {file && <p className="text-center mt-4 font-semibold">{file.name}</p>}
                        <button onClick={handleUpload} disabled={!file} className="w-full mt-6 bg-brand-accent hover:bg-brand-accent-hover text-white font-bold py-3 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                            Upload & Preview
                        </button>
                    </>
                );
            case 'preview':
                if (!previewData) return null;
                return (
                     <div className="space-y-4">
                        <div>
                            <h4 className="font-bold text-lg mb-2">Analysis Complete</h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-green-500/20 p-2 rounded-md"><strong>{previewData.new.length}</strong> new dramas</div>
                                <div className="bg-yellow-500/20 p-2 rounded-md"><strong>{previewData.updated.length}</strong> dramas to update</div>
                                <div className="bg-blue-500/20 p-2 rounded-md"><strong>{previewData.unchanged.length}</strong> unchanged</div>
                                <div className="bg-red-500/20 p-2 rounded-md"><strong>{previewData.errors.length}</strong> errors found</div>
                            </div>
                        </div>
                        {previewData.errors.length > 0 && (
                            <div>
                                <h4 className="font-bold text-lg mb-2 text-red-400">Errors Found</h4>
                                <div className="max-h-60 overflow-y-auto space-y-2 p-2 bg-brand-primary rounded-md custom-scrollbar">
                                    {previewData.errors.map(item => <EditableRow key={item.index} errorItem={item} onSave={handleSaveCorrection} />)}
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-700">
                            {previewData.errors.length > 0 && 
                                <button onClick={() => handleConfirmImport(true)} className="px-4 py-2 text-sm font-semibold bg-yellow-600 hover:bg-yellow-700 rounded-md transition-colors">
                                    Import Valid Dramas ({previewData.new.length + previewData.updated.length})
                                </button>
                            }
                             <button onClick={() => handleConfirmImport(false)} disabled={previewData.errors.length > 0} className="px-4 py-2 text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                                Confirm Import
                            </button>
                        </div>
                    </div>
                );
             case 'importing':
             case 'error':
             case 'success':
                 const isError = step === 'error';
                 const isSuccess = step === 'success';
                 return (
                     <div className="text-center py-8">
                         {step === 'importing' && <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-brand-accent mx-auto mb-4"></div>}
                         <p className={`text-lg font-semibold ${isError ? 'text-red-400' : isSuccess ? 'text-green-400' : ''}`}>{finalMessage}</p>
                         {isSuccess && (
                            <div className="mt-6 bg-brand-primary p-4 rounded-lg space-y-3">
                               <p className="text-sm">Download the updated files to sync your frontend public directory:</p>
                               <div className="flex justify-center gap-4">
                                <a href={`/api/admin/dramas/download/${downloadLinks.new}`} className="px-4 py-2 text-sm font-semibold bg-brand-secondary hover:bg-slate-700 rounded-md">Download dramas.json</a>
                                <a href={`/api/admin/dramas/download/${downloadLinks.backup}`} className="px-4 py-2 text-sm font-semibold bg-brand-secondary hover:bg-slate-700 rounded-md">Download Backup</a>
                               </div>
                            </div>
                         )}
                         {(isError || isSuccess) && <button onClick={handleClose} className="mt-6 px-6 py-2 bg-brand-accent hover:bg-brand-accent-hover rounded-md">Close</button>}
                     </div>
                 );
        }
    };


    if (!isOpen) return null;
    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4" onClick={handleClose}>
            <div className="bg-brand-secondary rounded-lg w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-4 flex justify-between items-center border-b border-slate-700">
                    <h3 className="text-xl font-bold">Import Drama Data</h3>
                    <button onClick={handleClose} className="p-1 rounded-full hover:bg-brand-primary"><CloseIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6">
                    {renderContent()}
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};
