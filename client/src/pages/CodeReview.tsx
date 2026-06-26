import React, { useEffect, useState } from 'react';
import { useReviewStore } from '../store/reviewStore';
import type { Issue } from '../store/reviewStore';
import { 
  ArrowLeft, 
  CheckCircle, 
  MessageSquare,
  Sparkles, 
  FileJson, 
  Printer, 
  Code,
  CornerDownRight,
  X,
  Edit3,
  Save
} from 'lucide-react';

interface CodeReviewProps {
  reviewId: number;
  onBack: () => void;
}

export const CodeReview: React.FC<CodeReviewProps> = ({ reviewId, onBack }) => {
  const { 
    activeReview, 
    fetchReviewDetails, 
    resolveIssue, 
    postComment, 
    applyAiFix, 
    updateFileContent,
    updateFileLocally,
    addWsListener,
    removeWsListener,
    isLoading 
  } = useReviewStore();

  const [selectedFile, setSelectedFile] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);
  
  // Custom edit file states
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>('');

  // AI Fix diff preview states
  const [previewFix, setPreviewFix] = useState<{
    issueId: number;
    line: number;
    original: string;
    fixed: string;
  } | null>(null);

  useEffect(() => {
    fetchReviewDetails(reviewId);
    setSelectedFile('');
    setIsEditing(false);
  }, [reviewId]);

  // Set default selected file once details load
  useEffect(() => {
    if (activeReview && activeReview.files.length > 0 && !selectedFile) {
      setSelectedFile(activeReview.files[0].filepath);
    }
  }, [activeReview, selectedFile]);

  // Sync active file content to editContent state
  useEffect(() => {
    if (activeReview) {
      const activeFileObject = activeReview.files.find(f => f.filepath === selectedFile);
      if (activeFileObject) {
        setEditContent(activeFileObject.content);
      }
    }
  }, [selectedFile, activeReview]);

  // Real-time collaborative edit sync via WebSockets
  useEffect(() => {
    const handleWsEvent = (event: any) => {
      if (event.type === 'FILE_UPDATED' && event.reviewId === reviewId) {
        updateFileLocally(event.filepath, event.content);
        if (event.filepath === selectedFile) {
          setEditContent(event.content);
        }
      } else if (event.type === 'ANALYSIS_COMPLETED' && event.reviewId === reviewId) {
        fetchReviewDetails(reviewId);
      }
    };
    addWsListener(handleWsEvent);
    return () => removeWsListener(handleWsEvent);
  }, [reviewId, selectedFile, addWsListener, removeWsListener, updateFileLocally, fetchReviewDetails]);

  if (isLoading || !activeReview) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[500px]">
          <div className="h-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-full bg-slate-200 dark:bg-slate-800 rounded-xl md:col-span-2" />
          <div className="h-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  const { review, issues, metrics, comments, files } = activeReview;

  // Retrieve current active file content and metrics
  const activeFileObject = files.find(f => f.filepath === selectedFile);
  const activeFileContent = activeFileObject ? activeFileObject.content : '';
  const activeFileMetrics = metrics.find(m => m.filepath === selectedFile);
  const activeFileIssues = issues.filter(i => i.filepath === selectedFile && i.status === 'open');

  // Filter issues based on dropdowns
  const filteredIssues = activeFileIssues.filter(i => {
    if (severityFilter === 'all') return true;
    return i.severity === severityFilter;
  });

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'border-red-500 bg-red-500/10 text-red-500';
      case 'high': return 'border-orange-500 bg-orange-500/10 text-orange-500';
      case 'medium': return 'border-amber-500 bg-amber-500/10 text-amber-500';
      case 'low': return 'border-emerald-500 bg-emerald-500/10 text-emerald-500';
      default: return 'border-slate-500 bg-slate-500/10 text-slate-500';
    }
  };

  const handlePostComment = async (lineNum: number) => {
    const text = commentInputs[lineNum];
    if (!text || !text.trim()) return;

    await postComment(reviewId, selectedFile, lineNum, text);
    
    // Clear state
    setCommentInputs(prev => ({ ...prev, [lineNum]: '' }));
    setActiveCommentLine(null);
  };

  const triggerAiFix = async (issue: Issue) => {
    const fixResult = await applyAiFix(issue.id);
    if (fixResult) {
      setPreviewFix({
        issueId: issue.id,
        line: issue.line,
        original: fixResult.originalCode,
        fixed: fixResult.fixedCode
      });
    }
  };

  const acceptFixPatch = async () => {
    if (!previewFix || !activeFileObject) return;
    
    // Update local file contents in memory to reflect fixed state
    const lines = activeFileContent.split('\n');
    lines[previewFix.line - 1] = previewFix.fixed;
    const newContent = lines.join('\n');
    activeFileObject.content = newContent;
    
    // Save to backend database
    await updateFileContent(reviewId, selectedFile, newContent);
    
    // Clear preview
    setPreviewFix(null);
  };

  // Export report actions
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(activeReview, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `code-review-report-${review.commit_hash.substring(0,8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] animate-fade-in print:bg-white print:text-black">
      {/* Review details top bar */}
      <div className="px-8 py-4 border-b border-slate-200 dark:border-darkBorder bg-white dark:bg-darkCard flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                Review Report
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                COMMIT {review.commit_hash.substring(0, 8)}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Audited by {review.author} on {new Date(review.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Aggregate score circle & exports */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase">QUALITY SCORE</span>
            <div className={`h-11 w-11 rounded-full flex items-center justify-center text-sm font-black border-2 ${
              review.score >= 90 
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10' 
                : review.score >= 70 
                  ? 'border-amber-500 text-amber-500 bg-amber-500/10' 
                  : 'border-red-500 text-red-500 bg-red-500/10'
            }`}>
              {review.score}%
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-darkBorder" />

          {/* Export buttons */}
          <div className="flex gap-2">
            <button
              onClick={exportJson}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <FileJson className="h-3.5 w-3.5" />
              <span>JSON Export</span>
            </button>
            <button
              onClick={exportPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>PDF Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main three-panel review container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel 1: File browser (Left) */}
        <div className="w-80 border-r border-slate-200 dark:border-darkBorder bg-white dark:bg-darkCard flex flex-col overflow-y-auto print:hidden">
          <div className="p-4 border-b border-slate-100 dark:border-darkBorder/40">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PROJECT FILES</span>
          </div>
          <div className="p-2 space-y-1">
            {files.map((file) => {
              const fileMetrics = metrics.find(m => m.filepath === file.filepath);
              const fileIssues = issues.filter(i => 
                i.filepath === file.filepath && 
                i.status === 'open' &&
                !i.code_snippet.includes('Code Quality Audit Passed') &&
                !i.code_snippet.includes('Repository is empty')
              );
              const isSelected = file.filepath === selectedFile;

              return (
                <button
                  key={file.filepath}
                  onClick={() => { setSelectedFile(file.filepath); setPreviewFix(null); }}
                  className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                    isSelected 
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white' 
                      : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Code className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold truncate">{file.filepath.split('/').pop()}</p>
                      <span className="text-[9px] text-slate-400 font-mono block mt-0.5 truncate">{file.filepath}</span>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5">
                    {fileMetrics && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-900 text-slate-500">
                        {fileMetrics.loc} LOC
                      </span>
                    )}
                    {fileIssues.length > 0 && (
                      <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold flex items-center justify-center border border-red-500/20">
                        {fileIssues.length}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel 2: Interactive Editor & Diff (Middle) */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          {/* File metrics header banner */}
          <div className="px-6 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono print:hidden">
            <div className="flex items-center gap-3 min-w-0">
              <span className="truncate max-w-[120px] sm:max-w-xs md:max-w-md font-mono shrink">Path: {selectedFile}</span>
              <button
                onClick={() => {
                  if (isEditing) {
                    setIsEditing(false);
                  } else {
                    setIsEditing(true);
                    setEditContent(activeFileContent);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap shrink-0 transition-all border ${
                  isEditing 
                    ? 'bg-amber-600/20 text-amber-400 border-amber-500/20 hover:bg-amber-600/30' 
                    : 'bg-slate-800/80 text-slate-300 border-slate-700/50 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>{isEditing ? 'Cancel Edit' : 'Edit File'}</span>
              </button>
            </div>
            {activeFileMetrics && (
              <div className="flex gap-4 items-center">
                <span>Complexity: <strong className="text-slate-200">{activeFileMetrics.complexity}</strong></span>
                <span>Maintainability: <strong className="text-slate-200">{activeFileMetrics.maintainability}%</strong></span>
                <span>Coverage: <strong className="text-slate-200">{activeFileMetrics.coverage}%</strong></span>
              </div>
            )}
          </div>

          {/* Code Viewer body */}
          <div className="flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed text-slate-300">
            {isEditing ? (
              <div className="flex flex-col h-full gap-4">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 min-h-[400px] w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-sm leading-relaxed"
                  spellCheck={false}
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const success = await updateFileContent(reviewId, selectedFile, editContent);
                      if (success) {
                        setIsEditing(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow transition-colors"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            ) : (
              activeFileContent.split('\n').map((lineCode, index) => {
                const lineNum = index + 1;
                
                // Find if this line has comments
                const lineComments = comments.filter(c => c.filepath === selectedFile && c.line === lineNum);

                // Find if this line has an issue
                const lineIssue = issues.find(i => i.filepath === selectedFile && i.line === lineNum && i.status === 'open');

                // Check if AI fix is previewing on this line
                const isDiffPreviewLine = previewFix && previewFix.line === lineNum;

                // Build severity color highlighting
                let lineBgClass = '';
                if (lineIssue) {
                  if (lineIssue.severity === 'critical') lineBgClass = 'bg-red-500/10 border-l-2 border-red-500';
                  else if (lineIssue.severity === 'high') lineBgClass = 'bg-orange-500/10 border-l-2 border-orange-500';
                  else if (lineIssue.severity === 'medium') lineBgClass = 'bg-amber-500/10 border-l-2 border-amber-500';
                  else if (lineIssue.severity === 'low') lineBgClass = 'bg-emerald-500/10 border-l-2 border-emerald-500';
                }

                return (
                  <div key={lineNum} className="flex flex-col">
                    {/* Normal line or highlighted issue line */}
                    {!isDiffPreviewLine ? (
                      <div 
                        className={`group flex items-start py-0.5 hover:bg-slate-900/60 transition-colors ${lineBgClass}`}
                        style={{ contentVisibility: 'auto' }}
                      >
                        {/* Plus button to comment */}
                        <button
                          onClick={() => setActiveCommentLine(activeCommentLine === lineNum ? null : lineNum)}
                          className="opacity-0 group-hover:opacity-100 px-1 text-slate-500 hover:text-indigo-400 shrink-0 transition-opacity print:hidden"
                          title="Add comment"
                        >
                          <MessageSquare className="h-3.5 w-3.5 mt-0.5" />
                        </button>

                        {/* Line Number */}
                        <span className="code-line-number text-slate-600 mr-4 font-mono select-none">
                          {lineNum}
                        </span>

                        {/* Code line text */}
                        <pre className="m-0 overflow-x-auto whitespace-pre-wrap flex-1 text-slate-300 dark:text-slate-100 font-mono">
                          {lineCode || ' '}
                        </pre>
                      </div>
                    ) : (
                      /* AI Fix Diff Preview Mode */
                      <div className="flex flex-col border border-indigo-500/30 rounded-lg overflow-hidden my-2">
                        <div className="bg-indigo-950/40 px-4 py-1.5 flex items-center justify-between text-xs text-indigo-400 border-b border-indigo-500/20">
                          <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> AI Fix Suggestion</span>
                          <div className="flex gap-2">
                            <button 
                              onClick={acceptFixPatch}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded text-[10px] font-bold"
                            >
                              Apply Fix
                            </button>
                            <button 
                              onClick={() => setPreviewFix(null)}
                              className="text-slate-400 hover:text-slate-200"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Red Deletions */}
                        <div className="bg-red-950/20 text-red-400 flex items-start py-1">
                          <span className="code-line-number text-red-500/40 mr-4 select-none">-</span>
                          <pre className="m-0 whitespace-pre-wrap font-mono">{previewFix?.original}</pre>
                        </div>

                        {/* Green Additions */}
                        <div className="bg-emerald-950/20 text-emerald-400 flex items-start py-1">
                          <span className="code-line-number text-emerald-500/40 mr-4 select-none">+</span>
                          <pre className="m-0 whitespace-pre-wrap font-mono">{previewFix?.fixed}</pre>
                        </div>
                      </div>
                    )}

                    {/* Inline comments thread list */}
                    {lineComments.length > 0 && (
                      <div className="pl-14 py-2 space-y-2 border-l border-slate-800 bg-slate-900/30">
                        {lineComments.map((c) => (
                          <div key={c.id} className="flex gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 max-w-2xl">
                            <img
                              src={c.user_details.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=Admin'}
                              alt="Avatar"
                              className="w-7 h-7 rounded-full shrink-0 bg-slate-800"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-200">{c.user_details.name}</span>
                                <span className="text-[9px] text-slate-500">{new Date(c.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">{c.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Comment Input Box */}
                    {activeCommentLine === lineNum && (
                      <div className="pl-14 py-3 bg-slate-900/20 border-l border-slate-800 flex flex-col gap-2 max-w-xl">
                        <textarea
                          rows={2}
                          placeholder="Write a comment or suggestions..."
                          value={commentInputs[lineNum] || ''}
                          onChange={(e) => setCommentInputs(prev => ({ ...prev, [lineNum]: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setActiveCommentLine(null)}
                            className="px-2.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-300"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handlePostComment(lineNum)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-[10px] font-semibold"
                          >
                            Send Comment
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel 3: Issue Card details list (Right) */}
        <div className="w-96 border-l border-slate-200 dark:border-darkBorder bg-white dark:bg-darkCard flex flex-col overflow-hidden print:hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-100 dark:border-darkBorder/40 flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CODE FINDINGS</span>
            <div className="flex gap-2">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical Only</option>
                <option value="high">High Only</option>
                <option value="medium">Medium Only</option>
                <option value="low">Low Only</option>
              </select>
            </div>
          </div>

          {/* Cards List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {filteredIssues.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <CheckCircle className="h-8 w-8 text-emerald-500/40" />
                <span>Zero open issues matching filter criteria.</span>
              </div>
            ) : (
              filteredIssues.map((issue) => (
                <div 
                  key={issue.id}
                  className={`border rounded-xl p-4 space-y-3 transition-shadow hover:shadow-md ${
                    issue.severity === 'critical' ? 'border-red-500/20 bg-red-500/[0.02]' :
                    issue.severity === 'high' ? 'border-orange-500/20 bg-orange-500/[0.02]' :
                    issue.severity === 'medium' ? 'border-amber-500/20 bg-amber-500/[0.02]' :
                    'border-emerald-500/20 bg-emerald-500/[0.02]'
                  }`}
                >
                  {/* Badge & Category Header */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${getSeverityColor(issue.severity)}`}>
                      {issue.severity}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono uppercase">{issue.category}</span>
                  </div>

                  {/* Message & Line coordinates */}
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                    {issue.message}
                  </p>

                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                    <CornerDownRight className="h-3 w-3" />
                    <span>Line {issue.line}</span>
                  </div>

                  {/* Action buttons (Resolve & AI Fix) */}
                  <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-darkBorder/40">
                    <button
                      onClick={() => resolveIssue(issue.id, 'resolved')}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <CheckCircle className="h-3.5 w-3.5 text-slate-500" />
                      <span>Resolve</span>
                    </button>

                    <button
                      onClick={() => triggerAiFix(issue)}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold shadow-sm hover:shadow transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Fix with AI</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
