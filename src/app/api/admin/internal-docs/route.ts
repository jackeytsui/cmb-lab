import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { internalDocs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.any().optional(),
  order: z.number().optional(),
});

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const docs = await db.select().from(internalDocs).orderBy(asc(internalDocs.order));
    return NextResponse.json({ docs });
  } catch (error) {
    console.error("Error fetching internal docs:", error);
    return NextResponse.json({ error: "Failed to fetch docs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [doc] = await db
      .insert(internalDocs)
      .values({
        title: parsed.data.title,
        content: parsed.data.content ?? null,
        order: parsed.data.order ?? 0,
      })
      .returning();

    return NextResponse.json({ doc }, { status: 201 });
  } catch (error) {
    console.error("Error creating internal doc:", error);
    return NextResponse.json({ error: "Failed to create doc" }, { status: 500 });
  }
}
