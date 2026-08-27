'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type TaskSuggestion = {
  id: string;
  title: string;
  description: string | null;
  suggestedAssignee: string | null;
  suggestedDueDate: string | null;
  confidence: number;
  status: 'PENDING' | 'APPROVED' | 'CREATING' | 'CREATED' | 'FAILED';
  clickUpTaskId: string | null;
  clickUpUrl: string | null;
};

type MeetingDetail = {
  id: string;
  title: string;
  description: string | null;
  meetingDate: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage: string | null;
  transcript?: { rawContent: string; wordCount: number } | null;
  analysis?: {
    summary: string;
    decisions: string[];
    actionItems: any[];
    risks: string[];
    blockers: string[];
    openQuestions: string[];
    confidence: number;
  } | null;
  taskSuggestions: TaskSuggestion[];
};

export default function MeetingDetailPage() {
  const params = useParams();
  const meetingId = params.id as string;

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawTranscriptInput, setRawTranscriptInput] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'transcript' | 'decisions'>('overview');
  const [creatingClickUpTaskId, setCreatingClickUpTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskSuggestion | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`);
      const json = await res.json();
      if (json.success) {
        setMeeting(json.data.meeting);
        if (json.data.meeting.transcript?.rawContent) {
          setRawTranscriptInput(json.data.meeting.transcript.rawContent);
        }
      }
    } catch (err) {
      console.error('Failed to fetch meeting detail:', err);
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleSaveTranscript = async () => {
    if (!rawTranscriptInput.trim()) return;
    setIngesting(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawContent: rawTranscriptInput })
      });
      const json = await res.json();
      if (json.success) {
        fetchDetail();
      }
    } catch (err) {
      console.error('Failed to save transcript:', err);
    } finally {
      setIngesting(false);
    }
  };

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/analyze`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        fetchDetail();
      }
    } catch (err) {
      console.error('Failed to analyze meeting:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreateInClickUp = async (taskId: string) => {
    setCreatingClickUpTaskId(taskId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/tasks/${taskId}/clickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clickUpListId: 'mock-list-1' })
      });
      const json = await res.json();
      if (json.success) {
        fetchDetail();
      }
    } catch (err) {
      console.error('Failed to create task in ClickUp:', err);
    } finally {
      setCreatingClickUpTaskId(null);
    }
  };

  const handleSaveEditedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    try {
      const res = await fetch(`/api/meetings/${meetingId}/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingTask.title,
          description: editingTask.description,
          suggestedAssignee: editingTask.suggestedAssignee
        })
      });
      const json = await res.json();
      if (json.success) {
        setEditingTask(null);
        fetchDetail();
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 p-12 text-center text-slate-500">Loading meeting details...</div>;
  }

  if (!meeting) {
    return <div className="min-h-screen bg-slate-950 p-12 text-center text-rose-400">Meeting not found.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Back button & Title Header */}
      <div className="flex items-center justify-between">
        <Link href="/meetings" className="text-xs text-indigo-400 hover:underline flex items-center gap-1">
          ← Back to Meetings
        </Link>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            meeting.status === 'COMPLETED'
              ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
              : meeting.status === 'PROCESSING'
              ? 'bg-blue-950 border border-blue-800 text-blue-400 animate-pulse'
              : 'bg-slate-800 text-slate-400'
          }`}
        >
          {meeting.status}
        </span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white">{meeting.title}</h1>
            <p className="text-xs text-slate-400 mt-1">📅 {new Date(meeting.meetingDate).toLocaleDateString()}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveTranscript}
              disabled={ingesting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            >
              {ingesting ? 'Saving...' : '💾 Save Transcript'}
            </button>

            <button
              onClick={handleRunAnalysis}
              disabled={analyzing || !meeting.transcript}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
            >
              {analyzing ? 'Analyzing...' : '⚡ Run AI Analysis'}
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 gap-4 pt-2 text-xs font-bold text-slate-400">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'overview' ? 'border-indigo-500 text-indigo-400' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'tasks' ? 'border-indigo-500 text-indigo-400' : 'border-transparent hover:text-slate-200'
            }`}
          >
            ClickUp Tasks ({meeting.taskSuggestions.length})
          </button>
          <button
            onClick={() => setActiveTab('decisions')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'decisions' ? 'border-indigo-500 text-indigo-400' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Decisions & Risks
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'transcript' ? 'border-indigo-500 text-indigo-400' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Transcript ({meeting.transcript?.wordCount || 0} words)
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
            <h3 className="text-base font-bold text-white flex items-center gap-2">📝 Executive Summary</h3>
            {meeting.analysis?.summary ? (
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 border border-slate-800 p-4 rounded-xl">
                {meeting.analysis.summary}
              </p>
            ) : (
              <p className="text-xs text-slate-500 italic">No summary generated yet. Click &quot;Run AI Analysis&quot; to extract summary and action items.</p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
            <h3 className="text-base font-bold text-white">📊 Key Metrics</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Analysis Confidence</span>
                <span className="font-bold text-emerald-400">{Math.round((meeting.analysis?.confidence || 0) * 100)}%</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Suggested Action Items</span>
                <span className="font-bold text-indigo-400">{meeting.taskSuggestions.length}</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Decisions Recorded</span>
                <span className="font-bold text-purple-400">{meeting.analysis?.decisions?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-indigo-950/60 border border-indigo-800/80 text-xs text-indigo-200 flex items-center justify-between">
            <span>🛡️ <strong>Human-in-the-Loop Security Rule</strong>: AI suggestions are never created automatically. Review, edit, and click &quot;Create in ClickUp&quot; to push tasks explicitly.</span>
          </div>

          {meeting.taskSuggestions.length === 0 ? (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400">
              No task suggestions found for this meeting.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meeting.taskSuggestions.map((task) => (
                <div key={task.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-lg">
                  <div className="flex items-start justify-between">
                    <h4 className="font-bold text-white text-sm">{task.title}</h4>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        task.status === 'CREATED'
                          ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                          : 'bg-amber-950 border border-amber-800 text-amber-300'
                      }`}
                    >
                      {task.status === 'CREATED' ? '✓ Created in ClickUp' : 'Pending Review'}
                    </span>
                  </div>

                  {task.description && <p className="text-xs text-slate-400">{task.description}</p>}

                  {task.suggestedAssignee && (
                    <p className="text-[11px] text-slate-500">👤 Assignee: <strong className="text-slate-300">{task.suggestedAssignee}</strong></p>
                  )}

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => setEditingTask(task)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      ✏️ Edit Card
                    </button>

                    {task.status === 'CREATED' && task.clickUpUrl ? (
                      <a
                        href={task.clickUpUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-800 text-xs font-bold text-emerald-300 hover:bg-emerald-900"
                      >
                        ↗ Open ClickUp
                      </a>
                    ) : (
                      <button
                        onClick={() => handleCreateInClickUp(task.id)}
                        disabled={creatingClickUpTaskId === task.id}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white disabled:opacity-50 shadow-md shadow-purple-600/20"
                      >
                        {creatingClickUpTaskId === task.id ? 'Creating...' : 'Push to ClickUp'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'decisions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-purple-400">✅ Key Decisions</h3>
            <ul className="space-y-2 text-xs text-slate-300">
              {meeting.analysis?.decisions?.map((d, i) => (
                <li key={i} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">• {d}</li>
              )) || <p className="text-slate-500 italic">No decisions recorded.</p>}
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-rose-400">⚠️ Risks & Blockers</h3>
            <ul className="space-y-2 text-xs text-slate-300">
              {meeting.analysis?.risks?.map((r, i) => (
                <li key={i} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">• {r}</li>
              )) || <p className="text-slate-500 italic">No risks recorded.</p>}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'transcript' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-bold text-white">📜 Raw & Normalized Transcript Input</h3>
          <textarea
            value={rawTranscriptInput}
            onChange={(e) => setRawTranscriptInput(e.target.value)}
            placeholder="Paste meeting transcript here..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 h-96"
          />
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveEditedTask} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Edit Task Card</h3>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Title</label>
              <input
                type="text"
                value={editingTask.title}
                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Description</label>
              <textarea
                value={editingTask.description || ''}
                onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 h-20"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                Save Edits
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
