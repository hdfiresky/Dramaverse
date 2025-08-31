/**
 * @fileoverview Defines the Admin Panel component for user management.
 * This view is only accessible to users with administrative privileges.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AdminUserView, UserData, Drama, DramaStatus, User } from '../types';
import { 
    ChevronRightIcon, EyeIcon, BookmarkIcon, CheckCircleIcon, PauseIcon, XCircleIcon, 
    UserIcon, FilmIcon, ChatBubbleOvalLeftEllipsisIcon, SearchIcon, InformationCircleIcon,
    UserPlusIcon, UserMinusIcon, BanIcon, CheckBadgeIcon, KeyIcon, TrashIcon, EllipsisVerticalIcon,
    ChartBarIcon
} from './Icons';
import {
    fetchAllUsers,
    fetchUserDataForAdmin,
    toggleUserBan,
    deleteUser,
    resetUserPassword,
    toggleUserAdminStatus,
    fetchAllUserDataForAdmin,
    fetchRegistrationStats
} from '../hooks/lib/adminApi';

interface AdminPanelProps {
    allDramas: Drama[];
    currentUser: User | null;
}

// --- SUB-COMPONENTS ---

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
                ) : <p className="text-sm text-brand-text-secondary">No favorites.</p>;

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
                                {Object.entries(reviews).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([ep, review]) => (
                                    <div key={ep} className="text-sm">
                                        <p className="font-bold">Ep {ep}:</p>
                                        <p className="italic text-slate-400">"{review.text}"</p>
                                    </div>
                                ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-sm text-brand-text-secondary">No episode reviews.</p>;

            case 'statuses':
            default:
                const statuses = Object.entries(userData.statuses).map(([url, statusInfo]) => ({ drama: dramaMap.get(url), ...statusInfo })).filter(item => item.drama && item.status);
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
                ) : <p className="text-sm text-brand-text-secondary">No statuses set.</p>;
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

const StatCard: React.FC<{ title: string; value: string | number; icon: React.FC<any> }> = ({ title, value, icon: Icon }) => (
    <div className="bg-brand-secondary p-4 rounded-lg flex items-center gap-4 shadow-md">
        <div className="bg-brand-primary p-3 rounded-full">
            <Icon className="w-6 h-6 text-brand-accent" />
        </div>
        <div>
            <p className="text-sm text-brand-text-secondary">{title}</p>
            <p className="text-2xl font-bold text-brand-text-primary">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        </div>
    </div>
);

const DashboardStats: React.FC<{ stats: { totalUsers: number; totalDramas: number; totalReviews: number; } }> = ({ stats }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard title="Total Users" value={stats.totalUsers} icon={UserIcon} />
        <StatCard title="Total Dramas" value={stats.totalDramas} icon={FilmIcon} />
        <StatCard title="Total Episode Reviews" value={stats.totalReviews} icon={ChatBubbleOvalLeftEllipsisIcon} />
    </div>
);

const RegistrationChart: React.FC<{ stats: {date: string; count: number}[] }> = ({ stats }) => {
    const maxCount = Math.max(...stats.map(s => s.count), 1); // Avoid division by zero
    
    return (
        <div className="bg-brand-secondary p-4 rounded-lg shadow-md">
            <h4 className="font-semibold mb-4">New User Registrations (Last 14 Days)</h4>
            <div className="flex justify-between items-end h-48 gap-1">
                {stats.map(({ date, count }) => (
                    <div key={date} className="flex-1 flex flex-col items-center justify-end group relative">
                        <div 
                            className="w-full bg-brand-accent hover:bg-brand-accent-hover transition-all duration-200 rounded-t-sm"
                            style={{ height: `${(count / maxCount) * 100}%` }}
                        ></div>
                        <span className="text-xs mt-1 text-brand-text-secondary">{new Date(date + 'T00:00:00').getDate()}</span>
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-brand-primary text-brand-text-primary text-xs rounded py-1 px-2 pointer-events-none whitespace-nowrap">
                           <strong>{count}</strong> users on {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AdvancedStats: React.FC<{ 
    dramas: Drama[]; 
    allUserData: Record<string, UserData>;
    registrationStats: {date: string; count: number}[];
    isLoading: boolean;
}> = ({ dramas, allUserData, registrationStats, isLoading }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const stats = useMemo(() => {
        if (!dramas.length || Object.keys(allUserData).length === 0) {
            return { topFavorited: [], topWatched: [] };
        }

        const dramaMap = new Map<string, { drama: Drama, favoriteCount: number, watchCount: number }>();
        dramas.forEach(d => dramaMap.set(d.url, { drama: d, favoriteCount: 0, watchCount: 0 }));

        Object.values(allUserData).forEach(userData => {
            userData.favorites.forEach(url => {
                if (dramaMap.has(url)) dramaMap.get(url)!.favoriteCount++;
            });
            Object.entries(userData.statuses).forEach(([url, statusInfo]) => {
                if ((statusInfo.status === DramaStatus.Watching || statusInfo.status === DramaStatus.Completed) && dramaMap.has(url)) {
                    dramaMap.get(url)!.watchCount++;
                }
            });
        });

        const allDramaStats = Array.from(dramaMap.values());
        const topFavorited = [...allDramaStats].sort((a, b) => b.favoriteCount - a.favoriteCount).slice(0, 5).filter(d => d.favoriteCount > 0);
        const topWatched = [...allDramaStats].sort((a, b) => b.watchCount - a.watchCount).slice(0, 5).filter(d => d.watchCount > 0);
        
        return { topFavorited, topWatched };
    }, [dramas, allUserData]);

    return (
        <div className="mt-8">
            <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 text-xl font-bold text-brand-text-primary mb-4 w-full text-left" aria-expanded={isExpanded}>
                <ChartBarIcon className="w-6 h-6" />
                Advanced Statistics
                <ChevronRightIcon className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
            {isExpanded && (
                <div className="animate-fade-in">
                    {isLoading ? <p className="text-sm text-brand-text-secondary">Loading statistics...</p> : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="lg:col-span-2">
                                <RegistrationChart stats={registrationStats} />
                            </div>
                            <div className="bg-brand-secondary p-4 rounded-lg shadow-md">
                                <h4 className="font-semibold mb-3">Top 5 Most Favorited Dramas</h4>
                                {stats.topFavorited.length > 0 ? (
                                    <ul className="space-y-2">
                                        {stats.topFavorited.map(({ drama, favoriteCount }) => (
                                            <li key={drama.url} className="text-sm flex justify-between items-center">
                                                <span className="truncate pr-4">{drama.title}</span>
                                                <span className="font-bold flex-shrink-0">{favoriteCount.toLocaleString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-sm text-brand-text-secondary">No favorites recorded yet.</p>}
                            </div>
                            <div className="bg-brand-secondary p-4 rounded-lg shadow-md">
                                <h4 className="font-semibold mb-3">Top 5 Most Watched Dramas</h4>
                                 {stats.topWatched.length > 0 ? (
                                    <ul className="space-y-2">
                                        {stats.topWatched.map(({ drama, watchCount }) => (
                                            <li key={drama.url} className="text-sm flex justify-between items-center">
                                                <span className="truncate pr-4">{drama.title}</span>
                                                <span className="font-bold flex-shrink-0">{watchCount.toLocaleString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-sm text-brand-text-secondary">No watched dramas recorded yet.</p>}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


/**
 * Main component for the Admin Panel.
 */
export const AdminPanel: React.FC<AdminPanelProps> = ({ allDramas, currentUser }) => {
    const [users, setUsers] = useState<AdminUserView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedUser, setExpandedUser] = useState<{ id: number, data: UserData } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [allUserData, setAllUserData] = useState<Record<string, UserData>>({});
    const [registrationStats, setRegistrationStats] = useState<{date: string, count: number}[]>([]);
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);


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
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenActionMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    useEffect(() => {
        fetchUsersCb();
        
        const fetchStatsData = async () => {
            setIsStatsLoading(true);
            try {
                const [userData, regStats] = await Promise.all([
                    fetchAllUserDataForAdmin(),
                    fetchRegistrationStats()
                ]);
                setAllUserData(userData);
                setRegistrationStats(regStats);
            } catch (err) {
                console.error("Could not load data for advanced stats:", err);
            } finally {
                setIsStatsLoading(false);
            }
        };
        fetchStatsData();
    }, [fetchUsersCb]);

    const handleAction = async (action: () => Promise<any>) => {
        setOpenActionMenu(null);
        try {
            await action();
        } catch (err) {
            alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleToggleAdmin = (user: AdminUserView) => {
        const action = user.isAdmin ? 'demote' : 'promote';
        if (window.confirm(`Are you sure you want to ${action} ${user.username} ${user.isAdmin ? 'from' : 'to'} an admin?`)) {
            handleAction(async () => {
                await toggleUserAdminStatus(user.id, !user.isAdmin);
                await fetchUsersCb();
            });
        }
    };
    
    const handleToggleBan = (userId: number, currentBanStatus: boolean) => {
        if (window.confirm(`Are you sure you want to ${currentBanStatus ? 'unban' : 'ban'} this user?`)) {
            handleAction(async () => {
                await toggleUserBan(userId, !currentBanStatus);
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: !currentBanStatus } : u));
            });
        }
    };

    const handleDeleteUser = (userId: number, username: string) => {
        if (window.confirm(`Are you sure you want to PERMANENTLY DELETE user '${username}'? This cannot be undone.`)) {
            handleAction(async () => {
                await deleteUser(userId);
                setUsers(prev => prev.filter(u => u.id !== userId));
            });
        }
    };
    
    const handleResetPassword = (userId: number) => {
        if (window.confirm('Are you sure you want to reset this user\'s password?')) {
            handleAction(async () => {
                const { newPassword } = await resetUserPassword(userId);
                alert(`Password has been reset. The new temporary password is: ${newPassword}`);
            });
        }
    };

    const handleToggleDetails = async (userId: number) => {
        setOpenActionMenu(null);
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

    const filteredUsers = useMemo(() => {
        return users.filter(user => user.username.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [users, searchTerm]);
    
    const dashboardStats = useMemo(() => {
        const totalReviews = Object.values(allUserData).reduce((acc, data) => {
            return acc + Object.keys(data.episodeReviews).reduce((reviewAcc, url) => {
                return reviewAcc + Object.keys(data.episodeReviews[url]).length;
            }, 0);
        }, 0);
        return { totalUsers: users.length, totalDramas: allDramas.length, totalReviews };
    }, [users, allDramas, allUserData]);


    if (error) return <div className="text-center p-8 text-red-400">{error}</div>;

    return (
        <div className="w-full animate-fade-in max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-brand-text-primary mb-2">Admin Panel</h2>
            <p className="text-brand-text-secondary mb-6">Site management, user overview, and statistics.</p>
            
            <DashboardStats stats={dashboardStats} />
            
            <div className="bg-brand-secondary shadow-lg rounded-lg overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </span>
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-brand-primary p-2 pl-9 rounded-md focus:ring-2 focus:ring-brand-accent focus:outline-none text-sm"
                        />
                    </div>
                </div>
                 {isLoading ? <div className="text-center p-8">Loading users...</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-brand-text-secondary">
                            <thead className="text-xs uppercase bg-brand-primary/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Username</th>
                                    <th scope="col" className="px-6 py-3">Status</th>
                                    <th scope="col" className="px-6 py-3">Role</th>
                                    <th scope="col" className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map(user => (
                                    <React.Fragment key={user.id}>
                                        <tr className="border-b border-slate-700 hover:bg-brand-primary">
                                            <td className="px-6 py-4 font-medium text-brand-text-primary whitespace-nowrap">{user.username}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.is_banned ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                                                    {user.is_banned ? 'Banned' : 'Active'}
                                                </span>
                                            </td>
                                             <td className="px-6 py-4">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.isAdmin ? 'bg-yellow-500/20 text-yellow-300' : 'bg-slate-500/20 text-slate-300'}`}>
                                                    {user.isAdmin ? 'Admin' : 'User'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right relative">
                                                <button onClick={() => setOpenActionMenu(openActionMenu === user.id ? null : user.id)} className="p-2 rounded-full hover:bg-slate-700" aria-label="Open actions menu">
                                                    <EllipsisVerticalIcon className="w-5 h-5" />
                                                </button>
                                                {openActionMenu === user.id && (
                                                    <div ref={menuRef} className="absolute right-12 top-2 z-10 w-48 bg-brand-secondary border border-slate-600 rounded-md shadow-lg py-1">
                                                        <button onClick={() => handleToggleDetails(user.id)} className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-2"><InformationCircleIcon className="w-4 h-4 text-sky-400" /> Details</button>
                                                        {currentUser?.username !== user.username && <button onClick={() => handleToggleAdmin(user)} className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-2"><UserPlusIcon className="w-4 h-4 text-purple-400" /> {user.isAdmin ? 'Demote' : 'Promote'}</button>}
                                                        <button onClick={() => handleToggleBan(user.id, user.is_banned)} className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-2"><BanIcon className="w-4 h-4 text-yellow-400" /> {user.is_banned ? 'Unban' : 'Ban'}</button>
                                                        <button onClick={() => handleResetPassword(user.id)} className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-2"><KeyIcon className="w-4 h-4 text-indigo-400" /> Reset Password</button>
                                                        {currentUser?.username !== user.username && <><div className="my-1 h-px bg-slate-600"></div><button onClick={() => handleDeleteUser(user.id, user.username)} className="w-full text-left px-4 py-2 hover:bg-slate-700 flex items-center gap-2 text-red-400"><TrashIcon className="w-4 h-4" /> Delete User</button></>}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        {expandedUser?.id === user.id && (
                                            <tr>
                                                <td colSpan={4} className="p-0">
                                                    <UserDetailView userData={expandedUser.data} allDramas={allDramas} />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 )}
            </div>

            <AdvancedStats dramas={allDramas} allUserData={allUserData} registrationStats={registrationStats} isLoading={isStatsLoading} />
        </div>
    );
};
