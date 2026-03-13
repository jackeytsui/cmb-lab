"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignIn, useAuth } from "@clerk/nextjs";

type Step = "email" | "otp" | "password" | "setup-password";

function extractErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const maybe = error as {
      errors?: Array<{ longMessage?: string; message?: string }>;
      message?: string;
    };
    const first = maybe.errors?.[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
    if (maybe.message) return maybe.message;
  }
  return "Something went wrong. Please try again.";
}

export function OtpFirstSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [clerkTimedOut, setClerkTimedOut] = useState(false);

  const accessExpired = searchParams.get("access") === "expired";
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  // Auto-redirect if already signed in
  useEffect(() => {
    if (isSignedIn) {
      window.location.href = "/dashboard";
    }
  }, [isSignedIn]);

  // Clerk load timeout
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setClerkTimedOut(true), 6000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  async function activateSession(createdSessionId: string | null) {
    if (!createdSessionId || !setActive) return;
    await setActive({ session: createdSessionId });
    router.push("/dashboard");
  }

  // Step 1: Send OTP
  async function handleSendCode() {
    if (!isLoaded || !signIn || !normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError("");
      await signIn.create({
        strategy: "email_code",
        identifier: normalizedEmail,
      });
      setStep("otp");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Step 2: Verify OTP
  async function handleVerifyCode() {
    if (!isLoaded || !signIn || !code.trim()) {
      setError("Please enter the code from your email.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError("");
      const result = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code: code.trim(),
      });
      if (result.status === "complete") {
        await activateSession(result.createdSessionId);
        return;
      }
      setError("Verification incomplete. Please try again.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Password sign in
  async function handlePasswordSignIn() {
    if (!isLoaded || !signIn || !normalizedEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError("");
      const result = await signIn.create({
        strategy: "password",
        identifier: normalizedEmail,
        password,
      });
      if (result.status === "complete") {
        await activateSession(result.createdSessionId);
        return;
      }
      setError("Sign-in incomplete. Please try again.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Send password reset code
  async function handleSendResetCode() {
    if (!isLoaded || !signIn || !normalizedEmail) {
      setError("Please enter your email address first.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError("");
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: normalizedEmail,
      });
      setStep("setup-password");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Set new password with code
  async function handleSetPassword() {
    if (!isLoaded || !signIn || !resetCode.trim() || !newPassword.trim()) {
      setError("Please enter the code and your new password.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError("");
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode.trim(),
        password: newPassword,
      });
      if (result.status === "complete") {
        await activateSession(result.createdSessionId);
        return;
      }
      setError("Password setup incomplete. Please try again.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  function goBack() {
    setStep("email");
    setCode("");
    setPassword("");
    setResetCode("");
    setNewPassword("");
    setError("");
  }

  // ---- Render ----

  return (
    <div className="space-y-4">
      {/* Already signed in */}
      {isSignedIn && (
        <div className="space-y-3 rounded-lg border border-emerald-700 bg-emerald-900/40 p-4 text-center">
          <p className="text-sm text-emerald-200">You&apos;re already signed in.</p>
          <a
            href="/dashboard"
            className="inline-block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      )}

      {/* Access expired banner */}
      {accessExpired && !isSignedIn && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-900/30 p-4">
          <p className="text-sm font-medium text-amber-200">Your access has expired</p>
          <p className="mt-1 text-xs text-amber-300/80">
            Your course access period has ended. Please contact your coach or the Canto to Mando Blueprint team if you believe this is an error.
          </p>
        </div>
      )}

      {/* Clerk loading */}
      {!isLoaded && !isSignedIn && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          <p className="text-xs text-slate-300">
            {clerkTimedOut
              ? "Taking longer than expected. Try refreshing the page."
              : "Loading..."}
          </p>
        </div>
      )}

      {/* ======================== STEP: EMAIL ======================== */}
      {step === "email" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">Email address</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSendCode();
                }
              }}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-800/90 px-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="you@email.com"
            />
          </div>

          <button
            type="button"
            disabled={isSubmitting || !isLoaded || !normalizedEmail}
            onClick={() => void handleSendCode()}
            className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Sending..." : "Send me a sign-in code"}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                if (!normalizedEmail) {
                  setError("Please enter your email address first.");
                  return;
                }
                setError("");
                setStep("password");
              }}
              className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 transition-colors"
            >
              Sign in with password instead
            </button>
          </div>
        </div>
      )}

      {/* ======================== STEP: OTP ======================== */}
      {step === "otp" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-800/50 bg-blue-900/20 p-3">
            <p className="text-sm text-blue-200">
              We sent a sign-in code to{" "}
              <span className="font-semibold text-white">{normalizedEmail}</span>
            </p>
            <p className="mt-1 text-xs text-blue-300/70">
              Check your inbox (and spam folder). The code expires in a few minutes.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">Enter your code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleVerifyCode();
                }
              }}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-800/90 px-3 text-center text-lg tracking-[0.3em] text-white outline-none placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-sm focus:border-blue-500"
              placeholder="Enter code"
              autoFocus
            />
          </div>

          <button
            type="button"
            disabled={isSubmitting || !isLoaded || !code.trim()}
            onClick={() => void handleVerifyCode()}
            className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Verifying..." : "Sign In"}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 transition-colors"
            >
              Use a different email
            </button>
            <button
              type="button"
              disabled={isSubmitting || !isLoaded}
              onClick={() => void handleSendCode()}
              className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        </div>
      )}

      {/* ======================== STEP: PASSWORD ======================== */}
      {step === "password" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3">
            <p className="text-sm text-slate-200">
              Signing in as <span className="font-semibold text-white">{normalizedEmail}</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handlePasswordSignIn();
                }
              }}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-800/90 px-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="Enter your password"
              autoFocus
            />
          </div>

          <button
            type="button"
            disabled={isSubmitting || !isLoaded || !password}
            onClick={() => void handlePasswordSignIn()}
            className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 transition-colors"
            >
              Back to email code
            </button>
            <button
              type="button"
              disabled={isSubmitting || !isLoaded}
              onClick={() => void handleSendResetCode()}
              className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              Forgot password?
            </button>
          </div>
        </div>
      )}

      {/* ======================== STEP: SETUP PASSWORD ======================== */}
      {step === "setup-password" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-800/50 bg-blue-900/20 p-3">
            <p className="text-sm text-blue-200">
              We sent a password reset code to{" "}
              <span className="font-semibold text-white">{normalizedEmail}</span>
            </p>
            <p className="mt-1 text-xs text-blue-300/70">
              Enter the code and choose a new password.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">Reset code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-800/90 px-3 text-center text-lg tracking-[0.3em] text-white outline-none placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-sm focus:border-blue-500"
              placeholder="Enter code"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSetPassword();
                }
              }}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-800/90 px-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="Choose a new password"
            />
          </div>

          <button
            type="button"
            disabled={isSubmitting || !isLoaded || !resetCode.trim() || !newPassword.trim()}
            onClick={() => void handleSetPassword()}
            className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Setting password..." : "Set Password & Sign In"}
          </button>

          <button
            type="button"
            onClick={goBack}
            className="w-full text-center text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 transition-colors"
          >
            Back to sign in
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-rose-800/50 bg-rose-900/20 p-3">
          <p className="text-xs text-rose-300">{error}</p>
        </div>
      )}
    </div>
  );
}
