import { useTranslations } from "@factory/i18n";
import { Link } from "@factory/i18n/navigation";

import { buttonVariants } from "../primitives/button";
import { cn } from "../lib/utils";
import { SignOutButton } from "../auth/sign-out-button";
import { ThemeToggle } from "../theme/theme-toggle";

export interface DashboardTopBarProps {
  userEmail: string;
  settingsHref: string;
}

// None of the three preset dashboards render SiteHeader (each has its own top bar via
// its own Card), so the theme toggle and account actions land here instead — the only
// reachable spot for someone who lands straight on /dashboard without visiting "/".
export function DashboardTopBar({ userEmail, settingsHref }: DashboardTopBarProps) {
  const t = useTranslations("ui.dashboard.topBar");

  return (
    <div className="flex items-center gap-2" aria-label={t("accountActionsLabel", { userEmail })}>
      <Link href={settingsHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        {t("settings")}
      </Link>
      <ThemeToggle />
      <SignOutButton />
    </div>
  );
}
