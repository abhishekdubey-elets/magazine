import type { Article } from "@/lib/types";

/**
 * Sample editorial content for the demo publication
 * "Tech Maha Impact — May 2026".
 *
 * All people, companies and figures are fictional sample content.
 * Body paragraphs are joined with a blank line ("\n\n"), as the layout
 * engine expects.
 */

const PUB = "pub-tmi-2026-05";

/** Join paragraphs with a blank line. */
const paras = (...items: string[]): string => items.join("\n\n");

export const sampleArticles: Article[] = [
  /* 1 ------------------------------------------------------------------ */
  {
    id: "art-editors-note",
    title: "Where Policy Meets Platform",
    subtitle: "An introduction to our special edition on technology, governance and impact",
    contentType: "editorial",
    sectionId: "sec-front",
    author: {
      name: "Dr. Kavya Iyer",
      designation: "Editor-in-Chief",
      organisation: "Elets Technomedia",
    },
    summary:
      "The Editor-in-Chief introduces this special compendium on Maharashtra's digital transformation, previewing the cover story on AI-powered governance, the shift towards strategic CSR 2.0 and reporting from the last mile, where district teams test whether platforms truly work for citizens.",
    body: paras(
      "Dear Readers,",
      "Maharashtra has always been a state that builds things: ports and mills, cooperatives and code. In the last decade it has quietly added a new kind of infrastructure to that list, the digital public rails on which a farmer in Vidarbha applies for a crop subsidy, a student in Kolhapur downloads a verified mark sheet, and a pensioner in Nagpur receives a benefit transfer without standing in a single queue.",
      "This special edition of Tech Maha Impact is our attempt to document that transformation from the inside. Our cover story examines how the state is weaving artificial intelligence into the everyday machinery of governance, from grievance routing to predictive service planning, and asks the harder questions about accountability that come with it.",
      "We also look closely at what we have been calling CSR 2.0, the shift from cheque-book philanthropy towards long-term, technology-enabled partnerships between corporates, civil society and government. And we travel to the last mile, where district teams are proving that the real test of any platform is whether it works at a taluka office with patchy connectivity on a Monday morning.",
      "The leaders, founders and practitioners featured in these pages do not agree on everything, and that is precisely the point. Good policy is shaped by honest conversation, and we hope this issue adds to it.",
      "My thanks to every contributor, partner and member of the Elets editorial team who made this edition possible. As always, we welcome your feedback.",
      "Warm regards,",
      "Dr. Kavya Iyer, Editor-in-Chief",
    ),
    pullQuotes: [
      "Good policy is shaped by honest conversation, and we hope this issue adds to it.",
    ],
    imageIds: ["img-portrait-06"],
    captions: ["Dr. Kavya Iyer, Editor-in-Chief"],
    status: "approved",
    tags: ["editorial", "e-governance", "maharashtra", "csr"],
    publicationId: PUB,
    createdAt: "2026-05-06T09:15:00.000Z",
    updatedAt: "2026-05-19T11:42:00.000Z",
  },

  /* 2 ------------------------------------------------------------------ */
  {
    id: "art-msg-secretary",
    title: "Message",
    subtitle: "On the convergence of CSR and technology",
    contentType: "leadership-message",
    sectionId: "sec-leadership",
    author: {
      name: "Dr. Vikram Deshpande, IAS",
      designation: "Principal Secretary, Department of Information Technology",
      organisation: "Government of Maharashtra (sample)",
    },
    summary:
      "The Principal Secretary for Information Technology outlines the state's citizen-centric digital agenda, the growing convergence of public digital infrastructure with corporate social responsibility, and the safeguards on privacy, inclusion and trust that must accompany the adoption of artificial intelligence in governance.",
    body: paras(
      "It gives me great pleasure to learn that Elets Technomedia is bringing out a special compendium, Tech Maha Impact, dedicated to the role of technology, e-governance and corporate social responsibility in shaping the future of Maharashtra. The publication arrives at an important moment, as the state accelerates its journey towards becoming a trillion-dollar economy and a front-runner in the national vision of Viksit Bharat 2047.",
      "Over the past few years, the Department of Information Technology has worked to place the citizen at the centre of every digital initiative. Today, more than five hundred services are available online through the Aaple Sarkar platform, integrated with DigiLocker, UPI-based payments and Aadhaar-enabled authentication. These are not merely technology projects; they represent a fundamental rethinking of how the state relates to its people, built on the principles of transparency, speed and accountability.",
      "Equally significant is the growing convergence between public digital infrastructure and corporate social responsibility. When industry partners invest in digital literacy, connected classrooms, telemedicine or skilling for emerging technologies, they amplify the reach of government programmes manifold. The State has encouraged such partnerships to be outcome-oriented, measurable and aligned with district-level priorities, so that every rupee of CSR spending translates into tangible improvement in people's lives.",
      "As we embrace artificial intelligence and data-driven decision-making, we remain mindful of our responsibility to protect privacy, ensure inclusion and build public trust. Technology must serve the last citizen in the most remote village with the same dignity and efficiency it offers in our largest cities. Our policies on data governance, cybersecurity and vernacular access are designed with this conviction.",
      "I am confident that this compendium will serve as a valuable reference for policymakers, industry leaders and practitioners alike, and will inspire new collaborations for the benefit of the people of Maharashtra. I extend my best wishes to Elets Technomedia and to all contributors for the success of this endeavour.",
    ),
    pullQuotes: [
      "Technology must serve the last citizen in the most remote village with the same dignity and efficiency it offers in our largest cities.",
    ],
    imageIds: ["img-portrait-01"],
    captions: ["Dr. Vikram Deshpande, IAS"],
    status: "approved",
    tags: ["leadership", "e-governance", "csr", "digital-india"],
    publicationId: PUB,
    createdAt: "2026-04-14T06:30:00.000Z",
    updatedAt: "2026-05-12T08:05:00.000Z",
  },

  /* 3 ------------------------------------------------------------------ */
  {
    id: "art-int-mahadigital",
    title: "Building Digital Trust at Scale",
    subtitle: "MahaDigital's vision for inclusive, citizen-first governance",
    contentType: "interview",
    sectionId: "sec-leadership",
    author: {
      name: "Shalini Rao",
      designation: "Managing Director",
      organisation: "MahaDigital Services Corporation",
    },
    interviewer: "Rose Jaiswal, Elets News Network",
    summary:
      "Shalini Rao, Managing Director of MahaDigital Services Corporation, explains how the organisation runs shared platforms for identity, payments and grievances, why assisted access remains central to inclusion, where AI is deployed with human oversight, and what the next three years hold for citizen-first governance.",
    body: paras(
      "Q: MahaDigital has grown from a service integrator into a core part of the state's governance machinery. How would you describe its mandate today?",
      "A: Our mandate is simple to state and difficult to deliver: make every interaction between a citizen and the government faster, fairer and more predictable. In practice that means we run the shared platforms that departments build on, including identity, payments, document verification and grievance management. We no longer think of ourselves as a vendor to departments. We are a steward of common digital infrastructure, and that brings a responsibility to design for reliability, interoperability and long-term public value rather than one-off project milestones.",
      "Q: Trust is a recurring theme in your public remarks. What does building digital trust actually involve for an organisation like yours?",
      "A: Trust is earned in small moments. It is the farmer who receives an SMS in Marathi confirming his application, the widow whose pension arrives on the same date every month, the student whose certificate is accepted by a university without a physical stamp. Behind those moments sit strict service-level commitments, continuous security audits and a clear grievance trail. We publish uptime and resolution metrics for our major platforms every quarter, because citizens trust systems that are willing to be measured.",
      "Q: How are you ensuring that digital services remain inclusive for citizens who are elderly, less literate or living in areas with weak connectivity?",
      "A: Inclusion cannot be an afterthought. Every new service now goes through an assisted-access review before launch. We ask whether it works on a basic smartphone, whether it can be completed at a common service centre with an operator's help, and whether it is available in Marathi and at least two other languages. Over 45,000 assisted service points act as a human bridge. Digital first must never mean digital only, and our design standards make that principle explicit.",
      "Q: Artificial intelligence is now part of almost every governance conversation. Where is MahaDigital actually deploying AI, and where are you deliberately holding back?",
      "A: We are using AI where it removes friction without taking away human judgement. Intelligent routing of grievances, automatic classification of uploaded documents and multilingual chat assistance are already live. Those tools have cut average grievance routing time from four days to under six hours. Where decisions affect entitlements, such as eligibility for a welfare scheme, we keep a human officer accountable for the final call. We are also building an internal model registry so that every algorithm in production is documented and auditable.",
      "Q: Finally, what are your priorities for the next three years, and what role do you see for industry and CSR partners?",
      "A: Our first priority is a unified citizen profile, with consent, so that people stop submitting the same documents again and again. The second is resilience: stronger disaster recovery, zero-trust security and sovereign hosting for sensitive data. The third is capacity, because platforms are only as good as the officers using them. Industry partners can help most by co-investing in skilling and by building solutions on our open interfaces. We want an ecosystem, not a dependency on any single provider.",
    ),
    pullQuotes: [
      "We publish uptime and resolution metrics for our major platforms every quarter, because citizens trust systems that are willing to be measured.",
      "Digital first must never mean digital only, and our design standards make that principle explicit.",
    ],
    imageIds: ["img-portrait-02"],
    captions: ["Shalini Rao, Managing Director, MahaDigital Services Corporation"],
    status: "approved",
    tags: ["interview", "digital-trust", "e-governance", "inclusion"],
    publicationId: PUB,
    createdAt: "2026-04-09T10:20:00.000Z",
    updatedAt: "2026-05-15T13:18:00.000Z",
  },

  /* 4 ------------------------------------------------------------------ */
  {
    id: "art-int-bhashasetu",
    title: "Vernacular AI for the Next Hundred Million",
    subtitle: "How Marathi-first voice assistants are opening public services to first-time digital users",
    contentType: "interview",
    sectionId: "sec-digital",
    author: {
      name: "Rohan Patil",
      designation: "Co-founder & CEO",
      organisation: "BhashaSetu AI",
    },
    interviewer: "Abhineet Kumar, Elets News Network",
    body: paras(
      "Nearly half of Maharashtra's internet users prefer to search, speak and transact in Marathi, yet most government interfaces were designed in English first. BhashaSetu AI, a Pune-based startup, is building voice-first assistants that let citizens ask about pensions, land records or crop insurance in their own dialect. Abhineet Kumar of Elets News Network spoke with co-founder and CEO Rohan Patil about vernacular AI and the realities of deploying it in public services.",
      "Q: What gap did you see in the market that led you to start BhashaSetu AI, and why focus on public services first?",
      "A: My co-founder and I grew up in Satara district and watched our parents struggle with portals that assumed fluency in English and comfort with forms. The technology to understand spoken Marathi existed in research labs, but nobody was building it for a pensioner calling a helpline at seven in the morning. Public services felt like the place where language barriers cost people the most, so that is where we chose to begin.",
      "Q: Marathi itself varies a great deal between Konkan, Marathwada and Vidarbha. How does your system cope with dialects and code-mixing?",
      "A: That is the hardest and most interesting part of our work. We have collected more than eleven thousand hours of consented speech from all thirty-six districts, including Varhadi, Malvani and Ahirani variants. People naturally mix Marathi, Hindi and English in a single sentence, so our models are trained on real conversations rather than textbook language. Accuracy on dialect-heavy queries has improved from sixty-eight to eighty-nine per cent in eighteen months.",
      "Q: Where are your voice assistants deployed today, and what kinds of questions are citizens actually asking them?",
      "A: We currently power voice helplines for three state departments and an assisted kiosk pilot in forty gram panchayats. Most questions are practical: has my application moved, why was my payment rejected, which document do I need. Around a third of callers are women, and many are first-time users of any digital service. The assistant answers routine queries in under a minute and hands complex or sensitive cases to a trained human agent with a summary.",
      "Q: Public sector deployments raise serious concerns about privacy and accountability. How do you handle citizen data and the risk of wrong answers?",
      "A: Voice recordings are processed within data centres in India and deleted after a fixed retention period unless the citizen consents to longer storage. We never use public service conversations to train commercial products. On accuracy, the assistant only answers from verified departmental knowledge bases, and it is designed to hand over to an officer rather than guess. Every response can be traced back to its source document for audit.",
      "Q: What would it take for vernacular AI to reach the next hundred million Indians, and what should governments do to accelerate it?",
      "A: Three things matter most. Governments should treat language datasets as public goods and make anonymised, consented corpora available to researchers and startups. Procurement rules need to reward outcomes, such as resolution rates in local languages, rather than only the lowest bid. And we need patient capital that understands public service timelines. If those pieces come together, a citizen in any district should be able to talk to the state as easily as she talks to her neighbour.",
    ),
    pullQuotes: [],
    imageIds: ["img-portrait-03"],
    captions: ["Rohan Patil, Co-founder & CEO, BhashaSetu AI"],
    status: "in-review",
    tags: ["interview", "vernacular-ai", "startups", "voice"],
    publicationId: PUB,
    createdAt: "2026-05-04T07:45:00.000Z",
    updatedAt: "2026-05-21T09:30:00.000Z",
    note: "Awaiting layout — demo interview for guided walkthrough",
  },

  /* 5 ------------------------------------------------------------------ */
  {
    id: "art-int-collector",
    title: "Taking Governance to the Last Mile",
    subtitle: "How Nashik is bringing district-level services to every doorstep",
    contentType: "interview",
    sectionId: "sec-dpi",
    author: {
      name: "Dr. Neha Joshi, IAS",
      designation: "District Collector",
      organisation: "Nashik (sample)",
    },
    interviewer: "Sahaj Anand, Elets News Network",
    summary:
      "Nashik's District Collector describes how a live district dashboard, mobile service camps in tribal hamlets and a cadre of trained digital sakhis are helping citizens access services closer to home, and what support district teams need from the state and industry to sustain the gains.",
    body: paras(
      "Nashik district has emerged as a testing ground for how state-level platforms perform where it matters most: in taluka offices, tribal hamlets and farmer service centres. District Collector Dr. Neha Joshi, IAS, tells Sahaj Anand of Elets News Network how her team is combining data dashboards, doorstep camps and old-fashioned field visits to bring governance to the last mile.",
      "Q: You often say that the real test of digital governance happens at the taluka level. What does last-mile delivery look like in Nashik today?",
      "A: It looks like a mix of the very modern and the very traditional. A citizen in Peth or Surgana can apply for a caste certificate online, but she may still need someone at the gram panchayat to help her scan documents. So we track both. Our district dashboard shows pending applications by office and by day, and every Monday the sub-divisional officers review the slowest services. The platform tells us where the problem is; people on the ground fix it.",
      "Q: Nashik has a large tribal population and difficult terrain in several blocks. How have you adapted services for those communities?",
      "A: We realised that waiting for people to come to us was not working. Under our Seva Doorstep programme, mobile teams with laptops, biometric devices and satellite connectivity visit remote hamlets on fixed days each month. In the last year they have processed over sixty-two thousand applications on the spot, from ration cards to scholarship forms. We also trained more than nine hundred women from self-help groups as digital sakhis who assist neighbours with forms and follow up on pending cases.",
      "Q: How is data changing the way your district administration plans resources, sets priorities and takes day-to-day decisions?",
      "A: Earlier, a lot of planning depended on annual reports that were out of date by the time they were printed. Now we can see near real-time trends in scheme uptake, grievance volumes and service delays. When the dashboard showed that crop insurance claims from two talukas were being rejected at unusually high rates, we found a simple data-entry mismatch and corrected it within a week. Data does not replace judgement, but it tells us where to look first.",
      "Q: What support do district teams need from the state and from industry partners to sustain these gains over the long term?",
      "A: Continuity of people matters as much as continuity of technology. Operators and data officers need regular training and a clear career path, otherwise skills walk out of the door. From the state, we need stable platforms with fewer sudden changes and good offline functionality. From industry and CSR partners, the most useful support has been connectivity in remote blocks and devices for frontline workers. When the basics are reliable, district teams can focus on solving citizens' problems rather than fighting their tools.",
    ),
    pullQuotes: [
      "The platform tells us where the problem is; people on the ground fix it.",
    ],
    imageIds: [],
    captions: [],
    status: "approved",
    tags: ["interview", "last-mile", "district-governance", "nashik"],
    publicationId: PUB,
    createdAt: "2026-04-21T11:05:00.000Z",
    updatedAt: "2026-05-16T07:52:00.000Z",
    note: "Portrait pending from district office",
  },

  /* 6 ------------------------------------------------------------------ */
  {
    id: "art-cover-ai-state",
    title: "Inside India's AI-Powered Governance State",
    subtitle: "How Maharashtra is building the country's largest citizen-tech stack",
    contentType: "feature",
    sectionId: "sec-cover",
    author: {
      name: "Elets News Network",
      designation: "Editorial Bureau",
      organisation: "Elets Technomedia",
    },
    summary:
      "Maharashtra has moved from scattered departmental portals to shared digital platforms, and is now layering artificial intelligence on top for grievance routing, crop advisories and welfare checks. This cover story examines what is working, where the risks lie and the guardrails being built for accountable AI.",
    body: paras(
      "On a weekday morning in Pune, a dashboard at the State Command and Control Centre lights up with a cluster of complaints about delayed water tanker deliveries in three villages of Purandar taluka. Within minutes, an AI model has grouped the grievances, matched them against tanker GPS data and flagged a contractor whose vehicles have not left the depot. By noon, the district office has issued a notice and diverted two tankers. Nobody filed a letter, and nobody waited in a queue.",
      "Scenes like this are becoming routine in Maharashtra, which is assembling what officials describe as one of the largest citizen-technology stacks in the country. More than five hundred services now run online, linked to shared layers for identity, payments, documents and grievances. Artificial intelligence is the newest and most consequential addition to that stack.",
      "## From Portals to Platforms",
      "The first wave of e-governance in the state was about digitising forms. Departments built their own portals, often with separate logins, databases and vendors. The result was progress, but also fragmentation: a citizen applying for three certificates might deal with three different systems.",
      "The second wave, which began around 2020, has been about platforms. MahaDigital Services Corporation now operates common building blocks that any department can plug into, including a unified citizen login, a payment gateway built on UPI, document exchange through DigiLocker and a single grievance registry. Officials estimate that shared components have cut the time to launch a new online service from nine months to under ten weeks.",
      "That shared foundation is what makes AI practical. Models need clean, connected data, and a fragmented landscape of departmental silos rarely provides it. With common data standards and consented data-sharing agreements in place, the state can now apply analytics across schemes rather than within them.",
      "## Where the Algorithms Work",
      "The most visible uses are in grievance redressal. An AI classification engine reads complaints in Marathi, Hindi and English, identifies the responsible office and predicts urgency. Average routing time has fallen from four days to under six hours, according to sample figures shared with Elets.",
      "In agriculture, satellite imagery and weather data feed crop advisories to more than thirty lakh registered farmers, while predictive models help the revenue department prioritise field verification for insurance claims. In health, a triage assistant supports community health workers in identifying high-risk pregnancies. In welfare, anomaly detection flags duplicate or suspicious beneficiary records before payments are released, saving an estimated ₹1,200 crore in leakages over two years.",
      "Vernacular access is another frontier. Startups such as BhashaSetu AI are building voice assistants that let citizens query their applications in local dialects, extending services to people who have never filled out an online form.",
      "## The Accountability Question",
      "Not everyone is comfortable with the pace of change. Civil society groups have raised concerns about opaque algorithms, exclusion errors and the concentration of sensitive data. A wrongly flagged beneficiary can lose a pension; a mistranslated query can send a farmer to the wrong office.",
      "Officials say they are responding with guardrails. The state is drafting an AI use framework that requires every model affecting entitlements to have a named human owner, documented training data and a grievance route for citizens who believe they have been wronged. An internal model registry will record what each algorithm does, who approved it and how it performs. Independent audits are planned for high-impact systems from the next financial year.",
      "The goal, as one senior official put it, is not automation for its own sake but decisions that are faster, fairer and easier to explain. If Maharashtra can show that AI and accountability can grow together, its model may well become the template for other states on the road to Viksit Bharat 2047.",
    ),
    pullQuotes: [
      "Officials estimate that shared components have cut the time to launch a new online service from nine months to under ten weeks.",
      "The goal is not automation for its own sake but decisions that are faster, fairer and easier to explain.",
    ],
    imageIds: ["img-network", "img-ai-abstract"],
    captions: [
      "Shared platforms now connect identity, payments, documents and grievances across departments (representative image)",
      "AI models support grievance routing, crop advisories and welfare checks, with human officers accountable for final decisions",
    ],
    facts: [
      { label: "Citizen services online", value: "500+" },
      { label: "Average grievance routing time", value: "< 6 hrs" },
      { label: "Farmers receiving AI advisories", value: "30 lakh+" },
      { label: "Estimated leakages prevented", value: "₹1,200 Cr" },
    ],
    status: "approved",
    tags: ["cover-story", "artificial-intelligence", "e-governance", "dpi", "maharashtra"],
    publicationId: PUB,
    createdAt: "2026-04-02T08:00:00.000Z",
    updatedAt: "2026-05-20T15:24:00.000Z",
  },

  /* 7 ------------------------------------------------------------------ */
  {
    id: "art-infographic",
    title: "Digital Maharashtra in Numbers",
    subtitle: "The scale behind the state's citizen-tech stack (sample figures)",
    contentType: "feature",
    sectionId: "sec-cover",
    author: {
      name: "Elets Research Desk",
      designation: "Data & Insights",
      organisation: "Elets Technomedia",
    },
    summary:
      "A one-page snapshot of the scale at which Maharashtra's citizen-tech stack operates, from direct benefit transfers and monthly digital transactions to assisted service centres and schemes integrated on a unified portal. All figures are indicative samples compiled by the Elets Research Desk.",
    body: paras(
      "Behind every online certificate, benefit transfer and grievance resolution sits a vast and largely invisible infrastructure. The figures on this page offer a snapshot of the scale at which Maharashtra's citizen-tech stack now operates, from direct benefit transfers that reach bank accounts within days to a statewide network of assisted service centres that keeps digital services within reach of citizens who need a helping hand.",
      "All numbers are indicative sample figures compiled by the Elets Research Desk for illustration, and represent cumulative or monthly values as labelled. They should be read as a portrait of direction and momentum rather than as official statistics.",
    ),
    pullQuotes: [],
    imageIds: [],
    captions: [],
    facts: [
      { label: "DBT transferred", value: "₹65,000 Cr" },
      { label: "Service centres", value: "45,000+" },
      { label: "Citizens served", value: "12 Cr" },
      { label: "Schemes integrated", value: "93" },
      { label: "Monthly digital transactions", value: "2.1 Cr" },
      { label: "Districts on unified portal", value: "36" },
    ],
    status: "approved",
    tags: ["infographic", "data", "dpi", "maharashtra"],
    publicationId: PUB,
    createdAt: "2026-04-27T12:10:00.000Z",
    updatedAt: "2026-05-14T10:32:00.000Z",
  },

  /* 8 ------------------------------------------------------------------ */
  {
    id: "art-csr-20",
    title: "CSR 2.0",
    subtitle: "A strategic roadmap for evolutionary social transformation",
    contentType: "feature",
    sectionId: "sec-csr",
    author: {
      name: "Dr. Suresh Nair",
      designation: "Advisor",
      organisation: "State Innovation Society",
    },
    summary:
      "A decade after CSR became mandatory, the conversation is shifting from how much companies spend to what that spending achieves. This essay sets out the pillars of CSR 2.0: measurable outcomes, alignment with public systems, cross-company collaboration, investment in NGO capacity and patient, multi-year commitment.",
    body: paras(
      "When India made corporate social responsibility mandatory for qualifying companies in 2014, the first priority was compliance. Businesses had to identify projects, spend two per cent of average net profits and report on it. A decade later, cumulative CSR spending in the country runs into lakhs of crores, and Maharashtra consistently receives the largest share of any state. The question now is no longer whether companies spend, but whether that spending changes lives in lasting, measurable ways.",
      "That shift in emphasis is what practitioners increasingly describe as CSR 2.0: a move from scattered, annual, cheque-book philanthropy towards strategic, multi-year partnerships that use technology, data and public systems to scale impact.",
      "## From Spending to Outcomes",
      "The first pillar of CSR 2.0 is a focus on outcomes rather than outputs. Distributing ten thousand tablets is an output; improving learning levels in mathematics among the students who use them is an outcome. Measuring the latter is harder and takes longer, but it is the only honest way to judge whether a programme works.",
      "Technology makes this kind of measurement far more feasible than before. Digital attendance, learning assessments, health records and geotagged asset registers allow companies and their implementing partners to track progress in near real time. Several corporates in the state now require third-party impact assessments for every project above ₹50 lakh, and some have begun publishing results openly, including for the programmes that did not deliver.",
      "The second pillar is alignment with public systems. CSR funds, however large, are small compared with government budgets. The most effective programmes therefore treat the state not as a bystander but as a partner, strengthening existing schools, primary health centres and anganwadis rather than building parallel structures that collapse when funding ends. District-level convergence platforms, which match corporate offers with local needs identified by collectors and zilla parishads, have made this alignment much easier.",
      "## Building an Ecosystem for Scale",
      "The third pillar is collaboration across companies. Too often, five corporates fund five small pilots in the same district, each with its own reporting format and logo. Pooled funds and thematic consortia, in areas such as water conservation, digital literacy or skilling for the AI economy, allow partners to share risk, standardise metrics and reach a scale that no single company could achieve alone.",
      "Civil society organisations sit at the heart of this ecosystem. They bring community trust, local knowledge and implementation capacity, but they are frequently underfunded for the very things that make programmes durable: monitoring systems, staff training and organisational development. CSR 2.0 recognises that investing in the capacity of NGOs is not overhead; it is infrastructure.",
      "Strategic CSR also requires patience. Social change rarely follows a financial year. Programmes in nutrition, education or livelihoods often need five to seven years to show durable results. Boards and CSR committees that commit to longer horizons, with clear milestones and responsible exit plans, are far more likely to see their investments endure.",
      "Finally, the new model asks companies to bring more than money. Engineers, data analysts, supply chain specialists and communications teams can offer skills that many social programmes lack. Structured employee volunteering and pro bono expertise, when designed around real needs rather than photo opportunities, can be as valuable as the grant itself.",
      "For Maharashtra, the opportunity is considerable. With mature digital public infrastructure, an active startup ecosystem and a deep pool of civil society expertise, the state is well placed to demonstrate what evolutionary social transformation can look like. The roadmap is clear: measure what matters, work with public systems, collaborate across boundaries and stay the course. The companies that follow it will find that responsibility and strategy are not separate agendas, but the same one.",
    ),
    pullQuotes: [
      "The question now is no longer whether companies spend, but whether that spending changes lives in lasting, measurable ways.",
      "CSR 2.0 recognises that investing in the capacity of NGOs is not overhead; it is infrastructure.",
    ],
    imageIds: ["img-csr-community", "img-classroom"],
    captions: [
      "Community programmes increasingly pair CSR funding with public systems and local civil society partners",
      "Digital classrooms remain one of the most common technology investments made through CSR",
    ],
    facts: [
      { label: "Annual CSR spend in the state (sample)", value: "₹1,800 CR+" },
      { label: "Pillars of CSR 2.0: outcomes, alignment, collaboration", value: "3" },
      { label: "Horizon for durable social change", value: "5+ YRS" },
    ],
    status: "approved",
    tags: ["csr", "civil-society", "impact", "partnerships"],
    publicationId: PUB,
    createdAt: "2026-04-11T09:40:00.000Z",
    updatedAt: "2026-05-13T16:08:00.000Z",
  },

  /* 9 ------------------------------------------------------------------ */
  {
    id: "art-agri-ai",
    title: "AI in the Fields",
    subtitle: "Data-led farming advisories reach Marathwada's smallholders",
    contentType: "feature",
    sectionId: "sec-digital",
    author: {
      name: "Abhineet Kumar",
      designation: "Assistant Editor",
      organisation: "Elets Technomedia",
    },
    summary:
      "AI-driven advisories that combine satellite imagery, weather forecasts and soil data are reaching more than four lakh farmers in Marathwada through Marathi voice notes and SMS. Early sample results show lower input costs and faster insurance settlements, though trust and data ownership remain open questions.",
    body: paras(
      "For Sunita Waghmare, who grows soybean and tur on three acres near Ambajogai in Beed district, the most important message of the kharif season arrived as a voice note in Marathi. It warned her that a dry spell was likely in the second week of July and advised her to delay a planned fertiliser application by ten days. She followed the advice. Her neighbours who did not lost much of their top dressing to the heat.",
      "Stories like hers are increasingly common across Marathwada, a region long defined by erratic rainfall, indebtedness and farmer distress. A growing network of AI-driven advisory services is now attempting to give smallholders the kind of precise, timely information that was once available only to large commercial farms.",
      "At the core of the system is a data platform that combines satellite imagery, hyperlocal weather forecasts, soil health card records and crop registration data. Machine learning models generate field-level recommendations on sowing windows, irrigation, pest risk and input use. These are then translated into simple messages in Marathi and delivered via SMS, voice calls and a mobile app, with agricultural assistants following up in person for farmers who need more help.",
      "Sample figures from the pilot, which covers more than four lakh farmers in eight districts, are encouraging. Participating farmers reported an average reduction of around eighteen per cent in fertiliser costs and fewer crop losses from pest attacks, particularly pink bollworm in cotton. Drone-based crop health surveys have also helped the agriculture department verify damage for insurance claims faster, reducing settlement times from several months to a few weeks in some talukas.",
      "Trust remains the biggest challenge. Many farmers have learned to be sceptical of advice that arrives from distant offices. The programme has addressed this by working through farmer producer organisations and krishi sakhis, local women trained to explain recommendations and gather feedback. When an advisory turns out to be wrong, the feedback goes straight back into improving the models.",
      "The next phase will extend advisories to horticulture and integrate market price forecasts, so farmers can decide not just when to sow but when to sell. If the gains hold, AI may become as ordinary a tool in Marathwada's fields as the bullock cart once was.",
    ),
    pullQuotes: [
      "What they can do is reduce avoidable losses and help farmers make better decisions with the resources they have.",
    ],
    imageIds: ["img-farm-drone"],
    captions: [
      "A drone-based crop health survey in Marathwada helps speed up verification of insurance claims",
    ],
    status: "in-review",
    tags: ["agriculture", "artificial-intelligence", "marathwada", "farmers"],
    publicationId: PUB,
    createdAt: "2026-04-24T05:55:00.000Z",
    updatedAt: "2026-05-18T12:40:00.000Z",
  },

  /* 10 ----------------------------------------------------------------- */
  {
    id: "art-cyber",
    title: "Securing the State's Digital Backbone",
    subtitle: "Why zero-trust architecture is now essential for government networks",
    contentType: "feature",
    sectionId: "sec-dpi",
    author: {
      name: "Kavita Menon",
      designation: "Chief Information Security Officer",
      organisation: "Sahyadri Data Centre",
    },
    summary:
      "The CISO of Sahyadri Data Centre explains why perimeter security no longer protects government networks, what zero-trust principles mean in practice, and how a phased programme covering identity, micro-segmentation, endpoints, staff awareness, vendor controls and resilience is securing the state's digital backbone.",
    body: paras(
      "Every day, the digital systems that run Maharashtra's citizen services process millions of transactions, from land record queries and scholarship applications to benefit transfers worth hundreds of crores. Every day, those same systems are probed, scanned and attacked. At Sahyadri Data Centre, our security operations centre records an average of more than forty lakh malicious connection attempts in a single twenty-four-hour period. Most are automated and unsophisticated. A small number are not.",
      "The threat landscape for government networks has changed dramatically in the past five years. Ransomware groups now target public institutions specifically because disruption creates pressure to pay. State-sponsored actors seek long-term access to sensitive data. And the attack surface itself has expanded enormously, as departments move workloads to the cloud, officers work from mobile devices and thousands of third-party applications connect to core platforms through interfaces.",
      "In this environment, the traditional model of network security, a strong perimeter with trusted users and systems inside it, is no longer adequate. Once an attacker gets past the firewall, through a phished password or a compromised vendor account, a flat internal network allows them to move freely. This is why we have embarked on a multi-year transition to zero-trust architecture across the state's digital backbone.",
      "## What Zero Trust Really Means",
      "Zero trust is often misunderstood as a product that can be purchased and installed. It is better understood as a set of principles. The first is that no user, device or application is trusted by default, regardless of whether it sits inside or outside the network. Every request for access must be verified explicitly, using identity, device health, location and behaviour as signals.",
      "The second principle is least privilege. A district operator processing caste certificates has no reason to access the payroll system, and a contractor maintaining a website has no need to reach a database of beneficiary records. Access should be granted only to what is required, only for as long as it is required, and reviewed continuously.",
      "The third principle is to assume breach. Instead of designing systems on the hope that attackers will be kept out, we design them on the expectation that some will get in. Networks are segmented into small zones so that a compromise in one cannot spread easily to others. Logs are collected centrally and analysed in real time, so that unusual behaviour is detected quickly and contained before it becomes a crisis.",
      "## Building It for Government Scale",
      "Applying these principles to a state government is a substantial undertaking. Our environment includes more than 1,400 applications, many of them built over two decades on different technologies, by different vendors, with different assumptions about security. Some legacy systems cannot support modern authentication at all. Replacing everything at once is neither affordable nor wise.",
      "We have therefore taken a phased approach. The first phase, completed last year, focused on identity. All officers accessing critical systems now use a single sign-on platform with multi-factor authentication, and privileged administrator accounts are managed through a dedicated vault with session recording. This alone has eliminated a large class of attacks based on stolen or shared passwords, which were responsible for a majority of incidents in earlier years.",
      "The second phase, now under way, covers micro-segmentation of the data centre and cloud environments. Applications are being grouped by sensitivity, and traffic between them is restricted to explicitly approved flows. Systems holding citizen identity data, financial records and health information sit in the most tightly controlled zones. Legacy applications that cannot be modernised quickly are placed behind secure access gateways that add verification on their behalf.",
      "The third phase will extend continuous verification to endpoints and to the thousands of devices used at district and taluka offices. Device health checks will ensure that an unpatched laptop or an infected tablet cannot connect to sensitive services, even if the user's credentials are valid. This is particularly important at common service centres, where shared devices and varying levels of digital hygiene create genuine risk.",
      "## People, Partners and Resilience",
      "Technology is only part of the answer. Most successful attacks still begin with a human being clicking on a link, reusing a password or approving a request without checking it. Over the past eighteen months, we have run security awareness programmes for more than twenty-two thousand government employees, including simulated phishing exercises. Click rates on simulated attacks have fallen from nearly one in four to fewer than one in twenty.",
      "Vendors and partners are another critical link. Every third-party organisation that connects to state systems must now meet baseline security requirements, undergo periodic audits and report incidents within six hours, in line with national guidelines. Contracts include clear obligations on data handling, and access for vendor staff is time-bound and monitored.",
      "We are also investing heavily in resilience, because no defence is perfect. Critical platforms are replicated across geographically separate sites, backups are kept offline and immutable so that ransomware cannot encrypt them, and recovery drills are conducted every quarter. Our target is to restore essential citizen services within four hours of a major incident.",
      "Finally, security must coexist with usability. If verification is too cumbersome, officers will find workarounds that create new risks. We have worked closely with departments to design authentication flows that are secure but simple, using mobile-based approvals and risk-based prompts that only add friction when something looks unusual.",
      "The journey to zero trust is not a destination with a finish line. Threats will evolve, technologies will change and new services will bring new risks. But the principle at its heart is enduring: in a digital state, trust must be earned continuously, not assumed. For the citizens who rely on government platforms every day, that is the strongest assurance we can offer.",
    ),
    pullQuotes: [
      "Instead of designing systems on the hope that attackers will be kept out, we design them on the expectation that some will get in.",
      "But the principle at its heart is enduring: in a digital state, trust must be earned continuously, not assumed.",
    ],
    imageIds: ["img-cyber"],
    captions: [
      "The security operations centre monitors the state's digital backbone around the clock",
    ],
    status: "approved",
    tags: ["cybersecurity", "zero-trust", "dpi", "data-centre"],
    publicationId: PUB,
    createdAt: "2026-04-17T13:25:00.000Z",
    updatedAt: "2026-05-17T10:11:00.000Z",
  },

  /* 11 ----------------------------------------------------------------- */
  {
    id: "art-case-services",
    title: "From Counters to Code",
    subtitle: "Rebuilding citizen services around a single digital front door",
    contentType: "case-study",
    sectionId: "sec-dpi",
    author: {
      name: "Sahaj Anand",
      designation: "Sub Editor",
      organisation: "Elets Technomedia",
    },
    summary:
      "A district pilot, later scaled statewide, replaced forty separate portals with a single digital front door built on one login, automatic document retrieval, plain-Marathi forms and public timelines. Office visits per request fell from 3.4 to 0.6, and processing times dropped from twenty-one days to six.",
    body: paras(
      "For years, obtaining a basic government certificate in many Maharashtra towns meant a familiar ritual: a morning off work, a queue outside a tehsil office, a stack of photocopies and, often, a return visit because one document was missing. This case study looks at how one district-level pilot, later scaled statewide, set out to replace that ritual with a single digital front door.",
      "## The Challenge",
      "Before the redesign, citizens dealt with more than forty separate departmental portals, each with its own login, form design and document requirements. A survey of applicants in Satara and Jalna districts found that the average citizen visited a government office 3.4 times to complete a single service request. Nearly a third of applications were rejected at the first attempt, mostly because of incomplete documents rather than ineligibility.",
      "## The Approach",
      "Four design decisions followed. First, a single citizen login linked to Aadhaar-based authentication replaced separate departmental accounts. Second, documents already held by the government, such as birth records, land records and previous certificates, were fetched automatically through DigiLocker instead of being uploaded again. Third, forms were rewritten in plain Marathi and pre-filled wherever possible, cutting the average number of fields by more than half. Fourth, every application received a public service-level timeline, with automatic escalation to a senior officer when it was breached.",
      "## The Outcomes",
      "Eighteen months after the statewide rollout, the results are significant. Average office visits per service request have fallen from 3.4 to 0.6, as most applications are now completed entirely online or with a single visit to a service centre. Average processing time for the twenty priority services has fallen from twenty-one days to six.",
    ),
    pullQuotes: [
      "Documents already held by the government were fetched automatically instead of being uploaded again.",
    ],
    imageIds: ["img-citizen-service"],
    captions: [
      "A citizen completes a service request with operator assistance at an Aaple Sarkar centre",
    ],
    facts: [
      { label: "Office visits per request", value: "3.4 → 0.6" },
      { label: "First-attempt rejections", value: "31% → 9%" },
      { label: "Average processing time", value: "21 → 6 days" },
      { label: "Citizen satisfaction", value: "4.3 / 5" },
    ],
    status: "approved",
    tags: ["case-study", "citizen-services", "service-design", "dpi"],
    publicationId: PUB,
    createdAt: "2026-04-19T10:00:00.000Z",
    updatedAt: "2026-05-11T14:47:00.000Z",
  },

  /* 12 ----------------------------------------------------------------- */
  {
    id: "art-event-conclave",
    title: "TechMahaImpact 2026",
    subtitle: "Where government vision meets industry action",
    contentType: "event-report",
    sectionId: "sec-events",
    author: {
      name: "Elets News Network",
      designation: "Editorial Bureau",
      organisation: "Elets Technomedia",
    },
    summary:
      "More than six hundred leaders from government, industry and civil society met in Mumbai on 20 May 2026 for TechMahaImpact 2026. Sessions covered AI-powered governance, CSR 2.0, cybersecurity and last-mile delivery, and the evening closed with awards recognising twenty-four initiatives from across the state.",
    body: paras(
      "More than six hundred policymakers, technology leaders, CSR heads and civil society representatives gathered in Mumbai on 20 May 2026 for TechMahaImpact 2026, a one-day conclave organised by Elets Technomedia to explore how technology, governance and social investment can together accelerate Maharashtra's development. The theme for this year's edition was Where Government Vision Meets Industry Action.",
      "The inaugural session set the tone for the day. Delivering the keynote address, Dr. Vikram Deshpande, Principal Secretary, Department of Information Technology, described the state's digital public infrastructure as a shared asset and called on industry to build on its open platforms rather than create parallel systems. He announced that the state's draft AI use framework would be released for public consultation in the coming months.",
      "The first panel, on AI-powered governance, brought together senior officials, startup founders and researchers. Shalini Rao, Managing Director of MahaDigital Services Corporation, shared sample data showing grievance routing times falling from days to hours, while Rohan Patil of BhashaSetu AI argued that vernacular voice interfaces would determine whether AI reached rural citizens at all. Panellists agreed that human accountability must remain central wherever algorithms affect entitlements.",
      "The evening concluded with the TechMahaImpact Awards, recognising twenty-four initiatives across e-governance, digital health, education, agriculture and CSR. Winners included a district-level citizen services programme, a solar microgrid initiative for rural schools and a vernacular AI helpline for pensioners. The jury, comprising former civil servants, academics and industry experts, evaluated more than one hundred and eighty nominations on impact, scalability and innovation. Each winner received a citation and a commemorative trophy.",
      "Closing the conclave, Dr. Kavya Iyer, Editor-in-Chief, Elets Technomedia, said the day had shown that the most important conversations happen when government, industry and civil society sit at the same table. Organisers confirmed that the next edition will be held in Pune in 2027, with a dedicated track on AI skilling for youth.",
    ),
    pullQuotes: [
      "The most important conversations happen when government, industry and civil society sit at the same table.",
    ],
    imageIds: ["img-conference", "img-skyline"],
    captions: [
      "Delegates during a panel discussion at TechMahaImpact 2026 in Mumbai",
      "The conclave brought together more than 600 leaders from government, industry and civil society",
    ],
    status: "approved",
    tags: ["events", "conclave", "awards", "mumbai"],
    publicationId: PUB,
    createdAt: "2026-05-10T14:00:00.000Z",
    updatedAt: "2026-05-22T09:05:00.000Z",
  },

  /* 13 ----------------------------------------------------------------- */
  {
    id: "art-policy-dpdp",
    title: "Data Protection Rules and the Public Sector",
    subtitle: "What changes for state departments now",
    contentType: "news-report",
    sectionId: "sec-policy",
    author: {
      name: "Ritika Sharma",
      designation: "",
      organisation: "Elets Technomedia",
    },
    summary:
      "As national data protection rules are phased in, state departments must map the personal data they hold, rewrite consent notices, prepare for breach reporting and update vendor contracts. Experts say capacity is the biggest gap, but that responsible data handling could strengthen trust in digital services.",
    body: paras(
      "State government departments across India are preparing for one of the most significant changes to the way they handle citizens' information. With the rules under the national Digital Personal Data Protection framework being phased in, public bodies that collect, store and process personal data will need to meet clear obligations on consent, purpose limitation, security and accountability.",
      "For Maharashtra, which runs hundreds of online services and holds records on more than twelve crore residents, the implications are wide-ranging. Departments will need to know precisely what personal data they hold, why they hold it and who can access it. For many, that will require a first-ever comprehensive data inventory.",
      "Officials familiar with the preparations say the most immediate change concerns notice and consent. Where data is collected on the basis of consent, citizens must be told in clear language, and in the language of their choice, what is being collected and for what purpose. Forms on state portals are being reviewed to remove fields that are not strictly necessary, a practice long criticised by privacy advocates.",
      "The framework does allow the state to process personal data without consent for certain legitimate uses, such as delivering subsidies, benefits and services, or complying with law. However, experts caution that these exemptions do not remove the duty to protect data. Security safeguards, breach notification and reasonable retention limits apply to government bodies as well.",
      "Breach reporting is likely to test departmental readiness. A data breach involving personal information must be reported to the regulator and to affected individuals, and departments will need tested incident response plans, clear lines of responsibility and the technical ability to detect breaches in the first place. The State IT department is understood to be drafting a common breach response protocol for all departments.",
      "Privacy experts say the new regime is an opportunity as much as a compliance burden. Citizens who trust that their data is handled responsibly are more likely to use digital services. Handled well, data protection could become a foundation for the next phase of digital governance rather than a brake on it.",
    ),
    pullQuotes: [
      "Citizens who trust that their data is handled responsibly are more likely to use digital services.",
    ],
    imageIds: ["img-ai-abstract"],
    captions: [""],
    status: "approved",
    tags: ["public-policy", "data-protection", "privacy", "compliance"],
    publicationId: PUB,
    createdAt: "2026-04-29T08:35:00.000Z",
    updatedAt: "2026-05-15T06:58:00.000Z",
  },

  /* 14 ----------------------------------------------------------------- */
  {
    id: "art-health",
    title: "Telemedicine at the Taluka Level",
    subtitle: "How hub-and-spoke teleconsultation is bringing specialists to rural patients",
    contentType: "feature",
    sectionId: "sec-digital",
    author: {
      name: "Dr. Anjali Kulkarni",
      designation: "Public Health Specialist",
      organisation: "Rural Health Mission (sample)",
    },
    summary:
      "A hub-and-spoke telemedicine network now links primary health centres with specialists at district hospitals, delivering more than eighteen lakh teleconsultations in a year. Patients save time and money, but connectivity, specialist availability and comfort with on-screen care remain challenges.",
    body: paras(
      "At the primary health centre in Dhadgaon, in the hilly tribal belt of Nandurbar district, the nearest specialist used to be a four-hour bus ride away. Today, a mother worried about her child's persistent fever can sit in front of a webcam and consult a paediatrician at a district hospital in less than twenty minutes. The consultation is free, the prescription is issued digitally and the medicines are dispensed on the spot.",
      "Telemedicine has moved from a pandemic-era stopgap to a permanent part of rural healthcare in Maharashtra. Under a hub-and-spoke model, specialists at district hospitals and medical colleges act as hubs, while primary health centres and health and wellness centres at the taluka and village level serve as spokes. Community health officers at the spokes conduct the initial examination, record vital signs and connect patients to the right specialist.",
      "Sample figures from the Rural Health Mission indicate that more than eighteen lakh teleconsultations were conducted across the state in the last financial year, with general medicine, paediatrics, gynaecology and dermatology the most requested specialities. Around sixty per cent of patients were women, many of whom said they would otherwise have delayed seeking care.",
      "The benefits go beyond convenience. Each avoided trip to a district hospital saves a rural family an estimated ₹800 to ₹1,500 in travel and lost wages. Early specialist input helps catch conditions such as hypertension, diabetes and high-risk pregnancies before they become emergencies, reducing pressure on overstretched referral hospitals.",
      "Digital health records are a crucial enabler. Patients are increasingly registered with a health ID, allowing doctors to see past consultations, test results and prescriptions. This continuity of care is especially valuable for chronic disease management, where regular follow-up makes the biggest difference.",
      "Challenges remain. Connectivity in remote blocks is still unreliable, and some centres depend on a single mobile hotspot. Specialist availability is uneven, with peak-hour waiting times stretching beyond an hour in some districts. And not every patient is comfortable discussing health concerns with a doctor on a screen, particularly on sensitive issues.",
      "The mission is addressing these gaps with satellite-backed connectivity for the most isolated centres, scheduled specialist rosters and training for community health officers in communication and counselling. AI-based triage tools are being piloted to help prioritise urgent cases and suggest likely diagnoses for doctors to confirm.",
      "For health workers on the ground, the change is tangible. As a community health officer in Akkalkuwa put it, the specialist is no longer someone patients hear about; she is someone they can see.",
    ),
    pullQuotes: [
      "Each avoided trip to a district hospital saves a rural family an estimated ₹800 to ₹1,500 in travel and lost wages.",
    ],
    imageIds: ["img-health"],
    captions: [
      "A community health officer connects a patient to a district hospital specialist via teleconsultation",
    ],
    status: "draft",
    tags: ["health", "telemedicine", "rural", "digital-health"],
    publicationId: PUB,
    createdAt: "2026-05-02T09:50:00.000Z",
    updatedAt: "2026-05-09T17:20:00.000Z",
  },

  /* 15 ----------------------------------------------------------------- */
  {
    id: "art-solar",
    title: "Solar Microgrids Power 120 Rural Schools",
    subtitle: "CSR partnership brings reliable electricity to classrooms in three districts",
    contentType: "news-report",
    sectionId: "sec-csr",
    author: {
      name: "Nikita Dixit",
      designation: "Correspondent",
      organisation: "Elets News Network",
    },
    summary:
      "A CSR consortium working with zilla parishads has commissioned solar microgrids with battery storage at 120 rural government schools in Pune, Satara and Solapur districts, keeping digital classrooms running and saving an estimated ₹1.4 crore a year. Another 200 schools are planned.",
    body: paras(
      "PUNE: Solar-powered microgrids have been commissioned at 120 government schools across rural Pune, Satara and Solapur districts, ensuring uninterrupted electricity for classrooms, computer labs and mid-day meal kitchens, officials said on Thursday.",
      "The initiative, supported through a CSR partnership between a consortium of renewable energy and engineering companies and the district zilla parishads, has installed a combined capacity of 1.8 megawatts. Each school has received rooftop solar panels of between ten and twenty kilowatts, along with battery storage that can power essential loads for up to six hours after sunset.",
      "Many of the schools previously faced daily power cuts lasting several hours, which made it difficult to use digital learning equipment installed under earlier programmes. Teachers said smart classrooms and computer labs had often remained unused for long periods.",
      "With reliable power now available, the schools are running digital classes throughout the day, and several have started evening study sessions for older students preparing for board examinations. The microgrids are expected to reduce the schools' electricity bills by an estimated ₹1.4 crore a year in total, savings that headmasters said would be redirected to learning materials and maintenance.",
      "Each installation is monitored remotely through a central dashboard that tracks generation, battery health and consumption. Local technicians, many of them graduates of a vocational training programme run by the partners, have been trained to carry out routine maintenance.",
      "District officials said the programme would be expanded to a further 200 schools over the next two years, with priority for institutions in tribal and drought-prone blocks. The partners have also committed to a five-year maintenance plan to ensure the systems remain operational long after installation.",
      "The project forms part of a wider state push to align CSR investments with education and clean energy priorities.",
    ),
    pullQuotes: [],
    imageIds: ["img-solar"],
    captions: ["Rooftop solar panels installed at a zilla parishad school in rural Pune district"],
    status: "draft",
    tags: ["csr", "solar", "education", "clean-energy"],
    publicationId: PUB,
    createdAt: "2026-05-07T06:15:00.000Z",
    updatedAt: "2026-05-10T08:44:00.000Z",
  },

  /* 16 ----------------------------------------------------------------- */
  {
    id: "art-skilling",
    title: "Skilling 50,000 Youth for the AI Economy",
    subtitle: "A multi-partner model for job-ready digital talent beyond the metros",
    contentType: "case-study",
    sectionId: "sec-csr",
    author: {
      name: "Anuj Sharma",
      designation: "Senior Correspondent",
      organisation: "Elets News Network",
    },
    summary:
      "A CSR-funded skilling initiative delivered by NGOs and colleges aims to prepare 50,000 young people from smaller towns for entry-level digital and AI roles by 2027. In two years it has trained over 21,000 learners, more than half of them women, with promising early placement results.",
    body: paras(
      "Maharashtra's young people face a paradox. The state is home to some of India's largest technology employers, yet many graduates from smaller towns struggle to find jobs because their skills do not match what the market needs. A multi-partner skilling initiative has set out to close that gap for 50,000 young people by 2027.",
      "## The Challenge",
      "Employer surveys conducted by the programme partners found that fewer than one in five graduates from tier-two and tier-three colleges in the state were considered job-ready for entry-level technology roles. Gaps were most pronounced in practical skills such as data handling, basic programming, cloud tools and workplace communication. Young women faced additional barriers, including limited access to devices and concerns about travel to training centres.",
      "## The Approach",
      "The programme brings together CSR funding from five technology and financial services companies, curriculum support from industry experts and implementation by a network of NGOs and colleges. Training is delivered through a blended model: online modules that students can access on a smartphone, combined with weekly in-person lab sessions at partner colleges and community centres.",
      "Courses cover data analytics, AI fundamentals, cloud support, digital marketing and customer experience roles, each mapped to entry-level job descriptions provided by employers. Every learner completes a capstone project based on a real business problem, and mentors from partner companies provide career guidance. Stipends and device loans are offered to learners from low-income households, and at least half the seats are reserved for women.",
      "## The Outcomes",
      "In its first two years, the programme has trained over 21,000 young people across fourteen districts, of whom fifty-four per cent are women. According to preliminary figures, around sixty-eight per cent of those who completed training have secured jobs or internships within six months, with average starting salaries of about ₹2.6 lakh a year. A smaller share have started freelance work or small businesses.",
      "Partners acknowledge that the hardest part is not training but placement in the learners' home regions, where good jobs are scarcer. The programme is now working with district industry centres and local businesses to create more opportunities closer to home, and to support remote work arrangements.",
      "If it reaches its target, the initiative will offer a replicable model for how CSR, industry and civil society can prepare young people for an economy increasingly shaped by AI.",
    ),
    pullQuotes: [
      "Partners acknowledge that the hardest part is not training but placement in the learners' home regions, where good jobs are scarcer.",
    ],
    imageIds: ["img-classroom"],
    captions: ["Learners during a weekly lab session at a partner college"],
    facts: [
      { label: "Youth trained so far", value: "21,000+" },
      { label: "Women learners", value: "54%" },
      { label: "Placed within six months", value: "68%" },
    ],
    status: "needs-changes",
    tags: ["skilling", "csr", "youth", "ai-economy"],
    publicationId: PUB,
    createdAt: "2026-04-30T11:30:00.000Z",
    updatedAt: "2026-05-14T15:02:00.000Z",
    note: "Verify placement figures with partner NGO",
  },

  /* 17 ----------------------------------------------------------------- */
  {
    id: "art-datacentre",
    title: "Sahyadri Data Centre Expands Sovereign Cloud Capacity",
    subtitle: "New Navi Mumbai facility more than doubles state hosting capacity",
    contentType: "news-report",
    sectionId: "sec-digital",
    author: {
      name: "Shalini Rawat",
      designation: "Correspondent",
      organisation: "Elets News Network",
    },
    summary:
      "Sahyadri Data Centre has commissioned a 12 MW sovereign cloud facility in Navi Mumbai for sensitive government workloads, including a GPU cluster for AI applications. Built to Tier IV standards with renewable power and a Nagpur recovery site, it begins migrating priority workloads next quarter.",
    body: paras(
      "MUMBAI: Sahyadri Data Centre has commissioned a new sovereign cloud facility in Navi Mumbai, more than doubling the capacity available to state government departments for hosting sensitive citizen data and critical applications, officials announced on Monday.",
      "The new facility adds 12 megawatts of IT load capacity and is designed to Tier IV standards for availability, with fully redundant power, cooling and network connectivity. It will host workloads that must remain within the state's control, including identity platforms, land records, health information systems and financial databases.",
      "Officials said demand for government cloud capacity had grown by more than forty per cent a year since 2022, driven by the expansion of online citizen services, analytics and AI workloads. The existing facility in Pune had been operating close to its limits.",
      "The sovereign cloud offers departments self-service provisioning of computing and storage resources, with security controls built in by default. All data remains within India, and access by vendor personnel is subject to strict monitoring and approval workflows aligned with the state's zero-trust security programme.",
      "The facility includes a dedicated cluster of graphics processing units to support AI applications, including vernacular language models and analytics for welfare and agriculture programmes. Departments and approved startups working on public sector projects will be able to access this capacity at subsidised rates.",
      "Sustainability has been a key design consideration. The data centre draws around thirty per cent of its power from renewable sources and uses advanced cooling systems that officials say will reduce energy consumption compared with conventional designs. A disaster recovery site in Nagpur will provide geographic redundancy.",
      "Migration of priority workloads is scheduled to begin next quarter.",
    ),
    pullQuotes: [],
    imageIds: ["img-datacentre"],
    captions: ["Server halls at the new sovereign cloud facility in Navi Mumbai"],
    status: "in-review",
    tags: ["data-centre", "sovereign-cloud", "infrastructure", "ai"],
    publicationId: PUB,
    createdAt: "2026-05-08T07:05:00.000Z",
    updatedAt: "2026-05-20T06:36:00.000Z",
  },

  /* 18 ----------------------------------------------------------------- */
  {
    id: "art-closing",
    title: "Shaping Viksit Maharashtra, Together",
    subtitle: "Thank you to our partners",
    contentType: "editorial",
    sectionId: "sec-front",
    author: {
      name: "Elets Technomedia",
      designation: "Publisher",
    },
    summary:
      "A closing note from the publisher thanking the government, industry and civil society partners who contributed to this edition, and inviting readers to continue the conversation on the Elets website as the TechMahaImpact series works towards a Viksit Maharashtra.",
    body: paras(
      "As this edition of Tech Maha Impact goes to press, we extend our heartfelt thanks to the Government of Maharashtra, our partners in industry and civil society, and every leader who shared their time and insight with us. Your stories are the true record of a state reimagining how it serves its people.",
      "The conversation continues beyond these pages. Visit www.eletsonline.com for news, interviews and updates from the TechMahaImpact series, and join us as we work towards a Viksit Maharashtra, together. We look forward to meeting you at our next conclave.",
    ),
    pullQuotes: [],
    imageIds: ["img-skyline"],
    captions: ["Mumbai skyline at dusk"],
    status: "approved",
    tags: ["closing", "partners", "viksit-bharat"],
    publicationId: PUB,
    createdAt: "2026-05-09T12:00:00.000Z",
    updatedAt: "2026-05-21T17:10:00.000Z",
  },

  /* 19 ----------------------------------------------------------------- */
  {
    id: "art-msg-csr-council",
    title: "Message",
    subtitle: "Partnerships that deliver measurable impact",
    contentType: "leadership-message",
    sectionId: "sec-csr",
    author: {
      name: "Smt. Meera Kulkarni",
      designation: "Chairperson",
      organisation: "State CSR Council (sample)",
    },
    summary:
      "The Chairperson of the State CSR Council highlights the Council's focus on outcome-based partnerships, transparent reporting and alignment with district priorities, the role of its digital convergence platform, and the need for long-term commitments shared by government, industry and civil society.",
    body: paras(
      "It is a matter of great satisfaction that Elets Technomedia is dedicating a special compendium to the role of technology and corporate social responsibility in Maharashtra's development journey. Such platforms help bring together the diverse stakeholders whose collaboration is essential for lasting social change.",
      "Maharashtra has long been at the forefront of CSR in the country, both in the scale of investment and in the diversity of causes supported. Yet the true measure of our collective effort lies not in the amount spent, but in the lives transformed. The State CSR Council has therefore placed a strong emphasis on outcome-based partnerships, transparent reporting and alignment with district development priorities.",
      "Over the past year, the Council has facilitated more than three hundred partnerships between companies, government departments and civil society organisations, in areas ranging from water conservation and school education to digital literacy, healthcare and skilling for emerging technologies. Special attention has been given to aspirational blocks in Vidarbha and Marathwada, where the need is greatest. Our digital convergence platform now enables corporates to identify verified local needs and track the progress of their projects in real time.",
      "Technology has been a powerful enabler in this journey, but partnerships remain at its heart. When government brings reach, industry brings resources and expertise, and civil society brings community trust, the results can be truly transformative. I urge all stakeholders to think in terms of long-term commitments and shared accountability.",
      "I congratulate Elets Technomedia on this initiative and extend my best wishes to all contributors and readers. I am confident that this compendium will inspire many new partnerships for the people of Maharashtra.",
    ),
    pullQuotes: [],
    imageIds: [],
    captions: [],
    status: "draft",
    tags: ["leadership", "csr", "partnerships"],
    publicationId: PUB,
    createdAt: "2026-05-05T10:25:00.000Z",
    updatedAt: "2026-05-08T13:50:00.000Z",
  },
];
