/**
 * @fileoverview Defines the Admin Panel component for user management.
 * This view is only accessible to users with administrative privileges.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminUserView, UserData, Drama, DramaStatus } from '../types';
import { ChevronRightIcon, EyeIcon, BookmarkIcon, CheckCircleIcon, PauseIcon, XCircleIcon } from './Icons';
import {
    fetchAllUsers,
    fetchUserDataForAdmin,
    toggleUserBan,
    deleteUser,
    resetUserPassword
} from '../hooks/lib/adminApi';

interface AdminPanelProps {
    allDramas: Drama[];
}

const statusIconMap: Record<DramaStatus, React.FC<any>> = {
    [DramaStatus.Watching]: EyeIcon,
    [DramaStatus.PlanToWatch]: BookmarkIcon,
    [DramaStatus.Completed]: CheckCircleIcon,
    [DramaStatus.OnHold]: PauseIcon,
    [DramaStatus.Dropped]: XCircleIcon,
};

/**
 * A component to display a user's detailed data in a read-only format.
 */
const UserDetailView: React.FC<{ userData: UserData; allDramas: Drama[] }> = ({ userData, allDramas }) => {
    const [activeTab, setActiveTab] = useState<'statuses' | 'favorites' | 'reviews'>('statuses');

    const dramaMap = useMemo(() => new Map(allDramas.map(d => [d.url, d])), [allDramas]);

    const content = useMemo(() => {
        switch (activeTab) {
            case 'favorites':
                const favoriteDramas = userData.favorites.map(url => dramaMap.get(url)).filter(Boolean) as Drama[];
                return favoriteDramas.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {favoriteDramas.map(d => (
                            <div key={d.url} className="text-center">
                                <img src={d.cover_image} alt={d.title} className="w-full h-auto object-cover rounded" />
                                <p className="text-xs mt-1 truncate">{d.title}</p>
                            </div>
                        ))}
                    </div>
                ) : <p>No favorites.</p>;

            case 'reviews':
                 const reviewedDramas = Object.entries(userData.episodeReviews)
                    .map(([url, reviews]) => ({ drama: dramaMap.get(url), reviews }))
                    .filter(item => item.drama);

                return reviewedDramas.length > 0 ? (
                    <div className="space-y-4">
                        {reviewedDramas.map(({ drama, reviews }) => (
                            <div key={drama!.url}>
                                <h4 className="font-semibold">{drama!.title}</h4>
                                <div className="pl-2 border-l-2 border-slate-600 space-y-2 mt-1">
                                {Object.entries(reviews).map(([ep, review]) => (
                                    <div key={ep} className="text-sm">
                                        <p className="font-bold">Ep {ep}:</p>
                                        <p className="italic text-slate-400">"{review.text}"</p>
                                    </div>
                                ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p>No episode reviews.</p>;

            case 'statuses':
            default:
                const statuses = Object.entries(userData.statuses).map(([url, statusInfo]) => ({ drama: dramaMap.get(url), ...statusInfo })).filter(item => item.drama);
                return statuses.length > 0 ? (
                    <div className="space-y-2">
                        {statuses.map(({ drama, status, currentEpisode }) => {
                            const Icon = statusIconMap[status];
                            return (
                                <div key={drama!.url} className="flex items-center gap-2 bg-slate-700/50 p-2 rounded">
                                    {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
                                    <span className="flex-1 truncate font-medium">{drama!.title}</span>
                                    <span className="text-xs text-slate-400">
                                        {status} {status === 'Watching' && `(Ep ${currentEpisode})`}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                ) : <p>No statuses set.</p>;
        }
    }, [activeTab, userData, dramaMap]);

    return (
        <div className="bg-brand-primary p-4 rounded-b-lg">
            <div className="border-b border-slate-700 mb-3">
                <nav className="-mb-px flex space-x-4">
                     {([ 'statuses', 'favorites', 'reviews'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`capitalize whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab ? 'border-brand-accent text-brand-accent' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                            {tab}
                        </button>
                    ))}
                </nav>
            </div>
            {content}
        </div>
    );
};

/**
 * Main component for the Admin Panel.
 */
export const AdminPanel: React.FC<AdminPanelProps> = ({ allDramas }) => {
    const [users, setUsers] = useState<AdminUserView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedUser, setExpandedUser] = useState<{ id: number, data: UserData } | null>(null);

    const fetchUsersCb = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchAllUsers();
            setUsers(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsersCb();
    }, [fetchUsersCb]);

    const handleToggleBan = async (userId: number, currentBanStatus: boolean) => {
        if (window.confirm(`Are you sure you want to ${currentBanStatus ? 'unban' : 'ban'} this user?`)) {
            try {
                await toggleUserBan(userId, !currentBanStatus);
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: !currentBanStatus } : u));
            } catch (err) {
                alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }
    };

    const handleDeleteUser = async (userId: number, username: string) => {
        if (window.confirm(`Are you sure you want to PERMANENTLY DELETE user '${username}'? This cannot be undone.`)) {
            try {
                await deleteUser(userId);
                setUsers(prev => prev.filter(u => u.id !== userId));
            } catch (err) {
                alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }
    };
    
    const handleResetPassword = async (userId: number) => {
        if (window.confirm('Are you sure you want to reset this user\'s password?')) {
            try {
                const { newPassword } = await resetUserPassword(userId);
                alert(`Password has been reset. The new temporary password is: ${newPassword}`);
            } catch (err) {
                alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }
    };

    const handleToggleDetails = async (userId: number) => {
        if (expandedUser?.id === userId) {
            setExpandedUser(null);
            return;
        }
        try {
            const data = await fetchUserDataForAdmin(userId);
            setExpandedUser({ id: userId, data });
        } catch (err) {
            alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    if (isLoading) return <div className="text-center p-8">Loading users...</div>;
    if (error) return <div className="text-center p-8 text-red-400">{error}</div>;

    return (
        <div className="w-full animate-fade-in">
            <h2 className="text-3xl font-bold text-brand-text-primary mb-6">Admin Panel</h2>
            <div className="bg-brand-secondary shadow-lg rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-brand-text-secondary">
                        <thead className="text-xs uppercase bg-brand-primary">
                            <tr>
                                <th scope="col" className="px-6 py-3">Username</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <React.Fragment key={user.id}>
                                    <tr className="border-b border-slate-700 hover:bg-brand-primary">
                                        <td className="px-6 py-4 font-medium text-brand-text-primary whitespace-nowrap">{user.username}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.is_banned ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                                                {user.is_banned ? 'Banned' : 'Active'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                                            <button onClick={() => handleToggleDetails(user.id)} className="font-medium text-sky-400 hover:underline">Details</button>
                                            <button onClick={() => handleToggleBan(user.id, user.is_banned)} className={`font-medium ${user.is_banned ? 'text-green-400' : 'text-yellow-400'} hover:underline`}>
                                                {user.is_banned ? 'Unban' : 'Ban'}
                                            </button>
                                            <button onClick={() => handleResetPassword(user.id)} className="font-medium text-indigo-400 hover:underline">Reset Pass</button>
                                            <button onClick={() => handleDeleteUser(user.id, user.username)} className="font-medium text-red-400 hover:underline">Delete</button>
                                        </td>
                                    </tr>
                                    {expandedUser?.id === user.id && (
                                        <tr>
                                            <td colSpan={3} className="p-0">
                                                <UserDetailView userData={expandedUser.data} allDramas={allDramas} />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};