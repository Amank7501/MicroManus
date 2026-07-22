import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { testConnection } from "@/lib/test-connection";
import { getProvider } from "@/lib/models";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

  if (!getProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (!/^https?:\/\//.test(endpoint)) {
    return NextResponse.json({ error: "Endpoint must be a valid URL" }, { status: 400 });
  }
  if (!model) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  let keyToTest = apiKey;
  if (!keyToTest) {
    const { data: existing } = await admin
      .from("api_keys")
      .select("encrypted_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }
    keyToTest = decrypt(existing.encrypted_key);
  }

  const result = await testConnection(endpoint, keyToTest, model);

  const { error } = await admin.from("api_keys").upsert(
    {
      user_id: user.id,
      provider,
      endpoint,
      encrypted_key: encrypt(keyToTest),
      selected_model: model,
      status: result.ok ? "connected" : "failed",
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }

  return NextResponse.json({
    status: result.ok ? "connected" : "failed",
    message: result.ok ? undefined : result.message,
  });
}
