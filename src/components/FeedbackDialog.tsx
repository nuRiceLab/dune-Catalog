"use client";

/**
 * FeedbackDialog — icon button + modal form for reporting issues / feedback.
 *
 * Place <FeedbackDialog /> in the app header (upper-right corner).
 * Pure frontend: on submit, opens the user's mail client via a mailto: link
 * with the form contents prefilled. No backend endpoint required.
 *
 * Requires shadcn/ui components: dialog, button, input, textarea, label.
 * Icons: lucide-react (already a shadcn dependency).
 */

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Bug,
  ExternalLink,
  Lightbulb,
  MessageSquareText,
  Send,
} from "lucide-react";

/**
 * Magnifying glass with an exclamation mark in the lens.
 * Custom SVG in lucide style (24x24, stroke 2) — lucide has no
 * "search-alert" icon, so this blends in with the rest of the icon set.
 */
function SearchAlertIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* lens */}
      <circle cx="10.5" cy="10.5" r="7.5" />
      {/* handle */}
      <line x1="16" y1="16" x2="21" y2="21" />
      {/* exclamation mark inside the lens */}
      <line x1="10.5" y1="6.8" x2="10.5" y2="11.6" />
      <circle cx="10.5" cy="14.4" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Where feedback emails go. Comma-separate for multiple recipients. */
const FEEDBACK_EMAIL = "dunetech@rice.edu"; // TODO: set the real address
const REPO_ISSUES_URL = "https://github.com/nuRiceLab/dune-Catalog/issues";

type Category = "bug" | "feature" | "feedback";

const CATEGORIES: {
  value: Category;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "bug", label: "Report a bug", icon: Bug },
  { value: "feature", label: "Request a feature", icon: Lightbulb },
  { value: "feedback", label: "General feedback", icon: MessageSquareText },
];

const SUBJECT_TAG: Record<Category, string> = {
  bug: "bug",
  feature: "feature request",
  feedback: "feedback",
};

const TITLE_MIN = 5;
const TITLE_MAX = 120;
const DESC_MIN = 10;
// Kept modest: mailto URLs are unreliable beyond ~2000 chars in some clients.
const DESC_MAX = 1500;

export default function FeedbackDialog() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [launched, setLaunched] = useState(false);

  const titleOk = title.trim().length >= TITLE_MIN && title.length <= TITLE_MAX;
  const descOk =
    description.trim().length >= DESC_MIN && description.length <= DESC_MAX;
  const canSubmit = titleOk && descOk;

  function resetForm() {
    setCategory("bug");
    setTitle("");
    setDescription("");
    setLaunched(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Reset when the dialog closes so a fresh form appears next time.
    if (!next) resetForm();
  }

  function buildMailtoUrl(): string {
    const pageContext = `${pathname}${
      searchParams?.toString() ? `?${searchParams.toString()}` : ""
    }`;

    const subject = `[DUNE Catalog][${SUBJECT_TAG[category]}] ${title.trim()}`;
    const body =
      `${description.trim()}\n\n` +
      `----------------------------------------\n` +
      `Category : ${category}\n` +
      `Page     : ${pageContext}\n` +
      `Source   : DUNE Catalog in-app feedback form\n`;

    return (
      `mailto:${FEEDBACK_EMAIL}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`
    );
  }

  function handleSubmit() {
    if (!canSubmit) return;
    // Opens the user's default mail client with the message prefilled.
    window.location.href = buildMailtoUrl();
    // We can't detect whether a client actually opened, so switch the dialog
    // to a "check your mail app / fallback" view instead of claiming success.
    setLaunched(true);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Report an issue or give feedback"
          title="Report an issue or give feedback"
          className="gap-1.5 text-white hover:text-white hover:bg-gray-700"
        >
          <SearchAlertIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Report issue</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {launched ? (
          /* ---------- Post-launch view ---------- */
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Almost done — press send</DialogTitle>
              <DialogDescription>
                Your email app should have opened with the report prefilled.
                Press send there to deliver it.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Nothing opened? Your browser may not have a mail app configured.
              You can email us directly at{" "}
              <a
                href={`mailto:${FEEDBACK_EMAIL}`}
                className="underline underline-offset-4"
              >
                {FEEDBACK_EMAIL}
              </a>{" "}
              (copy and paste the address into any mail client), or{" "}
              <a
                href={`${REPO_ISSUES_URL}/new/choose`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                open an issue on GitHub
              </a>
              .
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLaunched(false)}>
                Back to form
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          /* ---------- Form view ---------- */
          <>
            <DialogHeader>
              <DialogTitle>Report an issue or give feedback</DialogTitle>
              <DialogDescription>
                Fill this out and we'll open an email to the developers in
                your mail app, ready to send. No GitHub account needed.
              </DialogDescription>
              <a
                href={`${REPO_ISSUES_URL}/new/choose`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1 text-sm font-semibold underline underline-offset-4"
              >
                Open an issue on GitHub instead
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </DialogHeader>

            <div className="grid gap-4">
              {/* Category selector */}
              <div className="grid gap-2">
                <Label>Type</Label>
                <div
                  role="radiogroup"
                  aria-label="Feedback type"
                  className="grid grid-cols-3 gap-2"
                >
                  {CATEGORIES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={category === value}
                      onClick={() => setCategory(value)}
                      className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        category === value
                          ? "border-primary bg-primary/10 font-medium"
                          : "border-input hover:bg-accent"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="grid gap-2">
                <Label htmlFor="feedback-title">Summary</Label>
                <Input
                  id="feedback-title"
                  placeholder={
                    category === "bug"
                      ? "e.g. Search returns no results for hd-protodune"
                      : "One-line summary"
                  }
                  value={title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="grid gap-2">
                <Label htmlFor="feedback-description">Details</Label>
                <Textarea
                  id="feedback-description"
                  rows={5}
                  placeholder={
                    category === "bug"
                      ? "What did you do, what did you expect, and what happened instead?"
                      : "Tell us more…"
                  }
                  value={description}
                  maxLength={DESC_MAX}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {description.length}/{DESC_MAX} — the page you're on is
                  attached automatically.
                </p>
              </div>

              <div className="flex items-center justify-end">
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  <Send className="mr-2 h-4 w-4" />
                  Open email to send
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
