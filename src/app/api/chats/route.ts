import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({ user_id: user.id, title: "New chat" })
    .select("id")
    .single();

  if (error || !chat) {
    return NextResponse.json({ error: "Could not create chat" }, { status: 500 });
  }

  return NextResponse.json({ id: chat.id });
}
