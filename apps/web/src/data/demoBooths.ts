import { BOOTH_SLOTS } from '@meetspace/venue';
import type { BoothDemoExperience, DemoSlide, DemoQuizQuestion } from '@meetspace/venue';
import { DEFAULT_DEMO_POINTS_CONFIG } from '@meetspace/venue';

export interface DemoBoothMeta {
  id: string;
  slotId: string;
  company: string;
  color: string;
  category: string;
  tagline: string;
  description: string;
  logo?: string;
  productName: string;
  productDescription: string;
  hiring?: string[];
  tags?: string[];
}

function createSlides(
  company: string,
  product: string,
  category: string,
  custom: (t: (start: number, end: number, overrides?: Partial<DemoSlide>) => DemoSlide) => DemoSlide[]
): DemoSlide[] {
  let idx = 0;
  const t = (start: number, end: number, overrides: Partial<DemoSlide> = {}): DemoSlide => {
    idx++;
    const base: DemoSlide = {
      id: `${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-slide-${idx}`,
      type: 'animated',
      animation: 'fade',
      duration: (end - start) * 1000,
      ...overrides,
    };
    return base;
  };
  return custom(t);
}

export const DEMO_BOOTH_META: DemoBoothMeta[] = [
  {
    id: 'demo-ai-innovation-labs',
    slotId: BOOTH_SLOTS[0]!.id,
    company: 'AI Innovation Labs',
    color: '#6366f1',
    category: 'Artificial Intelligence',
    tagline: 'Enterprise AI that thinks with you',
    description: 'Pioneering applied AI solutions that transform how businesses understand, automate, and accelerate decision-making.',
    productName: 'Neurix Business Assistant',
    productDescription: 'An enterprise-grade AI assistant that processes documents, emails, and data to deliver actionable insights in seconds.',
    hiring: ['ML Engineer', 'AI Researcher', 'Prompt Engineer'],
    tags: ['llm', 'rag', 'python', 'pytorch'],
  },
  {
    id: 'demo-nimbus-cloud',
    slotId: BOOTH_SLOTS[1]!.id,
    company: 'Nimbus Cloud Systems',
    color: '#0ea5e9',
    category: 'Cloud Computing',
    tagline: 'Deploy globally in seconds',
    description: 'Next-generation cloud platform with intelligent orchestration, edge computing, and zero-downtime deployments.',
    productName: 'Nimbus Edge Platform',
    productDescription: 'Unified cloud and edge orchestration that automatically scales workloads to the optimal location for performance and cost.',
    hiring: ['Platform Engineer', 'SRE', 'Cloud Architect'],
    tags: ['kubernetes', 'terraform', 'go', 'edge'],
  },
  {
    id: 'demo-shieldfort-cyber',
    slotId: BOOTH_SLOTS[2]!.id,
    company: 'ShieldFort Security',
    color: '#64748b',
    category: 'Cybersecurity',
    tagline: 'Zero trust, real protection',
    description: 'Comprehensive zero-trust security platform protecting enterprises from modern threats with AI-powered detection.',
    productName: 'FortifyZero Suite',
    productDescription: 'End-to-end zero-trust architecture with continuous verification, micro-segmentation, and real-time threat intelligence.',
    hiring: ['Security Engineer', 'Threat Researcher', 'AppSec Engineer'],
    tags: ['zero-trust', 'siem', 'rust', 'security'],
  },
  {
    id: 'demo-vertex-analytics',
    slotId: BOOTH_SLOTS[3]!.id,
    company: 'Vertex Data Analytics',
    color: '#8b5cf6',
    category: 'Data Analytics',
    tagline: 'Turn data into decisions',
    description: 'Real-time analytics platform that helps organizations visualize, explore, and act on their data instantly.',
    productName: 'Vertex Insight Engine',
    productDescription: 'Real-time data pipeline with AI-powered anomaly detection, interactive dashboards, and natural language queries.',
    hiring: ['Data Engineer', 'Analytics Engineer', 'Data Scientist'],
    tags: ['sql', 'spark', 'dbt', 'analytics'],
  },
  {
    id: 'demo-devforge-platforms',
    slotId: BOOTH_SLOTS[4]!.id,
    company: 'DevForge Platforms',
    color: '#a855f7',
    category: 'Developer Platforms',
    tagline: 'Ship faster with confidence',
    description: 'Developer-first platform providing integrated CI/CD, preview environments, and intelligent debugging tools.',
    productName: 'ForgeStack',
    productDescription: 'All-in-one developer platform with AI code review, automated testing, preview deployments, and observability built-in.',
    hiring: ['DevEx Engineer', 'Backend Engineer', 'Developer Advocate'],
    tags: ['typescript', 'cli', 'devtools', 'ci-cd'],
  },
  {
    id: 'demo-paypulse-fintech',
    slotId: BOOTH_SLOTS[5]!.id,
    company: 'PayPulse FinTech',
    color: '#14b8a6',
    category: 'FinTech',
    tagline: 'Payments that just work',
    description: 'Modern payment infrastructure enabling seamless, secure transactions for businesses of any size.',
    productName: 'PulsePay Gateway',
    productDescription: 'Intelligent payment routing with fraud prevention, real-time settlement, and support for 100+ payment methods.',
    hiring: ['Backend Engineer', 'Payments Engineer', 'Risk Analyst'],
    tags: ['payments', 'api', 'fraud', 'fintech'],
  },
  {
    id: 'demo-autonex-automation',
    slotId: BOOTH_SLOTS[6]!.id,
    company: 'AutoNex Automation',
    color: '#f97316',
    category: 'Automation',
    tagline: 'Intelligent automation at scale',
    description: 'Robotic process automation and intelligent workflows that eliminate repetitive tasks across the enterprise.',
    productName: 'NexFlow Orchestrator',
    productDescription: 'AI-powered workflow automation with computer vision, natural language processing, and seamless system integration.',
    hiring: ['Robotics Engineer', 'Automation Engineer', 'ML Engineer'],
    tags: ['rpa', 'computer-vision', 'workflows', 'python'],
  },
  {
    id: 'demo-mediquest-health',
    slotId: BOOTH_SLOTS[7]!.id,
    company: 'MediQuest HealthTech',
    color: '#eab308',
    category: 'Healthcare Technology',
    tagline: 'Smarter care, better outcomes',
    description: 'Healthcare technology solutions improving patient outcomes through AI diagnostics and connected care platforms.',
    productName: 'QuestCare AI',
    productDescription: 'AI-assisted clinical decision support with medical imaging analysis, patient monitoring, and predictive care alerts.',
    hiring: ['HealthTech Engineer', 'ML Engineer', 'Clinical Data Scientist'],
    tags: ['healthcare', 'ml', 'imaging', 'hipaa'],
  },
];

export const DEMO_EXPERIENCES: BoothDemoExperience[] = [
  // AI Innovation Labs
  {
    boothId: 'demo-ai-innovation-labs',
    companyName: 'AI Innovation Labs',
    companyLogo: '🤖',
    productName: 'Neurix Business Assistant',
    productDescription: 'An enterprise-grade AI assistant that processes documents, emails, and data to deliver actionable insights in seconds.',
    boothDescription: 'Pioneering applied AI solutions that transform how businesses understand, automate, and accelerate decision-making.',
    category: 'Artificial Intelligence',
    duration: 30000,
    pointsConfig: DEFAULT_DEMO_POINTS_CONFIG,
    slides: [
      { id: 'ai-s1', type: 'animated', animation: 'fade', title: 'AI Innovation Labs', content: 'Transforming Business with Applied AI', bullets: ['Enterprise-Ready Solutions', 'Trusted by Fortune 500', 'Ethical AI First'], background: 'linear-gradient(135deg, #6366f1 0%, #312e81 100%)' },
      { id: 'ai-s2', type: 'animated', animation: 'slide', title: 'The Challenge', content: 'Knowledge workers spend 60% of their time searching for information across documents, emails, and systems.', bullets: ['Information Overload', 'Wasted Productivity', 'Missed Opportunities'], background: 'linear-gradient(135deg, #4f46e5 0%, #1e1b4b 100%)' },
      { id: 'ai-s3', type: 'animated', animation: 'zoom', title: 'Meet Neurix', content: 'Your AI-Powered Business Assistant', bullets: ['Understands Context', 'Learns Your Business', 'Secure by Design'], background: 'linear-gradient(135deg, #6366f1 0%, #312e81 100%)' },
      { id: 'ai-s4', type: 'animated', animation: 'fade', title: 'Document Intelligence', content: 'Neurix processes contracts, reports, and emails to extract key insights instantly.', bullets: ['Auto-Summarization', 'Risk Detection', 'Smart Extraction'], background: 'linear-gradient(135deg, #7c3aed 0%, #312e81 100%)' },
      { id: 'ai-s5', type: 'animated', animation: 'slide', title: 'Automated Insights', content: 'Get answers before you even know to ask. Neurix surfaces relevant insights proactively.', bullets: ['Trend Analysis', 'Anomaly Alerts', 'Predictive Recommendations'], background: 'linear-gradient(135deg, #6366f1 0%, #1e1b4b 100%)' },
      { id: 'ai-s6', type: 'animated', animation: 'typewriter', title: 'Business Benefits', content: '10x Faster Decisions • 40% Time Saved • Enterprise Security', bullets: ['ROI in Weeks', 'Seamless Integration', '24/7 Availability'], background: 'linear-gradient(135deg, #4f46e5 0%, #312e81 100%)' },
    ],
    quiz: [
      { id: 'ai-q1', question: 'What percentage of time do knowledge workers spend searching for information?', options: ['20%', '40%', '60%', '80%'], correctIndex: 2 },
      { id: 'ai-q2', question: 'What is the name of AI Innovation Labs\' business assistant?', options: ['Atlas', 'Neurix', 'Cortex', 'Nexus'], correctIndex: 1 },
    ],
  },
  // Nimbus Cloud
  {
    boothId: 'demo-nimbus-cloud',
    companyName: 'Nimbus Cloud Systems',
    companyLogo: '☁️',
    productName: 'Nimbus Edge Platform',
    productDescription: 'Unified cloud and edge orchestration that automatically scales workloads to the optimal location for performance and cost.',
    boothDescription: 'Next-generation cloud platform with intelligent orchestration, edge computing, and zero-downtime deployments.',
    category: 'Cloud Computing',
    duration: 30000,
    pointsConfig: DEFAULT_DEMO_POINTS_CONFIG,
    slides: [
      { id: 'cloud-s1', type: 'animated', animation: 'fade', title: 'Nimbus Cloud Systems', content: 'Deploy Globally in Seconds', bullets: ['Multi-Cloud Native', 'Edge-First Architecture', 'Intelligent Orchestration'], background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)' },
      { id: 'cloud-s2', type: 'animated', animation: 'slide', title: 'The Cloud Complexity Problem', content: 'Managing deployments across regions, clouds, and edge is overwhelming.', bullets: ['Configuration Drift', 'Latency Issues', 'Rising Costs'], background: 'linear-gradient(135deg, #0284c7 0%, #075985 100%)' },
      { id: 'cloud-s3', type: 'animated', animation: 'zoom', title: 'Nimbus Edge Platform', content: 'One Platform. Every Location.', bullets: ['Unified Control Plane', 'Smart Routing', 'Auto-Optimization'], background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)' },
      { id: 'cloud-s4', type: 'animated', animation: 'fade', title: 'Intelligent Placement', content: 'AI decides where to run your workload for best performance and lowest cost.', bullets: ['Latency Optimization', 'Cost Reduction', 'Compliance Aware'], background: 'linear-gradient(135deg, #06b6d4 0%, #155e75 100%)' },
      { id: 'cloud-s5', type: 'animated', animation: 'slide', title: 'Zero-Downtime Deployments', content: 'Blue-green and canary deployments happen automatically with instant rollback.', bullets: ['Safe Releases', 'Instant Rollback', 'Global Rollout'], background: 'linear-gradient(135deg, #0ea5e9 0%, #075985 100%)' },
      { id: 'cloud-s6', type: 'animated', animation: 'typewriter', title: 'Ready to Scale', content: 'From Startup to Global in Minutes', bullets: ['Pay Per Use', '99.99% Uptime SLA', 'Enterprise Support'], background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' },
    ],
    quiz: [
      { id: 'cloud-q1', question: 'What does Nimbus Edge Platform optimize for?', options: ['Only Cost', 'Only Speed', 'Performance and Cost', 'Only Security'], correctIndex: 2 },
      { id: 'cloud-q2', question: 'How does Nimbus handle deployments?', options: ['Manual Only', 'Zero-Downtime Automated', 'Weekly Batches', 'Single Region Only'], correctIndex: 1 },
    ],
  },
  // ShieldFort
  {
    boothId: 'demo-shieldfort-cyber',
    companyName: 'ShieldFort Security',
    companyLogo: '🛡️',
    productName: 'FortifyZero Suite',
    productDescription: 'End-to-end zero-trust architecture with continuous verification, micro-segmentation, and real-time threat intelligence.',
    boothDescription: 'Comprehensive zero-trust security platform protecting enterprises from modern threats with AI-powered detection.',
    category: 'Cybersecurity',
    duration: 30000,
    pointsConfig: DEFAULT_DEMO_POINTS_CONFIG,
    slides: [
      { id: 'sec-s1', type: 'animated', animation: 'fade', title: 'ShieldFort Security', content: 'Zero Trust. Real Protection.', bullets: ['Assume Breach Mentality', 'Continuous Verification', 'AI-Powered Defense'], background: 'linear-gradient(135deg, #475569 0%, #0f172a 100%)' },
      { id: 'sec-s2', type: 'animated', animation: 'slide', title: 'Perimeter Security is Dead', content: 'Remote work, cloud, and APIs have dissolved the traditional network perimeter.', bullets: ['89% of breaches use valid credentials', 'VPNs are not enough', 'Attack surface exploded'], background: 'linear-gradient(135deg, #334155 0%, #020617 100%)' },
      { id: 'sec-s3', type: 'animated', animation: 'zoom', title: 'FortifyZero Suite', content: 'Never Trust. Always Verify.', bullets: ['Identity-Centric Security', 'Device Trust', 'Context-Aware Access'], background: 'linear-gradient(135deg, #475569 0%, #0f172a 100%)' },
      { id: 'sec-s4', type: 'animated', animation: 'fade', title: 'Micro-Segmentation', content: 'Contain breaches before they spread with granular network segmentation.', bullets: ['Lateral Movement Prevention', 'Least Privilege Access', 'Dynamic Policies'], background: 'linear-gradient(135deg, #64748b 0%, #1e293b 100%)' },
      { id: 'sec-s5', type: 'animated', animation: 'slide', title: 'AI Threat Detection', content: 'Machine learning identifies anomalies and threats in real-time before damage occurs.', bullets: ['Behavioral Analytics', 'Threat Intelligence', 'Automated Response'], background: 'linear-gradient(135deg, #475569 0%, #020617 100%)' },
      { id: 'sec-s6', type: 'animated', animation: 'typewriter', title: 'Secure Everything', content: 'Users • Devices • Apps • Data', bullets: ['Unified Dashboard', 'Compliance Ready', 'Deploy in Days'], background: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)' },
    ],
    quiz: [
      { id: 'sec-q1', question: 'What is the core principle of Zero Trust?', options: ['Trust Everyone', 'Trust the VPN', 'Never Trust, Always Verify', 'Trust Internal Network'], correctIndex: 2 },
      { id: 'sec-q2', question: 'What does micro-segmentation prevent?', options: ['Login Issues', 'Lateral Movement', 'Slow WiFi', 'Disk Space'], correctIndex: 1 },
    ],
  },
  // Vertex Analytics
  {
    boothId: 'demo-vertex-analytics',
    companyName: 'Vertex Data Analytics',
    companyLogo: '📊',
    productName: 'Vertex Insight Engine',
    productDescription: 'Real-time data pipeline with AI-powered anomaly detection, interactive dashboards, and natural language queries.',
    boothDescription: 'Real-time analytics platform that helps organizations visualize, explore, and act on their data instantly.',
    category: 'Data Analytics',
    duration: 30000,
    pointsConfig: DEFAULT_DEMO_POINTS_CONFIG,
    slides: [
      { id: 'data-s1', type: 'animated', animation: 'fade', title: 'Vertex Data Analytics', content: 'Turn Data Into Decisions', bullets: ['Real-Time Insights', 'AI-Powered Analytics', 'Self-Service BI'], background: 'linear-gradient(135deg, #8b5cf6 0%, #4c1d95 100%)' },
      { id: 'data-s2', type: 'animated', animation: 'slide', title: 'Data Overload Crisis', content: 'Businesses generate petabytes of data daily but only use 1% of it effectively.', bullets: ['Siloed Data', 'Slow Reports', 'Analysis Paralysis'], background: 'linear-gradient(135deg, #7c3aed 0%, #312e81 100%)' },
      { id: 'data-s3', type: 'animated', animation: 'zoom', title: 'Vertex Insight Engine', content: 'Ask Questions. Get Answers. Instantly.', bullets: ['Natural Language Queries', 'Real-Time Processing', 'Unified Data Layer'], background: 'linear-gradient(135deg, #8b5cf6 0%, #4c1d95 100%)' },
      { id: 'data-s4', type: 'animated', animation: 'fade', title: 'Natural Language Queries', content: '"Show me revenue by region last quarter" - just ask in plain English.', bullets: ['No SQL Required', 'Instant Results', 'Smart Suggestions'], background: 'linear-gradient(135deg, #a78bfa 0%, #4c1d95 100%)' },
      { id: 'data-s5', type: 'animated', animation: 'slide', title: 'AI Anomaly Detection', content: 'Catch issues before they become problems with intelligent monitoring.', bullets: ['Proactive Alerts', 'Root Cause Analysis', 'Trend Prediction'], background: 'linear-gradient(135deg, #8b5cf6 0%, #312e81 100%)' },
      { id: 'data-s6', type: 'animated', animation: 'typewriter', title: 'Data-Driven Culture', content: 'Empower Everyone to Make Better Decisions', bullets: ['Democratized Analytics', 'Governed & Secure', 'Scales to Billions'], background: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)' },
    ],
    quiz: [
      { id: 'data-q1', question: 'How much of business data is typically used effectively?', options: ['50%', '25%', '1%', '10%'], correctIndex: 2 },
      { id: 'data-q2', question: 'How can users query Vertex Insight Engine?', options: ['Only SQL', 'Natural Language', 'Only APIs', 'Only CSV Upload'], correctIndex: 1 },
    ],
  },
  // DevForge
  {
    boothId: 'demo-devforge-platforms',
    companyName: 'DevForge Platforms',
    companyLogo: '⚡',
    productName: 'ForgeStack',
    productDescription: 'All-in-one developer platform with AI code review, automated testing, preview deployments, and observability built-in.',
    boothDescription: 'Developer-first platform providing integrated CI/CD, preview environments, and intelligent debugging tools.',
    category: 'Developer Platforms',
    duration: 30000,
    pointsConfig: DEFAULT_DEMO_POINTS_CONFIG,
    slides: [
      { id: 'dev-s1', type: 'animated', animation: 'fade', title: 'DevForge Platforms', content: 'Ship Faster With Confidence', bullets: ['Developer Experience First', 'AI-Powered Workflow', 'From Commit to Production'], background: 'linear-gradient(135deg, #a855f7 0%, #581c87 100%)' },
      { id: 'dev-s2', type: 'animated', animation: 'slide', title: 'Developer Friction', content: 'Developers spend only 32% of time writing code. The rest is waiting, debugging, and deploying.', bullets: ['Long CI Times', 'Environment Hell', 'Debugging Nightmares'], background: 'linear-gradient(135deg, #9333ea 0%, #3b0764 100%)' },
      { id: 'dev-s3', type: 'animated', animation: 'zoom', title: 'ForgeStack', content: 'One Platform. Zero Friction.', bullets: ['Unified Workflow', 'Instant Previews', 'AI Assistance'], background: 'linear-gradient(135deg, #a855f7 0%, #581c87 100%)' },
      { id: 'dev-s4', type: 'animated', animation: 'fade', title: 'AI Code Review', content: 'Get intelligent feedback on every pull request before human review.', bullets: ['Bug Detection', 'Security Scans', 'Best Practices'], background: 'linear-gradient(135deg, #c084fc 0%, #581c87 100%)' },
      { id: 'dev-s5', type: 'animated', animation: 'slide', title: 'Preview Environments', content: 'Every branch gets a live preview URL. Test with stakeholders instantly.', bullets: ['Shareable Links', 'Auto-Cleanup', 'Full Stack Ready'], background: 'linear-gradient(135deg, #a855f7 0%, #3b0764 100%)' },
      { id: 'dev-s6', type: 'animated', animation: 'typewriter', title: 'Developer Joy', content: 'More Coding. Less Waiting.', bullets: ['10x Faster Feedback', 'Built-in Observability', 'Loved by Teams'], background: 'linear-gradient(135deg, #9333ea 0%, #581c87 100%)' },
    ],
    quiz: [
      { id: 'dev-q1', question: 'What percentage of time do developers spend writing code?', options: ['80%', '60%', '32%', '50%'], correctIndex: 2 },
      { id: 'dev-q2', question: 'What does ForgeStack provide for every branch?', options: ['Email Reports', 'Preview Environments', 'PDF Docs', 'SMS Alerts'], correctIndex: 1 },
    ],
  },
  // PayPulse
  {
    boothId: 'demo-paypulse-fintech',
    companyName: 'PayPulse FinTech',
    companyLogo: '💳',
    productName: 'PulsePay Gateway',
    productDescription: 'Intelligent payment routing with fraud prevention, real-time settlement, and support for 100+ payment methods.',
    boothDescription: 'Modern payment infrastructure enabling seamless, secure transactions for businesses of any size.',
    category: 'FinTech',
    duration: 30000,
    pointsConfig: DEFAULT_DEMO_POINTS_CONFIG,
    slides: [
      { id: 'pay-s1', type: 'animated', animation: 'fade', title: 'PayPulse FinTech', content: 'Payments That Just Work', bullets: ['Global Reach', '99.999% Uptime', 'Built for Scale'], background: 'linear-gradient(135deg, #14b8a6 0%, #134e4a 100%)' },
      { id: 'pay-s2', type: 'animated', animation: 'slide', title: 'Payments are Broken', content: 'Failed payments cost businesses $118B annually. Complexity kills conversions.', bullets: ['High Decline Rates', 'Fraud Losses', 'Integration Pain'], background: 'linear-gradient(135deg, #0d9488 0%, #042f2e 100%)' },
      { id: 'pay-s3', type: 'animated', animation: 'zoom', title: 'PulsePay Gateway', content: 'Smart Routing. Happy Customers.', bullets: ['Intelligent Routing', 'Fraud Prevention', 'Real-Time Settlement'], background: 'linear-gradient(135deg, #14b8a6 0%, #134e4a 100%)' },
      { id: 'pay-s4', type: 'animated', animation: 'fade', title: 'Intelligent Routing', content: 'AI routes each transaction to the processor most likely to approve it.', bullets: ['Higher Approval Rates', 'Lower Costs', 'Better UX'], background: 'linear-gradient(135deg, #2dd4bf 0%, #134e4a 100%)' },
      { id: 'pay-s5', type: 'animated', animation: 'slide', title: 'Fraud Prevention', content: 'Real-time risk scoring blocks fraud without friction for legitimate customers.', bullets: ['ML-Powered', '3DS Smart', 'Chargeback Protection'], background: 'linear-gradient(135deg, #14b8a6 0%, #042f2e 100%)' },
      { id: 'pay-s6', type: 'animated', animation: 'typewriter', title: 'Accept Payments Everywhere', content: 'Cards • Wallets • BNPL • Crypto', bullets: ['100+ Payment Methods', 'One Integration', 'Global Coverage'], background: 'linear-gradient(135deg, #0d9488 0%, #134e4a 100%)' },
    ],
    quiz: [
      { id: 'pay-q1', question: 'How much do failed payments cost businesses annually?', options: ['$10B', '$50B', '$118B', '$200B'], correctIndex: 2 },
      { id: 'pay-q2', question: 'How many payment methods does PulsePay support?', options: ['10+', '50+', '100+', '1000+'], correctIndex: 2 },
    ],
  },
  // AutoNex
  {
    boothId: 'demo-autonex-automation',
    companyName: 'AutoNex Automation',
    companyLogo: '🤖',
    productName: 'NexFlow Orchestrator',
    productDescription: 'AI-powered workflow automation with computer vision, natural language processing, and seamless system integration.',
    boothDescription: 'Robotic process automation and intelligent workflows that eliminate repetitive tasks across the enterprise.',
    category: 'Automation',
    duration: 30000,
    pointsConfig: DEFAULT_DEMO_POINTS_CONFIG,
    slides: [
      { id: 'auto-s1', type: 'animated', animation: 'fade', title: 'AutoNex Automation', content: 'Intelligent Automation at Scale', bullets: ['AI-Powered Workflows', 'End-to-End Orchestration', 'Human-in-the-Loop'], background: 'linear-gradient(135deg, #f97316 0%, #9a3412 100%)' },
      { id: 'auto-s2', type: 'animated', animation: 'slide', title: 'The Cost of Repetition', content: 'Employees spend 45% of time on tasks that could be automated with current technology.', bullets: ['Data Entry', 'Report Generation', 'Email Processing'], background: 'linear-gradient(135deg, #ea580c 0%, #7c2d12 100%)' },
      { id: 'auto-s3', type: 'animated', animation: 'zoom', title: 'NexFlow Orchestrator', content: 'Automate Anything. Integrate Everything.', bullets: ['No-Code Builder', 'AI Decision Making', 'Enterprise Scale'], background: 'linear-gradient(135deg, #f97316 0%, #9a3412 100%)' },
      { id: 'auto-s4', type: 'animated', animation: 'fade', title: 'Computer Vision + NLP', content: 'Handle unstructured data like documents, images, and emails intelligently.', bullets: ['Document Processing', 'Image Recognition', 'Language Understanding'], background: 'linear-gradient(135deg, #fb923c 0%, #9a3412 100%)' },
      { id: 'auto-s5', type: 'animated', animation: 'slide', title: 'Smart Orchestration', content: 'Connect 500+ apps and systems with intelligent routing and error handling.', bullets: ['Self-Healing Flows', 'Conditional Logic', 'Audit Trails'], background: 'linear-gradient(135deg, #f97316 0%, #7c2d12 100%)' },
      { id: 'auto-s6', type: 'animated', animation: 'typewriter', title: 'Work Smarter', content: 'Focus on What Matters Most', bullets: ['80% Time Saved', 'Error Reduction', 'Employee Satisfaction Up'], background: 'linear-gradient(135deg, #ea580c 0%, #9a3412 100%)' },
    ],
    quiz: [
      { id: 'auto-q1', question: 'What percentage of time could be automated with current technology?', options: ['20%', '30%', '45%', '60%'], correctIndex: 2 },
      { id: 'auto-q2', question: 'What does NexFlow use to handle documents and images?', options: ['Only APIs', 'Computer Vision + NLP', 'Only Spreadsheets', 'Only Email'], correctIndex: 1 },
    ],
  },
  // MediQuest
  {
    boothId: 'demo-mediquest-health',
    companyName: 'MediQuest HealthTech',
    companyLogo: '🏥',
    productName: 'QuestCare AI',
    productDescription: 'AI-assisted clinical decision support with medical imaging analysis, patient monitoring, and predictive care alerts.',
    boothDescription: 'Healthcare technology solutions improving patient outcomes through AI diagnostics and connected care platforms.',
    category: 'Healthcare Technology',
    duration: 30000,
    pointsConfig: DEFAULT_DEMO_POINTS_CONFIG,
    slides: [
      { id: 'health-s1', type: 'animated', animation: 'fade', title: 'MediQuest HealthTech', content: 'Smarter Care, Better Outcomes', bullets: ['AI-Assisted Diagnostics', 'Connected Care', 'Patient-Centered'], background: 'linear-gradient(135deg, #eab308 0%, #713f12 100%)' },
      { id: 'health-s2', type: 'animated', animation: 'slide', title: 'Healthcare Challenges', content: 'Clinicians are overwhelmed. Burnout is high, and diagnostic delays impact outcomes.', bullets: ['Staff Shortages', 'Rising Costs', 'Delayed Diagnoses'], background: 'linear-gradient(135deg, #ca8a04 0%, #422006 100%)' },
      { id: 'health-s3', type: 'animated', animation: 'zoom', title: 'QuestCare AI', content: 'AI That Augments, Never Replaces', bullets: ['Clinical Decision Support', 'Imaging Analysis', 'Predictive Alerts'], background: 'linear-gradient(135deg, #eab308 0%, #713f12 100%)' },
      { id: 'health-s4', type: 'animated', animation: 'fade', title: 'Medical Imaging Analysis', content: 'Detect anomalies in X-rays, CT scans, and MRIs with 99% accuracy assist.', bullets: ['Radiology Support', 'Faster Triage', 'Second Opinion'], background: 'linear-gradient(135deg, #facc15 0%, #713f12 100%)' },
      { id: 'health-s5', type: 'animated', animation: 'slide', title: 'Predictive Care', content: 'Identify at-risk patients early with continuous monitoring and smart alerts.', bullets: ['Early Warning System', 'Remote Monitoring', 'Preventive Care'], background: 'linear-gradient(135deg, #eab308 0%, #422006 100%)' },
      { id: 'health-s6', type: 'animated', animation: 'typewriter', title: 'Better Healthcare for All', content: 'Saving Time. Saving Lives.', bullets: ['HIPAA Compliant', 'Clinician Approved', 'Proven Results'], background: 'linear-gradient(135deg, #ca8a04 0%, #713f12 100%)' },
    ],
    quiz: [
      { id: 'health-q1', question: 'What does QuestCare AI assist with?', options: ['Only Billing', 'Clinical Decision Support', 'Only Scheduling', 'Only Records'], correctIndex: 1 },
      { id: 'health-q2', question: 'What types of medical imaging can QuestCare analyze?', options: ['Only X-rays', 'X-rays, CT scans, and MRIs', 'Only Ultrasound', 'Only Photos'], correctIndex: 1 },
    ],
  },
];

export const DEMO_MOCK_ATTENDEES = [
  { id: 'att-1', name: 'Sarah Chen', avatar: '👩‍💻', totalPoints: 485, boothsVisited: 7, demosCompleted: 6 },
  { id: 'att-2', name: 'Marcus Johnson', avatar: '👨‍💼', totalPoints: 460, boothsVisited: 8, demosCompleted: 5 },
  { id: 'att-3', name: 'Elena Rodriguez', avatar: '👩‍🔬', totalPoints: 435, boothsVisited: 6, demosCompleted: 5 },
  { id: 'att-4', name: 'Kai Nakamura', avatar: '👨‍💻', totalPoints: 410, boothsVisited: 7, demosCompleted: 4 },
  { id: 'att-5', name: 'Aisha Patel', avatar: '👩‍🎓', totalPoints: 385, boothsVisited: 5, demosCompleted: 4 },
  { id: 'att-6', name: 'Diego Morales', avatar: '👨‍🔧', totalPoints: 360, boothsVisited: 6, demosCompleted: 3 },
  { id: 'att-7', name: 'Priya Singh', avatar: '👩‍💼', totalPoints: 335, boothsVisited: 5, demosCompleted: 3 },
  { id: 'att-8', name: 'Tom Wilson', avatar: '👨‍🎨', totalPoints: 310, boothsVisited: 4, demosCompleted: 3 },
  { id: 'att-9', name: 'Mei Lin', avatar: '👩‍🔬', totalPoints: 285, boothsVisited: 5, demosCompleted: 2 },
  { id: 'att-10', name: 'Omar Hassan', avatar: '👨‍💼', totalPoints: 260, boothsVisited: 4, demosCompleted: 2 },
  { id: 'att-11', name: 'Hana Kim', avatar: '👩‍💻', totalPoints: 235, boothsVisited: 3, demosCompleted: 2 },
  { id: 'att-12', name: 'Lucas Silva', avatar: '👨‍🎓', totalPoints: 210, boothsVisited: 4, demosCompleted: 1 },
  { id: 'att-13', name: 'Grace Osei', avatar: '👩‍🔧', totalPoints: 185, boothsVisited: 3, demosCompleted: 1 },
  { id: 'att-14', name: 'Ravi Kumar', avatar: '👨‍💻', totalPoints: 160, boothsVisited: 2, demosCompleted: 1 },
  { id: 'att-15', name: 'Zoe Anderson', avatar: '👩‍🎨', totalPoints: 135, boothsVisited: 2, demosCompleted: 1 },
  { id: 'att-16', name: 'Ivan Petrov', avatar: '👨‍🔬', totalPoints: 110, boothsVisited: 1, demosCompleted: 1 },
  { id: 'att-17', name: 'Nora Schmidt', avatar: '👩‍💼', totalPoints: 85, boothsVisited: 1, demosCompleted: 0 },
  { id: 'att-18', name: 'Kenji Tanaka', avatar: '👨‍🎓', totalPoints: 60, boothsVisited: 1, demosCompleted: 0 },
  { id: 'att-19', name: 'Leah Johnson', avatar: '👩‍💻', totalPoints: 35, boothsVisited: 0, demosCompleted: 0 },
  { id: 'att-20', name: 'Sam Park', avatar: '👨‍🔧', totalPoints: 10, boothsVisited: 0, demosCompleted: 0 },
];

export function getDemoExperience(boothId: string): BoothDemoExperience | undefined {
  return DEMO_EXPERIENCES.find((e) => e.boothId === boothId);
}

export function getDemoBoothMeta(boothId: string): DemoBoothMeta | undefined {
  return DEMO_BOOTH_META.find((m) => m.id === boothId);
}
