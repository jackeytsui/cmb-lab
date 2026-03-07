import { Metadata } from "next";
import Link from "next/link";
import { getCertificateByVerificationId } from "@/lib/certificates";
import { CheckCircle2, Download, ExternalLink } from "lucide-react";

interface VerifyPageProps {
  params: Promise<{ certificateId: string }>;
}

export async function generateMetadata({
  params,
}: VerifyPageProps): Promise<Metadata> {
  const { certificateId } = await params;
  const cert = await getCertificateByVerificationId(certificateId);

  if (!cert) {
    return { title: "Certificate Not Found" };
  }

  return {
    title: `${cert.studentName} - ${cert.courseTitle} Certificate`,
    description: `Certificate of completion for ${cert.courseTitle}`,
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { certificateId } = await params;
  const cert = await getCertificateByVerificationId(certificateId);

  if (!cert) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-2xl">!</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Certificate Not Found</h1>
          <p className="text-zinc-400 mb-6">
            The certificate you are looking for does not exist or the
            verification ID is invalid.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  const verifyPageUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://cantomando.com"}/verify/${cert.verificationId}`;

  const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(cert.courseTitle)}&organizationName=${encodeURIComponent("CantoMando Blueprint")}&certUrl=${encodeURIComponent(verifyPageUrl)}&certId=${encodeURIComponent(cert.verificationId)}`;

  return (
    <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Verified Badge */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <span className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 text-sm font-medium rounded-full border border-emerald-500/20">
            Verified Certificate
          </span>
        </div>

        {/* Certificate Card */}
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-8 text-center">
          <p className="text-zinc-400 text-sm mb-2">This certifies that</p>
          <h1 className="text-3xl font-bold mb-4">{cert.studentName}</h1>
          <p className="text-zinc-400 text-sm mb-2">
            has successfully completed
          </p>
          <h2 className="text-xl font-semibold text-blue-400 mb-6">
            {cert.courseTitle}
          </h2>

          <div className="border-t border-zinc-700 pt-4 mb-6">
            <p className="text-zinc-400 text-sm">
              Completed on{" "}
              <span className="text-white">
                {formatDate(new Date(cert.completedAt))}
              </span>
            </p>
            <p className="text-zinc-500 text-xs mt-1">
              Verification ID: {cert.verificationId}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={`/api/certificates/${cert.verificationId}/download`}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
            <a
              href={linkedInUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "#0A66C2" }}
            >
              <ExternalLink className="w-4 h-4" />
              Add to LinkedIn
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-zinc-500 text-xs mt-6">
          This certificate was issued by CantoMando Blueprint
        </p>
      </div>
    </div>
  );
}
