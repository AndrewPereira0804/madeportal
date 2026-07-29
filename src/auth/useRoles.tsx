// src/auth/useRoles.ts
import { useEffect, useState } from "react";
import supabase from "../config/supabaseClient";
import { useAuth } from "./authContext";

type UserRoleResult = {
  roles:
    | {
        slug: string;
      }
    | Array<{
        slug: string;
      }>
    | null;
};

type ProfileStatusResult = {
  status: string | null;
};

function getRoleSlug(row: UserRoleResult) {
  if (Array.isArray(row.roles)) {
    return row.roles[0]?.slug;
  }

  return row.roles?.slug;
}

async function fetchActiveUserRoleSlugs(userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status")
    .eq("user_id", userId)
    .single();

  const profileStatus = (profile as ProfileStatusResult | null)?.status ?? null;

  if (profileError || profileStatus !== "active") {
    return {
      roles: [] as string[],
      error: profileError,
    };
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("roles!inner(slug)")
    .eq("user_id", userId);

  return {
    roles: ((data ?? []) as UserRoleResult[])
      .map(getRoleSlug)
      .filter((slug): slug is string => Boolean(slug)),
    error,
  };
}

export default function useRoles() {
  const { session } = useAuth();
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    let ignore = false;

    const timeoutId = window.setTimeout(() => {
      if (!userId) {
        if (!ignore) {
          setRoles([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      fetchActiveUserRoleSlugs(userId)
        .then(({ roles: activeRoles, error }) => {
          if (ignore) {
            return;
          }

          if (error) {
            console.warn("could not fetch user roles", error);
            setRoles([]);
          } else {
            setRoles(activeRoles);
          }
          setLoading(false);
        });
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [userId]);

  return { roles, loading };
}
