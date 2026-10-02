// Counter-Case tab view types shared by server and client code (step 4).
import type { RunView } from "@/lib/source-shared";
import type { UncertaintyView } from "@/lib/claim-shared";

export type CounterArgumentView = {
  id: string;
  rank: number;
  prompt: { position: number; text: string } | null;
  argument: string;
  mechanism: string;
  claimCodes: string[];
};

export type FalsifierView = {
  id: string;
  code: string;
  criterion: string;
  outcomeCheck: string;
  claimCodes: string[];
  uncertaintyCodes: string[];
};

export type UncertaintyListItem = UncertaintyView & {
  origin: string; // "from prompt 9" | "uncertainty analysis"
  falsifierCodes: string[];
};

export type CounterCaseView = {
  arguments: CounterArgumentView[];
  uncertainties: UncertaintyListItem[];
  falsifiers: FalsifierView[];
  run: RunView | null;
};
