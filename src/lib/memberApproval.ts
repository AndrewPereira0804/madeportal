import supabase from "../config/supabaseClient";

export type ChapterAccessRoleSlug = "brother" | "neophyte" | "alum";

export const chapterAccessRoleOptions: Array<{ slug: ChapterAccessRoleSlug; label: string }> = [
  { slug: "brother", label: "Brother" },
  { slug: "neophyte", label: "Neophyte" },
  { slug: "alum", label: "Alum" },
];

export async function approveMemberWithChapterRole(
  targetUserId: string,
  chapterRoleSlug: ChapterAccessRoleSlug,
) {
  const { error } = await supabase.rpc("approve_member", {
    target_user_id: targetUserId,
    chapter_role_slug: chapterRoleSlug,
    extra_role_slugs: [],
  });

  if (error) {
    throw error;
  }
}
