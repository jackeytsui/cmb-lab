import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCertificateByVerificationId } from "@/lib/certificates";
import { CertificateDocument } from "@/components/certificate/CertificateDocument";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certificateId: string }> }
) {
  try {
    const { certificateId } = await params;
    const cert = await getCertificateByVerificationId(certificateId);

    if (!cert) {
      return NextResponse.json(
        { error: "Certificate not found" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement: any = React.createElement(CertificateDocument, {
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      completedAt: new Date(cert.completedAt),
      verificationId: cert.verificationId,
    });

    const buffer = await renderToBuffer(pdfElement);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certificate-${cert.verificationId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Certificate PDF render error:", error);
    return NextResponse.json(
      { error: "Failed to generate certificate PDF" },
      { status: 500 }
    );
  }
}
