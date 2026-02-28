// src/auth/useRoles.ts
import { useEffect, useState } from "react";
import supabase from "../config/supabaseClient";
import { useAuth } from "./authProvider";

export default function useRoles() {
  const { session } = useAuth();
  // return an array of zero-or-more role slugs; empty when not logged in or no
  // roles assigned
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    if (session?.user?.id) {
      // select every linked role's slug. `!inner` makes the joined rows appear
      // at the top level, which simplifies mapping.
      supabase
        .from("user_roles")
        .select("roles!inner(slug)")
        .eq("user_id", session.user.id)
        .then(({ data, error }) => {
          if (error) {
            console.warn("could not fetch user roles", error);
            setRoles([]);
          } else {
            setRoles(
              data?.map((r: any) => r.roles.slug as string) ?? []
            );
          }
        });
    } else {
      setRoles([]);
    }
  }, [session]);

  console.log("User session:", session);
  console.log("useRoles (array):", { session, roles });
  return roles;
}
