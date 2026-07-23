import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { testConnection } from "@/lib/test-connection";
import { getProvider, getAuthType } from "@/lib/models";
import type { ConnectionAuth } from "@/lib/connection-auth";

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
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!getProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (!/^https?:\/\//.test(endpoint)) {
    return NextResponse.json({ error: "Endpoint must be a valid URL" }, { status: 400 });
  }
  if (!model) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  const authType = getAuthType(provider);
  const admin = createAdminClient();

  let auth: ConnectionAuth;
  let encryptedKey: string | null = null;
  let encryptedUsername: string | null = null;
  let encryptedPassword: string | null = null;

  if (authType === "api_key") {
    let keyToTest = apiKey;
    if (!keyToTest) {
      const { data: existing } = await admin
        .from("api_keys")
        .select("encrypted_key")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing?.encrypted_key) {
        return NextResponse.json({ error: "API key is required" }, { status: 400 });
      }
      keyToTest = decrypt(existing.encrypted_key);
    }

    auth = { type: "bearer", token: keyToTest };
    encryptedKey = encrypt(keyToTest);
  } else {
    // Basic auth (Ollama): both fields are optional — a local, unprotected
    // instance needs no credentials at all. Leaving both blank on an
    // update keeps whatever was saved before instead of clearing it.
    let usernameToTest = username;
    let passwordToTest = password;

    if (!username.trim() && !password.trim()) {
      const { data: existing } = await admin
        .from("api_keys")
        .select("encrypted_username, encrypted_password")
        .eq("user_id", user.id)
        .maybeSingle();

      usernameToTest = existing?.encrypted_username ? decrypt(existing.encrypted_username) : "";
      passwordToTest = existing?.encrypted_password ? decrypt(existing.encrypted_password) : "";
    }

    auth =
      usernameToTest || passwordToTest
        ? { type: "basic", username: usernameToTest, password: passwordToTest }
        : { type: "none" };
    encryptedUsername = encrypt(usernameToTest);
    encryptedPassword = encrypt(passwordToTest);
  }

  const result = await testConnection(endpoint, auth, model);

  const { error } = await admin.from("api_keys").upsert(
    {
      user_id: user.id,
      provider,
      endpoint,
      auth_type: authType,
      encrypted_key: encryptedKey,
      encrypted_username: encryptedUsername,
      encrypted_password: encryptedPassword,
      selected_model: model,
      status: result.ok ? "connected" : "failed",
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("api_keys upsert failed:", error);
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }

  return NextResponse.json({
    status: result.ok ? "connected" : "failed",
    message: result.ok ? undefined : result.message,
  });
}
