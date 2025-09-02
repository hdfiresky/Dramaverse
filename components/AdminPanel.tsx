/**
 * @fileoverview Defines the Admin Panel component for user management.
 * This view is only accessible to users with administrative privileges.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { AdminUserView, UserData, Drama, DramaStatus, User, UserDramaStatus } from '../types';
import { 
    ChevronRightIcon, EyeIcon, BookmarkIcon, CheckCircleIcon, PauseIcon, XCircleIcon, 
    UserIcon, FilmIcon, ChatBubbleOvalLeftEllipsisIcon, SearchIcon, InformationCircleIcon,
    UserPlusIcon, UserMinusIcon, BanIcon, CheckBadgeIcon, KeyIcon, TrashIcon, CloseIcon,
    ChartBarIcon, Cog6ToothIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, ArrowUturnLeftIcon
} from './Icons';
import {
    fetchAllUsers,
    fetchUserDataForAdmin,
    toggleUserBan,
    deleteUser,
    resetUserPassword,
    toggleUserAdminStatus,
    fetchBackups,
    rollbackToBackup,
    fetchDashboardStats
} from '../hooks/lib/adminApi';
import { DataImportModal } from './DataImportModal';
import { API_BASE_URL, BACKEND_MODE } from '../config';


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
 * In backend mode, it fetches the required drama details itself.
 */
const UserDetailView: React.FC<{ userData: UserData; }> = ({ userData }) => {
    const [activeTab, setActiveTab] = useState<'statuses' | 'favorites' | 'reviews'>('statuses');
    const [dramaDetails, setDramaDetails] = useState<Map<string, Drama>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!BACKEND_MODE) return;
            const urls = new Set<string>();
            userData.favorites.forEach(url => urls.add(url));
            Object.keys(userData.statuses).forEach(url => urls.add(url));
            Object.keys(userData.episodeReviews).forEach(url => urls.add(url));

            if (urls.size === 0) {
                setIsLoading(false);
                return;
            }
            
            try {
                const res = await fetch(`${API_BASE_URL}/dramas/by-urls`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    credentials: 'include', body: JSON.stringify({ urls: Array.from(urls) })
                });
                if (!res.ok) throw new Error("Failed to fetch drama details for user.");
                const dramas: Drama[] = await res.json();
                setDramaDetails(new Map(dramas.map(d => [d.url, d])));
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [userData]);


    const content = useMemo(() => {
        if (isLoading && BACKEND_MODE) return <p className="text-sm text-center p-4">Loading drama details...</p>;
        
        const dramaMap = dramaDetails;

        switch (activeTab) {
            case 'favorites':
                const favoriteDramas = userData.favorites.map(url => dramaMap.get(url)).filter((d): d is Drama => Boolean(d));
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
                const statuses = Object.entries(userData.statuses).map(([url, statusInfo]: [string, UserDramaStatus]) => ({ drama: dramaMap.get(url), ...statusInfo })).filter(item => item.drama && item.status);
                return statuses.length > 0 ? (
                    <div className="space-y-2">
                        {statuses.map(({ drama, status, currentEpisode }) => {
                            const Icon = statusIconMap[status as DramaStatus];
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
    }, [activeTab, userData, dramaDetails, isLoading]);

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

const DashboardStats: React.FC<{ stats: any | null; isLoading: boolean }> = ({ stats, isLoading }) => {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-brand-secondary p-4 rounded-lg flex items-center gap-4 shadow-md animate-pulse">
                        <div className="bg-brand-primary p-3 rounded-full w-14 h-14"></div>
                        <div className="w-full">
                            <div className="h-4 bg-brand-primary rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-brand-primary rounded w-1/3"></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!stats) return null;
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard title="Total Users" value={stats.totalUsers} icon={UserIcon} />
            <StatCard title="Total Dramas" value={stats.totalDramas} icon={FilmIcon} />
            <StatCard title="Total Episode Reviews" value={stats.totalReviews} icon={ChatBubbleOvalLeftEllipsisIcon} />
        </div>
    );
};

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

const AdvancedStats: React.FC<{ stats: any | null, isLoading: boolean }> = ({ stats, isLoading }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Advanced stats calculations are now done on the backend.
    // We just need to display them.

    return (
        <div className="mt-8">
            <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 text-xl font-bold text-brand-text-primary mb-4 w-full text-left" aria-expanded={isExpanded}>
                <ChartBarIcon className="w-6 h-6" />
                Advanced Statistics
                <ChevronRightIcon className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
            {isExpanded && (
                <div className="animate-fade-in">
                    {isLoading ? <p className="text-sm text-brand-text-secondary">Loading statistics...</p> : !stats ? <p className="text-sm text-brand-text-secondary">Could not load stats.</p> : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="lg:col-span-2">
                                <RegistrationChart stats={stats.registrationStats} />
                            </div>
                            {/* The backend can be extended to provide top favorited/watched dramas as well */}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


interface UserManagementModalProps {
    user: AdminUserView;
    currentUser: User | null;
    onClose: () => void;
    onToggleAdmin: () => void;
    onToggleBan: () => void;
    onResetPassword: () => void;
    onDeleteUser: () => void;
}

const UserManagementModal: React.FC<UserManagementModalProps> = ({ user, currentUser, onClose, onToggleAdmin, onToggleBan, onResetPassword, onDeleteUser }) => {
    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-brand-secondary rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-4 flex justify-between items-center border-b border-slate-700">
                    <h3 className="text-lg font-bold">Manage User: <span className="text-brand-accent">{user.username}</span></h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-brand-primary"><CloseIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         <button onClick={onToggleAdmin} disabled={currentUser?.username === user.username} className="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                            {user.isAdmin ? <UserMinusIcon className="w-5 h-5 text-purple-400" /> : <UserPlusIcon className="w-5 h-5 text-purple-400" />}
                            <div>
                                <p className="font-semibold">{user.isAdmin ? 'Demote Admin' : 'Promote to Admin'}</p>
                                <p className="text-xs text-slate-400">Toggle administrator role.</p>
                            </div>
                        </button>
                         <button onClick={onToggleBan} disabled={user.isAdmin} className="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                            {user.is_banned ? <CheckBadgeIcon className="w-5 h-5 text-green-400" /> : <BanIcon className="w-5 h-5 text-yellow-400" />}
                            <div>
                                <p className="font-semibold">{user.is_banned ? 'Unban User' : 'Ban User'}</p>
                                <p className="text-xs text-slate-400">Toggle user access.</p>
                            </div>
                        </button>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-slate-400 mb-2 mt-4">Sensitive Actions</h4>
                         <button onClick={onResetPassword} className="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 rounded-md">
                            <KeyIcon className="w-5 h-5 text-indigo-400" />
                            <div>
                                <p className="font-semibold">Reset Password</p>
                                <p className="text-xs text-slate-400">Generate a new temporary password.</p>
                            </div>
                        </button>
                        <button onClick={onDeleteUser} disabled={user.isAdmin} className="w-full text-left p-3 hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center gap-3 rounded-md text-red-600 dark:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                            <TrashIcon className="w-5 h-5" />
                            <div>
                                <p className="font-semibold">Delete User</p>
                                <p className="text-xs text-red-500 dark:text-red-400/80">Permanently remove this user.</p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};

const DataManagement: React.FC<{ onImportComplete: () => void }> = ({ onImportComplete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [backups, setBackups] = useState<{ filename: string; createdAt: string }[]>([]);

    const loadBackups = useCallback(async () => {
        try {
            const backupData = await fetchBackups();
            setBackups(backupData);
        } catch (e) {
            alert(e instanceof Error ? e.message : "Could not load backups.");
        }
    }, []);

    useEffect(() => {
        if (isExpanded) {
            loadBackups();
        }
    }, [isExpanded, loadBackups]);

    const handleRollback = async (filename: string) => {
        if (window.confirm(`Are you sure you want to roll back to ${filename}? This will replace all current drama data.`)) {
            try {
                const result = await rollbackToBackup(filename);
                alert(result.message);
                onImportComplete(); // Refresh all data
                loadBackups();
            } catch (e) {
                alert(e instanceof Error ? e.message : "Rollback failed.");
            }
        }
    };
    
    return (
        <div className="mt-8">
            <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 text-xl font-bold text-brand-text-primary mb-4 w-full text-left" aria-expanded={isExpanded}>
                <Cog6ToothIcon className="w-6 h-6" />
                Drama Data Management
                <ChevronRightIcon className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
            {isExpanded && (
                <div className="bg-brand-secondary shadow-lg rounded-lg p-6 animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h4 className="font-semibold mb-3">Import Dramas</h4>
                        <p className="text-sm text-brand-text-secondary mb-4">Upload a new `dramas.json` file to add or update the drama library.</p>
                        <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover rounded-md transition-colors">
                            <ArrowUpTrayIcon className="w-5 h-5"/>
                            Import Data
                        </button>
                    </div>
                     <div>
                        <h4 className="font-semibold mb-3">Manage Backups</h4>
                        <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                           {backups.length > 0 ? backups.map(backup => (
                               <div key={backup.filename} className="bg-brand-primary p-2 rounded-md flex justify-between items-center text-sm">
                                   <div>
                                       <p className="font-mono">{backup.filename}</p>
                                       <p className="text-xs text-slate-400">{new Date(backup.createdAt).toLocaleString()}</p>
                                   </div>
                                   <div className="flex items-center gap-1">
                                       <a href={`${API_BASE_URL}/admin/dramas/download/${backup.filename}`} title="Download" className="p-2 hover:bg-slate-700 rounded-full"><ArrowDownTrayIcon className="w-4 h-4" /></a>
                                       <button onClick={() => handleRollback(backup.filename)} title="Rollback to this version" className="p-2 hover:bg-slate-700 rounded-full"><ArrowUturnLeftIcon className="w-4 h-4 text-yellow-400"/></button>
                                   </div>
                               </div>
                           )) : <p className="text-sm text-brand-text-secondary">No backups found.</p>}
                        </div>
                    </div>
                </div>
            )}
            <DataImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onImportComplete={() => { onImportComplete(); loadBackups(); }} />
        </div>
    );
}

interface AdminPanelProps {
    currentUser: User | null;
}

/**
 * Main component for the Admin Panel.
 */
export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
    const [users, setUsers] = useState<AdminUserView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedUser, setExpandedUser] = useState<{ id: number, data: UserData } | null>(null);
    const [managingUser, setManagingUser] = useState<AdminUserView | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [dashboardStats, setDashboardStats] = useState<any | null>(null);
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    
    const fetchAdminData = useCallback(async () => {
        setIsLoading(true);
        setIsStatsLoading(true);
        try {
            const usersData = await fetchAllUsers();
            setUsers(usersData);

            if (BACKEND_MODE) {
                const stats = await fetchDashboardStats();
                setDashboardStats(stats);
            }
            
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
            setIsStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAdminData();
    }, [fetchAdminData]);

    const handleAction = async (action: () => Promise<any>, successCallback?: () => void) => {
        setManagingUser(null);
        try {
            await action();
            successCallback?.();
        } catch (err) {
            alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

    const filteredUsers = useMemo(() => {
        return users.filter(user => user.username.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [users, searchTerm]);
    
    if (error) return <div className="text-center p-8 text-red-400">{error}</div>;

    return (
        <div className="w-full animate-fade-in max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-brand-text-primary mb-2">Admin Panel</h2>
            <p className="text-brand-text-secondary mb-6">Site management, user overview, and statistics.</p>
            
            <DashboardStats stats={dashboardStats} isLoading={isStatsLoading} />
            
            <div className="bg-brand-secondary shadow-lg rounded-lg">
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
                    <div className="divide-y divide-slate-700">
                        {filteredUsers.map(user => (
                            <div key={user.id}>
                                <div 
                                    className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                                    onClick={() => handleToggleDetails(user.id)}
                                    role="button"
                                    aria-expanded={expandedUser?.id === user.id}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-brand-text-primary truncate">{user.username}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${user.is_banned ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}`}>
                                                {user.is_banned ? 'Banned' : 'Active'}
                                            </span>
                                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${user.isAdmin ? 'bg-yellow-200 text-yellow-800' : 'bg-blue-200 text-blue-800'}`}>
                                                {user.isAdmin ? 'Admin' : 'User'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setManagingUser(user);
                                            }}
                                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
                                            title={`Manage ${user.username}`}
                                            aria-label={`Manage ${user.username}`}
                                        >
                                            <Cog6ToothIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                {expandedUser?.id === user.id && (
                                    <UserDetailView userData={expandedUser.data} />
                                )}
                            </div>
                        ))}
                    </div>
                 )}
            </div>

             <DataManagement onImportComplete={fetchAdminData} />

            <AdvancedStats stats={dashboardStats} isLoading={isStatsLoading} />

            {managingUser && (
                <UserManagementModal 
                    user={managingUser}
                    currentUser={currentUser}
                    onClose={() => setManagingUser(null)}
                    onToggleAdmin={() => {
                        const action = managingUser.isAdmin ? 'demote' : 'promote';
                        if (window.confirm(`Are you sure you want to ${action} ${managingUser.username}?`)) {
                            handleAction(() => toggleUserAdminStatus(managingUser.id, !managingUser.isAdmin), fetchAdminData);
                        }
                    }}
                    onToggleBan={() => {
                         if (window.confirm(`Are you sure you want to ${managingUser.is_banned ? 'unban' : 'ban'} this user?`)) {
                            handleAction(() => toggleUserBan(managingUser.id, !managingUser.is_banned), fetchAdminData);
                        }
                    }}
                    onResetPassword={() => {
                         if (window.confirm('Are you sure you want to reset this user\'s password?')) {
                            handleAction(async () => {
                                const { newPassword } = await resetUserPassword(managingUser.id);
                                alert(`Password for ${managingUser.username} has been reset. The new temporary password is: ${newPassword}`);
                            });
                        }
                    }}
                    onDeleteUser={() => {
                         if (window.confirm(`Are you sure you want to PERMANENTLY DELETE user '${managingUser.username}'? This cannot be undone.`)) {
                           handleAction(() => deleteUser(managingUser.id), fetchAdminData);
                        }
                    }}
                />
            )}
        </div>
    );
};