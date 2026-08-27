'use client';

import { useState, useEffect, useCallback } from 'react';

type ConfigItem = {
  id: string;
  key: string;
  value: string;
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ARRAY';
  category: string;
  purpose: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  version: number;
  isEditable: boolean;
  isHighImpact: boolean;
  requiresRestart: boolean;
  updatedAt: string;
};

type IntegrationStatusItem = {
  providerName: string;
  purpose: string;
  configured: boolean;
  enabled: boolean;
  connectionStatus: 'HEALTHY' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  managedBy: string;
};

const CATEGORIES = [
  'ALL',
  'SYSTEM',
  'RAG',
  'LLM',
  'CACHE',
  'RETRIEVAL',
  'DOCUMENT',
  'MULTIMODAL',
  'OCR',
  'WORKER',
  'QUEUE',
  'MEETING',
  'CLICKUP',
  'FEATURE_FLAG',
  'PERFORMANCE',
  'SECURITY',
  'OTHER'
];

export default function EnterpriseAdminControlCenter() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<
    'overview' | 'configs' | 'flags' | 'providers' | 'integrations' | 'infrastructure' | 'audit'
  >('overview');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [highImpactFilter, setHighImpactFilter] = useState(false);

  // Modals & Editing
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newValueType, setNewValueType] = useState<ConfigItem['valueType']>('STRING');
  const [newCategory, setNewCategory] = useState('RAG');
  const [newPurpose, setNewPurpose] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // High Impact Confirmation Dialog
  const [confirmationPendingConfig, setConfirmationPendingConfig] = useState<{
    config: ConfigItem;
    newValue: string;
  } | null>(null);
  const [confirmInputText, setConfirmInputText] = useState('');

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/config');
      if (res.status === 403) {
        setError('Access denied: Administrator privileges required (403 Forbidden).');
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setConfigs(json.data.configs);
      }
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/config/integrations/status');
      const json = await res.json();
      if (json.success) {
        setIntegrations(json.data.integrations);
      }
    } catch (err) {
      console.error('Failed to fetch integration status:', err);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
    fetchIntegrations();
  }, [fetchConfigs, fetchIntegrations]);

  const handleCreateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim() || !newPurpose.trim()) return;

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKey.trim().toUpperCase(),
          value: newValue,
          valueType: newValueType,
          category: newCategory,
          purpose: newPurpose,
          description: newDescription
        })
      });
      const json = await res.json();
      if (json.success) {
        setIsCreateModalOpen(false);
        setNewKey('');
        setNewValue('');
        setNewPurpose('');
        setNewDescription('');
        fetchConfigs();
      } else {
        alert(`Creation Error: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Failed to create config:', err);
    }
  };

  const initiateUpdateConfig = (config: ConfigItem) => {
    setEditingConfig(config);
    setEditValue(config.value);
    setEditPurpose(config.purpose);
    setEditDescription(config.description || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConfig) return;

    if (editingConfig.isHighImpact && editValue !== editingConfig.value) {
      setConfirmationPendingConfig({ config: editingConfig, newValue: editValue });
      setConfirmInputText('');
      return;
    }

    await executeSaveConfig(editingConfig.key, editValue, editPurpose, editDescription, editingConfig.version);
  };

  const executeSaveConfig = async (key: string, val: string, purp: string, desc: string, version: number) => {
    try {
      const res = await fetch(`/api/admin/config/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: val, purpose: purp, description: desc, expectedVersion: version })
      });

      if (res.status === 409) {
        const conflictJson = await res.json();
        alert(`⚠️ 409 Conflict Error: ${conflictJson.error?.message}`);
        fetchConfigs();
        setEditingConfig(null);
        setConfirmationPendingConfig(null);
        return;
      }

      const json = await res.json();
      if (json.success) {
        setEditingConfig(null);
        setConfirmationPendingConfig(null);
        fetchConfigs();
      } else {
        alert(`Update Error: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  const handleToggleStatus = async (key: string, currentStatus: boolean, version: number) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    try {
      const res = await fetch(`/api/admin/config/${key}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: version })
      });

      if (res.status === 409) {
        const conflictJson = await res.json();
        alert(`⚠️ 409 Conflict: ${conflictJson.error?.message}`);
        fetchConfigs();
        return;
      }

      const json = await res.json();
      if (json.success) {
        fetchConfigs();
      } else {
        alert(`Status Change Error: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const filteredConfigs = configs.filter((c) => {
    const matchesSearch =
      c.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.purpose.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'ALL' || c.category === selectedCategory;
    const matchesStatus =
      statusFilter === 'ALL' || (statusFilter === 'ACTIVE' && c.isActive) || (statusFilter === 'INACTIVE' && !c.isActive);

    const matchesHighImpact = !highImpactFilter || c.isHighImpact;

    return matchesSearch && matchesCategory && matchesStatus && matchesHighImpact;
  });

  const featureFlags = configs.filter((c) => c.category === 'FEATURE_FLAG' || c.key.endsWith('_ENABLED'));
  const aiProviderConfigs = configs.filter((c) => c.category === 'LLM');

  const totalActive = configs.filter((c) => c.isActive).length;
  const totalInactive = configs.filter((c) => !c.isActive).length;
  const totalHighImpact = configs.filter((c) => c.isHighImpact).length;

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-12 flex flex-col items-center justify-center space-y-4">
        <span className="text-4xl">🛑</span>
        <h2 className="text-xl font-bold text-rose-400">403 Forbidden</h2>
        <p className="text-xs text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Top Header & Navigation Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <h1 className="text-2xl font-extrabold text-white">Enterprise Configuration Control Center</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Centralized governance, secret isolation, optimistic concurrency, multi-instance Redis Pub/Sub invalidation & feature flag management.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right border-r border-slate-800 pr-4 hidden sm:block">
              <span className="text-[10px] text-slate-500 font-mono">ENFORCEMENT</span>
              <p className="text-xs text-emerald-400 font-bold">🔒 Secrets in .env only</p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
            >
              + Add Configuration
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-slate-800 gap-6 text-xs font-bold text-slate-400 pt-2 no-scrollbar">
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'configs', label: `⚙️ Runtime Configs (${configs.length})` },
            { id: 'flags', label: `🚩 Feature Flags (${featureFlags.length})` },
            { id: 'providers', label: `🤖 AI Providers (${aiProviderConfigs.length})` },
            { id: 'integrations', label: `🔗 Integrations (${integrations.length})` },
            { id: 'infrastructure', label: '🏗️ Infrastructure Status' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2 border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-lg">
              <span className="text-xs text-slate-400 font-semibold">Total Governance Keys</span>
              <p className="text-3xl font-extrabold text-white">{configs.length}</p>
              <p className="text-[10px] text-slate-500 mt-1">Configured in PostgreSQL & Registry</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-lg">
              <span className="text-xs text-slate-400 font-semibold">Active Operational Items</span>
              <p className="text-3xl font-extrabold text-emerald-400">{totalActive}</p>
              <p className="text-[10px] text-slate-500 mt-1">{totalInactive} deactivated items</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-lg">
              <span className="text-xs text-slate-400 font-semibold">High Impact Thresholds</span>
              <p className="text-3xl font-extrabold text-amber-400">{totalHighImpact}</p>
              <p className="text-[10px] text-slate-500 mt-1">Require confirmation & alert verification</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-lg">
              <span className="text-xs text-slate-400 font-semibold">Multi-Instance Bus</span>
              <p className="text-3xl font-extrabold text-indigo-400">Redis Pub/Sub</p>
              <p className="text-[10px] text-slate-500 mt-1">Commit-first cache invalidation active</p>
            </div>
          </div>

          {/* Quick Notice Banner */}
          <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-800/60 flex items-start gap-3">
            <span className="text-lg">ℹ️</span>
            <div className="text-xs text-indigo-200 leading-relaxed">
              <strong>Strict Secret & Credentials Notice:</strong> API keys (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, etc.), OAuth client secrets (`CLICKUP_CLIENT_SECRET`), JWT passwords, and database connection URLs are managed exclusively via environment files (`.env`) or your deployment secret manager. Secret values are never stored in the database or exposed via API payloads.
            </div>
          </div>
        </div>
      )}

      {/* RUNTIME CONFIGURATIONS TAB */}
      {activeTab === 'configs' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <input
              type="text"
              placeholder="Search by key, purpose, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  Category: {cat}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Status: All</option>
              <option value="ACTIVE">Status: Active</option>
              <option value="INACTIVE">Status: Deactivated</option>
            </select>

            <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={highImpactFilter}
                onChange={(e) => setHighImpactFilter(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-0"
              />
              High Impact Only
            </label>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 animate-pulse">Loading configurations...</div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto shadow-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-4">Key</th>
                    <th className="p-4">Value</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Version</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No configuration records matching filters.
                      </td>
                    </tr>
                  ) : (
                    filteredConfigs.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-mono font-bold text-indigo-300">
                          {c.key}
                          {c.isHighImpact && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-950 border border-amber-800 text-[9px] text-amber-400 font-bold">
                              HIGH IMPACT
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-mono font-semibold text-slate-100 max-w-xs truncate">{c.value}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-purple-300">
                            {c.valueType}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-300 text-[11px]">{c.category}</td>
                        <td className="p-4 font-mono font-bold text-slate-400">v{c.version}</td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              c.isActive
                                ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                                : 'bg-amber-950 border border-amber-800 text-amber-300'
                            }`}
                          >
                            {c.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => initiateUpdateConfig(c)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-semibold text-slate-200"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleToggleStatus(c.key, c.isActive, c.version)}
                            className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
                              c.isActive
                                ? 'bg-amber-950 border border-amber-800 text-amber-300 hover:bg-amber-900'
                                : 'bg-emerald-950 border border-emerald-800 text-emerald-300 hover:bg-emerald-900'
                            }`}
                          >
                            {c.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FEATURE FLAGS TAB */}
      {activeTab === 'flags' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featureFlags.map((flag) => (
            <div key={flag.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
              <div className="flex justify-between items-start">
                <span className="font-mono text-xs font-bold text-indigo-300">{flag.key}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    flag.isActive && flag.value === 'true'
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                      : 'bg-rose-950 border border-rose-800 text-rose-400'
                  }`}
                >
                  {flag.isActive && flag.value === 'true' ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">{flag.purpose}</p>
              <div className="flex justify-between items-center border-t border-slate-800/80 pt-3">
                <span className="text-[10px] text-slate-500 font-mono">v{flag.version}</span>
                <button
                  onClick={() =>
                    executeSaveConfig(
                      flag.key,
                      flag.value === 'true' ? 'false' : 'true',
                      flag.purpose,
                      flag.description || '',
                      flag.version
                    )
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    flag.value === 'true'
                      ? 'bg-rose-900/40 hover:bg-rose-900/60 border border-rose-700 text-rose-300'
                      : 'bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700 text-emerald-300'
                  }`}
                >
                  {flag.value === 'true' ? 'Turn Off' : 'Turn On'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI PROVIDERS TAB */}
      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {aiProviderConfigs.map((prov) => (
            <div key={prov.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-purple-300">{prov.key}</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400">
                  {prov.valueType}
                </span>
              </div>
              <p className="text-xs text-slate-400">{prov.purpose}</p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200">
                Current Value: <strong className="text-indigo-400">{prov.value}</strong>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => initiateUpdateConfig(prov)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                >
                  Configure Provider Setting
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* INTEGRATIONS TAB */}
      {activeTab === 'integrations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((item) => (
            <div key={item.providerName} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-sm text-slate-100">{item.providerName}</h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    item.configured
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                      : 'bg-rose-950 border border-rose-800 text-rose-400'
                  }`}
                >
                  {item.configured ? 'Configured ✓' : 'Not Configured ✗'}
                </span>
              </div>
              <p className="text-xs text-slate-400">{item.purpose}</p>
              <div className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-800 pt-3">
                <span>Secret Management:</span>
                <span className="font-mono text-[10px] text-indigo-400">{item.managedBy}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* INFRASTRUCTURE TAB */}
      {activeTab === 'infrastructure' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-lg">
            <span className="text-xs text-slate-400">PostgreSQL Database</span>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-emerald-400">ONLINE</span>
              <span className="text-[10px] text-slate-500 font-mono">Port 5433</span>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-lg">
            <span className="text-xs text-slate-400">Redis Cache & Bus</span>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-emerald-400">ONLINE</span>
              <span className="text-[10px] text-slate-500 font-mono">Port 6379</span>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-lg">
            <span className="text-xs text-slate-400">RabbitMQ Message Queue</span>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-emerald-400">ONLINE</span>
              <span className="text-[10px] text-slate-500 font-mono">Port 5672</span>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 shadow-lg">
            <span className="text-xs text-slate-400">Worker Process</span>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-emerald-400">ACTIVE</span>
              <span className="text-[10px] text-slate-500 font-mono">Document AI</span>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateConfig}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-white">Add Configuration to Registry</h3>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Key (Must match registered format)</label>
              <input
                type="text"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="RAG_VECTOR_TIMEOUT_MS"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-semibold">Value Type</label>
                <select
                  value={newValueType}
                  onChange={(e) => setNewValueType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                >
                  <option value="STRING">STRING</option>
                  <option value="NUMBER">NUMBER</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                  <option value="JSON">JSON</option>
                  <option value="ARRAY">ARRAY</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-semibold">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                >
                  {CATEGORIES.filter((c) => c !== 'ALL').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Initial Value</label>
              <input
                type="text"
                required
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="e.g. 15000"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Purpose (Mandatory)</label>
              <textarea
                required
                value={newPurpose}
                onChange={(e) => setNewPurpose(e.target.value)}
                placeholder="Explain runtime purpose in code..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 h-16"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                Create Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingConfig && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveEdit}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white">Edit Configuration — {editingConfig.key}</h3>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-indigo-400 font-bold">
                Version {editingConfig.version}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">New Value</label>
              <input
                type="text"
                required
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Purpose</label>
              <textarea
                required
                value={editPurpose}
                onChange={(e) => setEditPurpose(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 h-16"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingConfig(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                Update Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* HIGH IMPACT CONFIRMATION MODAL WITH TYPE "CONFIRM" REQUIREMENT */}
      {confirmationPendingConfig && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-amber-800/80 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
              ⚠️ High Impact Change Confirmation Required
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This setting is flagged as <strong>HIGH IMPACT</strong>. Changes take effect immediately across all active application & worker instances.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
              <div className="text-indigo-300 font-bold">{confirmationPendingConfig.config.key}</div>
              <div className="flex justify-between text-slate-400">
                <span>Previous:</span>
                <span className="text-rose-400">{confirmationPendingConfig.config.value}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>New:</span>
                <span className="text-emerald-400">{confirmationPendingConfig.newValue}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">
                Type <strong className="text-white">CONFIRM</strong> to proceed:
              </label>
              <input
                type="text"
                value={confirmInputText}
                onChange={(e) => setConfirmInputText(e.target.value)}
                placeholder="CONFIRM"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-amber-400 font-bold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmationPendingConfig(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmInputText !== 'CONFIRM'}
                onClick={() =>
                  executeSaveConfig(
                    confirmationPendingConfig.config.key,
                    confirmationPendingConfig.newValue,
                    editPurpose,
                    editDescription,
                    confirmationPendingConfig.config.version
                  )
                }
                className="px-4 py-2 rounded-xl bg-amber-600 disabled:opacity-40 hover:bg-amber-500 text-xs font-bold text-white shadow-lg shadow-amber-600/20"
              >
                Confirm & Propagate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
