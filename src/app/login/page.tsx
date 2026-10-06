"use client";

import { useState, type FormEvent } from "react";
import { getSession, signIn } from "next-auth/react";
import { ArrowRight, Eye, EyeOff, Landmark, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        redirect: false,
        username: username.trim(),
        password,
        callbackUrl: "/",
      });

      if (!result?.ok) {
        setError("We couldn’t sign you in. Check your LDAP username and password, then try again.");
        return;
      }

      const session = await getSession();
      const employeeType = session?.user?.employee_type;
      window.location.href = employeeType === "pda-manager" ? "/pda-manager" : "/reimbursements";
    } catch {
      setError("Sign-in couldn’t be completed. Check your network connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#102a43] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -right-10 -top-10 h-60 w-60 rounded-full border border-white/10" />
        <div className="absolute -bottom-40 -left-24 h-[30rem] w-[30rem] rounded-full bg-[#1e5676]/40 blur-3xl" />

        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg">
            <img src="/iit.png" alt="IIT Mandi" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide">IIT Mandi</p>
            <p className="text-xs text-blue-100/70">Finance Management Portal</p>
          </div>
        </div>

        <div className="relative max-w-xl py-16">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-blue-100">
            <Landmark size={15} aria-hidden="true" />
            Institute finance workspace
          </div>
          <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Finance workflows, all in one place.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-blue-100/75">
            Submit bills, follow approvals, and manage department funds through your institute account.
          </p>

          <div className="mt-10 grid max-w-md grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <ShieldCheck className="mb-3 text-cyan-200" size={21} aria-hidden="true" />
              <p className="text-sm font-medium">Institute sign-in</p>
              <p className="mt-1 text-xs text-blue-100/65">Use your LDAP credentials</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <ArrowRight className="mb-3 text-cyan-200" size={21} aria-hidden="true" />
              <p className="text-sm font-medium">Role-based access</p>
              <p className="mt-1 text-xs text-blue-100/65">Go straight to your workspace</p>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-blue-100/50">Indian Institute of Technology Mandi</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
              <img src="/iit.png" alt="IIT Mandi" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">IIT Mandi</p>
              <p className="text-xs text-slate-500">Finance Management Portal</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_24px_70px_-35px_rgba(15,39,64,0.28)] sm:p-9">
            <div className="mb-8">
              <p className="text-sm font-semibold text-[#17627a]">Welcome back</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Sign in to your account</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Use your IIT Mandi LDAP username and password to continue.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">LDAP username</label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Your institute username"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#17627a] focus:bg-white focus:ring-4 focus:ring-[#17627a]/10"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">LDAP password</label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-11 pr-12 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#17627a] focus:bg-white focus:ring-4 focus:ring-[#17627a]/10"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#17627a]/30"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#17627a] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#124e62] focus:outline-none focus:ring-4 focus:ring-[#17627a]/20 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {loading ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Signing in…</>
                ) : (
                  <>Sign in <ArrowRight size={17} aria-hidden="true" /></>
                )}
              </button>
            </form>

            <div className="mt-7 flex items-start gap-2.5 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 shrink-0 text-[#17627a]" size={16} aria-hidden="true" />
              <p>Sign-in is handled through the institute’s LDAP authentication.</p>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">Integrated Finance Management Portal · IIT Mandi</p>
        </div>
      </section>
    </main>
  );
}
