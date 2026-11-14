"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ActionState = {
  message: string;
  status: "idle" | "error" | "success";
};

const invalidEmailMessage = "Enter a valid email address.";
const invalidPasswordMessage = "Password must be at least 8 characters.";
const loginFailureMessage = "Wrong email or password";

type CredentialsResult =
  | { error: string }
  | { credentials: { email: string; password: string } };

function validateCredentials(formData: FormData): CredentialsResult {
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return { error: invalidEmailMessage };
  }

  if (typeof password !== "string" || password.length < 8) {
    return { error: invalidPasswordMessage };
  }

  return { credentials: { email: email.trim(), password } };
}

export async function logIn(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const credentials = validateCredentials(formData);
  if ("error" in credentials) {
    return { message: credentials.error, status: "error" };
  }

  try {
    const { error } = await (
      await createClient()
    ).auth.signInWithPassword(credentials.credentials);
    if (error) {
      return { message: loginFailureMessage, status: "error" };
    }
  } catch (error) {
    console.error("Supabase sign-in request failed.", error);
    return { message: loginFailureMessage, status: "error" };
  }

  redirect("/");
}

export async function signUp(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const credentials = validateCredentials(formData);
  if ("error" in credentials) {
    return { message: credentials.error, status: "error" };
  }

  const rawName = formData.get("name");
  const displayName =
    typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim().slice(0, 80) : "";

  let hasSession = false;
  try {
    const { data, error } = await (
      await createClient()
    ).auth.signUp({
      ...credentials.credentials,
      // Optional display name, stored in the user's auth profile metadata
      // (used for the dashboard greeting). Not a database schema change.
      options: displayName ? { data: { full_name: displayName } } : undefined,
    });
    if (error) {
      return {
        message: "Unable to create your account. Please try again.",
        status: "error",
      };
    }
    hasSession = Boolean(data.session);
  } catch (error) {
    console.error("Supabase sign-up request failed.", error);
    return {
      message: "Unable to create your account. Please try again.",
      status: "error",
    };
  }

  if (hasSession) {
    redirect("/");
  }

  return {
    message: "Check your email for a confirmation link, then log in.",
    status: "success",
  };
}
