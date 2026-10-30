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
    },
    {
      id: "nowdev-26",
      name: "now[dev]26",
      format: "irl",
      hub: "San Jose",
      location: "San Jose, CA",
      host: "ServiceNow",
      venue: "San Jose Convention Center",
      hostInsight: "ServiceNow's developer conference built around hands-on builds next to the platform engineers who ship the product. Registration is officially open — conference-adjacent, so networking value is as real as the build.",
      dates: "2026-11-04",
      deadline: "2026-11-05",
      prize: "Build sessions — no public prize pool",
      tags: ["irl", "devtools", "platform"],
      url: "https://community.moveworks.com/announcements-updates-102/registration-is-open-come-build-with-us-at-now-dev-26-3831",
      blurb: "Two days of real builds on the ServiceNow platform, side by side with the engineers who run it."
    },
    {
      id: "mit-energy-hack",
      name: "MIT Energy & Climate Hack",
      format: "irl",
      hub: "Boston",
      location: "Cambridge, MA",
      host: "MIT (student-run, 12th year)",
      venue: "MIT campus",
      hostInsight: "Twelve years running and still student-governed. Companies bring real energy and climate challenges and recruit from the finals — a genuinely strong room for climate-tech careers.",
      dates: "2026-11-06",
      deadline: "2026-11-08",
      prize: "Prizes per challenge",
      tags: ["irl", "students", "climate"],
      url: "https://www.mitenergyhack.org/faqs",
      blurb: "Three-day student hackathon where companies pose real energy and climate challenges; top team per challenge advances to finals."
    },
    {
      id: "code-metal-forge",
      name: "Code Metal Forge 2026",
      format: "irl",
      hub: "Boston",
      location: "Boston, MA",
      host: "Code Metal × USSOCOM",
      venue: "BASE X, 60 State Street",
      hostInsight: "Second annual edition, sponsored by US Special Operations Command. Defense-adjacent — an unusual direct line into gov/defense prototyping work for technical builders.",
      dates: "2026-11-06",
      deadline: "2026-11-08",
      prize: "$18,000",
      tags: ["irl", "defense", "hardware"],
      url: "https://capd.mit.edu/events/2026/11/06/code-metal-hackathon-forge-2026-sponsored-by-ussocom/",
      blurb: "Rapid-prototyping hackathon targeting MIT engineers and technical builders — build for the mission, $18K on the line."
    },
    {
      id: "hackstorm-3",
      name: "HackStorm 3.0: Sense, Think and Act",
      format: "irl",
      hub: "SF",
      location: "San Francisco, CA",
      host: "HackStorm team (Devpost-listed)",
      venue: "SF — exact venue on the Luma page",
      hostInsight: "Third edition of a curated AI-hardware community event. Registration runs on Luma, not Devpost — the Devpost listing is a mirror; go straight to the Luma link.",
      dates: "2026-11-06",
      deadline: "2026-11-08",
      prize: "$6,000 cash",
      tags: ["irl", "ai", "hardware"],
      url: "https://ushackathons.com/events/hackstorm-3-0-sense-think-and-act",
      blurb: "Can a curated group of builders ship real AI hardware in 48 hours? Third-time-out event with $6K in cash prizes."
    },
    {
      id: "innodata-hackathon-2026",
      name: "Innodata Hackathon 2026",
      format: "irl",
      hub: "NYC",
      location: "New York, NY",
      host: "Innodata",
      venue: "St. John's University, Manhattan campus",
      hostInsight: "Public AI-automation services company running this partly as a community/recruiting play — optional welcome party and happy hour the night before (Fri Nov 13). One day, so scope tight.",
      dates: "2026-11-14",
      deadline: "2026-11-14",
      prize: "See event page",
      tags: ["irl", "ai"],
      url: "https://innodata.com/events/innodata-hackathon-2026/",
      blurb: "Full-day in-person hackathon: real technical challenges, working prototypes, 9am–5pm at St. John's Manhattan."
    },
    {
      id: "nyc-geoai-hackathon",
      name: "NYC GeoAI Hackathon 2026",
      format: "irl",
      hub: "NYC",
      location: "New York, NY",
      host: "GISMO NYC",
      venue: "Pratt Institute Manhattan, 144 W 14th St",
      hostInsight: "GISMO is NYC's regional geospatial professional network — an unusually mixed crowd of planners, data scientists and civic builders, not the usual pure-dev field.",
      dates: "2026-11-14",
      deadline: "2026-11-14",
      prize: "See event page",
      tags: ["irl", "ai", "geoai"],
      url: "https://www.gismonyc.org/geoai-hackathon-2026.html",
      blurb: "One-day GeoAI sprint: create AI-ready geospatial data and solve real-world mapping challenges."
    },
    {
      id: "system-public-challenge",
      name: "System Public Challenge 2026",
      format: "irl",
      hub: "NYC",
      location: "New York, NY",
      host: "System (public benefit corporation)",
      venue: "System HQ, NYC",
      hostInsight: "First public hackathon from System, the company behind the Public Graph — an open map of quantitative relationships drawn from peer-reviewed research. Small, first-time event; challenge questions set with partner organizations.",
      dates: "2026-11-13",
      deadline: "2026-11-14",
      prize: "See event page",
      tags: ["irl", "open-data", "ai"],
      url: "https://hack123.henryht.sh/en/h/system-public-challenge-2026",
      blurb: "Teams of 2–7 build on the System Public Graph plus open data, across three categories, at System's NYC HQ."
    },
    {
      id: "hackumass-xiv",
      name: "HackUMass XIV",
      format: "irl",
      hub: "Boston",
      location: "Amherst, MA",
      host: "UMass Amherst (Manning College of Information & Computer Sciences)",
      venue: "UMass Amherst campus",
      hostInsight: "One of New England's largest student hackathons, with hands-on workshops and dedicated mentors aimed at beginners — a reliable first-IRL-event choice.",
      dates: "2026-11-13",
      deadline: "2026-11-15",
      prize: "See event page",
      tags: ["irl", "students", "beginner"],
      url: "https://www.cics.umass.edu/events/hackumass-xiv",
      blurb: "36 hours, all experience levels, dedicated mentorship — the classic big-campus hackathon experience."
    },
    {
      id: "scion-300-ai",
      name: "300 AI Hackathon",
      format: "irl",
      hub: "Boston",
      location: "Boston, MA",
      host: "SCION",
      venue: "300 Mass Ave",
      hostInsight: "Curated by application — only 40 builders admitted, applications close Friday Nov 6 at 11:59pm. A small field means unusually good judge access; apply early.",
      dates: "2026-11-12",
      deadline: "2026-11-15",
      prize: "See event page",
      tags: ["irl", "ai"],
      url: "https://scion.events/300-hackathon",
      blurb: "62 hours, 40 builders, one building in Boston — building starts 9pm Nov 12, demos Nov 14–15."
    },
    {
      id: "space-apps-seattle",
      name: "NASA Space Apps Challenge — Seattle",
      format: "irl",
      hub: "Seattle",
      location: "Seattle, WA",
      host: "NASA Space Apps (local Seattle organizers)",
      venue: "Seattle — venue on event page",
      hostInsight: "Local edition of NASA's global 48-hour civic-space challenge, now accepting participants. Collaborative culture, open to all skill levels — designers and scientists welcome, not only coders.",
      dates: "2026-11-13",
      deadline: "2026-11-15",
      prize: "Global challenge awards",
      tags: ["irl", "space", "beginner"],
      url: "https://spaceappsseattle.org/",
      blurb: "48 hours of NASA-challenge building in the city that unites tech and space. Free and open to everyone."
    },
    {
      id: "ietf-127-hackathon",
      name: "IETF 127 Hackathon",
      format: "irl",
      hub: "SF",
      location: "San Francisco, CA",
      host: "Internet Engineering Task Force",
      venue: "Hilton San Francisco Union Square",
      hostInsight: "Standards-body working session, not a competition — free, onsite registration available. The prize is proximity to the protocol engineers who run the internet.",
      dates: "2026-11-14",
      deadline: "2026-11-15",
      prize: "n/a — collaborative, not competitive",
      tags: ["irl", "protocols", "devtools"],
      url: "https://wiki.ietf.org/meeting/127/hackathon",
      blurb: "Developers and experts collaborate on practical implementations of IETF standards, Sat–Sun of the meeting week."
    },
    {
      id: "band-dark-factory",
      name: "BAND Dark Factory Buildathon",
      format: "irl",
      hub: "SF",
      location: "San Francisco, CA",
      host: "HackerSquad",
      venue: "AWS Builder Loft, 525 Market St (2nd floor)",
      hostInsight: "HackerSquad is a recurring SF buildathon organizer that regularly books the AWS Builder Loft. Week-long format: in-person kickoff Nov 13, then an online build week — remote participation possible.",
      dates: "2026-11-13",
      deadline: "2026-11-13",
      prize: "See event page",
      tags: ["irl", "agents", "ai"],
      url: "https://luma.com/band-ai-hacks-nov13-2026",
      blurb: "\"All agents, now in sync\" — kickoff buildathon at the AWS Builder Loft, then a week-long remote build."
    },
    {
      id: "aie-code-agents",
      name: "AIE Code Agents Hackathon",
      format: "irl",
      hub: "NYC",
      location: "New York, NY",
      host: "AI Engineer × Cerebral Valley, with Google DeepMind",
      venue: "The Malin Flatiron",
      hostInsight: "Cerebral Valley runs NYC's AI social graph, and the first official hackathon featuring Gemini 3 — DeepMind engineers on site. Recruitment-adjacent by design; the room matters as much as the prizes.",
      dates: "2026-11-22",
      deadline: "2026-11-23",
      prize: "See event page",
      tags: ["irl", "ai", "agents"],
      url: "https://cerebralvalley.ai/e/aie-code-agents-nyc",
      blurb: "Work on codebase context optimization, reasoning RL, and collaborative code-gen tooling — with the DeepMind team in the building."
    },
    {
      id: "bostonhacks-2026",
      name: "BostonHacks 2026",
      format: "irl",
      hub: "Boston",
      location: "Boston, MA",
      host: "BostonHacks (student-run)",
      venue: "Boston — venue on event page",
      hostInsight: "Boston's long-running student hackathon; 2026 is transit-themed (\"Boston Bound\") with tracks like Transit Gamification and Boundless Boston — civic-data builds fit naturally.",
      dates: "2026-11-21",
      deadline: "2026-11-22",
      prize: "See event page",
      tags: ["irl", "students", "civic"],
      url: "https://www.bostonhacks.org/",
      blurb: "Boston-student classic with transit-themed tracks, workshops, and a full two-day schedule."
    },
    {
      id: "agents-for-impact",
      name: "Agents for Impact Hackathon",
      format: "irl",
      hub: "NYC",
      location: "New York, NY",
      host: "Google Cloud",
      venue: "Google Pier 57, 29 11th Ave",
      hostInsight: "Google's own curated-builder event — teams are hand-picked and the day is structured around Google's agentic AI and data stack. Getting selected is the hard part; the Cloud/DeepMind adjacency is the real prize.",
      dates: "2026-12-08",
      deadline: "2026-12-08",
      prize: "See event page",
      tags: ["irl", "ai", "agents"],
      url: "https://cloud.google.com/events/agents-for-impact-nyc",
      blurb: "One-day sprint at Pier 57: curated teams tackle food equity, public health, and emergency-evacuation challenges with Google's agentic tools."
    },
    {
      id: "physical-ai-hack",
      name: "Physical AI Hack",
      format: "irl",
      hub: "SF",
      location: "San Francisco, CA",
      host: "tokens&",
      venue: "San Francisco — address on host page",
      hostInsight: "tokens& runs free community AI events in SF. Robotics-and-dexterity focus — hardware-adjacent builders are the ones who stand out here.",
      dates: "2026-11-28",
      deadline: "2026-11-28",
      prize: "See host page",
      tags: ["irl", "ai", "hardware"],
      url: "https://foundercal.com/events/physical-ai-hack-2026-11-28",
      blurb: "One-day physical-AI build: machines that handle objects with dexterity, touch, and whole-body coordination. Free entry."
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
