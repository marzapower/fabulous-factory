import { setRequestLocale } from "@factory/i18n/server";
import { notFound } from "next/navigation";

export default async function CatchAll({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  notFound();
}
