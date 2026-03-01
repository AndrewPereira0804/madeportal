// src/auth/useRoles.ts
import { useEffect, useState } from "react";
import supabase from "../config/supabaseClient";
import { useAuth } from "./authProvider";

export default function useRoles() {
  const { session } = useAuth();
  // return an object containing the list and a loading flag
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user?.id) {
      setLoading(true);
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
          setLoading(false);
        });
    } else {
      setRoles([]);
      setLoading(false);
    }
  }, [session]);

  console.log("User session:", session);
  console.log("useRoles (array):", { session, roles, loading });
  return { roles, loading };
}
