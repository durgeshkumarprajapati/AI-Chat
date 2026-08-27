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
  updatedAt: string;
};

type IntegrationStatusItem = {
  providerName: string;
  configured: boolean;
  enabled: boolean;
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

export default function AdminConfigurationPage() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'configs' | 'integrations'>('configs');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals
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

  const [confirmationPendingConfig, setConfirmationPendingConfig] = useState<{
    config: ConfigItem;
    newValue: string;
  } | null>(null);

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

    // Check for high-impact threshold/flag change
    const isHighImpact =
      editingConfig.key.includes('THRESHOLD') ||
      editingConfig.key.includes('TIMEOUT') ||
      editingConfig.key.includes('ENABLED') ||
      editingConfig.category === 'FEATURE_FLAG';

    if (isHighImpact && editValue !== editingConfig.value) {
      setConfirmationPendingConfig({ config: editingConfig, newValue: editValue });
      return;
    }

    await executeSaveConfig(editingConfig.key, editValue, editPurpose, editDescription);
  };

  const executeSaveConfig = async (key: string, val: string, purp: string, desc: string) => {
    try {
      const res = await fetch(`/api/admin/config/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: val, purpose: purp, description: desc })
      });
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

  const handleToggleStatus = async (key: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    try {
      const res = await fetch(`/api/admin/config/${key}/${action}`, { method: 'POST' });
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

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalActive = configs.filter((c) => c.isActive).length;
  const totalInactive = configs.filter((c) => !c.isActive).length;

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
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              ⚙️ Enterprise Configuration Control Center
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Manage operational runtime behavior, RAG timeouts, thresholds, and feature flags dynamically without application redeployments.
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
          >
            + Create Configuration
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 gap-6 text-xs font-bold text-slate-400 pt-2">
          <button
            onClick={() => setActiveTab('configs')}
            className={`pb-2 border-b-2 transition-colors ${activeTab === 'configs' ? 'border-indigo-500 text-indigo-400' : 'border-transparent hover:text-slate-200'
              }`}
          >
            Runtime Configurations ({configs.length})
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`pb-2 border-b-2 transition-colors ${activeTab === 'integrations' ? 'border-indigo-500 text-indigo-400' : 'border-transparent hover:text-slate-200'
              }`}
          >
            External Integration Status ({integrations.length})
          </button>
        </div>
      </div>

      {activeTab === 'configs' ? (
        <>
          {/* Dashboard Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-lg">
              <span className="text-xs text-slate-400">Total Configurations</span>
              <p className="text-2xl font-extrabold text-white">{configs.length}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-lg">
              <span className="text-xs text-slate-400">Active Items</span>
              <p className="text-2xl font-extrabold text-emerald-400">{totalActive}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-lg">
              <span className="text-xs text-slate-400">Deactivated Items</span>
              <p className="text-2xl font-extrabold text-amber-400">{totalInactive}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-lg">
              <span className="text-xs text-slate-400">Security Rule</span>
              <p className="text-xs font-bold text-indigo-400 mt-1">🔒 Secrets remain in .env only</p>
            </div>
          </div>

          {/* Search & Filtering Toolbar */}
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
          </div>

          {/* Configurations Table */}
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
                    <th className="p-4">Purpose</th>
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
                          {c.isSystem && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400">
                              SYSTEM
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
                        <td className="p-4 text-slate-400 max-w-xs truncate" title={c.purpose}>
                          {c.purpose}
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${c.isActive
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
                            onClick={() => handleToggleStatus(c.key, c.isActive)}
                            className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${c.isActive
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
        </>
      ) : (
        /* Integration Status View */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              🛡️ Secret-Isolated Integration Status
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Shows whether deployment credentials are configured in environment files without exposing secret strings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {integrations.map((item) => (
              <div key={item.providerName} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm text-slate-100">{item.providerName}</h4>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${item.configured
                        ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                        : 'bg-rose-950 border border-rose-800 text-rose-400'
                      }`}
                  >
                    {item.configured ? 'Configured ✓' : 'Not Configured'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-900 pt-2">
                  <span>Runtime Enablement</span>
                  <span className="font-bold text-indigo-400">{item.enabled ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateConfig}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-white">Create Runtime Configuration</h3>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Key (e.g. RAG_CUSTOM_TOPK)</label>
              <input
                type="text"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="RAG_CUSTOM_TOPK"
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
              <label className="text-xs text-slate-400 font-semibold">Value</label>
              <input
                type="text"
                required
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="e.g. 10 or true"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Purpose (Mandatory)</label>
              <textarea
                required
                value={newPurpose}
                onChange={(e) => setNewPurpose(e.target.value)}
                placeholder="Clear explanation of how this setting is used in code..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 h-16"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Description (Optional)</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Additional notes"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
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
                Save Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {editingConfig && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveEdit}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-white">Edit Configuration — {editingConfig.key}</h3>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Value</label>
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

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-semibold">Description</label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
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

      {/* Confirmation Dialog for High-Impact Changes */}
      {confirmationPendingConfig && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-amber-800/80 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
              ⚠️ Confirm High-Impact Configuration Change
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are updating a high-impact global configuration setting (threshold, timeout, or feature flag). Changes take effect immediately across all active RAG pipelines.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div>
                <span className="text-slate-400 font-semibold">Configuration Key:</span>
                <p className="font-mono text-indigo-300 font-bold">{confirmationPendingConfig.config.key}</p>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Previous Value:</span>
                <span className="font-mono text-rose-400">{confirmationPendingConfig.config.value}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">New Value:</span>
                <span className="font-mono text-emerald-400">{confirmationPendingConfig.newValue}</span>
              </div>
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
                onClick={() =>
                  executeSaveConfig(
                    confirmationPendingConfig.config.key,
                    confirmationPendingConfig.newValue,
                    editPurpose,
                    editDescription
                  )
                }
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white shadow-lg shadow-amber-600/20"
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
