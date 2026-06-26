import React from 'react';
import { 
  LayoutDashboard, 
  GitBranch, 
  BarChart3, 
  Settings as SettingsIcon, 
  Users, 
  LogOut,
  ShieldCheck,
  Video
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { logout, user } = useAuthStore();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'repos', label: 'Repositories', icon: GitBranch },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Rules & Policies', icon: SettingsIcon },
    { id: 'team', label: 'Team Collaboration', icon: Users },
    { id: 'lounge', label: 'Collab Huddle', icon: Video },
  ];

  return (
    <div className="w-64 border-r border-slate-200 dark:border-darkBorder bg-white dark:bg-darkCard flex flex-col h-screen fixed left-0 top-0 transition-colors duration-200 z-10">
      {/* Brand logo */}
      <div className="p-6 border-b border-slate-200 dark:border-darkBorder flex items-center gap-3">
        <div className="p-2 bg-indigo-600 rounded-lg text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold font-sans tracking-tight text-slate-800 dark:text-white leading-tight">
            Code Review
          </h1>
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">AUTOMATED PLATFORM</span>
        </div>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User profile card & Logout */}
      <div className="p-4 border-t border-slate-200 dark:border-darkBorder bg-slate-50/50 dark:bg-slate-900/30">
        <div className="flex items-center gap-3 mb-4">
          <img
            src={user?.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=Admin'}
            alt="User avatar"
            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-darkBorder"
          />
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate leading-none mb-1">
              {user?.name}
            </p>
            <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              {user?.role}
            </span>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 border border-transparent hover:border-red-200 dark:hover:border-red-900/30 transition-all duration-150"
        >
          <LogOut className="h-4 w-4" />
          Logout Account
        </button>
      </div>
    </div>
  );
};
