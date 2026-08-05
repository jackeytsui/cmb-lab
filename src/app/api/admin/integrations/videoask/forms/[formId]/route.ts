import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { fetchVideoAskForm } from "@/lib/videoask/client";
import { normalizeVideoAskForm } from "@/lib/videoask/mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ formId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { formId } = await params;
  if (!formId || formId.length > 200) {
    return NextResponse.json({ error: "Invalid VideoAsk form ID" }, { status: 400 });
  }

  try {
    const form = normalizeVideoAskForm(await fetchVideoAskForm(formId));
    return NextResponse.json({
      form: {
        id: form.id,
        title: form.title,
        folderId: form.folderId,
        folderName: form.folderName,
        shareUrl: form.shareUrl,
        updatedAt: form.updatedAt?.toISOString() ?? null,
        description: form.description,
        warnings: form.warnings,
        stats: {
          questions: form.questions.length,
          promptTexts: form.questions.filter((question) => question.promptText).length,
          transcriptions: form.questions.filter((question) => question.transcription)
            .length,
          sourceMedia: form.questions.filter((question) => question.mediaUrl).length,
          logicActions: form.questions.reduce(
            (total, question) => total + question.logicEdges.length,
            0,
          ),
        },
        questions: form.questions.map((question) => ({
          id: question.id,
          label: question.label,
          title: question.title,
          promptText: question.promptText,
          transcription: question.transcription,
          mediaType: question.mediaType,
          hasMedia: Boolean(question.mediaUrl),
          responseType: question.responseType,
          allowedResponseTypes: question.allowedResponseTypes,
          options: question.options.map((option) => ({
            label: option.label,
            value: option.value,
          })),
          logicActions: question.logicEdges.length,
          warnings: question.warnings,
        })),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not inspect VideoAsk form";
    console.error("[videoask/form-preview] Failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
