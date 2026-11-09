import type { Booth } from './booths';
import { BOOTH_SLOTS } from './booths';

/**
 * Demo sponsors (fictional), assigned to booth slots in order. The API seeds Elasticsearch
 * from this list and the offline mock uses it too, so both show the same expo.
 */
export const DEMO_SPONSORS: Omit<Booth, 'id' | 'slotId'>[] = [
  { company: 'Lumen Labs', color: '#6366f1', tagline: 'Applied AI for healthcare', hiring: ['ML Engineer', 'Data Scientist'], tags: ['python', 'pytorch'] },
  { company: 'Canyon Cloud', color: '#0ea5e9', tagline: 'Serverless infra', hiring: ['Platform Engineer', 'SRE'], tags: ['go', 'kubernetes'] },
  { company: 'Basalt Bank', color: '#14b8a6', tagline: 'Fintech for small business', hiring: ['Backend Engineer'], tags: ['java', 'payments'] },
  { company: 'Wasatch Robotics', color: '#f97316', tagline: 'Warehouse robots', hiring: ['Robotics Engineer', 'ML Engineer'], tags: ['ros', 'c++', 'python'] },
  { company: 'Saltflat Studio', color: '#ec4899', tagline: 'Product design agency', hiring: ['Product Designer'], tags: ['figma', 'ux'] },
  { company: 'Granite Security', color: '#64748b', tagline: 'Zero-trust networking', hiring: ['Security Engineer'], tags: ['rust', 'security'] },
  { company: 'Beehive Health', color: '#eab308', tagline: 'Patient engagement', hiring: ['Frontend Engineer', 'PM'], tags: ['react', 'typescript'] },
  { company: 'Alta Analytics', color: '#8b5cf6', tagline: 'Real-time dashboards', hiring: ['Data Engineer'], tags: ['sql', 'spark', 'python'] },
  { company: 'Red Butte Energy', color: '#ef4444', tagline: 'Grid-scale storage', hiring: ['Embedded Engineer'], tags: ['c', 'iot'] },
  { company: 'Kestrel Mobile', color: '#22c55e', tagline: 'Consumer apps', hiring: ['iOS Engineer', 'Android Engineer'], tags: ['swift', 'kotlin'] },
  { company: 'Uinta Edu', color: '#06b6d4', tagline: 'Learning platform', hiring: ['Full-stack Engineer'], tags: ['react', 'node'] },
  { company: 'Delta Dev Tools', color: '#a855f7', tagline: 'CI that explains itself', hiring: ['Developer Advocate', 'Backend Engineer'], tags: ['typescript', 'devtools'] },
  { company: 'Quarry Games', color: '#f43f5e', tagline: 'Indie multiplayer studio', hiring: ['Gameplay Engineer', '3D Artist'], tags: ['unity', 'c#'] },
  { company: 'Bonneville Bio', color: '#10b981', tagline: 'Genomics pipelines', hiring: ['Bioinformatics Engineer', 'ML Engineer'], tags: ['python', 'genomics'] },
  { company: 'Pinecrest Legal AI', color: '#3b82f6', tagline: 'Contract review copilots', hiring: ['NLP Engineer'], tags: ['llm', 'python'] },
  { company: 'Summit Logistics', color: '#d946ef', tagline: 'Route optimization', hiring: ['Operations Research Analyst'], tags: ['optimization', 'python'] },
  { company: 'Arch Vision', color: '#0284c7', tagline: 'Computer vision for retail', hiring: ['Computer Vision Engineer'], tags: ['opencv', 'pytorch'] },
  { company: 'Juniper Pay', color: '#16a34a', tagline: 'Checkout in one tap', hiring: ['Frontend Engineer'], tags: ['react', 'payments'] },
  { company: 'Monolith Data', color: '#7c3aed', tagline: 'Vector search at scale', hiring: ['Search Engineer'], tags: ['elasticsearch', 'rust'] },
  { company: 'Sego Climate', color: '#65a30d', tagline: 'Carbon accounting', hiring: ['Data Analyst'], tags: ['sql', 'python'] },
  { company: 'Timp Ventures', color: '#b45309', tagline: 'Seed-stage VC', hiring: ['Venture Fellow'], tags: ['startups'] },
  { company: 'Cottonwood HR', color: '#db2777', tagline: 'Hiring without bias', hiring: ['Recruiter', 'Backend Engineer'], tags: ['node', 'hr'] },
  { company: 'Lakeside Quantum', color: '#4f46e5', tagline: 'Quantum simulation', hiring: ['Research Scientist'], tags: ['physics', 'python'] },
  { company: 'Oquirrh Media', color: '#ea580c', tagline: 'Creator tools', hiring: ['Video Engineer'], tags: ['webrtc', 'ffmpeg'] },
];

export const DEMO_BOOTHS: Booth[] = DEMO_SPONSORS.slice(0, BOOTH_SLOTS.length).map((c, i) => ({
  ...c,
  id: `booth-${c.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  slotId: BOOTH_SLOTS[i]!.id,
}));
