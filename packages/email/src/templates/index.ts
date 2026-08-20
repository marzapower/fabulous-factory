import type { ReactElement } from "react";

import { MagicLinkTemplate, type MagicLinkProps } from "./magic-link";
import { VerifyEmailTemplate, type VerifyEmailProps } from "./verify-email";

/**
 * The props each template name expects. `send()` (src/send.ts) is generic over this map
 * so `send("verify-email", to, props)` type-checks `props` against `TemplateProps["verify-email"]`.
 */
export interface TemplateProps {
  "verify-email": VerifyEmailProps;
  "magic-link": MagicLinkProps;
}

export type TemplateName = keyof TemplateProps;

/** name → (props) => JSX. `send()` looks up the renderer by template name. */
export const TEMPLATES: { [K in TemplateName]: (props: TemplateProps[K]) => ReactElement } = {
  "verify-email": VerifyEmailTemplate,
  "magic-link": MagicLinkTemplate,
};

export type { MagicLinkProps, VerifyEmailProps };
