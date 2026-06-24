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

function getRoleSlug(row: UserRoleResult) {
  if (Array.isArray(row.roles)) {
    return row.roles[0]?.slug;
  }

  return row.roles?.slug;
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
      supabase
        .from("user_roles")
        .select("roles!inner(slug)")
        .eq("user_id", userId)
        .then(({ data, error }) => {
          if (ignore) {
            return;
          }

          if (error) {
            console.warn("could not fetch user roles", error);
            setRoles([]);
          } else {
            setRoles(
              ((data ?? []) as UserRoleResult[])
                .map(getRoleSlug)
                .filter((slug): slug is string => Boolean(slug))
            );
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
