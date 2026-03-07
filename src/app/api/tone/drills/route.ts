import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

const mandarinDrills = [
  { id: "m1", syllable: "ma", tone: 1, language: "mandarin" },
  { id: "m2", syllable: "ma", tone: 2, language: "mandarin" },
  { id: "m3", syllable: "ma", tone: 3, language: "mandarin" },
  { id: "m4", syllable: "ma", tone: 4, language: "mandarin" },
  { id: "ms1", syllable: "ni3 hao3", tone: 2, language: "mandarin", type: "sandhi" },
];

const cantoneseDrills = [
  { id: "c1", syllable: "si", tone: 1, language: "cantonese" },
  { id: "c2", syllable: "si", tone: 2, language: "cantonese" },
  { id: "c3", syllable: "si", tone: 3, language: "cantonese" },
  { id: "c4", syllable: "si", tone: 4, language: "cantonese" },
  { id: "c5", syllable: "si", tone: 5, language: "cantonese" },
  { id: "c6", syllable: "si", tone: 6, language: "cantonese" },
];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const language = request.nextUrl.searchParams.get("language") ?? "mandarin";
  const drills = language === "cantonese" ? cantoneseDrills : mandarinDrills;

  return NextResponse.json({ drills });
}
