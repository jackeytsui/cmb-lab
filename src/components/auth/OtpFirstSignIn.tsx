"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";

type Mode = "otp" | "password";

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
  return "Unable to sign in. Please try again.";
}

export function OtpFirstSignIn() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("otp");
  const [otpSent, setOtpSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  async function activateSession(createdSessionId: string | null) {
    if (!createdSessionId || !setActive) return;
    await setActive({ session: createdSessionId });
    router.push("/dashboard");
  }

  async function handleSendOtp() {
    if (!isLoaded || !signIn) return;
    if (!normalizedEmail) {
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
      setOtpSent(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    if (!isLoaded || !signIn) return;
    if (!code.trim()) {
      setError("Please enter the verification code.");
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
      setError("Verification is incomplete. Please try again.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordSignIn() {
    if (!isLoaded || !signIn) return;
    if (!normalizedEmail || !password) {
      setError("Please enter email and password.");
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
      setError("Password sign-in is incomplete. Please try again.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendPasswordSetupCode() {
    if (!isLoaded || !signIn) return;
    if (!normalizedEmail) {
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
      setResetCodeSent(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetPasswordWithCode() {
    if (!isLoaded || !signIn) return;
    if (!resetCode.trim() || !newPassword.trim()) {
      setError("Please enter code and new password.");
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
      setError("Password setup is incomplete. Please try again.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-200">Email address</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 w-full rounded-md border border-slate-600 bg-slate-800/90 px-3 text-sm text-white outline-none ring-0 placeholder:text-slate-400 focus:border-blue-500"
          placeholder="you@email.com"
        />
      </div>

      <div className="grid gap-2">
        <button
          type="button"
          disabled={isSubmitting || !isLoaded}
          onClick={() => {
            setMode("otp");
            void handleSendOtp();
          }}
          className="h-10 rounded-md bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-60"
        >
          Continue with Email Code (OTP)
        </button>
      </div>

      {mode === "otp" && otpSent ? (
        <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-300">
            We sent a one-time code to <span className="font-semibold text-slate-100">{normalizedEmail}</span>.
          </p>
          <input
            type="text"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              void handleVerifyOtp();
            }}
            className="h-10 w-full rounded-md border border-slate-600 bg-slate-800/90 px-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-500"
            placeholder="Enter OTP code"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSubmitting || !isLoaded}
              onClick={() => void handleVerifyOtp()}
              className="h-9 rounded-md bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-60"
            >
              Verify and Sign In
            </button>
            <button
              type="button"
              disabled={isSubmitting || !isLoaded}
              onClick={() => void handleSendOtp()}
              className="h-9 rounded-md border border-slate-600 px-3 text-xs text-slate-200 disabled:opacity-60"
            >
              Resend code
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3">
        <button
          type="button"
          onClick={() => {
            setMode((prev) => (prev === "password" ? "otp" : "password"));
            setError("");
          }}
          className="text-xs font-medium text-slate-200 underline underline-offset-2"
        >
          {mode === "password" ? "Use OTP instead" : "Use password instead"}
        </button>

        {mode === "password" ? (
          <div className="mt-2 space-y-2">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-600 bg-slate-800/90 px-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="Enter password"
            />
            <button
              type="button"
              disabled={isSubmitting || !isLoaded}
              onClick={() => void handlePasswordSignIn()}
              className="h-9 rounded-md border border-slate-600 bg-slate-800/90 px-3 text-xs text-white disabled:opacity-60"
            >
              Sign in with password
            </button>
            <p className="text-xs text-slate-400">
              First time using password? Send yourself a setup code below.
            </p>
            <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/70 p-2">
              <button
                type="button"
                disabled={isSubmitting || !isLoaded}
                onClick={() => void handleSendPasswordSetupCode()}
                className="h-9 rounded-md border border-slate-600 px-3 text-xs text-slate-200 disabled:opacity-60"
              >
                Send password setup code
              </button>
              {resetCodeSent ? (
                <>
                  <input
                    type="text"
                    autoComplete="one-time-code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-600 bg-slate-800/90 px-3 text-xs text-white outline-none placeholder:text-slate-400 focus:border-blue-500"
                    placeholder="Enter setup code"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-600 bg-slate-800/90 px-3 text-xs text-white outline-none placeholder:text-slate-400 focus:border-blue-500"
                    placeholder="Create new password"
                  />
                  <button
                    type="button"
                    disabled={isSubmitting || !isLoaded}
                    onClick={() => void handleSetPasswordWithCode()}
                    className="h-9 rounded-md bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Set password and sign in
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
