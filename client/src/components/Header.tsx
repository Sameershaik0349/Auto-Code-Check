import React, { useEffect, useState } from 'react';
import { Sun, Moon, Bell, Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  title: string;
  wsConnected: boolean;
  notifications: string[];
  clearNotifications: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  title, 
  wsConnected, 
  notifications,
  clearNotifications 
}) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  useEffect(() => {
    // Check initial body class
    const isDark = document.body.classList.contains('dark') || 
                   (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.body.classList.add('dark');
      setTheme('dark');
    } else {
      document.body.classList.remove('dark');
      setTheme('light');
    }
  }, []);

  const toggleTheme = () => {
    if (theme === 'dark') {
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setTheme('light');
    } else {
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setTheme('dark');
    }
  };

  return (
    <header className="h-20 border-b border-slate-200 dark:border-darkBorder bg-white/70 dark:bg-darkCard/70 backdrop-blur-md sticky top-0 flex items-center justify-between px-8 transition-colors duration-200 z-10">
      <h2 className="text-xl font-bold font-sans tracking-tight text-slate-800 dark:text-white capitalize">
        {title.replace('-', ' ')}
      </h2>

      <div className="flex items-center gap-6">
        {/* WebSocket Connection indicator */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border transition-all duration-300 ${
          wsConnected 
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
        }`}>
          {wsConnected ? (
            <>
              <Wifi className="h-3.5 w-3.5 animate-pulse" />
              <span>LIVE</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              <span>OFFLINE</span>
            </>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-lg border border-slate-200 dark:border-darkBorder text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150"
          title="Toggle Light/Dark Theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className="p-2.5 rounded-lg border border-slate-200 dark:border-darkBorder text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 relative"
          >
            <Bell className="h-4 w-4" />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-600 animate-ping" />
            )}
          </button>

          {/* Notifications dropdown menu */}
          {showNotifMenu && (
            <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-xl shadow-xl z-20 py-2 animate-fade-in">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-darkBorder">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Notifications</span>
                {notifications.length > 0 && (
                  <button 
                    onClick={() => { clearNotifications(); setShowNotifMenu(false); }}
                    className="text-[10px] text-indigo-500 hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((notif, index) => (
                    <div 
                      key={index}
                      className="px-4 py-3 text-xs border-b last:border-b-0 border-slate-100 dark:border-darkBorder/40 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300"
                    >
                      {notif}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
