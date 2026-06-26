import React, { useEffect, useState } from 'react';
import { useRepoStore } from '../store/repoStore';
import { useReviewStore } from '../store/reviewStore';
import { 
  Plus, 
  Trash2, 
  Play, 
  Clock, 
  AlertCircle, 
  ExternalLink,
  Loader2,
  FolderOpen
} from 'lucide-react';

interface RepositoriesProps {
  onViewReview: (reviewId: number) => void;
}

export const Repositories: React.FC<RepositoriesProps> = ({ onViewReview }) => {
  const { repos, fetchRepos, connectRepo, deleteRepo, analyzeRepo } = useRepoStore();
  const { reviews, fetchReviews } = useReviewStore();
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [owner, setOwner] = useState('');
  const [branch, setBranch] = useState('main');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchRepos();
    fetchReviews();
  }, [fetchRepos, fetchReviews]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name || !url) {
      setFormError('Please enter repository name and clone URL.');
      return;
    }

    const success = await connectRepo(name, url, owner || 'external', branch || 'main');
    if (success) {
      setShowModal(false);
      setName('');
      setUrl('');
      setOwner('');
      setBranch('main');
    }
  };

  const handleAnalyze = async (id: number) => {
    await analyzeRepo(id);
  };

  // Find latest completed review for a repo
  const getLatestReviewId = (repoId: number) => {
    const repoReviews = reviews.filter(r => r.repo === repoId && r.status === 'completed');
    if (repoReviews.length === 0) return null;
    // Sort by date descending
    return repoReviews.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].id;
  };

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header section */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-mono tracking-wider">
            Connected Repositories
          </p>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mt-1">
            Manage your integrated source code projects.
          </h3>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition-all"
        >
          <Plus className="h-4.5 w-4.5" />
          <span>Connect Repository</span>
        </button>
      </div>

      {/* Repos Grid */}
      {repos.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-darkCard rounded-xl border border-slate-200 dark:border-darkBorder">
          <FolderOpen className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
          <h4 className="text-base font-bold text-slate-700 dark:text-slate-300">No repositories integrated</h4>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
            Get started by connecting a Git repository to scan for security flaws and code quality indexes.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Connect your first repo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {repos.map((repo) => {
            const latestReviewId = getLatestReviewId(repo.id);
            return (
              <div 
                key={repo.id}
                className="bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-xl p-6 flex flex-col justify-between hover:shadow-md hover:border-slate-300 dark:hover:border-[#2f3452] transition-all duration-200"
              >
                <div>
                  {/* Language and Delete header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {repo.language}
                    </span>
                    <button
                      onClick={() => deleteRepo(repo.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      title="Delete connection"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Repo Name */}
                  <h4 className="text-lg font-bold text-slate-800 dark:text-white truncate">
                    {repo.name}
                  </h4>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1.5 truncate">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{repo.owner}</span>
                    <span>•</span>
                    <span>{repo.branch}</span>
                  </p>

                  {/* Summary Metrics */}
                  {repo.status === 'active' && repo.score !== undefined ? (
                    <div className="grid grid-cols-2 gap-4 my-6 py-4 border-y border-slate-100 dark:border-darkBorder/40">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">AUDIT SCORE</span>
                        <span className={`text-xl font-black ${
                          repo.score >= 90 
                            ? 'text-emerald-500' 
                            : repo.score >= 70 
                              ? 'text-amber-500' 
                              : 'text-red-500'
                        }`}>
                          {repo.score}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">TOTAL ISSUES</span>
                        <span className="text-xl font-black text-slate-800 dark:text-slate-200">
                          {repo.total_issues}
                        </span>
                      </div>
                    </div>
                  ) : repo.status === 'analyzing' ? (
                    <div className="my-6 py-6 border-y border-slate-100 dark:border-darkBorder/40 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                      <span className="text-xs text-indigo-500 font-semibold">Analyzing codebase files...</span>
                    </div>
                  ) : repo.status === 'failed' ? (
                    <div className="my-6 py-4 border-y border-slate-100 dark:border-darkBorder/40 flex items-center gap-3 text-red-500">
                      <AlertCircle className="h-5 w-5 shrink-0" />
                      <span className="text-xs font-semibold leading-relaxed">Analysis failed. Check your celery tasks or source files.</span>
                    </div>
                  ) : (
                    <div className="my-6 py-8 border-y border-slate-100 dark:border-darkBorder/40 text-center text-xs text-slate-400">
                      Not audited yet. Run analysis to audit code.
                    </div>
                  )}
                </div>

                {/* Audit trigger buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAnalyze(repo.id)}
                    disabled={repo.status === 'analyzing'}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>{repo.status === 'analyzing' ? 'Auditing...' : 'Run Audit'}</span>
                  </button>

                  <button
                    onClick={() => latestReviewId && onViewReview(latestReviewId)}
                    disabled={!latestReviewId || repo.status === 'analyzing'}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-colors disabled:opacity-30 disabled:pointer-events-none disabled:shadow-none"
                  >
                    <span>View Report</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect Repository Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 p-4">
          <div className="bg-white dark:bg-darkCard border border-slate-200 dark:border-darkBorder rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Connect Repository</h3>
            <p className="text-xs text-slate-400 mb-6">
              Connect a GitHub repository profile to sync files and branch references.
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleConnect} className="space-y-4">
              {/* Repository Name Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Select Simulated Repository</label>
                <select
                  value={name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setName(val);
                    // Autofill simulated details
                    if (val === 'express-todo-api') {
                      setUrl('https://github.com/octocat/express-todo-api.git');
                      setOwner('octocat');
                    } else if (val === 'python-log-processor') {
                      setUrl('https://github.com/coder123/python-log-processor.git');
                      setOwner('coder123');
                    } else if (val === 'go-payment-gateway') {
                      setUrl('https://github.com/golang-dev/go-payment-gateway.git');
                      setOwner('golang-dev');
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-darkBorder rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Choose simulated repo template --</option>
                  <option value="express-todo-api">express-todo-api (JavaScript)</option>
                  <option value="python-log-processor">python-log-processor (Python)</option>
                  <option value="go-payment-gateway">go-payment-gateway (Go)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Repository Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. express-todo-api"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-darkBorder rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Repository Clone URL</label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/owner/repo.git"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-darkBorder rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Owner / Org</label>
                  <input
                    type="text"
                    placeholder="octocat"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-darkBorder rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Target Branch</label>
                  <input
                    type="text"
                    placeholder="main"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-darkBorder rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-darkBorder/40">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                >
                  Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
