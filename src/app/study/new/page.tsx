'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewStudySessionPage() {
  const router = useRouter();
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string>('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState<string>('');

  const [goal, setGoal] = useState<string>('DEEP_UNDERSTANDING');
  const [difficulty, setDifficulty] = useState<string>('BEGINNER');
  const [learningStyle, setLearningStyle] = useState<string>('MIXED');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [externalWebEnabled, setExternalWebEnabled] = useState<boolean>(false);

  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadResources() {
      try {
        const [kbRes, rmRes, docRes] = await Promise.all([
          fetch('/api/knowledge-bases'),
          fetch('/api/roadmaps'),
          fetch('/api/documents')
        ]);

        const kbData = await kbRes.json();
        const rmData = await rmRes.json();
        const docData = await docRes.json();

        if (kbData.success) setKnowledgeBases(kbData.data || []);
        if (rmData.success) setRoadmaps(rmData.data || []);
        if (docData.success) setDocuments(docData.data || []);
      } catch (err) {
        console.error('Failed to load user resources', err);
      }
    }
    loadResources();
  }, []);

  const handleCreateSession = async () => {
    setErrorMsg(null);
    setCreating(true);

    try {
      const res = await fetch('/api/study/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle,
          knowledgeBaseId: selectedKbId || undefined,
          roadmapId: selectedRoadmapId || undefined,
          documentIds: selectedDocIds,
          goal,
          difficulty,
          learningStyle,
          durationMinutes,
          externalWebEnabled
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create study session');
      }

      // Start the session to generate initial topics & questions
      const startRes = await fetch(`/api/study/sessions/${data.data.id}/start`, {
        method: 'POST'
      });
      const startData = await startRes.json();

      if (!startRes.ok || !startData.success) {
        throw new Error(startData.error || 'Failed to initialize study topics');
      }

      router.push(`/study/${data.data.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred');
      setCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Create Study Session</h1>
        <p className="text-xs text-slate-400 mt-1">
          Select your authorized knowledge sources, set your learning goals, and start grounded tutoring.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
          ⚠️ {errorMsg}
        </div>
      )}

      <div className="space-y-6 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">Study Session Title (Optional)</label>
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="e.g. React RSC & Architecture Deep Dive"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Source Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Select Knowledge Base</label>
            <select
              value={selectedKbId}
              onChange={(e) => setSelectedKbId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">None / Custom Documents</option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Select Roadmap</label>
            <select
              value={selectedRoadmapId}
              onChange={(e) => setSelectedRoadmapId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">None</option>
              {roadmaps.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Documents Multi-Select */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">Select Individual Documents</label>
          <div className="max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
            {documents.length === 0 ? (
              <p className="text-[11px] text-slate-500">No standalone documents found.</p>
            ) : (
              documents.map((doc) => (
                <label key={doc.id} className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(doc.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedDocIds([...selectedDocIds, doc.id]);
                      else setSelectedDocIds(selectedDocIds.filter((id) => id !== doc.id));
                    }}
                    className="rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{doc.filename}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Goal */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">Learning Goal</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { value: 'DEEP_UNDERSTANDING', label: 'Understand Deeply' },
              { value: 'EXAM_PREPARATION', label: 'Prepare for Exam' },
              { value: 'INTERVIEW_PREP', label: 'Interview Prep' },
              { value: 'QUICK_REVISION', label: 'Quick Revision' },
              { value: 'CERTIFICATION_PREP', label: 'Certification' }
            ].map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGoal(g.value)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                  goal === g.value
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty & Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Difficulty</label>
            <div className="flex space-x-2">
              {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                    difficulty === d
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Learning Style</label>
            <select
              value={learningStyle}
              onChange={(e) => setLearningStyle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="EXPLANATION">Explanation-first</option>
              <option value="SOCRATIC">Socratic Questioning</option>
              <option value="QUIZ_FIRST">Quiz-first</option>
              <option value="MIXED">Mixed Adaptive</option>
            </select>
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">Session Duration</label>
          <div className="flex space-x-2">
            {[15, 30, 60].map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => setDurationMinutes(dur)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                  durationMinutes === dur
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                {dur} Minutes
              </button>
            ))}
          </div>
        </div>

        {/* External Web Switch */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800">
          <div>
            <span className="text-xs font-semibold text-white">External Web Research</span>
            <p className="text-[11px] text-slate-400">Allow web search fallback if local documents do not contain evidence.</p>
          </div>
          <input
            type="checkbox"
            checked={externalWebEnabled}
            onChange={(e) => setExternalWebEnabled(e.target.checked)}
            className="w-4 h-4 text-indigo-600 rounded bg-slate-900 border-slate-800 focus:ring-indigo-500"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleCreateSession}
          disabled={creating}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
        >
          {creating ? 'Initializing Study Session...' : 'Start Study Session 🚀'}
        </button>
      </div>
    </div>
  );
}
