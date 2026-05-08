import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

interface TelegramState {
  botToken: string;
  chatId: string;
  savedBotToken: string | null;
  savedChatId: string | null;
  saving: boolean;
  removing: boolean;
}

const font = { fontFamily: "'Inter', sans-serif" };

const providers = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4o Mini",
    placeholder: "sk-...",
    accentColor: "#10a37f",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0L4.4 14.6407a4.5 4.5 0 0 1-2.0592-6.7451zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.4502 2.5685a4.4894 4.4894 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.4503-2.5632a4.4948 4.4948 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" fill="white"/>
      </svg>
    ),
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Claude 3 Haiku",
    placeholder: "sk-ant-...",
    accentColor: "#cc785c",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017L3.674 20H0L6.57 3.52zm4.132 9.959L8.453 7.687 6.205 13.48h4.496z" fill="white"/>
      </svg>
    ),
  },
  {
    id: "google",
    name: "Google Gemini",
    description: "Gemini 1.5 Pro, Gemini 1.5 Flash",
    placeholder: "AIza...",
    accentColor: "#4285f4",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 24A14.304 14.304 0 0 0 24 12 14.304 14.304 0 0 0 12 0 14.304 14.304 0 0 0 0 12a14.304 14.304 0 0 0 12 12zm0-2.308a12 12 0 0 1 0-19.384V21.69zm0-19.384a12 12 0 0 1 0 19.384V2.308z" fill="white"/>
      </svg>
    ),
  },
  {
    id: "groq",
    name: "Groq",
    description: "Llama 3, Mixtral (Free tier available)",
    placeholder: "gsk_...",
    accentColor: "#f55036",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2"/>
        <circle cx="12" cy="12" r="4" fill="white"/>
      </svg>
    ),
  },
];

interface KeyState {
  inputValue: string;
  maskedKey: string | null;
  saving: boolean;
  removing: boolean;
}

function mask(key: string): string {
  if (key.length <= 4) return "••••";
  return "••••••••••••" + key.slice(-4);
}

export default function Settings() {
  const [, navigate] = useLocation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>(
    Object.fromEntries(
      providers.map((p) => [p.id, { inputValue: "", maskedKey: null, saving: false, removing: false }])
    )
  );
  const [telegram, setTelegram] = useState<TelegramState>({
    botToken: "",
    chatId: "",
    savedBotToken: null,
    savedChatId: null,
    saving: false,
    removing: false,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });

    supabase
      .from("api_keys")
      .select("provider, api_key")
      .then(({ data }) => {
        if (!data) return;
        setKeyStates((prev) => {
          const next = { ...prev };
          for (const row of data as { provider: string; api_key: string }[]) {
            if (next[row.provider]) {
              next[row.provider] = { ...next[row.provider], maskedKey: mask(row.api_key) };
            }
          }
          return next;
        });
      });

    supabase
      .from("integrations")
      .select("access_token, refresh_token")
      .eq("provider", "telegram")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.access_token) {
          setTelegram((prev) => ({
            ...prev,
            savedBotToken: mask(data.access_token as string),
            savedChatId: data.refresh_token as string | null,
          }));
        }
      });
  }, []);

  async function handleSaveTelegram() {
    const botToken = telegram.botToken.trim();
    const chatId   = telegram.chatId.trim();
    if (!botToken || !chatId) return;

    setTelegram((prev) => ({ ...prev, saving: true }));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTelegram((prev) => ({ ...prev, saving: false })); return; }

    const { error } = await supabase.from("integrations").upsert(
      {
        user_id:       user.id,
        provider:      "telegram",
        access_token:  botToken,
        refresh_token: chatId,
        expires_at:    null,
      },
      { onConflict: "user_id,provider" }
    );

    if (!error) {
      setTelegram((prev) => ({
        ...prev,
        botToken: "",
        chatId: "",
        savedBotToken: mask(botToken),
        savedChatId: chatId,
        saving: false,
      }));
      showToast("Telegram connected successfully");
    } else {
      setTelegram((prev) => ({ ...prev, saving: false }));
      showToast("Failed to save Telegram credentials");
    }
  }

  async function handleRemoveTelegram() {
    setTelegram((prev) => ({ ...prev, removing: true }));
    await supabase.from("integrations").delete().eq("provider", "telegram");
    setTelegram({ botToken: "", chatId: "", savedBotToken: null, savedChatId: null, saving: false, removing: false });
    showToast("Telegram disconnected");
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function setInput(providerId: string, val: string) {
    setKeyStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], inputValue: val } }));
  }

  async function handleSave(providerId: string) {
    const state = keyStates[providerId];
    const keyValue = state.inputValue.trim();
    if (!keyValue) return;

    setKeyStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], saving: true } }));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setKeyStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], saving: false } })); return; }

    const { error } = await supabase.from("api_keys").upsert(
      { user_id: user.id, provider: providerId, api_key: keyValue },
      { onConflict: "user_id,provider" }
    );

    if (!error) {
      setKeyStates((prev) => ({
        ...prev,
        [providerId]: { inputValue: "", maskedKey: mask(keyValue), saving: false, removing: false },
      }));
      showToast("API key saved successfully");
    } else {
      setKeyStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], saving: false } }));
      showToast("Failed to save key");
    }
  }

  async function handleRemove(providerId: string) {
    setKeyStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], removing: true } }));

    await supabase.from("api_keys").delete().eq("provider", providerId);

    setKeyStates((prev) => ({
      ...prev,
      [providerId]: { inputValue: "", maskedKey: null, saving: false, removing: false },
    }));
    showToast("API key removed");
  }

  async function handleLogOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen w-full" style={font}>
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg"
          style={{ backgroundColor: "#16a34a" }}
        >
          ✓ {toast}
        </div>
      )}

      {/* Sidebar */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col fixed top-0 left-0 h-screen border-r border-white/5"
        style={{ backgroundColor: "#0d1117" }}
      >
        <div className="px-5 py-6">
          <span className="text-white font-bold text-lg tracking-tight">EverydayAI</span>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1">
          {[
            { icon: "🏠", label: "Home", path: "/dashboard" },
            { icon: "🎛️", label: "Studio", path: "/dashboard" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left"
            style={{ backgroundColor: "rgba(59,91,252,0.15)", color: "#3b5bfc" }}
          >
            <span className="text-base">⚙️</span>
            Settings
          </button>
        </nav>

        <div className="px-4 py-5 border-t border-white/5 flex flex-col gap-3">
          {userEmail && (
            <p className="text-xs text-white/35 truncate" title={userEmail}>{userEmail}</p>
          )}
          <button
            onClick={handleLogOut}
            className="w-full py-2 rounded-lg text-sm font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all duration-150"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-60 min-h-screen px-8 py-8" style={{ backgroundColor: "#0a0f1e" }}>
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-sm text-white/45 mt-1">
            Add your own API keys to power your agents. Keys are stored securely and never shared.
          </p>

          <div className="grid grid-cols-1 gap-4 mt-8 sm:grid-cols-2">
            {providers.map((provider) => {

              const state = keyStates[provider.id];
              const connected = !!state.maskedKey;

              return (
                <div
                  key={provider.id}
                  className="rounded-2xl border border-white/8 p-5 flex flex-col gap-4"
                  style={{ backgroundColor: "#111827" }}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: provider.accentColor + "22" }}
                      >
                        {provider.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{provider.name}</p>
                        <p className="text-xs text-white/35 mt-0.5">{provider.description}</p>
                      </div>
                    </div>
                    {connected && (
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                      >
                        Connected
                      </span>
                    )}
                  </div>

                  {/* Masked key display */}
                  {connected && (
                    <div
                      className="flex items-center justify-between rounded-lg px-3 py-2 border border-white/8"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                    >
                      <span className="text-sm text-white/50 font-mono tracking-wider">
                        {state.maskedKey}
                      </span>
                      <button
                        onClick={() => handleRemove(provider.id)}
                        disabled={state.removing}
                        className="text-xs text-red-400/80 hover:text-red-400 transition-colors duration-150 disabled:opacity-50 ml-3 flex-shrink-0"
                      >
                        {state.removing ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  )}

                  {/* Input + Save */}
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder={connected ? "Replace with new key…" : provider.placeholder}
                      value={state.inputValue}
                      onChange={(e) => setInput(provider.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSave(provider.id); }}
                      className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
                      style={{ backgroundColor: "#0a0f1e" }}
                    />
                    <button
                      onClick={() => handleSave(provider.id)}
                      disabled={!state.inputValue.trim() || state.saving}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      style={{ backgroundColor: "#3b5bfc" }}
                    >
                      {state.saving ? "Saving…" : connected ? "Replace" : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Integrations section ── */}
          <div className="mt-12">
            <h1 className="text-2xl font-bold text-white">Integrations</h1>
            <p className="text-sm text-white/45 mt-1">
              Connect external services to power your agent tools.
            </p>

            <div className="mt-8">
              {/* Telegram card */}
              <div
                className="rounded-2xl border border-white/8 p-5 flex flex-col gap-4 max-w-md"
                style={{ backgroundColor: "#111827" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                      style={{ backgroundColor: "rgba(38,155,214,0.15)" }}
                    >
                      📱
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Telegram</p>
                      <p className="text-xs text-white/35 mt-0.5">Send messages via Telegram bot</p>
                    </div>
                  </div>
                  {telegram.savedBotToken && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                    >
                      Connected
                    </span>
                  )}
                </div>

                {telegram.savedBotToken && (
                  <div
                    className="flex items-center justify-between rounded-lg px-3 py-2 border border-white/8"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs text-white/40">Bot Token</span>
                      <span className="text-sm text-white/50 font-mono tracking-wider">{telegram.savedBotToken}</span>
                      {telegram.savedChatId && (
                        <>
                          <span className="text-xs text-white/40 mt-1">Chat ID</span>
                          <span className="text-sm text-white/50 font-mono">{telegram.savedChatId}</span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={handleRemoveTelegram}
                      disabled={telegram.removing}
                      className="text-xs text-red-400/80 hover:text-red-400 transition-colors duration-150 disabled:opacity-50 ml-3 flex-shrink-0"
                    >
                      {telegram.removing ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <input
                    type="password"
                    placeholder={telegram.savedBotToken ? "Replace Bot Token…" : "Bot Token (from BotFather)"}
                    value={telegram.botToken}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, botToken: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
                    style={{ backgroundColor: "#0a0f1e" }}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Chat ID (e.g. 123456789)"
                      value={telegram.chatId}
                      onChange={(e) => setTelegram((prev) => ({ ...prev, chatId: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveTelegram(); }}
                      className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 outline-none focus:border-[#3b5bfc] transition-colors"
                      style={{ backgroundColor: "#0a0f1e" }}
                    />
                    <button
                      onClick={handleSaveTelegram}
                      disabled={!telegram.botToken.trim() || !telegram.chatId.trim() || telegram.saving}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      style={{ backgroundColor: "#3b5bfc" }}
                    >
                      {telegram.saving ? "Saving…" : telegram.savedBotToken ? "Replace" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
