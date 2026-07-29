import { useEffect, useState } from "react";
import supabase from "../config/supabaseClient";
import { useAuth } from "./authContext";

// hook returns the `status` field from the profiles table for the current
// session user. `null` means not logged in or row not found.
async function fetchProfileStatus(userId: string) {
  return supabase
    .from("profiles")
    .select("status")
    .eq("user_id", userId)
    .single();
}

export function useStatus() {
  const { session } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    let ignore = false;

    const timeoutId = window.setTimeout(() => {
      if (!userId) {
        if (!ignore) {
          setStatus(null);
          setLoadedUserId(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      fetchProfileStatus(userId).then(({ data, error }) => {
        if (ignore) {
          return;
        }

        if (error) {
          console.warn("could not fetch profile status", error);
          setStatus(null);
        } else {
          setStatus(data?.status ?? null);
        }
        setLoadedUserId(userId);
        setLoading(false);
      });
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [userId]);

  return {
    status,
    loading: loading || (userId !== null && loadedUserId !== userId),
  };
}
