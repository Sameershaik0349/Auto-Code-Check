import React, { useEffect, useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend
} from 'recharts';
import { useAuthStore, API_BASE } from '../store/authStore';
import { BarChart3, TrendingUp, Award } from 'lucide-react';

export const Analytics: React.FC = () => {
  const { getAuthHeaders } = useAuthStore();
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const headers = getAuthHeaders();
        const response = await fetch(`${API_BASE}/analytics/trends/`, { headers });
        const data = await response.json();
        setTrends(data);
      } catch (err) {
        console.error('Failed to load trends data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
          <div className="h-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Page Title */}
      <div>
        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-mono tracking-wider">
          Code Analytics & Audits
        </p>
        <h3 className="text-xl font-bold text-slate-800 dark:text-white mt-1">
          Historical quality insights and health logs.
        </h3>
      </div>

      {/* Analytics stats banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-xl text-white shadow-lg">
          <Award className="h-8 w-8 mb-3" />
          <h4 className="text-2xl font-bold">Grade A Quality</h4>
          <p className="text-xs text-indigo-100 mt-1 leading-relaxed">
            Your average repository score is 92%, indicating excellent compliance with coding conventions and safety patterns.
          </p>
        </div>
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-semibold block mb-1">COMPLEXITY INDEX</span>
            <span className="text-2xl font-black text-slate-800 dark:text-white">7 Low Risk</span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">Average cyclomatic complexity per function.</p>
          </div>
        </div>
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-semibold block mb-1">ISSUE RESOLUTION TIME</span>
            <span className="text-2xl font-black text-slate-800 dark:text-white">4.2 hours</span>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">Average time to apply and accept code suggestions.</p>
          </div>
        </div>
      </div>

      {/* Grid containing trends charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Quality Score Progress Chart */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-6 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            <span>Code Audit Score Progress</span>
          </h4>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2235" vertical={false} className="hidden dark:block" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[60, 100]} stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: '#121420', 
                    borderColor: '#1f2235', 
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px'
                  }} 
                />
                <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5} fill="#6366f1" fillOpacity={0.06} name="Quality index" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Complexity vs Findings Trend */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-xl border border-slate-200 dark:border-darkBorder">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-6 flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-indigo-500" />
            <span>Complexity & Open Findings Volume</span>
          </h4>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2235" vertical={false} className="hidden dark:block" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: '#121420', 
                    borderColor: '#1f2235', 
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px'
                  }} 
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="complexity" stroke="#f59e0b" strokeWidth={2.5} name="Cyclomatic complexity" />
                <Line type="monotone" dataKey="issues" stroke="#ef4444" strokeWidth={2.5} name="Open Issues" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
