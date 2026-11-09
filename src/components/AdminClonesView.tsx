import React, { useState } from "react";
import {
  Shield,
  Users,
  Bot,
  Ban,
  CheckCircle2,
  Megaphone,
  Calendar,
  Plus,
} from "lucide-react";
import {
  BotUserRecord,
  ClonedBotInstance,
  WeeklyPollRecord,
} from "../data/botStore";

interface AdminClonesViewProps {
  users: BotUserRecord[];
  onGrantPremium: (userId: number, days: number) => void;
  onSetCloneLimitOverride: (userId: number, limit: number | "UNLIMITED") => void;
  onToggleBan: (userId: number, ban: boolean, reason?: string) => void;
  clones: ClonedBotInstance[];
  onCreateClone: (
    ownerId: number,
    botName: string,
    botUsername: string,
    token: string
  ) => { ok: boolean; message: string };
  weeklyPolls: WeeklyPollRecord[];
  onTriggerSundayPoll: () => WeeklyPollRecord;
  onSendBroadcast: (messageText: string) => { deliveredUsers: number; deliveredClones: number };
}

export const AdminClonesView: React.FC<AdminClonesViewProps> = ({
  users,
  onGrantPremium,
  onSetCloneLimitOverride,
  onToggleBan,
  clones,
  onCreateClone,
  weeklyPolls,
  onTriggerSundayPoll,
  onSendBroadcast,
}) => {
  // /add_user form state
  const [targetUserId, setTargetUserId] = useState("904112388");
  const [premiumDays, setPremiumDays] = useState("30");
  const [adminFeedback, setAdminFeedback] = useState<string | null>(null);

  // Clone creation form state
  const [cloneOwnerId, setCloneOwnerId] = useState<number>(612094811);
  const [cloneName, setCloneName] = useState("");
  const [cloneUsername, setCloneUsername] = useState("");
  const [cloneToken, setCloneToken] = useState("");
  const [cloneFeedback, setCloneFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Broadcast state
  const [broadcastText, setBroadcastText] = useState(
    "New 4K IMAX Multi-Audio batch of Kalki 2898 AD and Solo Leveling Season 2 is now live in @CinePulseBot!"
  );
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  const handleGrantPremiumSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const uid = Number(targetUserId);
    const days = Number(premiumDays);
    if (!uid || isNaN(days) || days <= 0) return;
    onGrantPremium(uid, days);
    setAdminFeedback(
      `Executed /add_user ${uid} ${days}: Granted ${days} days of Premium status (Gemini AI Spelling Correction + 3 Clone Limit).`
    );
  };

  const handleCreateCloneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneName.trim() || !cloneUsername.trim()) return;
    const res = onCreateClone(
      cloneOwnerId,
      cloneName.trim(),
      cloneUsername.trim().replace(/^@/, ""),
      cloneToken.trim() || "7901283910:AAH2k...99xYz"
    );
    setCloneFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setCloneName("");
      setCloneUsername("");
      setCloneToken("");
    }
  };

  const handleBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    const stats = onSendBroadcast(broadcastText.trim());
    setBroadcastResult(
      `Broadcast dispatched to ${stats.deliveredUsers} active users across main bot and ${stats.deliveredClones} cloned instances.`
    );
  };

  return (
    <div className="space-y-8">
      {/* Section 1: User Subscriptions (/add_user), Clone Limits & Global Security (/ban & /unban) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: User Tier Table & Global Ban Controls (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  01. User Subscriptions, Clone Quotas & Global Security
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enforces 1 clone for Free users, up to 3 for Premium users, and Unlimited overrides. Bans apply across main and cloned bots.
                </p>
              </div>
              <Users className="w-5 h-5 text-sky-400 shrink-0" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">User / Telegram ID</th>
                    <th className="py-2.5 px-3 font-medium">Tier & AI Access</th>
                    <th className="py-2.5 px-3 font-medium text-right">Clones Used / Limit</th>
                    <th className="py-2.5 px-3 font-medium">Global Status</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {users.map((u) => {
                    const userClonesCount = clones.filter((c) => c.ownerId === u.userId).length;
                    const hasAI = u.role === "OWNER" || (u.role === "PREMIUM" && u.premiumDaysRemaining > 0);
                    return (
                      <tr key={u.userId} className="hover:bg-slate-950/50 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-slate-100">{u.name}</div>
                          <div className="text-slate-400 font-mono tabular-nums">
                            @{u.username} · ID {u.userId}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div
                            className={`font-semibold ${
                              hasAI ? "text-emerald-400" : "text-slate-300"
                            }`}
                          >
                            {u.role} {u.premiumDaysRemaining > 0 && u.role !== "OWNER" ? `(${u.premiumDaysRemaining}d)` : ""}
                          </div>
                          <div className="text-slate-400">
                            {hasAI ? "Gemini AI Spellcheck Active" : "Standard Search Only"}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                          {userClonesCount} / {u.cloneLimit}
                        </td>
                        <td className="py-3 px-3">
                          {u.isBanned ? (
                            <span className="text-rose-400 font-semibold">
                              BANNED (All Instances)
                            </span>
                          ) : (
                            <span className="text-emerald-400">Nominal</span>
                          )}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {u.role !== "OWNER" && (
                              <>
                                <button
                                  onClick={() => onGrantPremium(u.userId, 30)}
                                  className="px-2.5 py-1 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded transition-colors whitespace-nowrap shrink-0"
                                >
                                  +30d Premium
                                </button>
                                <button
                                  onClick={() =>
                                    onSetCloneLimitOverride(
                                      u.userId,
                                      u.cloneLimit === "UNLIMITED" ? (u.role === "PREMIUM" ? 3 : 1) : "UNLIMITED"
                                    )
                                  }
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
                                >
                                  {u.cloneLimit === "UNLIMITED" ? "Reset Limit" : "Unlimited Override"}
                                </button>
                                <button
                                  onClick={() =>
                                    onToggleBan(
                                      u.userId,
                                      !u.isBanned,
                                      "Admin security action"
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap shrink-0 ${
                                    u.isBanned
                                      ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                                      : "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                                  }`}
                                >
                                  {u.isBanned ? "/unban" : "/ban"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {adminFeedback && (
            <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs text-sky-300 font-mono">
              {adminFeedback}
            </div>
          )}
        </div>

        {/* Right: /add_user Command Executor & Broadcast Console (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <form onSubmit={handleGrantPremiumSubmit} className="space-y-3.5">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white">
                Grant Premium Tier (/add_user)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Unlocks Gemini AI Spelling Correction and expands clone limit to 3.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs text-slate-400 block mb-1">User ID</label>
                <input
                  type="text"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Duration (Days)</label>
                <input
                  type="number"
                  value={premiumDays}
                  onChange={(e) => setPremiumDays(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Execute /add_user {targetUserId} {premiumDays}
            </button>
          </form>

          {/* Global Broadcast Tool */}
          <form onSubmit={handleBroadcastSubmit} className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">
                Global Broadcast Tool
              </span>
              <Megaphone className="w-4 h-4 text-amber-400" />
            </div>
            <textarea
              rows={2}
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200"
            />
            <button
              type="submit"
              className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Broadcast Across Main & Cloned Bots
            </button>
            {broadcastResult && (
              <div className="text-xs text-emerald-400 font-mono">{broadcastResult}</div>
            )}
          </form>
        </div>
      </div>

      {/* Section 2: Clone Tracking (/clone_status) & Master Log Channel Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">
                02. Active Bot Clones Monitor (/clone_status)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Logged to Master Log Channel (-1001982347250) with Bot Name, Username, Owner ID, Token, and Creation Date.
              </p>
            </div>
            <Bot className="w-5 h-5 text-emerald-400 shrink-0" />
          </div>

          <div className="divide-y divide-slate-800">
            {clones.map((clone) => (
              <div key={clone.id} className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">
                    {clone.botName} <span className="text-sky-400 font-mono text-xs">@{clone.botUsername}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    Owner: {clone.ownerName} (@{clone.ownerUsername} · ID {clone.ownerId}) · Token: {clone.maskedToken}
                  </div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    Created: {clone.createdAt}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0">
                  <div className="text-xs font-semibold text-emerald-400">{clone.status}</div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    {clone.usersCount.toLocaleString()} users
                  </div>
                  <div className="text-xs text-slate-400">
                    {clone.filesServed.toLocaleString()} served
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Provision New Clone & Weekly Sunday Poll Automation */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <form onSubmit={handleCreateCloneSubmit} className="space-y-3.5">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white">
                Provision Bot Clone (Enforces Tier Limits)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Free: max 1 clone · Premium: max 3 clones · Override: Unlimited.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 block">Select Clone Owner</label>
              <select
                value={cloneOwnerId}
                onChange={(e) => setCloneOwnerId(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                {users.map((u) => {
                  const used = clones.filter((c) => c.ownerId === u.userId).length;
                  return (
                    <option key={u.userId} value={u.userId}>
                      {u.name} ({u.role} · Used {used}/{u.cloneLimit} clones)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Bot Display Name</label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  placeholder="e.g. Tamil Rockers Filter"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Bot @Username</label>
                <input
                  type="text"
                  value={cloneUsername}
                  onChange={(e) => setCloneUsername(e.target.value)}
                  placeholder="TamilAutoFilterBot"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Clone & Log to Master Log Channel</span>
            </button>

            {cloneFeedback && (
              <div
                className={`text-xs font-mono ${
                  cloneFeedback.ok ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {cloneFeedback.text}
              </div>
            )}
          </form>

          {/* Sunday Automated Poll Trigger */}
          <div className="pt-4 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">
                Weekly Sunday Automated Polling
              </span>
              <Calendar className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-xs text-slate-400">
              Generates trending poll in user DMs, pins in connected groups, and forwards aggregated tally to Master Lock Channel (-1001982347300).
            </p>
            <button
              type="button"
              onClick={onTriggerSundayPoll}
              className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Dispatch Sunday Poll & Forward to Master Lock ({weeklyPolls.length} Sent)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
