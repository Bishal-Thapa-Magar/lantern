// Lantern settings. Safe to commit: the Supabase "anon" key is designed to be public.
// Your data is protected by the Row Level Security rules in supabase/schema.sql, NOT by hiding this key.
// NEVER put a "service_role" key here or anywhere in this repository.

export const CONFIG = {
  // Leave both empty to run in "guest mode" (saving works on this device only, no accounts).
  supabaseUrl: "", // e.g. "https://abcdxyzcompany.supabase.co"
  supabaseAnonKey: "", // the long "anon public" key from Supabase > Project Settings > API

  // Sign-in buttons to show. Each one must also be enabled in Supabase > Authentication > Providers.
  // Supabase names: google, linkedin_oidc, facebook, github, apple, twitter, discord, azure
  oauthProviders: [
    { id: "google", label: "Google" },
    { id: "linkedin_oidc", label: "LinkedIn" },
    { id: "facebook", label: "Facebook" },
    { id: "github", label: "GitHub" },
  ],
  emailLogin: true,

  // Where learners report mistakes or suggest resources.
  feedbackUrl: "https://github.com/YOUR-NAME/lantern/issues/new/choose",
};
