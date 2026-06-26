import React, { useEffect, useState } from 'react';
import { useReviewStore } from '../store/reviewStore';
import { useAuthStore, API_BASE } from '../store/authStore';
import { Sliders, UserX, AlertTriangle } from 'lucide-react';

export const Settings: React.FC = () => {
  const { rules, fetchRules, updateRule, isLoading } = useReviewStore();
  const { user, getAuthHeaders, logout } = useAuthStore();

  // Profile Form States
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileUsername, setProfileUsername] = useState(user?.username || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profileAvatar, setProfileAvatar] = useState(user?.avatar || '');
  const [profileRole, setProfileRole] = useState(user?.role || 'developer');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync profile details when user is loaded
  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileUsername(user.username || '');
      setProfileEmail(user.email || '');
      setProfileAvatar(user.avatar || '');
      setProfileRole(user.role || 'developer');
    }
  }, [user]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggle = async (ruleId: number, enabled: boolean, severity: string) => {
    await updateRule(ruleId, enabled, severity);
  };

  const handleSeverityChange = async (ruleId: number, enabled: boolean, newSeverity: string) => {
    await updateRule(ruleId, enabled, newSeverity);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSavingProfile(true);
    setProfileSuccess('');
    setProfileError('');

    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/members/${user.id}/`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: profileName.trim(),
          username: profileUsername.trim(),
          email: profileEmail.trim(),
          avatar: profileAvatar.trim(),
          role: profileRole
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        const errMsg = errData.username ? `Username is already taken.` : (errData.email ? `Email is already taken.` : 'Failed to update profile');
        throw new Error(errMsg);
      }

      const updatedUser = await response.json();
      
      // Update local Zustand store and localStorage
      useAuthStore.setState({ user: updatedUser });
      localStorage.setItem('user_profile', JSON.stringify(updatedUser));
      
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => setProfileSuccess(''), 4000);
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!user) return;
    
    const confirmed1 = window.confirm("WARNING: Are you absolutely sure you want to delete your profile? This will permanently delete your user account and all your contributions.");
    if (!confirmed1) return;
    
    const confirmed2 = window.confirm("LAST WARNING: This action CANNOT be undone. Are you sure you want to permanently delete your account?");
    if (!confirmed2) return;
    
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/members/${user.id}/`, {
        method: 'DELETE',
        headers
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete account');
      }
      
      alert("Your profile has been successfully deleted. You will be logged out now.");
      await logout();
    } catch (err: any) {
      alert(`Error deleting profile: ${err.message}`);
    }
  };

  if (isLoading && rules.length === 0) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-[400px] bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Title */}
      <div>
        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-mono tracking-wider">
          Analysis Rules & Policies
        </p>
        <h3 className="text-xl font-bold text-slate-800 dark:text-white mt-1">
          Customize code quality thresholds and static analysis constraints.
        </h3>
      </div>

      {/* Rules list card */}
      <div className="bg-white dark:bg-darkCard rounded-xl border border-slate-200 dark:border-darkBorder overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-darkBorder flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Rules configurations</h4>
          <span className="text-xs text-indigo-500 font-semibold flex items-center gap-1">
            <Sliders className="h-4 w-4" />
            <span>Changes persist immediately</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-mono tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-darkBorder">
                <th className="px-6 py-4">Rule Name</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Target Severity</th>
                <th className="px-6 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/40 text-sm">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                    {rule.name}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 max-w-sm">
                    {rule.description}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {rule.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={rule.severity}
                      onChange={(e) => handleSeverityChange(rule.id, rule.enabled, e.target.value)}
                      className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => handleToggle(rule.id, e.target.checked, rule.severity)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profile Settings Card */}
      <div className="bg-white dark:bg-darkCard rounded-xl border border-slate-200 dark:border-darkBorder overflow-hidden animate-fade-in">
        <div className="p-6 border-b border-slate-200 dark:border-darkBorder flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Profile Management</h4>
          <span className="text-xs text-slate-400 font-semibold font-mono">EDIT DETAILS</span>
        </div>

        <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
          {profileError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
              {profileError}
            </div>
          )}
          {profileSuccess && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              {profileSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Username / Nickname</label>
              <input
                type="text"
                required
                value={profileUsername}
                onChange={(e) => setProfileUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Avatar Image URL</label>
              <input
                type="url"
                value={profileAvatar}
                onChange={(e) => setProfileAvatar(e.target.value)}
                className="w-full px-3 py-2 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none font-medium"
                placeholder="https://api.dicebear.com/..."
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-darkBorder/40">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Platform Role</label>
              <select
                value={profileRole}
                onChange={(e) => setProfileRole(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-55 dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none font-medium"
              >
                <option value="developer">Developer</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isSavingProfile}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 text-white px-5 py-2.5 rounded-lg text-xs font-semibold transition-colors shadow-md shadow-indigo-600/10"
            >
              {isSavingProfile ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone: Account deletion */}
      <div className="bg-white dark:bg-darkCard rounded-xl border border-red-200 dark:border-red-950/30 overflow-hidden animate-fade-in">
        <div className="p-6 border-b border-red-100 dark:border-red-950/20 bg-red-50/20 dark:bg-red-950/5 flex items-center justify-between">
          <h4 className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4.5 w-4.5" />
            <span>Danger Zone</span>
          </h4>
          <span className="text-xs text-red-500 font-semibold font-mono">ACCOUNT MANAGEMENT</span>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200">Delete Account Profile</h5>
              <p className="text-xs text-slate-400 max-w-lg">
                Permanently delete your developer profile, authorization access, and collaborator settings. This action is irreversible.
              </p>
            </div>
            <button
              onClick={handleDeleteProfile}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-650 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-red-900/10 shrink-0"
            >
              <UserX className="h-4 w-4" />
              <span>Delete Profile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
