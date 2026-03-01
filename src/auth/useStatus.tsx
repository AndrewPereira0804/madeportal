import { useEffect, useState } from "react";
import supabase from "../config/supabaseClient";
import { useAuth } from "./authProvider";

// hook returns the `status` field from the profiles table for the current
// session user. `null` means not logged in or row not found.
async function fetchProfileStatus(userId: string) {
  const byUserId = await supabase
    .from("profiles")
    .select("status")
    .eq("user_id", userId)
    .single();

  if (!byUserId.error) {
    return byUserId;
  }

  return supabase
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .single();
}

export function useStatus() {
  const { session } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user?.id) {
      setLoading(true);
      fetchProfileStatus(session.user.id).then(({ data, error }) => {
          if (error) {
            console.warn("could not fetch profile status", error);
            setStatus(null);
          } else {
            setStatus(data?.status ?? null);
          }
          setLoading(false);
        });
    } else {
      setStatus(null);
      setLoading(false);
    }
  }, [session]);

  return { status, loading };
}
