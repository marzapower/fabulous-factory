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

/** name → (props) => JSX. `send()` looks up the renderer by template name. */
export const TEMPLATES: { [K in TemplateName]: (props: TemplateProps[K]) => ReactElement } = {
  "verify-email": VerifyEmailTemplate,
  "magic-link": MagicLinkTemplate,
  "reset-password": ResetPasswordTemplate,
  "delete-account": DeleteAccountTemplate,
};

export type { DeleteAccountProps, MagicLinkProps, ResetPasswordProps, VerifyEmailProps };
