import React, { useEffect, useState } from 'react';
import { 
  GitBranch, 
  Layers, 
  FileCode, 
  Compass, 
  Activity, 
  Calendar,
  User,
  ArrowUpRight
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { API_BASE, useAuthStore } from '../store/authStore';
import { useReviewStore } from '../store/reviewStore';

interface Stats {
  repositoriesCount: number;
  reviewsCount: number;
  filesAnalyzed: number;
  linesOfCode: number;
  averageMaintainability: number;
  issuesBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

interface DashboardProps {
  onViewReview: (reviewId: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onViewReview }) => {
  const { getAuthHeaders } = useAuthStore();
  const { reviews, fetchReviews } = useReviewStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const headers = getAuthHeaders();
        // Fetch stats
        const statsResp = await fetch(`${API_BASE}/analytics/stats/`, { headers });
        if (statsResp.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        if (!statsResp.ok) throw new Error('Failed to load dashboard statistics');
        const statsData = await statsResp.json();
        setStats(statsData);

        // Fetch trends
        const trendsResp = await fetch(`${API_BASE}/analytics/trends/`, { headers });
        if (trendsResp.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        if (!trendsResp.ok) throw new Error('Failed to load dashboard trends');
        const trendsData = await trendsResp.json();
        setTrends(trendsData);

        // Fetch reviews
        await fetchReviews();
      } catch (err) {
        console.error('Failed to load dashboard statistics', err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, [fetchReviews]);

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  // Issue chart coloring
  const severityColors = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#10b981'
  };

  const barData = stats ? [
    { name: 'Critical', count: stats.issuesBreakdown.critical, fill: severityColors.critical },
    { name: 'High', count: stats.issuesBreakdown.high, fill: severityColors.high },
    { name: 'Medium', count: stats.issuesBreakdown.medium, fill: severityColors.medium },
    { name: 'Low', count: stats.issuesBreakdown.low, fill: severityColors.low }
  ] : [];

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Repos */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
              Active Repositories
            </span>
            <h3 className="text-3xl font-extrabold text-slate-800 dark:text-white">
              {stats?.repositoriesCount || 0}
            </h3>
          </div>
          <div className="p-3.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
            <GitBranch className="h-6 w-6" />
          </div>
        </div>

        {/* Total Reviews */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
              Completed Reviews
            </span>
            <h3 className="text-3xl font-extrabold text-slate-800 dark:text-white">
              {stats?.reviewsCount || 0}
            </h3>
          </div>
          <div className="p-3.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        {/* Lines of Code */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
              Lines of Code Scanned
            </span>
            <h3 className="text-3xl font-extrabold text-slate-800 dark:text-white">
              {stats?.linesOfCode ? stats.linesOfCode.toLocaleString() : '0'}
            </h3>
          </div>
          <div className="p-3.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <FileCode className="h-6 w-6" />
          </div>
        </div>

        {/* Average Maintainability */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
              Maintainability Index
            </span>
            <h3 className="text-3xl font-extrabold text-slate-800 dark:text-white">
              {stats?.averageMaintainability || 100}%
            </h3>
          </div>
          <div className="p-3.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
            <Compass className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend chart */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Code Quality Trend</h4>
            <div className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
              <Activity className="h-4 w-4" />
              <span>+16% improve</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis domain={[50, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#121420', 
                    borderColor: '#1f2235', 
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px'
                  }} 
                />
                <Area type="monotone" dataKey="score" name="Quality Score" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Severity chart */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-6">Open Findings by Severity</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ 
                    backgroundColor: '#121420', 
                    borderColor: '#1f2235', 
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px'
                  }} 
                />
                <Bar dataKey="count" name="Open Issues" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Reviews Table */}
      <div className="bg-white dark:bg-darkCard rounded-xl border border-slate-200 dark:border-darkBorder overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-darkBorder">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Recent Completed Reviews</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-mono tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-darkBorder">
                <th className="px-6 py-4">Analyzed Date</th>
                <th className="px-6 py-4">Commit / Hash</th>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4">Triggered By</th>
                <th className="px-6 py-4">Quality Score</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkBorder/40 text-sm">
              {reviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No code reviews completed yet. Connect a repository and trigger your first analysis!
                  </td>
                </tr>
              ) : (
                reviews.map((review) => (
                  <tr key={review.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {new Date(review.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                      {review.commit_hash.substring(0, 8)}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                      {review.branch}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      {review.author}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        review.score >= 90 
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                          : review.score >= 70 
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' 
                            : 'bg-red-500/10 text-red-600 dark:text-red-400'
                      }`}>
                        {review.score}% Score
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => onViewReview(review.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:text-indigo-600 transition-colors"
                      >
                        <span>View Report</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
