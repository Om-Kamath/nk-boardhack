/* HackBoard data layer — tracked Oct 30, 2026 from ETHGlobal event pages,
 * Devpost listings, DevGrants Daily, and organizer sites. Verify on the
 * event page before booking travel; deadlines and prize totals move. */

const HACKBOARD_DATA = {
  // `deadline` and `dates` are ISO strings so countdowns compute from Date.now().
  open: [
    {
      id: "vultr-agent-rush",
      name: "Vultr Agent Rush",
      format: "online",
      dates: "2026-11-03",
      deadline: "2026-11-08",
      prize: "$9,000 + $5,000 Vultr credits",
      tags: ["agents", "devtools", "ai"],
      url: "https://devgrantsdaily.com/type/hackathon/",
      blurb: "Build autonomous agents on Vultr's cloud stack. Short build window — plan for a scoped, deployable demo."
    },
    {
      id: "dsh-hacks-v2",
      name: "DSH Hacks V2",
      format: "online",
      dates: "2026-11-01",
      deadline: "2026-11-07",
      prize: "$42,234",
      tags: ["ai", "health", "students"],
      url: "https://devpost.com/c/artificial-intelligence",
      blurb: "AI-for-healthcare themed online hack. Large prize pool for a young event — medical-data demos score well here."
    },
    {
      id: "hackrpi-2026",
      name: "HackRPI 2026",
      format: "irl",
      location: "Troy, NY",
      dates: "2026-11-07",
      deadline: "2026-11-07",
      prize: "$3,550",
      tags: ["students", "irl", "beginner"],
      url: "https://hackrpi-2026.devpost.com/",
      blurb: "RPI's campus marathon. Small cash pool but a small, friendly field — a genuine first-win shot for student teams."
    },
    {
      id: "redhawk-builds-2026",
      name: "Redhawk Builds",
      format: "irl",
      location: "Oxford, OH",
      dates: "2026-11-07",
      deadline: "2026-11-08",
      prize: "$3,500",
      tags: ["students", "fintech", "irl", "beginner"],
      url: "https://redhawk-builds-2026.devpost.com/",
      blurb: "Miami University build weekend with a fintech tilt. Low registration count on Devpost right now."
    },
    {
      id: "ethglobal-mumbai",
      name: "ETHGlobal Mumbai",
      format: "irl",
      location: "Mumbai, India",
      dates: "2026-11-06",
      deadline: "2026-11-06",
      prize: "Sponsor pool (TBD on event page)",
      tags: ["web3", "irl"],
      url: "https://ethglobal.com/events/mumbai",
      blurb: "ETHGlobal's India flagship. Prize money lives in sponsor tracks — DeFi, agentic payments, and infra historically pay best."
    },
    {
      id: "agent-native",
      name: "Agent-Native Hackathon (Builder.io)",
      format: "online",
      dates: "2026-10-27",
      deadline: "2026-11-09",
      prize: "$10,000",
      tags: ["agents", "devtools", "ai"],
      url: "https://www.builder.io/hackathon",
      blurb: "Ship something agent-native with Builder.io's toolchain. Winners announced Nov 13 — short feedback loop."
    },
    {
      id: "paypal-ai-hackathon",
      name: "PayPal AI Hackathon",
      format: "online",
      dates: "2026-10-15",
      deadline: "2026-11-12",
      prize: "$67,500",
      tags: ["ai", "fintech", "agents"],
      url: "https://paypalaihackathon.devpost.com/",
      blurb: "Biggest sponsor pool of the season after Kiroween. Payments + agent workflows is the obvious winning shape."
    },
    {
      id: "ugreen-ai-nas",
      name: "UGREEN AI NAS Hackathon",
      format: "online",
      dates: "2026-10-18",
      deadline: "2026-11-15",
      prize: "$51,000",
      tags: ["ai", "hardware"],
      url: "https://ugreenhackathon.devpost.com/",
      blurb: "AI on local NAS hardware — privacy-first, self-hosted ML. Unusual track, meaning less demo saturation."
    },
    {
      id: "code-for-india",
      name: "Code for India",
      format: "online",
      dates: "2026-10-20",
      deadline: "2026-11-15",
      prize: "₹18 lakh (~$20,000)",
      tags: ["agents", "social", "ai"],
      url: "https://devgrantsdaily.com/type/hackathon/",
      blurb: "Open-source agent builds for Indian public-sector problems. Judges favor deployable civic tooling over slideware."
    },
    {
      id: "cutie-hack-2026",
      name: "Cutie Hack",
      format: "irl",
      location: "Riverside, CA",
      dates: "2026-11-21",
      deadline: "2026-11-21",
      prize: "Prizes per track",
      tags: ["students", "beginner", "irl"],
      url: "https://cutie-hack-2026.devpost.com/",
      blurb: "UC Riverside's 12-hour beginner hackathon. If this is your first event, start here."
    },
    {
      id: "kiroween",
      name: "Kiroween",
      format: "online",
      dates: "2026-10-30",
      deadline: "2026-12-04",
      prize: "$100,000",
      tags: ["ai", "agents"],
      url: "https://kiroween.devpost.com/",
      blurb: "The season's biggest pool — Kiro's spec-driven AI build-off. Five full weeks to ship; quality bar is high."
    }
  ],

  concluded: [
    {
      id: "ethglobal-ny-2026",
      name: "ETHGlobal New York",
      dates: "2026-06-12",
      deadline: "2026-06-14",
      prize: "$175,000 pool",
      tags: ["web3", "irl"],
      url: "https://ethglobal.com/events/newyork2026",
      blurb: "2026's largest tracked pool. Sponsor tracks concentrated in DeFi and identity."
    },
    {
      id: "hackmoney-2026",
      name: "HackMoney",
      dates: "2026-01-30",
      deadline: "2026-02-11",
      prize: "$75,000 pool",
      tags: ["web3", "defi"],
      url: "https://ethglobal.com/events/hackmoney2026",
      blurb: "ETHGlobal's DeFi-focused online event — the reference pool for on-chain finance builds."
    },
    {
      id: "ethonline-2026",
      name: "ETHOnline",
      dates: "2026-09-04",
      deadline: "2026-09-16",
      prize: "$70,000 pool",
      tags: ["web3"],
      url: "https://ethglobal.com/events/ethonline2026",
      blurb: "Biggest online web3 hack of the year; winner patterns feed the predictor's sponsor-track weights."
    },
    {
      id: "ethglobal-tokyo-2026",
      name: "ETHGlobal Tokyo",
      dates: "2026-09-25",
      deadline: "2026-09-27",
      prize: "$59,500 pool",
      tags: ["web3", "irl"],
      url: "https://ethglobal.com/events/tokyo2026",
      blurb: "World ID and ENS identity tracks paid out here — identity remains a reliably funded sponsor category."
    },
    {
      id: "qloo-agentic",
      name: "Qloo Agentic Hackathon",
      dates: "2026-10-10",
      deadline: "2026-10-30",
      prize: "$25,000 pool",
      tags: ["agents", "ai"],
      url: "https://devpost.com/c/artificial-intelligence",
      blurb: "Cultural-data agent builds. Closed today — winners expected within two weeks."
    },
    {
      id: "crowdstrike-agentworks",
      name: "CrowdStrike AgentWorks",
      dates: "2026-10-06",
      deadline: "2026-10-20",
      prize: "Sponsor prizes",
      tags: ["agents", "security"],
      url: "https://www.crowdstrike.com/",
      blurb: "Security-agent builds on Falcon. Winner announcements landed early November."
    }
  ],

  winners: [
    {
      id: "salesshortcut",
      event: "Agent Development Kit Hackathon (with Google Cloud)",
      title: "SalesShortcut — grand prize",
      status: "won",
      detail: "An agent-oriented sales tool that became a company with paying customers. Devpost's blog cites it as the model hackathon outcome: tool, not demo."
    },
    {
      id: "crowdstrike-winners",
      event: "CrowdStrike AgentWorks",
      title: "Winners announced early November",
      status: "pending",
      detail: "Security-agent builds on Falcon MCP. Watch which agent shapes CrowdStrike paid for — it signals their 2027 sponsor tracks."
    },
    {
      id: "agent-native-winners",
      event: "Agent-Native Hackathon (Builder.io)",
      title: "Winners Nov 13",
      status: "pending",
      detail: "Still open for registration until Nov 9 — this doubles as a deadline and a winner-watch."
    },
    {
      id: "hackmoney-pattern",
      event: "HackMoney 2026",
      title: "DeFi + agentic payments swept sponsor tracks",
      status: "won",
      detail: "The $75K pool concentrated in on-chain finance primitives and AI-assisted payment flows — the same pattern repeated at ETHOnline and Tokyo."
    }
  ],

  news: [
    { date: "2026-10-30", text: "Kiroween opened today — $100,000 pool, five-week build window, closes Dec 4. Biggest prize in this season's data." },
    { date: "2026-10-30", text: "Qloo Agentic closed today at $25K. Winners expected within ~2 weeks." },
    { date: "2026-11-06", text: "ETHGlobal Mumbai kicks off Nov 6 — last big IRL web3 event of the year." },
    { date: "2026-11-07", text: "Campus weekend double-header: HackRPI (Troy, NY) and Redhawk Builds (Oxford, OH), both Nov 7–8." },
    { date: "2026-11-12", text: "PayPal AI Hackathon closes Nov 12 — $67,500 and the season's strongest fintech-agent signal." },
    { date: "2026-11-13", text: "Agent-Native winners announced Nov 13; CrowdStrike AgentWorks winners already out early Nov." }
  ]
};

/* Renders a human "X days left" label from an ISO deadline. */
function daysLeft(iso) {
  const MS_PER_DAY = 86400000;
  const today = new Date();
  const deadline = new Date(iso + "T23:59:59");
  return Math.ceil((deadline - today) / MS_PER_DAY);
}

function countdownLabel(iso) {
  const d = daysLeft(iso);
  if (d < 0) return "closed";
  if (d === 0) return "closes today";
  if (d === 1) return "1 day left";
  return d + " days left";
}
