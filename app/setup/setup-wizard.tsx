"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import Confetti from "react-confetti";
import { LuArrowLeft, LuArrowRight, LuCheck, LuCircleAlert, LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import { toast, ToastContainer, type ToastIcon } from "react-toastify";
import type { ConfigView } from "@/lib/config-shared";
import { call, toBody, toModel, type Model } from "../(app)/settings/config-model";
import { ConfigSectionBody } from "../(app)/settings/config-section-body";
import type { ConfigSection } from "../(app)/settings/config-sections";
import { PlainLanguage } from "../(app)/settings/plain";
import { AddMemberForm } from "../(app)/settings/team/add-member-form";
import { FadeIn, NavHighlight } from "../motion";

type Step = {
  key: string;
  title: string;
  hint: string; // one line in the step bar
  sections?: ConfigSection[];
};

const STEPS: Step[] = [
  { key: "welcome", title: "Welcome", hint: "Set up the framework your analysts will screen deals with." },
  {
    key: "quick",
    title: "Quick Screen questions",
    hint: "The first filter: answered from the deal materials before any deeper work.",
    sections: ["quick"],
  },
  {
    key: "prompts",
    title: "Collection Prompts",
    hint: "The questions the research on every deal must answer; unanswered ones are flagged.",
    sections: ["prompts"],
  },
  {
    key: "counter",
    title: "Counter-Case Prompts",
    hint: "Questions used to argue against each deal, so the risks get equal attention.",
    sections: ["counter"],
  },
  {
    key: "dims",
    title: "Evaluation dimensions",
    hint: "The lenses each deal is scored on from 0 to 5, based on the evidence found for it.",
    sections: ["dims"],
  },
  {
    key: "anchors",
    title: "Score anchors",
    hint: "What each score means, so scores stay comparable across deals.",
    sections: ["anchors"],
  },
  {
    key: "class",
    title: "Proceed / Watch / Pass",
    hint: "The rules that turn scores into a recommendation, applied automatically.",
    sections: ["class"],
  },
  {
    key: "defaults",
    title: "Review the defaults",
    hint: "How far to trust each source and how much evidence a score needs.",
    sections: ["tiers", "conf", "suff"],
  },
  { key: "team", title: "Your team", hint: "Optional: add the analysts and admins who will work with you." },
  { key: "done", title: "Ready", hint: "Publish the configuration as v1 and open the dashboard." },
];

// What has to be fixed before a step can be saved, in plain words, with a tip
// on how to fix it. The database checks the same again when the configuration
// is published.
type Problem = { title: string; tip: string };

const EMPTY_TIP = "Fill in the empty field, or remove the item with its × button if you added it by mistake.";

function problemIn(key: string, m: Model): Problem | null {
  const blank = (v: string | undefined | null) => !v || !v.trim();
  switch (key) {
    case "quick":
      if (m.quick.length === 0)
        return { title: "Add at least one Quick Screen question.", tip: "Use + Add question below the list. Two or three questions are usually enough." };
      if (m.quick.length > 7)
        return { title: "Use at most seven Quick Screen questions.", tip: "Remove the ones you need least with their × button; the first check should stay short." };
      if (m.quick.some((q) => blank(q.label) || blank(q.question)))
        return {
          title: "A Quick Screen question is incomplete.",
          tip: "Every question needs a short label and the question itself. Fill in both fields, or remove the question with its × button.",
        };
      return null;
    case "prompts":
      if (m.prompts.length === 0)
        return { title: "Add at least one research question.", tip: "Use + Add question below the list, or go Back and forward again to start from the defaults." };
      if (m.prompts.some((p) => blank(p.question))) return { title: "One of the research questions is empty.", tip: EMPTY_TIP };
      return null;
    case "counter":
      if (m.counter.length === 0)
        return { title: "Add at least one question to argue against a deal.", tip: "Use + Add question below the list. Each one produces one argument against the investment." };
      if (m.counter.some((p) => blank(p.prompt))) return { title: "One of the questions is empty.", tip: EMPTY_TIP };
      return null;
    case "dims":
      if (m.dims.length === 0)
        return { title: "Add at least one area to score deals on.", tip: "Use + Add area below the list, for example Team or Competitive advantage." };
      if (m.dims.some((d) => blank(d.title) || blank(d.question)))
        return {
          title: "An area is missing its name or guiding question.",
          tip: "Open each area and check the first two fields, or remove an area you don't need with its × button.",
        };
      if (m.dims.some((d) => d.prompts.some((p) => blank(p.prompt))))
        return { title: "A question inside one of the areas is empty.", tip: "Open the areas, then " + EMPTY_TIP.charAt(0).toLowerCase() + EMPTY_TIP.slice(1) };
      return null;
    case "anchors":
      if (Object.values(m.anchors).some((v) => blank(v)))
        return { title: "A score is missing its description.", tip: "Describe what every score from 0 to 5 means, so everyone scores deals the same way." };
      return null;
    case "class":
      for (const r of m.criteria.rules) {
        const name = r.outcome === "pass" ? "Pass" : r.outcome === "watch" ? "Watch" : "Proceed";
        if (r.outcome !== "proceed" && r.predicates.length === 0)
          return { title: `The ${name} rules have no condition.`, tip: `Use + Add condition under ${name} and pick when it should apply.` };
        if (r.predicates.some((p) => "value" in p && Number.isNaN(p.value)))
          return { title: `A ${name} condition is missing its number.`, tip: "Fill in the number next to the condition, or remove the condition with its × button." };
      }
      return null;
    case "defaults":
      if ([m.suff.min, m.suff.max, m.suff.cap].some((n) => Number.isNaN(n)))
        return { title: "A number in the evidence rules is empty.", tip: "Fill in every number under Sufficiency rule; the defaults (2, 5 and 2) work for most funds." };
      if (m.suff.min > m.suff.max)
        return { title: "The minimum is higher than the maximum.", tip: "Under Sufficiency rule, the first number (facts per score) has to be smaller than or equal to the second." };
      return null;
    default:
      return null;
  }
}

// Toast body: what is wrong, and how to fix it.
function Tip({ title, tip }: Problem) {
  return (
    <div className="pt-[5px]">
      <div className="text-reading leading-snug font-semibold text-[var(--color-text)]">{title}</div>
      <div className="mt-1 text-body leading-relaxed text-[var(--color-neutral-300)]">{tip}</div>
    </div>
  );
}

// Toast icons: the app's icons in a tinted square, coloured by type.
const toastIcon: ToastIcon = ({ type }) => {
  const look =
    type === "error" || type === "warning"
      ? { Icon: type === "error" ? LuCircleAlert : LuTriangleAlert, color: "var(--color-danger)", bg: "var(--color-warn-bg)" }
      : { Icon: LuCircleCheck, color: "var(--color-cobalt)", bg: "var(--color-cobalt-tint)" };
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px]"
      style={{ color: look.color, background: look.bg }}
    >
      <look.Icon aria-hidden className="h-4 w-4" />
    </span>
  );
};

const SAVE_TIP =
  "Check your internet connection and try again. Your earlier steps are already saved; if it keeps failing, reload the page.";

export function SetupWizard({
  fundName,
  displayName,
  draft,
}: {
  fundName: string;
  displayName: string;
  draft: ConfigView;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // 1 when moving forward, -1 when going back: the next step slides in from that side.
  const [direction, setDirection] = useState(1);
  const [reached, setReached] = useState(0);
  const [model, setModel] = useState<Model>(() => toModel(draft));
  const [saved, setSaved] = useState(() => JSON.stringify(toBody(toModel(draft))));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [busy, startTransition] = useTransition();

  const step = STEPS[index];
  const dirty = useMemo(() => JSON.stringify(toBody(model)) !== saved, [model, saved]);
  const update =
    <K extends keyof Model>(key: K) =>
    (value: Model[K]) =>
      setModel((m) => ({ ...m, [key]: value }));

  // Window size for the confetti on the last step.
  useEffect(() => {
    const read = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Save the draft (when changed) and reload it, so new rows get their ids.
  async function save() {
    if (!dirty) return;
    const { draft: savedDraft } = await call("PUT", "/api/settings/config", toBody(model));
    const next = toModel(savedDraft);
    setModel(next);
    setSaved(JSON.stringify(toBody(next)));
  }

  function go(to: number) {
    // Moving on checks the current step; going back never blocks.
    const problem = to > index ? problemIn(step.key, model) : null;
    if (problem) {
      toast.warning(<Tip {...problem} />, { toastId: problem.title });
      return;
    }
    startTransition(async () => {
      try {
        await save();
        setDirection(to > index ? 1 : -1);
        setIndex(to);
        setReached((r) => Math.max(r, to));
        window.scrollTo({ top: 0 });
      } catch (e) {
        toast.error(
          <Tip title={e instanceof Error ? `Couldn't save: ${e.message.replace(/\.$/, "")}.` : "Couldn't save this step."} tip={SAVE_TIP} />,
        );
      }
    });
  }


  function finish(skip: boolean) {
    if (skip && !confirm("Skip the setup and use the default configuration? You can change everything later in Settings."))
      return;
    startTransition(async () => {
      try {
        if (!skip) await save();
        await call("POST", "/api/setup/complete");
        router.push("/deals");
        router.refresh();
      } catch (e) {
        toast.error(
          <Tip
            title={e instanceof Error ? `Couldn't finish the setup: ${e.message.replace(/\.$/, "")}.` : "Couldn't finish the setup."}
            tip="Go back through the steps and check that nothing is empty, then try again. If it keeps failing, reload the page; your steps are saved."
          />,
        );
      }
    });
  }


  const last = index === STEPS.length - 1;

  return (
    <>
      <ToastContainer
        position="top-right"
        hideProgressBar
        newestOnTop
        closeOnClick
        theme="light"
        autoClose={7000}
        icon={toastIcon}
      />
      {last && size.width > 0 && (
        <Confetti
          width={size.width}
          height={size.height}
          recycle={false}
          numberOfPieces={380}
          gravity={0.22}
          colors={["#2b4bff", "#1a33c9", "#c9d2ff", "#e9ecff", "#0e1530", "#f2dc4b"]}
          style={{ position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none" }}
        />
      )}
      <aside className="app-sidebar" aria-label="Setup steps">
        <div className="text-section mb-1 px-2.5 font-semibold">Set up {fundName}</div>
        <p className="text-muted mb-3 px-2.5 text-meta leading-relaxed">
          Each step comes filled in with sensible defaults. Adjust what matters to your fund now; you can change everything later in Settings.
        </p>
        {STEPS.map((s, i) => {
          const done = i !== index && i < reached;
          const current = i === index;
          const reachable = i <= reached && !busy;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => reachable && i !== index && go(i)}
              disabled={!reachable && !current}
              aria-current={current ? "step" : undefined}
              className={`sidebar-item w-full text-left ${reachable || current ? "" : "sidebar-item-locked"} ${i < STEPS.length - 1 ? "step-item" : ""}`}
            >
              {current && <NavHighlight id="setup-nav" />}
              <span
                className={`step-marker ${
                  done ? "step-marker-done" : current ? "step-marker-current" : reachable ? "step-marker-todo" : "step-marker-locked"
                }`}
              >
                {done ? <LuCheck aria-hidden className="h-3 w-3" strokeWidth={3} /> : String(i + 1).padStart(2, "0")}
              </span>
              {s.title}
            </button>
          );
        })}
      </aside>

      <main className="w-full flex-1 px-12 pt-12 pb-6 md:pl-[calc(264px+3rem)]">
        {/* The Ready step is centred in the whole area next to the sidebar. */}
        <div
          className={
            last ? "mx-auto flex min-h-[calc(100dvh-60px-220px)] max-w-[880px] items-center justify-center" : "max-w-[880px]"
          }
        >
          <FadeIn key={step.key} x={8 * direction}>
            {step.key === "welcome" ? (
              <Welcome name={displayName} fundName={fundName} />
            ) : step.key === "team" ? (
              <TeamStep />
            ) : step.key === "done" ? (
              <Done fundName={fundName} model={model} />
            ) : (
              <div className="flex flex-col gap-12">
                {step.key === "defaults" && (
                  <p className="text-muted -mb-6 text-reading leading-relaxed">
                    These settings work for most funds, so you can usually leave them as they are. The confidence levels are
                    fixed.
                  </p>
                )}
                {step.sections!.map((section) => (
                  <div key={section}>
                    <PlainLanguage>
                      <ConfigSectionBody section={section} view={model} shown={draft} update={update} fundName={fundName} />
                    </PlainLanguage>
                  </div>
                ))}
              </div>
            )}
          </FadeIn>
        </div>

        {/* Setup bar: pinned to the bottom, like the pipeline's step bar. */}
        <div
          className={`sticky bottom-0 z-[4] mt-10 max-w-[880px] bg-[var(--color-bg)] pt-3 pb-4 ${last ? "mx-auto" : ""}`}
        >
          <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5 pr-3.5 pl-4 shadow-[0_6px_20px_rgb(14_21_48/0.08),0_1px_3px_rgb(14_21_48/0.06)]">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-tag leading-tight font-medium text-[var(--color-neutral-500)]">
                Step {index + 1} of {STEPS.length} · {step.title}
              </div>
              <div className="text-body leading-snug font-medium">
                {busy ? "Saving…" : dirty ? "Unsaved changes · saved when you continue" : step.hint}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {index === 0 ? (
                <button type="button" className="btn" onClick={() => finish(true)} disabled={busy}>
                  Skip and use the defaults
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => go(index - 1)} disabled={busy}>
                  <LuArrowLeft aria-hidden className="h-4 w-4" />
                  Back
                </button>
              )}
              {last ? (
                <button type="button" className="btn btn-primary" onClick={() => finish(false)} disabled={busy}>
                  Finish setup and open the dashboard
                  <LuArrowRight aria-hidden className="h-4 w-4" />
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => go(index + 1)} disabled={busy}>
                  {index === 0 ? "Start setup" : step.key === "team" ? "Continue" : "Save and continue"}
                  <LuArrowRight aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function Welcome({ name, fundName }: { name: string; fundName: string }) {
  return (
    <div>
      <h1 className="mb-2 text-page">Welcome to Tracer, {name.split(" ")[0]}</h1>
      <p className="text-muted mb-8 max-w-[640px] text-reading leading-relaxed">
        Before the first deal, set up how {fundName} screens companies. Every deal runs through the same framework, so
        these settings decide which questions are asked, what evidence is required, and how a Proceed, Watch or Pass is
        reached.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {STEPS.slice(1, -1).map((s, i) => (
          <div key={s.key} className="panel flex gap-3 p-4">
            <span className="step-marker step-marker-done">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <div className="text-body font-medium">{s.title}</div>
              <div className="text-muted text-meta leading-relaxed">{s.hint}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-muted mt-6 text-body">
        Each step is pre-filled with a proven default. It takes about ten minutes; you can change everything later in
        Settings.
      </p>
    </div>
  );
}

function TeamStep() {
  return (
    <div>
      <h1 className="mb-1.5 text-page">Your team</h1>
      <p className="text-muted mb-8 max-w-[640px] text-reading leading-relaxed">
        Add the people who will screen deals with you. Analysts run evaluations; admins also change the fund&apos;s
        settings. No email is sent: share the password with them yourself. You can skip this and add people later in
        Settings → Team.
      </p>
      <div className="card">
        <AddMemberForm />
      </div>
    </div>
  );
}

const NEXT_STEPS = [
  ["Create a deal", "Add the company's name, stage and sector."],
  ["Upload the materials", "The pitch deck, memos and any other documents you have."],
  ["Run the Quick Screen", "Tracer drafts the answers from the materials; you review them and decide."],
] as const;

function Done({ fundName, model }: { fundName: string; model: Model }) {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const summary = [
    n(model.quick.length, "Quick Screen question"),
    n(model.prompts.length, "research question"),
    `${model.counter.length} question${model.counter.length === 1 ? "" : "s"} to argue against a deal`,
    n(model.dims.length, "area"),
  ];
  return (
    <div className="panel flex w-full max-w-[760px] flex-col items-center px-10 pt-8 pb-7 text-center">
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[4px] bg-[var(--color-cobalt)] text-white">
        <LuCheck aria-hidden className="h-6 w-6" strokeWidth={3} />
      </span>
      <h1 className="mb-1.5 text-page">{fundName} is ready to screen deals</h1>
      <p className="text-muted mb-5 max-w-[540px] text-reading leading-relaxed">
        Finishing saves this setup as version 1 of your fund&apos;s framework. Every new deal is evaluated against it, and
        you can change it anytime in Settings.
      </p>
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {summary.map((item) => (
          <span key={item} className="rounded-[3px] bg-[var(--color-cobalt-tint)] px-3 py-1 text-body text-[var(--color-cobalt-hover)]">
            {item}
          </span>
        ))}
      </div>
      <div className="w-full border-t border-[var(--color-line)] pt-5">
        <div className="mb-4 text-body font-medium text-[var(--color-neutral-400)]">What happens next</div>
        <ol className="grid gap-5 sm:grid-cols-3">
          {NEXT_STEPS.map(([title, text], i) => (
            <li key={title} className="flex flex-col items-center">
              <span className="step-marker step-marker-done mb-1.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="mb-0.5 text-reading font-medium">{title}</div>
              <div className="text-muted text-body leading-relaxed">{text}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
