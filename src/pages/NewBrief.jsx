import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { safeUpdate } from '../lib/supabaseHelpers'
import { streamAnthropicCall } from '../lib/streamHelper'
import { useToast } from '../context/ToastContext'
import { useUI } from '../context/UIContext'

const ORCHESTRATOR_SYSTEM = `You are the orchestrator for an AI web design agency. You will be given a detailed structured client brief. Break it down into four clearly labelled task lists for: 1) Researcher — what to research about the industry, audience, competitors and SEO. 2) Designer — what design decisions to make, what pages to wireframe, what brand direction to follow. 3) Developer — what pages to build, what technical requirements to implement, what integrations to set up. 4) Reviewer — what specific things to check against the brief during the quality review. Be specific and actionable for each agent. Use markdown formatting with clear headings.`

const PAGE_EXTRACTOR_SYSTEM = `Output ONLY a valid JSON array of page objects. Every page must have a unique filename. Never include the same page twice. The homepage must appear exactly once with filename index.html. For filenames use only lowercase letters, numbers and hyphens — no special characters, no ampersands, no spaces. For page names use plain readable English with no special characters — replace ampersands with the word and. Each object must have two keys: name which is the page name for example Home, About, Services, Contact, and filename which is the HTML filename for example index.html, about.html, services.html, contact.html. Output only the raw JSON array with no explanation and no markdown code blocks.`

function sanitiseExtractedPages(pages) {
  return pages
    .map(p => ({
      name:     p.name.replace(/&/g, 'and').replace(/[^a-zA-Z0-9 \-\.]/g, '').trim(),
      filename: p.filename.replace(/&/g, 'and').replace(/[^a-zA-Z0-9\s\-\.]/g, '').replace(/\s+/g, '-').toLowerCase(),
    }))
    .filter((page, index, self) => index === self.findIndex(p => p.filename === page.filename))
}

// ── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Business', num: 1 },
  { label: 'Scope',    num: 2 },
  { label: 'Brand',    num: 3 },
  { label: 'Content',  num: 4 },
  { label: 'Technical',num: 5 },
  { label: 'Competitors', num: 6 },
  { label: 'Review',   num: 7 },
]

const INDUSTRIES = [
  'Architecture & Real Estate', 'Arts & Entertainment', 'Beauty & Wellness',
  'Consulting & Professional Services', 'E-commerce & Retail', 'Education & Training',
  'Finance & Insurance', 'Food & Hospitality', 'Healthcare & Medical',
  'Legal', 'Marketing & Advertising', 'Non-profit & Charity',
  'Technology & SaaS', 'Travel & Tourism', 'Other',
]

const SITE_TYPES    = ['Portfolio', 'Brochure/marketing', 'E-commerce', 'SaaS/app', 'Blog', 'Booking/service', 'Other']
const PRIMARY_GOALS = ['Generate leads', 'Drive online sales', 'Build brand awareness', 'Provide information']
const BUDGET_RANGES = ['Under £2,000', '£2,000 – £5,000', '£5,000 – £10,000', '£10,000 – £25,000', '£25,000+', 'Not decided']
const WHAT_TO_KEEP  = ['Logo', 'Brand colours', 'Fonts', 'Copy/text', 'Images', 'Nothing — full rebrand']
const AESTHETICS    = ['Minimal', 'Bold', 'Playful', 'Elegant', 'Corporate', 'Modern', 'Rustic', 'Other']
const INTEGRATIONS  = ['Booking system', 'E-commerce/shop', 'Contact form', 'Newsletter signup', 'Live chat', 'Analytics', 'CMS', 'Social media feeds', 'Payment processing', 'Other']
const CMS_OPTIONS   = ['WordPress', 'Webflow', 'Custom', 'No preference']
const HOSTING_OPTIONS = ['Client handles own hosting', 'We recommend hosting', 'No preference']
const ANIMATION_STYLES = [
  'Subtle and professional',
  'Modern and dynamic',
  'Bold and creative',
  'Minimal',
  'Custom',
]
const HERO_ANIMATION_OPTIONS = ['None', 'Fade in', 'Parallax scroll', 'Particle background', 'Typewriter text', 'Video background', 'Gradient animation', 'Custom']

const DEFAULT_PAGES_BY_TYPE = {
  'Portfolio':          [{ name: 'Home', filename: 'index.html' }, { name: 'Work', filename: 'work.html' }, { name: 'About', filename: 'about.html' }, { name: 'Contact', filename: 'contact.html' }],
  'Brochure/marketing': [{ name: 'Home', filename: 'index.html' }, { name: 'About', filename: 'about.html' }, { name: 'Services', filename: 'services.html' }, { name: 'Contact', filename: 'contact.html' }],
  'E-commerce':         [{ name: 'Home', filename: 'index.html' }, { name: 'Shop', filename: 'shop.html' }, { name: 'Product', filename: 'product.html' }, { name: 'Cart', filename: 'cart.html' }, { name: 'Contact', filename: 'contact.html' }],
  'SaaS/app':           [{ name: 'Home', filename: 'index.html' }, { name: 'Features', filename: 'features.html' }, { name: 'Pricing', filename: 'pricing.html' }, { name: 'About', filename: 'about.html' }, { name: 'Contact', filename: 'contact.html' }],
  'Blog':               [{ name: 'Home', filename: 'index.html' }, { name: 'Blog', filename: 'blog.html' }, { name: 'About', filename: 'about.html' }, { name: 'Contact', filename: 'contact.html' }],
  'Booking/service':    [{ name: 'Home', filename: 'index.html' }, { name: 'Services', filename: 'services.html' }, { name: 'Booking', filename: 'booking.html' }, { name: 'About', filename: 'about.html' }, { name: 'Contact', filename: 'contact.html' }],
  'Other':              [{ name: 'Home', filename: 'index.html' }, { name: 'About', filename: 'about.html' }, { name: 'Contact', filename: 'contact.html' }],
}

const STEP_TIPS = {
  1: { title: 'Business',     tips: ['A clear description of what the business does helps agents write relevant copy.', 'Be specific about target audience — age, interests, pain points.', 'List concrete business goals, not vague ones like "grow the business".'] },
  2: { title: 'Scope',        tips: ['Defining the page list now prevents scope creep later.', 'Choose a site type to auto-populate a starting page list.', 'A realistic budget range helps us recommend the right technical approach.'] },
  3: { title: 'Brand',        tips: ['Upload the logo now so the Designer agent can reference it.', 'The more reference points you provide, the more aligned the final design will be.', 'Aesthetic keywords help set the right creative direction.'] },
  4: { title: 'Content',      tips: ['Content is the most common bottleneck in web projects — plan it early.', 'If copy is not ready, identifying which pages need it helps scope work.', 'Quality photography makes a huge difference — identify gaps early.'] },
  5: { title: 'Technical',    tips: ['Third-party integrations can significantly affect build time and cost.', 'CMS choice affects long-term maintenance — choose carefully.', 'GDPR compliance is legally required for most UK/EU businesses.'] },
  6: { title: 'Competitors',  tips: ['Competitor analysis reveals what the market expects in this industry.', 'Noting what you dislike is just as useful as what you like.', 'Even indirect competitors are worth including.'] },
  7: { title: 'Review',       tips: ['Review every section before submitting — changes after pipeline runs are harder.', 'A complete brief produces better AI output — aim for 80%+ completeness.', 'The compiled brief is passed directly to the Researcher, Designer, and Developer agents.'] },
}

const EMPTY_FORM = {
  step1: { companyName: '', industry: '', industryOther: '', location: '', tagline: '', whatTheyDo: '', targetAudience: '', keyBusinessGoals: '' },
  step2: { siteType: [], primaryGoal: '', pages: [], hasExistingSite: false, existingSiteUrl: '', isReplication: false, whatToKeep: [], existingSiteDislikes: '', targetLaunchDate: '', budgetRange: '' },
  step3: { logoUrl: '', logoFileName: '', colourPreferences: '', fontPreferences: '', aesthetic: [], moodDescription: '', brandGuidelines: '' },
  step4: { copyReady: false, copyNotes: '', pagesNeedingCopy: [], imagesAvailable: false, imageUrls: [], imageDirectionNotes: '', contentRequirements: '' },
  step5: { integrations: [], cmsRequired: false, preferredCms: '', hostingPreference: '', gdprRequired: false, otherTechnical: '', animationStyle: 'Subtle and professional', animationCustom: '', heroAnimation: [] },
  step6: { competitor1: { url: '', likes: '', dislikes: '' }, competitor2: { url: '', likes: '', dislikes: '' }, competitor3: { url: '', likes: '', dislikes: '' }, generalNotes: '' },
}

// ── Helper functions ─────────────────────────────────────────────────────────

function computeCompleteness(form) {
  const s1 = form.step1
  const s2 = form.step2
  const s3 = form.step3
  const s4 = form.step4
  const s5 = form.step5
  const s6 = form.step6

  const checks = [
    // step1 (6)
    !!s1.companyName, !!s1.industry, !!s1.location, !!s1.whatTheyDo, !!s1.targetAudience, !!s1.keyBusinessGoals,
    // step2 (5)
    s2.siteType.length > 0, !!s2.primaryGoal, s2.pages.length > 0, !!s2.budgetRange, !!s2.targetLaunchDate,
    // step3 (4)
    !!s3.colourPreferences, !!s3.fontPreferences, s3.aesthetic.length > 0, !!s3.moodDescription,
    // step4 (2)
    !!(s4.copyNotes || s4.pagesNeedingCopy.length > 0),
    !!(s4.imageUrls.length > 0 || s4.imageDirectionNotes),
    // step5 (2)
    s5.integrations.length > 0, !!s5.hostingPreference,
    // step6 (2)
    !!s6.competitor1.url, !!s6.generalNotes,
  ]

  const filled = checks.filter(Boolean).length
  return Math.round(filled / 21 * 100)
}

function compileBrief(form, clientName, projectName) {
  const s1 = form.step1
  const s2 = form.step2
  const s3 = form.step3
  const s4 = form.step4
  const s5 = form.step5
  const s6 = form.step6
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const lines = []

  lines.push(`# Website Brief — ${s1.companyName || 'Unnamed'}`)
  lines.push(`Client: ${clientName || '—'} | Project: ${projectName || '—'} | Generated: ${date}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  lines.push('## 1. Business Overview')
  lines.push('')
  if (s1.companyName)      lines.push(`**Company:** ${s1.companyName}`)
  if (s1.industry)         lines.push(`**Industry:** ${s1.industry === 'Other' && s1.industryOther ? s1.industryOther : s1.industry}`)
  if (s1.location)         lines.push(`**Location:** ${s1.location}`)
  if (s1.tagline)          lines.push(`**Tagline:** ${s1.tagline}`)
  if (s1.whatTheyDo)       lines.push(`**What they do:** ${s1.whatTheyDo}`)
  if (s1.targetAudience)   lines.push(`**Target audience:** ${s1.targetAudience}`)
  if (s1.keyBusinessGoals) lines.push(`**Business goals:** ${s1.keyBusinessGoals}`)
  lines.push('')

  lines.push('## 2. Scope & Pages')
  lines.push('')
  if (s2.siteType.length)  lines.push(`**Site type:** ${s2.siteType.join(', ')}`)
  if (s2.primaryGoal)      lines.push(`**Primary goal:** ${s2.primaryGoal}`)
  if (s2.budgetRange)      lines.push(`**Budget:** ${s2.budgetRange}`)
  if (s2.targetLaunchDate) lines.push(`**Target launch:** ${s2.targetLaunchDate}`)
  if (s2.pages.length) {
    lines.push(`**Pages (${s2.pages.length}):** ${s2.pages.map(p => p.name).join(', ')}`)
  }
  if (s2.hasExistingSite) {
    lines.push(`**Existing site:** Yes${s2.existingSiteUrl ? ` — ${s2.existingSiteUrl}` : ''}`)
    if (s2.isReplication && s2.existingSiteUrl) {
      lines.push(`**Replication mode:** ACTIVE — agents must analyse ${s2.existingSiteUrl} and mirror its structure, layout, navigation, and design as closely as possible. This is a like-for-like rebuild, not a redesign.`)
    }
    if (s2.whatToKeep.length)       lines.push(`**Keep from existing:** ${s2.whatToKeep.join(', ')}`)
    if (s2.existingSiteDislikes)    lines.push(`**Dislikes about existing:** ${s2.existingSiteDislikes}`)
  } else {
    lines.push('**Existing site:** No')
  }
  lines.push('')

  lines.push('## 3. Brand')
  lines.push('')
  lines.push(`**Logo:** ${s3.logoFileName ? `Provided (${s3.logoFileName})` : 'Not provided'}`)
  if (s3.colourPreferences) lines.push(`**Colour preferences:** ${s3.colourPreferences}`)
  if (s3.fontPreferences)   lines.push(`**Font preferences:** ${s3.fontPreferences}`)
  if (s3.aesthetic.length)  lines.push(`**Aesthetic:** ${s3.aesthetic.join(', ')}`)
  if (s3.moodDescription)   lines.push(`**Mood / direction:** ${s3.moodDescription}`)
  if (s3.brandGuidelines)   lines.push(`**Brand guidelines:** ${s3.brandGuidelines}`)
  lines.push('')

  lines.push('## 4. Content')
  lines.push('')
  lines.push(`**Copy ready:** ${s4.copyReady ? 'Yes' : 'No'}`)
  if (s4.copyReady && s4.copyNotes)            lines.push(`**Copy notes:** ${s4.copyNotes}`)
  if (!s4.copyReady && s4.pagesNeedingCopy.length) lines.push(`**Pages needing copy:** ${s4.pagesNeedingCopy.join(', ')}`)
  lines.push(`**Images available:** ${s4.imagesAvailable ? 'Yes' : 'No'}`)
  if (s4.imagesAvailable && s4.imageUrls.length) lines.push(`**Image count:** ${s4.imageUrls.length} file(s) uploaded`)
  if (!s4.imagesAvailable && s4.imageDirectionNotes) lines.push(`**Image direction:** ${s4.imageDirectionNotes}`)
  if (s4.contentRequirements) lines.push(`**Additional content requirements:** ${s4.contentRequirements}`)
  lines.push('')

  lines.push('## 5. Technical')
  lines.push('')
  if (s5.integrations.length) lines.push(`**Integrations required:** ${s5.integrations.join(', ')}`)
  lines.push(`**CMS required:** ${s5.cmsRequired ? 'Yes' : 'No'}`)
  if (s5.cmsRequired && s5.preferredCms) lines.push(`**Preferred CMS:** ${s5.preferredCms}`)
  if (s5.hostingPreference)  lines.push(`**Hosting:** ${s5.hostingPreference}`)
  lines.push(`**GDPR compliance required:** ${s5.gdprRequired ? 'Yes' : 'No'}`)
  if (s5.otherTechnical)     lines.push(`**Other technical notes:** ${s5.otherTechnical}`)
  if (s5.animationStyle) {
    const animLabel = s5.animationStyle === 'Custom' && s5.animationCustom
      ? `Custom — ${s5.animationCustom}`
      : s5.animationStyle
    lines.push(`**Animation style:** ${animLabel}`)
  }
  if (s5.heroAnimation?.length) lines.push(`**Hero animation:** ${s5.heroAnimation.join(', ')}`)
  lines.push('')

  lines.push('## 6. Competitor Analysis')
  lines.push('')
  ;[['Competitor 1', s6.competitor1], ['Competitor 2', s6.competitor2], ['Competitor 3', s6.competitor3]].forEach(([label, c]) => {
    if (c.url || c.likes || c.dislikes) {
      lines.push(`**${label}:** ${c.url || '—'}`)
      if (c.likes)    lines.push(`  Likes: ${c.likes}`)
      if (c.dislikes) lines.push(`  Dislikes: ${c.dislikes}`)
    }
  })
  if (s6.generalNotes) lines.push(`**General notes:** ${s6.generalNotes}`)
  lines.push('')

  return lines.join('\n')
}

// ── Reusable primitives ──────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors'
const textareaCls = inputCls + ' resize-none'

function Field({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="text-violet-400 ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  )
}

function MultiToggle({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            value.includes(opt)
              ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function RadioGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            value === opt
              ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function YesNo({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {['Yes', 'No'].map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt === 'Yes')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            value === (opt === 'Yes')
              ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ── Step components ──────────────────────────────────────────────────────────

function Step1({ form, setForm }) {
  const s = form.step1
  const set = patch => setForm(f => ({ ...f, step1: { ...f.step1, ...patch } }))

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-white">Business Overview</h2>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Company name" required>
          <input className={inputCls} value={s.companyName} onChange={e => set({ companyName: e.target.value })} placeholder="Acme Ltd" />
        </Field>
        <Field label="Location">
          <input className={inputCls} value={s.location} onChange={e => set({ location: e.target.value })} placeholder="London, UK" />
        </Field>
      </div>

      <Field label="Industry" required>
        <select
          className={inputCls}
          value={s.industry}
          onChange={e => set({ industry: e.target.value })}
        >
          <option value="">Select industry…</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>

      {s.industry === 'Other' && (
        <Field label="Specify industry">
          <input className={inputCls} value={s.industryOther} onChange={e => set({ industryOther: e.target.value })} placeholder="Describe the industry" />
        </Field>
      )}

      <Field label="Tagline / strapline">
        <input className={inputCls} value={s.tagline} onChange={e => set({ tagline: e.target.value })} placeholder="Crafting the future of digital" />
      </Field>

      <Field label="What does the business do?" required hint="Write 2–4 sentences. Be specific.">
        <textarea className={textareaCls} rows={4} value={s.whatTheyDo} onChange={e => set({ whatTheyDo: e.target.value })} placeholder="Describe the core service or product offering…" />
      </Field>

      <Field label="Target audience" required hint="Who are the customers? Demographics, interests, pain points.">
        <textarea className={textareaCls} rows={3} value={s.targetAudience} onChange={e => set({ targetAudience: e.target.value })} placeholder="e.g. SME owners aged 30–55, based in the UK, looking to automate their invoicing…" />
      </Field>

      <Field label="Key business goals" required hint="What does success look like? What should the new website achieve?">
        <textarea className={textareaCls} rows={3} value={s.keyBusinessGoals} onChange={e => set({ keyBusinessGoals: e.target.value })} placeholder="e.g. Generate 20 leads/month, reduce support enquiries, establish brand authority…" />
      </Field>
    </div>
  )
}

function Step2({ form, setForm }) {
  const s = form.step2
  const set = patch => setForm(f => ({ ...f, step2: { ...f.step2, ...patch } }))

  function handleSiteTypeChange(newTypes) {
    const patch = { siteType: newTypes }
    // Auto-populate pages when selecting the first type and pages are empty or match a prior auto-set
    if (newTypes.length > 0) {
      const auto = DEFAULT_PAGES_BY_TYPE[newTypes[0]] ?? DEFAULT_PAGES_BY_TYPE['Other']
      const currentIsDefault = Object.values(DEFAULT_PAGES_BY_TYPE).some(
        preset => JSON.stringify(preset) === JSON.stringify(s.pages)
      )
      if (s.pages.length === 0 || currentIsDefault) {
        patch.pages = auto
      }
    }
    set(patch)
  }

  function addPage() {
    set({ pages: [...s.pages, { name: '', filename: '' }] })
  }

  function removePage(i) {
    set({ pages: s.pages.filter((_, idx) => idx !== i) })
  }

  function updatePage(i, field, val) {
    const updated = s.pages.map((p, idx) => idx === i ? { ...p, [field]: val } : p)
    set({ pages: updated })
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-white">Scope &amp; Pages</h2>

      <Field label="Site type" required>
        <MultiToggle options={SITE_TYPES} value={s.siteType} onChange={handleSiteTypeChange} />
      </Field>

      <Field label="Primary goal" required>
        <RadioGroup options={PRIMARY_GOALS} value={s.primaryGoal} onChange={v => set({ primaryGoal: v })} />
      </Field>

      <Field label="Page list" hint="These pages will be passed to the Developer agent.">
        <div className="space-y-2">
          {s.pages.map((page, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls}
                value={page.name}
                onChange={e => updatePage(i, 'name', e.target.value)}
                placeholder="Page name"
              />
              <input
                className={inputCls}
                value={page.filename}
                onChange={e => updatePage(i, 'filename', e.target.value)}
                placeholder="filename.html"
              />
              <button
                type="button"
                onClick={() => removePage(i)}
                className="flex-shrink-0 text-zinc-500 hover:text-red-400 transition-colors px-1"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPage}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            + Add page
          </button>
        </div>
      </Field>

      <Field label="Existing website?">
        <YesNo value={s.hasExistingSite} onChange={v => set({ hasExistingSite: v, ...(!v && { isReplication: false, existingSiteUrl: '' }) })} />
      </Field>

      {s.hasExistingSite && (
        <div className="space-y-4 pl-4 border-l border-zinc-800">
          <Field label="Existing site URL" hint="The Researcher agent will automatically analyse this site when the pipeline runs.">
            <input className={inputCls} value={s.existingSiteUrl} onChange={e => set({ existingSiteUrl: e.target.value, ...(!e.target.value.trim() && { isReplication: false }) })} placeholder="https://example.com" />
          </Field>

          {s.hasExistingSite && s.existingSiteUrl.trim() && (
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={s.isReplication}
                  onChange={e => set({ isReplication: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 rounded border border-zinc-600 bg-zinc-800 peer-checked:bg-violet-600 peer-checked:border-violet-600 transition-colors flex items-center justify-center">
                  {s.isReplication && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <div className="space-y-0.5">
                <span className="block text-sm text-zinc-200 group-hover:text-white transition-colors">Replicate existing site exactly</span>
                <span className="block text-xs text-zinc-500">Agents will analyse and mirror the structure, layout and design of the current site as closely as possible</span>
              </div>
            </label>
          )}

          <Field label="What to keep from existing site">
            <MultiToggle options={WHAT_TO_KEEP} value={s.whatToKeep} onChange={v => set({ whatToKeep: v })} />
          </Field>
          <Field label="What do you dislike about the existing site?">
            <textarea className={textareaCls} rows={2} value={s.existingSiteDislikes} onChange={e => set({ existingSiteDislikes: e.target.value })} placeholder="Outdated design, poor mobile experience…" />
          </Field>
        </div>
      )}

      <Field label="Target launch date">
        <input className={inputCls} type="text" value={s.targetLaunchDate} onChange={e => set({ targetLaunchDate: e.target.value })} placeholder="e.g. End of Q3 2026" />
      </Field>

      <Field label="Budget range" required>
        <select className={inputCls} value={s.budgetRange} onChange={e => set({ budgetRange: e.target.value })}>
          <option value="">Select budget…</option>
          {BUDGET_RANGES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
    </div>
  )
}

function Step3({ form, setForm, clientId, uploading, onLogoUpload }) {
  const s = form.step3
  const set = patch => setForm(f => ({ ...f, step3: { ...f.step3, ...patch } }))

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-white">Brand</h2>

      <Field label="Logo" hint="Upload the client's logo so agents can reference it.">
        {s.logoFileName ? (
          <div className="flex items-center gap-3">
            {s.logoUrl && (
              <img src={s.logoUrl} alt="Logo preview" className="h-10 w-auto rounded border border-zinc-700 bg-zinc-800 object-contain p-1" />
            )}
            <span className="text-xs text-zinc-400">{s.logoFileName}</span>
            <button
              type="button"
              onClick={() => set({ logoUrl: '', logoFileName: '' })}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-colors">
            {uploading ? 'Uploading…' : 'Choose logo file'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={e => e.target.files?.[0] && onLogoUpload(e.target.files[0])}
            />
          </label>
        )}
      </Field>

      <Field label="Colour preferences" hint="HEX codes, Pantone refs, or descriptions.">
        <textarea className={textareaCls} rows={2} value={s.colourPreferences} onChange={e => set({ colourPreferences: e.target.value })} placeholder="Primary: #1A2B3C, accent: forest green…" />
      </Field>

      <Field label="Font preferences">
        <textarea className={textareaCls} rows={2} value={s.fontPreferences} onChange={e => set({ fontPreferences: e.target.value })} placeholder="Sans-serif body, serif headings — or specific font names" />
      </Field>

      <Field label="Aesthetic direction" required>
        <MultiToggle options={AESTHETICS} value={s.aesthetic} onChange={v => set({ aesthetic: v })} />
      </Field>

      <Field label="Mood / creative direction" required hint="Write freely — the more descriptive the better.">
        <textarea className={textareaCls} rows={4} value={s.moodDescription} onChange={e => set({ moodDescription: e.target.value })} placeholder="Inspired by Scandinavian design — clean white space, subtle texture, premium but approachable…" />
      </Field>

      <Field label="Reference URLs / brand guidelines">
        <textarea className={textareaCls} rows={3} value={s.brandGuidelines} onChange={e => set({ brandGuidelines: e.target.value })} placeholder="Links to brand docs, Figma files, or inspiration sites" />
      </Field>
    </div>
  )
}

function Step4({ form, setForm, clientId, uploading, onImagesUpload }) {
  const s = form.step4
  const set = patch => setForm(f => ({ ...f, step4: { ...f.step4, ...patch } }))
  const pages = form.step2.pages

  function togglePageNeedingCopy(pageName) {
    const current = s.pagesNeedingCopy
    set({
      pagesNeedingCopy: current.includes(pageName)
        ? current.filter(p => p !== pageName)
        : [...current, pageName]
    })
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-white">Content</h2>

      <Field label="Is copy (text content) ready to hand over?">
        <YesNo value={s.copyReady} onChange={v => set({ copyReady: v })} />
      </Field>

      {s.copyReady ? (
        <Field label="Copy notes" hint="Any details about the copy — format, sign-off status, etc.">
          <textarea className={textareaCls} rows={3} value={s.copyNotes} onChange={e => set({ copyNotes: e.target.value })} placeholder="Copy is approved and in Google Docs, link TBC…" />
        </Field>
      ) : (
        pages.length > 0 && (
          <Field label="Which pages still need copy written?" hint="Check all that apply.">
            <div className="flex flex-wrap gap-2">
              {pages.map(p => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => togglePageNeedingCopy(p.name)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    s.pagesNeedingCopy.includes(p.name)
                      ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </Field>
        )
      )}

      <Field label="Are images / photography available?">
        <YesNo value={s.imagesAvailable} onChange={v => set({ imagesAvailable: v })} />
      </Field>

      {s.imagesAvailable ? (
        <Field label="Upload images" hint={`Up to 10 images. ${s.imageUrls.length} uploaded.`}>
          <div className="space-y-2">
            {s.imageUrls.length > 0 && (
              <ul className="text-xs text-zinc-400 space-y-0.5">
                {s.imageUrls.map((url, i) => (
                  <li key={i} className="truncate">{url.split('/').pop()}</li>
                ))}
              </ul>
            )}
            {s.imageUrls.length < 10 && (
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-colors">
                {uploading ? 'Uploading…' : '+ Add images'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={uploading}
                  onChange={e => e.target.files?.length && onImagesUpload(Array.from(e.target.files))}
                />
              </label>
            )}
          </div>
        </Field>
      ) : (
        <Field label="Image direction notes" hint="Describe the kind of imagery needed — stock, bespoke photography, illustrations, etc.">
          <textarea className={textareaCls} rows={3} value={s.imageDirectionNotes} onChange={e => set({ imageDirectionNotes: e.target.value })} placeholder="We'll need lifestyle photography of the team and workspace. Open to licensed stock for hero images." />
        </Field>
      )}

      <Field label="Additional content requirements">
        <textarea className={textareaCls} rows={3} value={s.contentRequirements} onChange={e => set({ contentRequirements: e.target.value })} placeholder="Video embed on homepage, downloadable PDF brochure, interactive calculator…" />
      </Field>
    </div>
  )
}

function Step5({ form, setForm }) {
  const s = form.step5
  const set = patch => setForm(f => ({ ...f, step5: { ...f.step5, ...patch } }))

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-white">Technical</h2>

      <Field label="Required integrations" hint="Select all that apply.">
        <MultiToggle options={INTEGRATIONS} value={s.integrations} onChange={v => set({ integrations: v })} />
      </Field>

      <Field label="CMS required?">
        <YesNo value={s.cmsRequired} onChange={v => set({ cmsRequired: v })} />
      </Field>

      {s.cmsRequired && (
        <Field label="Preferred CMS">
          <select className={inputCls} value={s.preferredCms} onChange={e => set({ preferredCms: e.target.value })}>
            <option value="">Select…</option>
            {CMS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      )}

      <Field label="Hosting preference">
        <select className={inputCls} value={s.hostingPreference} onChange={e => set({ hostingPreference: e.target.value })}>
          <option value="">Select…</option>
          {HOSTING_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      </Field>

      <Field label="GDPR compliance required?">
        <YesNo value={s.gdprRequired} onChange={v => set({ gdprRequired: v })} />
      </Field>

      <Field label="Other technical notes">
        <textarea className={textareaCls} rows={3} value={s.otherTechnical} onChange={e => set({ otherTechnical: e.target.value })} placeholder="Accessibility requirements, performance targets, existing API integrations…" />
      </Field>

      <div className="border-t border-zinc-800 pt-5 space-y-5">
        <h3 className="text-sm font-semibold text-zinc-300">Animation &amp; Motion</h3>

        <Field label="Animation style" hint="Choose the overall motion feel for the site.">
          <RadioGroup options={ANIMATION_STYLES} value={s.animationStyle} onChange={v => set({ animationStyle: v, ...(v !== 'Custom' && { animationCustom: '' }) })} />
        </Field>

        {s.animationStyle === 'Custom' && (
          <Field label="Describe your animation style">
            <textarea
              className={textareaCls}
              rows={3}
              value={s.animationCustom}
              onChange={e => set({ animationCustom: e.target.value })}
              placeholder="Describe any specific animation effects you want, for example a particle background on the hero or a typewriter effect on the headline…"
            />
          </Field>
        )}

        <Field label="Hero animation preference" hint="Select all that apply to the main hero section.">
          <MultiToggle options={HERO_ANIMATION_OPTIONS} value={s.heroAnimation} onChange={v => set({ heroAnimation: v })} />
        </Field>
      </div>
    </div>
  )
}

function Step6({ form, setForm }) {
  const s = form.step6
  const setComp = (key, patch) => setForm(f => ({ ...f, step6: { ...f.step6, [key]: { ...f.step6[key], ...patch } } }))
  const set = patch => setForm(f => ({ ...f, step6: { ...f.step6, ...patch } }))

  const competitors = [
    { key: 'competitor1', label: 'Competitor 1', data: s.competitor1 },
    { key: 'competitor2', label: 'Competitor 2', data: s.competitor2 },
    { key: 'competitor3', label: 'Competitor 3', data: s.competitor3 },
  ]

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-white">Competitor Analysis</h2>

      {competitors.map(({ key, label, data }) => (
        <div key={key} className="space-y-3 p-4 rounded-lg bg-zinc-950 border border-zinc-800">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{label}</p>
          <Field label="Website URL">
            <input className={inputCls} value={data.url} onChange={e => setComp(key, { url: e.target.value })} placeholder="https://competitor.com" />
          </Field>
          <Field label="What do you like about this site?">
            <textarea className={textareaCls} rows={2} value={data.likes} onChange={e => setComp(key, { likes: e.target.value })} placeholder="Clean layout, strong calls-to-action…" />
          </Field>
          <Field label="What do you dislike?">
            <textarea className={textareaCls} rows={2} value={data.dislikes} onChange={e => setComp(key, { dislikes: e.target.value })} placeholder="Too text-heavy, dated aesthetic…" />
          </Field>
        </div>
      ))}

      <Field label="General competitor notes">
        <textarea className={textareaCls} rows={3} value={s.generalNotes} onChange={e => set({ generalNotes: e.target.value })} placeholder="Market positioning, common patterns in this sector, gaps we should exploit…" />
      </Field>
    </div>
  )
}

function Step7Review({ form, completeness, clients, projects, clientId, projectId }) {
  const s1 = form.step1
  const s2 = form.step2
  const s3 = form.step3
  const s4 = form.step4
  const s5 = form.step5
  const s6 = form.step6

  const client  = clients.find(c => c.id === clientId)
  const project = projects.find(p => p.id === projectId)

  const sections = [
    {
      title: 'Business Overview',
      rows: [
        ['Company',       s1.companyName],
        ['Industry',      s1.industry === 'Other' ? s1.industryOther : s1.industry],
        ['Location',      s1.location],
        ['Tagline',       s1.tagline],
        ['What they do',  s1.whatTheyDo],
        ['Target audience', s1.targetAudience],
        ['Business goals',  s1.keyBusinessGoals],
      ],
    },
    {
      title: 'Scope & Pages',
      rows: [
        ['Site type',     s2.siteType.join(', ')],
        ['Primary goal',  s2.primaryGoal],
        ['Budget',        s2.budgetRange],
        ['Launch date',   s2.targetLaunchDate],
        ['Pages',         s2.pages.map(p => p.name).join(', ')],
        ['Existing site', s2.hasExistingSite ? (s2.existingSiteUrl || 'Yes') : 'No'],
        ['Replication mode', s2.hasExistingSite && s2.isReplication && s2.existingSiteUrl ? 'Yes — mirror existing site exactly' : null],
      ],
    },
    {
      title: 'Brand',
      rows: [
        ['Logo',          s3.logoFileName || 'Not provided'],
        ['Colours',       s3.colourPreferences],
        ['Fonts',         s3.fontPreferences],
        ['Aesthetic',     s3.aesthetic.join(', ')],
        ['Mood',          s3.moodDescription],
        ['Brand guidelines', s3.brandGuidelines],
      ],
    },
    {
      title: 'Content',
      rows: [
        ['Copy ready',    s4.copyReady ? 'Yes' : 'No'],
        ['Copy notes',    s4.copyNotes],
        ['Pages needing copy', s4.pagesNeedingCopy.join(', ')],
        ['Images available', s4.imagesAvailable ? `Yes (${s4.imageUrls.length} file(s))` : 'No'],
        ['Image direction',  s4.imageDirectionNotes],
        ['Content requirements', s4.contentRequirements],
      ],
    },
    {
      title: 'Technical',
      rows: [
        ['Integrations',  s5.integrations.join(', ')],
        ['CMS required',  s5.cmsRequired ? 'Yes' : 'No'],
        ['Preferred CMS', s5.preferredCms],
        ['Hosting',       s5.hostingPreference],
        ['GDPR',          s5.gdprRequired ? 'Yes' : 'No'],
        ['Other notes',   s5.otherTechnical],
        ['Animation style', s5.animationStyle === 'Custom' && s5.animationCustom ? `Custom — ${s5.animationCustom}` : s5.animationStyle],
        ['Hero animation',  s5.heroAnimation?.join(', ')],
      ],
    },
    {
      title: 'Competitors',
      rows: [
        ['Competitor 1', s6.competitor1.url],
        ['Competitor 2', s6.competitor2.url],
        ['Competitor 3', s6.competitor3.url],
        ['General notes', s6.generalNotes],
      ],
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Review</h2>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          completeness >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
          completeness >= 50 ? 'bg-amber-500/20 text-amber-400' :
                               'bg-red-500/20 text-red-400'
        }`}>
          {completeness}% complete
        </span>
      </div>

      {client && (
        <div className="flex gap-4 text-xs text-zinc-400 pb-2 border-b border-zinc-800">
          <span>Client: <span className="text-zinc-200">{client.name}</span></span>
          {project && <span>Project: <span className="text-zinc-200">{project.name}</span></span>}
        </div>
      )}

      <div className="space-y-4">
        {sections.map(section => (
          <details key={section.title} open className="group">
            <summary className="flex items-center gap-2 cursor-pointer list-none py-2 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex-1">{section.title}</span>
              <span className="text-zinc-600 text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="pt-3 space-y-2">
              {section.rows.filter(([, val]) => val).map(([label, val]) => (
                <div key={label} className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                  <span className="text-zinc-500 text-xs pt-0.5">{label}</span>
                  <span className="text-zinc-200 text-xs whitespace-pre-wrap">{val}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>

      {completeness < 50 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-400">
          Brief is less than 50% complete. A more detailed brief produces significantly better agent output.
        </div>
      )}
    </div>
  )
}

// ── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step, current }) {
  const done   = current > step.num
  const active = current === step.num

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
        done   ? 'bg-violet-600 text-white' :
        active ? 'bg-violet-600/30 border border-violet-500 text-violet-300' :
                 'bg-zinc-800 border border-zinc-700 text-zinc-500'
      }`}>
        {done ? '✓' : step.num}
      </div>
      <span className={`text-xs hidden sm:block ${active ? 'text-violet-300' : done ? 'text-zinc-400' : 'text-zinc-600'}`}>
        {step.label}
      </span>
    </div>
  )
}

// ── Main page component ──────────────────────────────────────────────────────

export default function NewBrief() {
  const [searchParams] = useSearchParams()
  const navigate        = useNavigate()
  const showToast       = useToast()
  const { bumpDashboard } = useUI()

  const [step,         setStep]         = useState(1)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [draftId,      setDraftId]      = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [submitPhase,  setSubmitPhase]  = useState('') // '' | 'saving' | 'orchestrating' | 'done'
  const [uploading,    setUploading]    = useState(false)
  const [clients,           setClients]           = useState([])
  const [projects,          setProjects]          = useState([])
  const [allClientProjects, setAllClientProjects] = useState([])
  const [clientId,     setClientId]     = useState(searchParams.get('clientId') || '')
  const [projectId,    setProjectId]    = useState(searchParams.get('projectId') || '')
  const [successModal, setSuccessModal] = useState(null) // null | { projectId }

  const completeness = computeCompleteness(form)

  // Load clients on mount
  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => setClients(data ?? []))
  }, [])

  // Load projects when clientId changes, excluding any that already have a brief or draft
  useEffect(() => {
    if (!clientId) { setProjects([]); setAllClientProjects([]); return }
    Promise.all([
      supabase.from('projects').select('id, name, client_id').eq('client_id', clientId).order('name'),
      supabase.from('briefs').select('project_id').not('project_id', 'is', null),
      supabase.from('briefs_structured').select('project_id').not('project_id', 'is', null),
    ]).then(([{ data: allProjects }, { data: briefsRows }, { data: draftsRows }]) => {
      const briefedIds = new Set([
        ...(briefsRows  ?? []).map(r => r.project_id),
        ...(draftsRows  ?? []).map(r => r.project_id),
      ])
      const all = allProjects ?? []
      setAllClientProjects(all)
      setProjects(all.filter(p => !briefedIds.has(p.id)))
    })
  }, [clientId])

  // Auto-save on step change (after first step)
  useEffect(() => {
    if (step > 1) saveProgress()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function saveProgress() {
    setSaving(true)
    const payload = {
      client_id:  clientId  || null,
      project_id: projectId || null,
      step1: form.step1,
      step2: form.step2,
      step3: form.step3,
      step4: form.step4,
      step5: form.step5,
      step6: form.step6,
      status: 'draft',
    }

    if (!draftId) {
      const { data, error } = await supabase.from('briefs_structured').insert(payload).select('id').single()
      if (!error && data) setDraftId(data.id)
    } else {
      await supabase.from('briefs_structured').update(payload).eq('id', draftId)
    }
    setSaving(false)
  }

  async function handleSaveDraft() {
    await saveProgress()
    showToast('Draft saved')
  }

  async function handleLogoUpload(file) {
    setUploading(true)
    const path = `logos/${clientId || 'unassigned'}/${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage.from('brief-assets').upload(path, file, { contentType: file.type })
    if (!error) {
      const { data: urlData } = supabase.storage.from('brief-assets').getPublicUrl(data.path)
      setForm(f => ({ ...f, step3: { ...f.step3, logoUrl: urlData.publicUrl, logoFileName: file.name } }))
    } else {
      showToast('Logo upload failed', 'error')
    }
    setUploading(false)
  }

  async function handleImagesUpload(files) {
    setUploading(true)
    const newUrls = []
    for (const file of files) {
      if (form.step4.imageUrls.length + newUrls.length >= 10) break
      const path = `images/${clientId || 'unassigned'}/${Date.now()}-${file.name}`
      const { data, error } = await supabase.storage.from('brief-assets').upload(path, file, { contentType: file.type })
      if (!error) {
        const { data: urlData } = supabase.storage.from('brief-assets').getPublicUrl(data.path)
        newUrls.push(urlData.publicUrl)
      }
    }
    if (newUrls.length) {
      setForm(f => ({ ...f, step4: { ...f.step4, imageUrls: [...f.step4.imageUrls, ...newUrls] } }))
    }
    setUploading(false)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitPhase('saving')
    const selectedClient  = clients.find(c => c.id === clientId)
    const selectedProject = projects.find(p => p.id === projectId)
    const briefText = compileBrief(form, selectedClient?.name, selectedProject?.name)

    const { error: briefError } = await supabase.from('briefs').insert({
      client_id:  clientId  || null,
      project_id: projectId || null,
      brief_text: briefText,
    })

    if (briefError) {
      showToast('Failed to submit brief', 'error')
      setSubmitting(false)
      setSubmitPhase('')
      return
    }

    if (draftId) {
      await supabase.from('briefs_structured').update({ status: 'submitted' }).eq('id', draftId)
    }

    // Save replication settings to the project if applicable
    if (projectId && form.step2.hasExistingSite && form.step2.isReplication && form.step2.existingSiteUrl.trim()) {
      await safeUpdate('projects', projectId, {
        is_replication:  true,
        replication_url: form.step2.existingSiteUrl.trim(),
      })
    }

    // Run Page Extractor on compiled brief text to get accurate pages with correct filenames
    if (projectId) {
      try {
        console.log('[PageExtractor] Running on compiled brief text (structured template), project:', projectId)
        const { text: rawPages } = await streamAnthropicCall({
          messages:     [{ role: 'user', content: briefText }],
          systemPrompt: PAGE_EXTRACTOR_SYSTEM,
          model:        'claude-haiku-4-5-20251001',
          maxTokens:    8000,
        })
        console.log('[PageExtractor] Raw API response:', rawPages)
        const cleanedPages = rawPages.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const parsedPages = JSON.parse(cleanedPages)
        console.log('[PageExtractor] Parsed pages:', JSON.stringify(parsedPages))
        const extractedPages = sanitiseExtractedPages(parsedPages)
        console.log('[PageExtractor] Final clean pages:', JSON.stringify(extractedPages))
        if (Array.isArray(extractedPages) && extractedPages.length) {
          console.log('[PageExtractor] Clearing existing pages before save...')
          await safeUpdate('projects', projectId, { pages: null })
          console.log('[PageExtractor] Saving to Supabase — exact array:', JSON.stringify(extractedPages))
          await safeUpdate('projects', projectId, { pages: extractedPages })
        }
      } catch (err) {
        console.warn('[PageExtractor] Page extraction failed on structured brief:', err.message)
        // Fall back to saving the form-entered pages as a best-effort baseline
        if (form.step2.pages?.length) {
          console.log('[PageExtractor] Fallback: saving form pages baseline:', JSON.stringify(form.step2.pages))
          await safeUpdate('projects', projectId, { pages: null })
          await safeUpdate('projects', projectId, { pages: form.step2.pages })
        }
      }
    }

    // Trigger orchestrator
    if (projectId) {
      setSubmitPhase('orchestrating')
      try {
        const { text: orchText } = await streamAnthropicCall({
          messages:     [{ role: 'user', content: briefText }],
          systemPrompt: ORCHESTRATOR_SYSTEM,
          maxTokens:    30000,
        })

        await supabase.from('agent_outputs').insert({
          project_id: projectId,
          agent_name: 'Orchestrator',
          output_text: orchText,
          status:      'approved',
        })
      } catch (err) {
        console.warn('[NewBrief] Orchestrator failed:', err.message)
      }
    }

    setSubmitPhase('done')
    setSubmitting(false)
    bumpDashboard()

    if (projectId) {
      setSuccessModal({ projectId })
    } else {
      showToast('Brief submitted successfully')
      if (clientId) navigate(`/clients/${clientId}`)
      else          navigate('/projects')
    }
  }

  function handleNext() {
    setStep(s => Math.min(s + 1, 7))
  }

  function handleBack() {
    setStep(s => Math.max(s - 1, 1))
  }

  const showSelectors = !searchParams.get('clientId') && !searchParams.get('projectId')

  return (
    <>
    {/* ── Success modal ── */}
    {successModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
        <div className="w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-8 flex flex-col items-center text-center gap-5">
          <div className="w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-white">Brief submitted successfully</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Your orchestrator has broken down the project and all agents are ready. Click <span className="text-white font-medium">Start Project</span> when you are ready to begin.
            </p>
          </div>
          <button
            onClick={() => navigate(`/projects/${successModal.projectId}`)}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            Start Project
          </button>
        </div>
      </div>
    )}
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Link to="/projects" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-1">
          ← Back to projects
        </Link>
        <h1 className="text-xl font-semibold text-white">New Client Brief</h1>
      </div>

      {/* Client / project selectors */}
      {showSelectors && (
        <div className="flex gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-medium text-zinc-400">Client</label>
            <select
              className={inputCls}
              value={clientId}
              onChange={e => { setClientId(e.target.value); setProjectId('') }}
            >
              <option value="">No client selected</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-medium text-zinc-400">Project</label>
            <select
              className={inputCls}
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              disabled={!clientId}
            >
              <option value="">No project selected</option>
              {clientId && allClientProjects.length > 0 && projects.length === 0 ? (
                <option value="" disabled>All projects for this client already have a brief — delete the existing brief to create a new one</option>
              ) : (
                projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
              )}
            </select>
          </div>
        </div>
      )}

      {/* Step progress */}
      <div className="flex items-start gap-1 px-2">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1">
            <StepIndicator step={s} current={step} />
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 mt-[-14px] ${step > s.num ? 'bg-violet-600' : 'bg-zinc-800'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Two-column body */}
      <div className="flex gap-6 items-start">
        {/* Main form */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            {step === 1 && <Step1 form={form} setForm={setForm} />}
            {step === 2 && <Step2 form={form} setForm={setForm} />}
            {step === 3 && <Step3 form={form} setForm={setForm} clientId={clientId} uploading={uploading} onLogoUpload={handleLogoUpload} />}
            {step === 4 && <Step4 form={form} setForm={setForm} clientId={clientId} uploading={uploading} onImagesUpload={handleImagesUpload} />}
            {step === 5 && <Step5 form={form} setForm={setForm} />}
            {step === 6 && <Step6 form={form} setForm={setForm} />}
            {step === 7 && <Step7Review form={form} completeness={completeness} clients={clients} projects={projects} clientId={clientId} projectId={projectId} />}
          </div>

          {/* Footer navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className="px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Back
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving…' : 'Save draft'}
              </button>
              {step < 7 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 transition-colors"
                >
                  {submitPhase === 'saving'        ? 'Saving brief…'
                  : submitPhase === 'orchestrating' ? 'Orchestrating…'
                  : submitting                      ? 'Submitting…'
                  :                                   'Submit Brief'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-4 sticky top-6">
          {/* Completeness */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Completeness</p>
              <span className={`text-xs font-bold ${
                completeness >= 80 ? 'text-emerald-400' :
                completeness >= 50 ? 'text-amber-400' :
                                     'text-red-400'
              }`}>{completeness}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  completeness >= 80 ? 'bg-emerald-500' :
                  completeness >= 50 ? 'bg-amber-500' :
                                       'bg-red-500'
                }`}
                style={{ width: `${completeness}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500">
              {completeness >= 80 ? 'Great — ready to submit.' :
               completeness >= 50 ? 'Good progress. Fill in more detail for better output.' :
               'Add more information for higher quality agent output.'}
            </p>
          </div>

          {/* Tips */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Tips — {STEP_TIPS[step].title}
            </p>
            <ul className="space-y-2">
              {STEP_TIPS[step].tips.map(tip => (
                <li key={tip} className="flex gap-2 text-xs text-zinc-500 leading-relaxed">
                  <span className="text-violet-500 flex-shrink-0 mt-0.5">·</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Step nav shortcut */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-1">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Jump to step</p>
            {STEPS.map(s => (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                  step === s.num
                    ? 'bg-violet-600/20 text-violet-300'
                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
              >
                {s.num}. {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
