interface ProfileName {
  role?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
}

interface ChairmanNameSettings {
  chairman_name?: string | null;
}

export function chairmanDisplayName(
  settings: ChairmanNameSettings | null | undefined,
): string {
  return settings?.chairman_name?.trim() || "Chairman";
}

export function userDisplayName(
  user: ProfileName | null | undefined,
  fallbackFullName = "",
  settings?: ChairmanNameSettings | null,
): string {
  if (user?.role === "super-admin" || user?.role === "chairman")
    return chairmanDisplayName(settings);
  return (
    [user?.first_name?.trim(), user?.last_name?.trim()]
      .filter(Boolean)
      .join(" ") ||
    user?.full_name?.trim() ||
    user?.name?.trim() ||
    fallbackFullName.trim() ||
    user?.email?.split("@")[0] ||
    ""
  );
}
