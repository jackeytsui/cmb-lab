import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { OtpFirstSignIn } from "@/components/auth/OtpFirstSignIn";

export default function SignInPage() {
  return (
    <div className="auth-lockdown min-h-screen bg-[radial-gradient(circle_at_top_left,#1f2a87_0%,#0f172a_45%,#020617_100%)] px-4 py-8">
      <div className="mx-auto grid w-full max-w-6xl items-stretch gap-6 rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_1fr] md:p-6">
        <section className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/75 p-6 text-white">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white p-1.5 shadow-sm">
                <Image
                  src="/canto-to-mando-logo.png"
                  alt="Canto to Mando Lab"
                  width={96}
                  height={96}
                  className="h-full w-full scale-[1.18] object-cover object-top"
                  priority
                />
              </div>
              <div>
                <p className="text-xl font-semibold leading-none">Canto to Mando Lab</p>
                <p className="mt-1 text-xs tracking-[0.2em] text-slate-300 uppercase">
                  Canto to Mando Blueprint
                </p>
              </div>
            </Link>
            <h1 className="mt-8 max-w-md text-3xl font-semibold leading-tight">
              Your all-in-one home for the Canto to Mando Blueprint learning journey.
            </h1>
            <p className="mt-4 max-w-md text-sm text-slate-300">
              Practice reading with AI Passage Reader, train your listening with YouTube support, and access your coaching materials — all in one place.
            </p>
          </div>
          <div className="mt-10 rounded-lg border border-blue-400/30 bg-blue-500/10 p-3 text-xs text-slate-200">
            This platform is for Canto to Mando Blueprint members only. Sign in with the email you registered with.
          </div>
        </section>

        <section className="flex items-center justify-center rounded-xl border border-white/10 bg-slate-900/75 p-4 md:p-6">
          <div className="w-full max-w-sm rounded-xl border border-slate-700/70 bg-slate-950/80 p-5 shadow-xl">
            <h2 className="mb-4 text-center text-xl font-semibold text-white">
              Welcome back
            </h2>
            <p className="mb-5 text-center text-xs text-slate-400">
              Enter your email and we&apos;ll send you a sign-in code — no password needed.
            </p>
            <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-slate-800/50" />}>
              <OtpFirstSignIn />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
