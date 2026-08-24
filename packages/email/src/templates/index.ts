import type { ReactElement } from "react";

import { DeleteAccountTemplate, type DeleteAccountProps } from "./delete-account";
import { MagicLinkTemplate, type MagicLinkProps } from "./magic-link";
import { ResetPasswordTemplate, type ResetPasswordProps } from "./reset-password";
import { VerifyEmailTemplate, type VerifyEmailProps } from "./verify-email";

/**
 * The props each template name expects. `send()` (src/send.ts) is generic over this map
 * so `send("verify-email", to, props)` type-checks `props` against `TemplateProps["verify-email"]`.
 */
export interface TemplateProps {
  "verify-email": VerifyEmailProps;
  "magic-link": MagicLinkProps;
  "reset-password": ResetPasswordProps;
  "delete-account": DeleteAccountProps;
}

export type TemplateName = keyof TemplateProps;

/** A template's renderer and its one subject line, kept together so callers never look
 * the two up independently by name — `send()` (src/send.ts) reads both from one entry. */
export interface TemplateEntry<K extends TemplateName> {
  Component: (props: TemplateProps[K]) => ReactElement;
  subject: string;
}

/** name → { Component, subject }. `send()` looks up both by template name in one place. */
export const TEMPLATES: { [K in TemplateName]: TemplateEntry<K> } = {
  "verify-email": { Component: VerifyEmailTemplate, subject: "Verify your email address" },
  "magic-link": { Component: MagicLinkTemplate, subject: "Your sign-in link" },
  "reset-password": { Component: ResetPasswordTemplate, subject: "Reset your password" },
  "delete-account": { Component: DeleteAccountTemplate, subject: "Confirm account deletion" },
};

export type { DeleteAccountProps, MagicLinkProps, ResetPasswordProps, VerifyEmailProps };
