import Link from "next/link";

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
  return (
    <div className="flex items-center gap-2" aria-label={`Account actions for ${userEmail}`}>
      <Link href={settingsHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Settings
      </Link>
      <ThemeToggle />
      <SignOutButton />
    </div>
  );
}
