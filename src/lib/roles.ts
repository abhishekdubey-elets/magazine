/**
 * Team roles and what each may do. Shared by the server (enforcement) and the
 * app (to hide actions people cannot take).
 */

export type Role = "admin" | "editor" | "designer" | "contributor" | "viewer";

export const ROLES: Role[] = ["admin", "editor", "designer", "contributor", "viewer"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  designer: "Designer",
  contributor: "Contributor",
  viewer: "Viewer",
};

export const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including team, fonts and settings.",
  editor: "Edits and approves articles and pages; releases issues to print.",
  designer: "Lays out pages, edits templates and settings, runs InDesign builds.",
  contributor: "Writes and edits articles and uploads images.",
  viewer: "Reads the workspace and proofs; cannot change anything.",
};

export type Capability =
  | "edit-articles"
  | "approve-articles"
  | "edit-pages"
  | "approve-pages"
  | "edit-templates"
  | "edit-publications"
  | "edit-settings"
  | "upload-assets"
  | "record-work"
  | "edit-references"
  | "build-indesign"
  | "release-print"
  | "manage-fonts"
  | "manage-team"
  | "use-ai";

const MATRIX: Record<Capability, Role[]> = {
  "edit-articles": ["admin", "editor", "contributor"],
  "approve-articles": ["admin", "editor"],
  "edit-pages": ["admin", "editor", "designer"],
  "approve-pages": ["admin", "editor"],
  "edit-templates": ["admin", "designer"],
  "edit-publications": ["admin", "editor", "designer"],
  "edit-settings": ["admin", "designer"],
  "upload-assets": ["admin", "editor", "designer", "contributor"],
  /** Activity, QA runs and proof-export history. */
  "record-work": ["admin", "editor", "designer", "contributor"],
  "edit-references": ["admin", "editor", "designer"],
  "build-indesign": ["admin", "editor", "designer"],
  "release-print": ["admin", "editor"],
  "manage-fonts": ["admin", "designer"],
  "manage-team": ["admin"],
  "use-ai": ["admin", "editor", "designer", "contributor"],
};

export function can(role: Role | null | undefined, cap: Capability): boolean {
  return !!role && MATRIX[cap].includes(role);
}

export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as string[]).includes(r);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
  role: Role;
}
