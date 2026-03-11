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
              Use AI Passage Reader to generate guided Chinese reading practice, then train your listening with YouTube transcript support.
            </p>
          </div>
          <div className="mt-10 rounded-lg border border-blue-400/30 bg-blue-500/10 p-3 text-xs text-slate-200">
            Access is invite-only. Sign in with the registered email with Canto to Mando Blueprint.
          </div>
        </section>

        <section className="flex items-center justify-center rounded-xl border border-white/10 bg-slate-900/75 p-4 md:p-6">
          <div className="w-full rounded-xl border border-slate-700/70 bg-slate-950/80 p-4 shadow-xl [&_.cl-card]:border-0 [&_.cl-card]:bg-transparent [&_.cl-card]:shadow-none [&_.cl-formFieldLabel]:text-slate-200 [&_.cl-formFieldInput]:border-slate-600 [&_.cl-formFieldInput]:bg-slate-800/90 [&_.cl-formFieldInput]:text-white [&_.cl-formButtonPrimary]:bg-blue-600 [&_.cl-formButtonPrimary]:text-white hover:[&_.cl-formButtonPrimary]:bg-blue-700 [&_.cl-socialButtonsBlockButton]:border [&_.cl-socialButtonsBlockButton]:border-slate-600 [&_.cl-socialButtonsBlockButton]:bg-slate-800/90 [&_.cl-socialButtonsBlockButton]:text-white [&_.cl-socialButtonsBlockButton]:shadow-none hover:[&_.cl-socialButtonsBlockButton]:bg-slate-700/90">
            <h2 className="mb-3 text-center text-xl font-semibold text-white">
              Login to your Canto to Mando Lab!
            </h2>
            <OtpFirstSignIn />
          </div>
        </section>
      </div>
    </div>
  );
}
