import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Conversation, ChatMessage } from '@solyra/shared';
import { useAuth } from '../context/AuthContext';
import { client } from '../api/client';
import { CheckCircle2, ArrowRight, UserCheck, Settings } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, tier } = useAuth();
  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-slate-100">Welcome, {user?.fullName || 'User'}</h1>
        <p className="text-slate-400 text-sm mt-1">Tier: <span className="capitalize font-semibold text-indigo-400">{tier}</span></p>
      </div>
    </div>
  );
};

export const OnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const STORAGE_KEY = 'solyra_onboarding_draft';

  const [step, setStep] = useState<number>(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.step || 1;
      } catch {
        return 1;
      }
    }
    return 1;
  });

  const [formData, setFormData] = useState<{ displayName: string; roleIntent: string; notificationOptIn: boolean }>(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          displayName: parsed.displayName || user?.fullName || '',
          roleIntent: parsed.roleIntent || 'developer',
          notificationOptIn: parsed.notificationOptIn ?? true,
        };
      } catch {
        // Fallback
      }
    }
    return {
      displayName: user?.fullName || '',
      roleIntent: 'developer',
      notificationOptIn: true,
    };
  });

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...formData, step }));
  }, [formData, step]);

  const handleComplete = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    navigate('/app');
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Workspace Onboarding</h1>
            <p className="text-xs text-slate-400 mt-0.5">Step {step} of 3</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-6 h-1.5 rounded-full transition-colors ${
                  s === step ? 'bg-indigo-500' : s < step ? 'bg-indigo-400/40' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-200">Confirm Your Identity</h2>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Display Name</label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={() => setStep(2)}
              className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-200">Primary Objective</h2>
            <div className="space-y-2">
              {[
                { id: 'developer', title: 'Developer & Engineering', desc: 'Building integrations and managing APIs' },
                { id: 'operator', title: 'Operational Manager', desc: 'Monitoring autonomous systems and logs' },
                { id: 'architect', title: 'Enterprise Architect', desc: 'Overseeing contracts, models, and council' },
              ].map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    formData.roleIntent === item.id
                      ? 'border-indigo-500/50 bg-indigo-500/10'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="roleIntent"
                    value={item.id}
                    checked={formData.roleIntent === item.id}
                    onChange={() => setFormData({ ...formData, roleIntent: item.id })}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{item.title}</p>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Setup Complete</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Your profile configuration is saved. You are ready to start collaborating inside Solyra.
              </p>
            </div>
            <button
              onClick={handleComplete}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow"
            >
              Enter Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const { user, tier } = useAuth();
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h1 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-indigo-400" /> Account Profile
        </h1>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Full Name</span>
            <span className="text-slate-200 font-medium">{user?.fullName || 'N/A'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Email Address</span>
            <span className="text-slate-200 font-medium">{user?.email || 'N/A'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Role Tier</span>
            <span className="text-indigo-400 font-semibold uppercase">{tier}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h1 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" /> Preferences & Settings
        </h1>
        <p className="text-xs text-slate-400">Solyra workspace configuration and security settings.</p>
      </div>
    </div>
  );
};

export const ChatWorkspacePage: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('solyra-default');
  const endOfThreadRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;

  const getErrorMessage = (caught: unknown): string => {
    if (caught && typeof caught === 'object' && 'response' in caught) {
      const maybeResponse = caught as { response?: { data?: { error?: string } } };
      if (typeof maybeResponse.response?.data?.error === 'string') {
        return maybeResponse.response.data.error;
      }
    }
    return 'Something went wrong while loading the workspace.';
  };

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      const response = await client.get('/api/chat/conversations');
      if (response.data?.success) {
        const nextConversations: Conversation[] = Array.isArray(response.data.conversations) ? response.data.conversations : [];
        setConversations(nextConversations);
        setActiveConversationId((current) => {
          if (current && nextConversations.some((conversation) => conversation.id === current)) {
            return current;
          }
          return nextConversations[0]?.id ?? null;
        });
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        setError(null);
        const response = await client.get(`/api/chat/conversations/${activeConversationId}/messages`);
        if (response.data?.success) {
          const nextMessages: ChatMessage[] = Array.isArray(response.data.messages) ? response.data.messages : [];
          setMessages(nextMessages);
        }
      } catch (caught) {
        setError(getErrorMessage(caught));
      }
    };

    void loadMessages();
  }, [activeConversationId]);

  useEffect(() => {
    endOfThreadRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const createNewConversation = async (titleOverride?: string): Promise<Conversation | null> => {
    try {
      setError(null);
      const response = await client.post('/api/chat/conversations', {
        title: titleOverride && titleOverride.trim() ? titleOverride.trim() : 'New Conversation',
        modelIdentifier: selectedModel,
      });

      if (response.data?.success && response.data.conversation) {
        const createdConversation: Conversation = response.data.conversation;
        setConversations((current) => [createdConversation, ...current]);
        setActiveConversationId(createdConversation.id);
        setMessages([]);
        return createdConversation;
      }

      return null;
    } catch (caught) {
      setError(getErrorMessage(caught));
      return null;
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      setError(null);
      const response = await client.delete(`/api/chat/conversations/${conversationId}`);
      if (response.data?.success) {
        setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
        setActiveConversationId((current) => {
          if (current !== conversationId) {
            return current;
          }
          const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
          return remaining[0]?.id ?? null;
        });
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  const handleSendMessage = async (event?: React.FormEvent<HTMLFormElement>) => {
    if (event) {
      event.preventDefault();
    }

    const trimmedInput = inputText.trim();
    if (!trimmedInput || isGenerating) {
      return;
    }

    let conversationId = activeConversationId;
    if (!conversationId) {
      const createdConversation = await createNewConversation(trimmedInput.slice(0, 48));
      if (!createdConversation) {
        return;
      }
      conversationId = createdConversation.id;
    }

    if (!conversationId) {
      return;
    }

    const localMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId,
      senderId: user?.id ?? 'local-user',
      role: 'user',
      content: trimmedInput,
      createdAt: new Date(),
    };

    setInputText('');
    setError(null);
    setIsGenerating(true);
    setMessages((current) => [...current, localMessage]);

    try {
      const response = await client.post(`/api/chat/conversations/${conversationId}/messages`, {
        content: trimmedInput,
      });

      if (response.data?.success) {
        const serverMessages: ChatMessage[] = Array.isArray(response.data.messages) ? response.data.messages : [];
        setMessages((current) => current.filter((message) => message.id !== localMessage.id).concat(serverMessages));
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-slate-950/40">
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} overflow-hidden border-r border-slate-800 bg-slate-900/80 transition-all duration-200`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <span className="text-sm font-semibold tracking-wide text-slate-200">Conversations</span>
            <button
              type="button"
              onClick={() => void createNewConversation('New Conversation')}
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-500"
            >
              + New
            </button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-slate-500">No conversations yet.</div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveConversationId(conversation.id)}
                  className={`group flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition ${
                    activeConversationId === conversation.id
                      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                      : 'border-transparent bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="truncate text-xs font-medium">{conversation.title}</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteConversation(conversation.id);
                    }}
                    className="rounded px-1.5 py-0.5 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                    aria-label={`Delete conversation ${conversation.title}`}
                  >
                    ✕
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-slate-800 bg-slate-900/90 p-3">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Model</label>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 outline-none transition focus:border-emerald-600"
            >
              <option value="solyra-default">Solyra Default</option>
              <option value="solyra-reasoning">Solyra Reasoning</option>
              <option value="solyra-fast">Solyra Fast</option>
            </select>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((current) => !current)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
            <div>
              <div className="text-sm font-semibold text-slate-200">{activeConversation ? activeConversation.title : 'New Chat Session'}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{activeConversation?.modelIdentifier ?? selectedModel}</div>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <div className="font-medium text-slate-200">{user?.fullName || user?.email || 'Member'}</div>
            <div>{user?.email || 'Authenticated workspace'}</div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          {messages.length === 0 && !isGenerating ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-800 bg-emerald-950 text-lg font-bold text-emerald-300">S</div>
                <h2 className="text-xl font-semibold text-slate-100">Welcome to Solyra Workspace</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Start a session to sketch plans, summarize work, and explore the active Solyra system.
                </p>
                <div className="mt-6 grid gap-2 text-left">
                  {[
                    'Explain the council and brain architecture in Solyra',
                    'Summarize recent workspace work and next steps',
                    'Draft a plan for an internal system improvement',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInputText(prompt)}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-slate-700 hover:bg-slate-800"
                    >
                      “{prompt}”
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-800 bg-slate-900 text-slate-200'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] opacity-80">
                        <span>{isUser ? 'You' : 'Solyra'}</span>
                        <span>•</span>
                        <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  </div>
                );
              })}

              {isGenerating && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                      Solyra is generating a response...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={endOfThreadRef} />
        </div>

        <footer className="border-t border-slate-800 bg-slate-900/40 p-4">
          <form onSubmit={handleSendMessage} className="mx-auto flex max-w-4xl items-end gap-3">
            <textarea
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendMessage();
                }
              }}
              rows={2}
              disabled={isGenerating}
              placeholder="Type your message... (Press Enter to send, Shift+Enter for newline)"
              className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isGenerating}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
};
