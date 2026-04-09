import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { streamAnthropicCall } from '../lib/streamHelper'

// Orchestrator system prompt — must match PROJ_ORCHESTRATOR_SYSTEM in ProjectDetail.jsx
const ORCHESTRATOR_SYSTEM = `You are the orchestrator for an AI web design agency. You will be given a detailed structured client brief. Break it down into four clearly labelled task lists for: 1) Researcher — what to research about the industry, audience, competitors and SEO. 2) Designer — what design decisions to make, what pages to wireframe, what brand direction to follow. 3) Developer — what pages to build, what technical requirements to implement, what integrations to set up. 4) Reviewer — what specific things to check against the brief during the quality review. Be specific and actionable for each agent. Use markdown formatting with clear headings.`

// ── Constants ─────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'Architecture & Real Estate', 'Arts & Entertainment', 'Beauty & Wellness',
  'Consulting & Professional Services', 'E-commerce & Retail', 'Education & Training',
  'Finance & Insurance', 'Food & Hospitality', 'Healthcare & Medical',
  'Legal', 'Marketing & Advertising', 'Non-profit & Charity',
  'Technology & SaaS', 'Travel & Tourism', 'Other',
]

const SITE_TYPES = [
  { value: 'Portfolio',          icon: '🎨', desc: 'Showcase your work' },
  { value: 'Brochure/marketing', icon: '📣', desc: 'Promote your services' },
  { value: 'E-commerce',         icon: '🛒', desc: 'Sell products online' },
  { value: 'Booking/service',    icon: '📅', desc: 'Accept bookings' },
  { value: 'Other',              icon: '✦',  desc: 'Something else' },
]

const PRIMARY_GOALS = [
  'Generate leads',
  'Drive online sales',
  'Build brand awareness',
  'Provide information',
]

const BUDGET_RANGES = [
  'Under £2,000', '£2,000 – £5,000', '£5,000 – £10,000',
  '£10,000 – £25,000', '£25,000+', 'Not decided',
]

const FEELS = [
  'Professional', 'Playful', 'Luxury', 'Minimal',
  'Bold', 'Friendly', 'Technical', 'Creative',
]

const STEPS = [
  { num: 1, label: 'Your Business' },
  { num: 2, label: 'Your Website'  },
  { num: 3, label: 'Your Brand'    },
  { num: 4, label: 'Your Content'  },
  { num: 5, label: 'Review'        },
]

const EMPTY = {
  // Step 1
  companyName:      '',
  industry:         '',
  industryOther:    '',
  location:         '',
  tagline:          '',
  whatTheyDo:       '',
  customers:        '',
  businessGoals:    '',
  // Step 2
  siteType:         '',
  primaryGoal:      '',
  hasExistingSite:  false,
  existingUrl:      '',
  existingLikes:    '',
  existingDislikes: '',
  launchDate:       '',
  budget:           '',
  // Step 3
  hasLogo:          false,
  logoFile:         null,
  logoUrl:          '',
  hasColours:       false,
  colours:          '',
  hasFonts:         false,
  fonts:            '',
  feel:             [],
  brandNotes:       '',
  // Step 4
  copyReady:        false,
  imagesReady:      false,
  imageFiles:       [],
  imageUrls:        [],
  contentNotes:     '',
  comp1Url:         '',
  comp1Likes:       '',
  comp2Url:         '',
  comp2Likes:       '',
  comp3Url:         '',
  comp3Likes:       '',
}

// ── Brief compiler ────────────────────────────────────────────────────────────

function compileBrief(f, clientName, projectName) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const lines = [
    `# Client Brief — ${f.companyName || 'Unnamed'}`,
    `Client: ${clientName || '—'} | Project: ${projectName || '—'} | Submitted: ${date}`,
    '', '---', '',
    '## 1. Business Overview', '',
  ]
  if (f.companyName)   lines.push(`**Company:** ${f.companyName}`)
  if (f.industry)      lines.push(`**Industry:** ${f.industry === 'Other' && f.industryOther ? f.industryOther : f.industry}`)
  if (f.location)      lines.push(`**Location:** ${f.location}`)
  if (f.tagline)       lines.push(`**Tagline:** ${f.tagline}`)
  if (f.whatTheyDo)    lines.push(`**About the business:** ${f.whatTheyDo}`)
  if (f.customers)     lines.push(`**Target customers:** ${f.customers}`)
  if (f.businessGoals) lines.push(`**Business goals:** ${f.businessGoals}`)
  lines.push('', '## 2. Website', '')
  if (f.siteType)    lines.push(`**Site type:** ${f.siteType}`)
  if (f.primaryGoal) lines.push(`**Primary goal:** ${f.primaryGoal}`)
  if (f.launchDate)  lines.push(`**Target launch:** ${f.launchDate}`)
  if (f.budget)      lines.push(`**Budget:** ${f.budget}`)
  if (f.hasExistingSite) {
    lines.push(`**Existing site:** ${f.existingUrl || 'Yes'}`)
    if (f.existingLikes)    lines.push(`**Likes about existing:** ${f.existingLikes}`)
    if (f.existingDislikes) lines.push(`**Dislikes about existing:** ${f.existingDislikes}`)
  } else {
    lines.push('**Existing site:** None')
  }
  lines.push('', '## 3. Brand', '')
  lines.push(`**Logo:** ${f.hasLogo ? (f.logoUrl ? `Provided (${f.logoUrl})` : 'Provided') : 'Not yet'}`)
  if (f.hasColours && f.colours) lines.push(`**Brand colours:** ${f.colours}`)
  if (f.hasFonts   && f.fonts)   lines.push(`**Fonts:** ${f.fonts}`)
  if (f.feel.length)             lines.push(`**Brand feel:** ${f.feel.join(', ')}`)
  if (f.brandNotes)              lines.push(`**Brand notes / inspiration:** ${f.brandNotes}`)
  lines.push('', '## 4. Content', '')
  lines.push(`**Copy ready:** ${f.copyReady ? 'Yes' : 'No'}`)
  lines.push(`**Images ready:** ${f.imagesReady ? `Yes — ${f.imageUrls.length} file(s) uploaded` : 'No'}`)
  if (f.contentNotes) lines.push(`**Content notes:** ${f.contentNotes}`)
  const comps = [
    f.comp1Url && { url: f.comp1Url, likes: f.comp1Likes },
    f.comp2Url && { url: f.comp2Url, likes: f.comp2Likes },
    f.comp3Url && { url: f.comp3Url, likes: f.comp3Likes },
  ].filter(Boolean)
  if (comps.length) {
    lines.push('', '## 5. Competitors / Inspiration', '')
    comps.forEach((c, i) => {
      lines.push(`**${i + 1}.** ${c.url}`)
      if (c.likes) lines.push(`   Likes: ${c.likes}`)
    })
  }
  return lines.join('\n')
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Field({ label, hint, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">
        {label}
        {required && <span className="text-violet-500 ml-0.5">*</span>}
        {hint && <span className="ml-2 text-xs font-normal text-gray-400">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:border-violet-400 focus:ring-3 focus:ring-violet-100 transition-all'
const textareaCls = inputCls + ' resize-none'

function Input(props) {
  return <input {...props} className={inputCls} />
}

function Textarea({ rows = 3, ...props }) {
  return <textarea {...props} rows={rows} className={textareaCls} />
}

function Select({ children, ...props }) {
  return (
    <select {...props} className={inputCls + ' cursor-pointer'}>
      {children}
    </select>
  )
}

function YesNo({ value, onChange, yesLabel = 'Yes', noLabel = 'No' }) {
  return (
    <div className="flex gap-3">
      {[true, false].map(v => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            value === v
              ? 'bg-violet-50 border-violet-400 text-violet-700 ring-2 ring-violet-100'
              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          {v ? yesLabel : noLabel}
        </button>
      ))}
    </div>
  )
}

function Chip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
        active
          ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
          : 'bg-white border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600'
      }`}
    >
      {label}
    </button>
  )
}

// ── Step 1 — Your Business ────────────────────────────────────────────────────

function Step1({ f, set }) {
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Company name" required>
          <Input value={f.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Acme Ltd" />
        </Field>
        <Field label="Location" required>
          <Input value={f.location} onChange={e => set('location', e.target.value)} placeholder="London, UK" />
        </Field>
      </div>

      <Field label="Industry">
        <Select value={f.industry} onChange={e => set('industry', e.target.value)}>
          <option value="">Select your industry…</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </Select>
        {f.industry === 'Other' && (
          <Input className="mt-3" value={f.industryOther} onChange={e => set('industryOther', e.target.value)} placeholder="Describe your industry" />
        )}
      </Field>

      <Field label="Website tagline or slogan" hint="optional">
        <Input value={f.tagline} onChange={e => set('tagline', e.target.value)} placeholder="e.g. Crafting spaces you'll love" />
      </Field>

      <Field label="What does your business do?" required>
        <Textarea
          rows={4}
          value={f.whatTheyDo}
          onChange={e => set('whatTheyDo', e.target.value)}
          placeholder="Describe your products or services, what makes you different, and how long you've been operating…"
        />
      </Field>

      <Field label="Who are your customers?" required>
        <Textarea
          rows={3}
          value={f.customers}
          onChange={e => set('customers', e.target.value)}
          placeholder="e.g. Small business owners aged 30–50 in the UK looking for accountancy services…"
        />
      </Field>

      <Field label="What are your main business goals for this website?" required>
        <Textarea
          rows={3}
          value={f.businessGoals}
          onChange={e => set('businessGoals', e.target.value)}
          placeholder="e.g. Generate enquiries, sell products, showcase our portfolio, build credibility…"
        />
      </Field>
    </div>
  )
}

// ── Step 2 — Your Website ─────────────────────────────────────────────────────

function Step2({ f, set }) {
  return (
    <div className="space-y-7">
      <Field label="What type of website do you need?">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
          {SITE_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => set('siteType', t.value)}
              className={`flex flex-col items-start gap-1 p-4 rounded-xl border text-left transition-all ${
                f.siteType === t.value
                  ? 'bg-violet-50 border-violet-400 ring-2 ring-violet-100'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              <span className={`text-sm font-semibold ${f.siteType === t.value ? 'text-violet-700' : 'text-gray-800'}`}>{t.value}</span>
              <span className="text-xs text-gray-400">{t.desc}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="What is the primary goal of the website?">
        <div className="space-y-2 mt-1">
          {PRIMARY_GOALS.map(g => (
            <div
              key={g}
              onClick={() => set('primaryGoal', g)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                f.primaryGoal === g
                  ? 'bg-violet-50 border-violet-400 ring-2 ring-violet-100'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all flex items-center justify-center ${
                f.primaryGoal === g ? 'border-violet-500 bg-violet-500' : 'border-gray-300'
              }`}>
                {f.primaryGoal === g && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <span className={`text-sm font-medium ${f.primaryGoal === g ? 'text-violet-700' : 'text-gray-700'}`}>{g}</span>
            </div>
          ))}
        </div>
      </Field>

      <Field label="Do you have an existing website?">
        <YesNo value={f.hasExistingSite} onChange={v => set('hasExistingSite', v)} />
        {f.hasExistingSite && (
          <div className="mt-4 space-y-4 pl-4 border-l-2 border-violet-200">
            <Input value={f.existingUrl} onChange={e => set('existingUrl', e.target.value)} placeholder="https://yoursite.com" />
            <Textarea rows={2} value={f.existingLikes} onChange={e => set('existingLikes', e.target.value)} placeholder="What do you like about it?" />
            <Textarea rows={2} value={f.existingDislikes} onChange={e => set('existingDislikes', e.target.value)} placeholder="What don't you like about it?" />
          </div>
        )}
      </Field>

      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Target launch date" hint="optional">
          <Input type="date" value={f.launchDate} onChange={e => set('launchDate', e.target.value)} />
        </Field>
        <Field label="Budget range" hint="optional">
          <Select value={f.budget} onChange={e => set('budget', e.target.value)}>
            <option value="">Select a range…</option>
            {BUDGET_RANGES.map(b => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
      </div>
    </div>
  )
}

// ── Step 3 — Your Brand ───────────────────────────────────────────────────────

function Step3({ f, set, onLogoChange }) {
  const logoRef = useRef(null)

  function toggleFeel(val) {
    set('feel', f.feel.includes(val) ? f.feel.filter(v => v !== val) : [...f.feel, val])
  }

  return (
    <div className="space-y-7">
      <Field label="Do you have a logo?">
        <YesNo value={f.hasLogo} onChange={v => set('hasLogo', v)} />
        {f.hasLogo && (
          <div className="mt-4 pl-4 border-l-2 border-violet-200">
            <input ref={logoRef} type="file" accept="image/*,.svg,.pdf,.ai,.eps" className="hidden" onChange={e => onLogoChange(e.target.files[0])} />
            {f.logoUrl ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
                <span className="text-sm text-emerald-700 truncate flex-1">{f.logoFile?.name ?? 'Logo uploaded'}</span>
                <button type="button" onClick={() => { set('logoUrl', ''); set('logoFile', null) }} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">Remove</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => logoRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-300 hover:border-violet-400 hover:bg-violet-50 transition-all text-gray-400 hover:text-violet-500"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-sm font-medium">Click to upload logo</span>
                <span className="text-xs">PNG, JPG, SVG, PDF, AI, EPS</span>
              </button>
            )}
          </div>
        )}
      </Field>

      <Field label="Do you have specific brand colours?">
        <YesNo value={f.hasColours} onChange={v => set('hasColours', v)} />
        {f.hasColours && (
          <div className="mt-4 pl-4 border-l-2 border-violet-200">
            <Input value={f.colours} onChange={e => set('colours', e.target.value)} placeholder="e.g. Navy #1a2e5a, Gold #c9a96e, White #ffffff" />
          </div>
        )}
      </Field>

      <Field label="Do you have preferred fonts?">
        <YesNo value={f.hasFonts} onChange={v => set('hasFonts', v)} />
        {f.hasFonts && (
          <div className="mt-4 pl-4 border-l-2 border-violet-200">
            <Input value={f.fonts} onChange={e => set('fonts', e.target.value)} placeholder="e.g. Playfair Display for headings, Inter for body text" />
          </div>
        )}
      </Field>

      <Field label="Overall feel of the brand">
        <div className="flex flex-wrap gap-2 mt-1">
          {FEELS.map(v => <Chip key={v} label={v} active={f.feel.includes(v)} onClick={() => toggleFeel(v)} />)}
        </div>
      </Field>

      <Field label="Brand guidelines or inspiration websites" hint="optional">
        <Textarea
          rows={4}
          value={f.brandNotes}
          onChange={e => set('brandNotes', e.target.value)}
          placeholder="Paste any brand guidelines, describe your brand rules, or share links to websites you love and why…"
        />
      </Field>
    </div>
  )
}

// ── Step 4 — Your Content ─────────────────────────────────────────────────────

function Step4({ f, set, onImagesChange, uploadingImages }) {
  const imagesRef = useRef(null)

  return (
    <div className="space-y-7">
      <Field label="Is your written content (copy) ready?">
        <YesNo value={f.copyReady} onChange={v => set('copyReady', v)} yesLabel="Yes, it's ready" noLabel="Not yet" />
      </Field>

      <Field label="Do you have images or photography ready?">
        <YesNo value={f.imagesReady} onChange={v => set('imagesReady', v)} yesLabel="Yes, upload them" noLabel="Not yet" />
        {f.imagesReady && (
          <div className="mt-4 pl-4 border-l-2 border-violet-200 space-y-3">
            <input
              ref={imagesRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => onImagesChange(Array.from(e.target.files ?? []))}
            />
            {f.imageUrls.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  </svg>
                  <span className="font-medium">{f.imageUrls.length} image{f.imageUrls.length !== 1 ? 's' : ''} uploaded</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {f.imageFiles.map((file, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg truncate max-w-[180px]">{file.name}</span>
                  ))}
                </div>
                {f.imageUrls.length < 10 && (
                  <button type="button" onClick={() => imagesRef.current?.click()} disabled={uploadingImages} className="text-sm text-violet-600 hover:text-violet-500 font-medium">
                    + Add more images
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imagesRef.current?.click()}
                disabled={uploadingImages}
                className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-300 hover:border-violet-400 hover:bg-violet-50 transition-all text-gray-400 hover:text-violet-500 disabled:opacity-50"
              >
                {uploadingImages ? (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <span className="text-sm font-medium">Uploading…</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-sm font-medium">Click to upload images</span>
                    <span className="text-xs">Up to 10 images — JPG, PNG, WebP</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </Field>

      <Field label="Any specific content requirements?" hint="optional">
        <Textarea
          rows={3}
          value={f.contentNotes}
          onChange={e => set('contentNotes', e.target.value)}
          placeholder="Videos, case studies, testimonials, downloadable files, special sections…"
        />
      </Field>

      <div className="space-y-4">
        <p className="text-sm font-semibold text-gray-800">Competitor or inspiration websites <span className="text-xs font-normal text-gray-400">optional — up to 3</span></p>
        {[
          { urlKey: 'comp1Url', likesKey: 'comp1Likes', num: 1 },
          { urlKey: 'comp2Url', likesKey: 'comp2Likes', num: 2 },
          { urlKey: 'comp3Url', likesKey: 'comp3Likes', num: 3 },
        ].map(({ urlKey, likesKey, num }) => (
          <div key={num} className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Website {num}</p>
            <Input value={f[urlKey]} onChange={e => set(urlKey, e.target.value)} placeholder="https://example.com" />
            {f[urlKey] && (
              <Input value={f[likesKey]} onChange={e => set(likesKey, e.target.value)} placeholder="What do you like about this site?" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 5 — Review ───────────────────────────────────────────────────────────

function ReviewRow({ label, value }) {
  if (!value && value !== false) return null
  return (
    <div className="flex gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 w-40 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-800 flex-1">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</span>
    </div>
  )
}

function ReviewSection({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

function StepReview({ f }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Please review your answers before submitting.</p>

      <ReviewSection title="Your Business">
        <ReviewRow label="Company"      value={f.companyName} />
        <ReviewRow label="Industry"     value={f.industry === 'Other' ? f.industryOther : f.industry} />
        <ReviewRow label="Location"     value={f.location} />
        <ReviewRow label="Tagline"      value={f.tagline} />
        <ReviewRow label="About"        value={f.whatTheyDo} />
        <ReviewRow label="Customers"    value={f.customers} />
        <ReviewRow label="Goals"        value={f.businessGoals} />
      </ReviewSection>

      <ReviewSection title="Your Website">
        <ReviewRow label="Site type"    value={f.siteType} />
        <ReviewRow label="Primary goal" value={f.primaryGoal} />
        <ReviewRow label="Existing site" value={f.hasExistingSite ? (f.existingUrl || 'Yes') : 'None'} />
        <ReviewRow label="Launch date"  value={f.launchDate} />
        <ReviewRow label="Budget"       value={f.budget} />
      </ReviewSection>

      <ReviewSection title="Your Brand">
        <ReviewRow label="Logo"     value={f.hasLogo ? (f.logoUrl ? 'Uploaded' : 'Yes (no file yet)') : 'Not yet'} />
        <ReviewRow label="Colours"  value={f.hasColours ? f.colours : 'Not specified'} />
        <ReviewRow label="Fonts"    value={f.hasFonts   ? f.fonts   : 'Not specified'} />
        <ReviewRow label="Feel"     value={f.feel.length ? f.feel.join(', ') : null} />
        <ReviewRow label="Notes"    value={f.brandNotes} />
      </ReviewSection>

      <ReviewSection title="Your Content">
        <ReviewRow label="Copy ready"    value={f.copyReady} />
        <ReviewRow label="Images"        value={f.imagesReady ? `${f.imageUrls.length} file(s) uploaded` : 'Not yet'} />
        <ReviewRow label="Content notes" value={f.contentNotes} />
        {f.comp1Url && <ReviewRow label="Competitor 1" value={f.comp1Url} />}
        {f.comp2Url && <ReviewRow label="Competitor 2" value={f.comp2Url} />}
        {f.comp3Url && <ReviewRow label="Competitor 3" value={f.comp3Url} />}
      </ReviewSection>
    </div>
  )
}

// ── State screens ─────────────────────────────────────────────────────────────

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-violet-50/30 flex flex-col">
      <header className="bg-white border-b border-gray-100 h-14 flex items-center px-6 flex-shrink-0">
        <span className="text-base font-bold tracking-tight">
          <span className="text-violet-600">Forge</span>
          <span className="text-gray-900"> Agency</span>
        </span>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        {children}
      </main>
    </div>
  )
}

function StatusCard({ icon, iconBg, title, message }) {
  return (
    <Shell>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center space-y-4">
        <div className={`w-16 h-16 rounded-full ${iconBg} flex items-center justify-center mx-auto`}>
          {icon}
        </div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
      </div>
    </Shell>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClientBrief() {
  const { token } = useParams()

  // Token state: 'loading' | 'invalid' | 'already_submitted' | 'valid' | 'done'
  const [tokenState,  setTokenState]  = useState('loading')
  const [tokenRecord, setTokenRecord] = useState(null)
  const [clientName,  setClientName]  = useState('')
  const [projectName, setProjectName] = useState('')

  // Form state
  const [step,           setStep]           = useState(1)
  const [f,              setF]              = useState(EMPTY)
  const [uploadingLogo,  setUploadingLogo]  = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [submitting,     setSubmitting]     = useState(false)
  const [submitError,    setSubmitError]    = useState(null)

  function set(key, value) {
    setF(prev => ({ ...prev, [key]: value }))
  }

  // ── Token validation ────────────────────────────────────────────────────────

  useEffect(() => {
    async function validate() {
      const { data, error } = await supabase
        .from('client_brief_tokens')
        .select('*, clients(name), projects(name)')
        .eq('token', token)
        .maybeSingle()

      if (error || !data) { setTokenState('invalid'); return }
      if (data.expires_at && new Date(data.expires_at) < new Date()) { setTokenState('invalid'); return }
      if (data.status === 'submitted') { setTokenState('already_submitted'); return }

      setTokenRecord(data)
      setClientName(data.clients?.name  ?? '')
      setProjectName(data.projects?.name ?? '')
      setTokenState('valid')
    }
    validate()
  }, [token])

  // ── File uploads ────────────────────────────────────────────────────────────

  async function handleLogoChange(file) {
    if (!file) return
    set('logoFile', file)
    setUploadingLogo(true)
    const path = `${token}/logo/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true })
    if (error) {
      console.warn('Logo upload failed:', error.message)
      set('logoUrl', `[upload failed — ${file.name}]`)
    } else {
      const { data: { publicUrl } } = supabase.storage.from('client-uploads').getPublicUrl(path)
      set('logoUrl', publicUrl)
    }
    setUploadingLogo(false)
  }

  async function handleImagesChange(files) {
    if (!files.length) return
    const remaining = 10 - f.imageUrls.length
    const toUpload  = files.slice(0, remaining)
    setUploadingImages(true)
    const uploadedUrls  = []
    const uploadedFiles = []
    for (const file of toUpload) {
      const path = `${token}/images/${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('client-uploads').getPublicUrl(path)
        uploadedUrls.push(publicUrl)
        uploadedFiles.push(file)
      }
    }
    set('imageUrls',  [...f.imageUrls,  ...uploadedUrls])
    set('imageFiles', [...f.imageFiles, ...uploadedFiles])
    setUploadingImages(false)
  }

  // ── Step validation ─────────────────────────────────────────────────────────

  function canAdvance() {
    if (step === 1) return f.companyName.trim() && f.location.trim() && f.whatTheyDo.trim() && f.customers.trim() && f.businessGoals.trim()
    return true
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    console.log('[ClientBrief] Client brief submission started')
    setSubmitting(true)
    setSubmitError(null)

    const briefText = compileBrief(f, clientName, projectName)
    const projectId = tokenRecord?.project_id ?? null
    const clientId  = tokenRecord?.client_id  ?? null
    console.log('[ClientBrief] tokenRecord:', tokenRecord)
    console.log('[ClientBrief] project_id:', projectId, '| client_id:', clientId, '| briefText length:', briefText?.length)

    // 1. Save to briefs_structured
    console.log('[ClientBrief] Inserting into briefs_structured…')
    const { error: structuredErr } = await supabase.from('briefs_structured').insert({
      client_id:  clientId,
      project_id: projectId,
      status:     'submitted',
      step1: { companyName: f.companyName, industry: f.industry, industryOther: f.industryOther, location: f.location, tagline: f.tagline, whatTheyDo: f.whatTheyDo, customers: f.customers, businessGoals: f.businessGoals },
      step2: { siteType: f.siteType, primaryGoal: f.primaryGoal, hasExistingSite: f.hasExistingSite, existingUrl: f.existingUrl, existingLikes: f.existingLikes, existingDislikes: f.existingDislikes, launchDate: f.launchDate, budget: f.budget },
      step3: { hasLogo: f.hasLogo, logoUrl: f.logoUrl, hasColours: f.hasColours, colours: f.colours, hasFonts: f.hasFonts, fonts: f.fonts, feel: f.feel, brandNotes: f.brandNotes },
      step4: { copyReady: f.copyReady, imagesReady: f.imagesReady, imageUrls: f.imageUrls, contentNotes: f.contentNotes, comp1Url: f.comp1Url, comp1Likes: f.comp1Likes, comp2Url: f.comp2Url, comp2Likes: f.comp2Likes, comp3Url: f.comp3Url, comp3Likes: f.comp3Likes },
    })
    if (structuredErr) {
      console.error('[ClientBrief] briefs_structured insert FAILED:', structuredErr)
      setSubmitError('Something went wrong saving your brief. Please try again.')
      setSubmitting(false)
      return
    }
    console.log('[ClientBrief] briefs_structured saved OK')

    // 2. Insert into briefs (populates the activity feed)
    console.log('[ClientBrief] Inserting into briefs…')
    const { data: briefRecord, error: briefErr } = await supabase.from('briefs').insert({
      client_id:  clientId,
      project_id: projectId,
      brief_text: briefText,
    }).select('id').single()
    if (briefErr) {
      console.error('[ClientBrief] briefs insert FAILED:', briefErr)
    } else {
      console.log('[ClientBrief] Brief saved successfully — id:', briefRecord?.id, 'project_id:', projectId)
    }

    // 3. Mark token as submitted
    console.log('[ClientBrief] Marking token as submitted…')
    const { error: tokenErr } = await supabase
      .from('client_brief_tokens')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('token', token)
    if (tokenErr) console.error('[ClientBrief] token update FAILED:', tokenErr)
    else console.log('[ClientBrief] Token marked submitted OK')

    // 4. Show success screen immediately — component stays mounted so the
    //    Orchestrator call below continues running even after this re-render.
    setTokenState('done')
    setSubmitting(false)

    // 5. Trigger Orchestrator — awaited so the promise is not abandoned.
    //    The success screen is already visible; this runs in the background.
    console.log('[ClientBrief] About to trigger Orchestrator')
    await triggerOrchestrator(projectId, clientId, briefText)
    console.log('[ClientBrief] triggerOrchestrator returned')
  }

  async function triggerOrchestrator(projectId, clientId, briefText) {
    console.log('[ClientBrief] triggerOrchestrator called — project_id:', projectId, '| client_id:', clientId)

    if (!projectId) {
      console.error('[ClientBrief] ABORT: project_id is null — cannot save Orchestrator output')
      return
    }
    if (!briefText) {
      console.error('[ClientBrief] ABORT: briefText is empty')
      return
    }

    try {
      console.log('[ClientBrief] Orchestrator API call started')
      let orchText = ''
      await streamAnthropicCall({
        messages:     [{ role: 'user', content: briefText }],
        systemPrompt: ORCHESTRATOR_SYSTEM,
        maxTokens:    30000,
        onChunk:      (chunk) => { orchText += chunk },
      })
      console.log('[ClientBrief] Orchestrator response received — length:', orchText.length, '— preview:', orchText.slice(0, 100))

      if (!orchText.trim()) {
        console.error('[ClientBrief] Orchestrator returned empty text — skipping save')
        return
      }

      console.log('[ClientBrief] Saving to agent_outputs — project_id:', projectId)
      const { data: orchRecord, error: orchErr } = await supabase.from('agent_outputs').insert({
        project_id:  projectId,
        agent_name:  'Orchestrator',
        output_text: orchText,   // field name ProjectDetail queries: orchestratorOutput?.output_text
        status:      'approved',
      }).select('id').single()

      if (orchErr) {
        console.error('[ClientBrief] agent_outputs insert FAILED:', orchErr)
        return
      }
      console.log('[ClientBrief] Orchestrator saved to agent_outputs — record id:', orchRecord?.id)
    } catch (err) {
      console.error('[ClientBrief] Orchestrator trigger threw an exception:', err?.message ?? err)
      console.error('[ClientBrief] Full error object:', err)
    }
  }

  // ── Gate screens ────────────────────────────────────────────────────────────

  if (tokenState === 'loading') {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm">Loading your brief…</span>
        </div>
      </Shell>
    )
  }

  if (tokenState === 'invalid') {
    return (
      <StatusCard
        iconBg="bg-red-100"
        icon={<svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z" /></svg>}
        title="This brief link is invalid or has expired"
        message="The link you followed is no longer valid. Please contact your project manager to receive a new link."
      />
    )
  }

  if (tokenState === 'already_submitted') {
    return (
      <StatusCard
        iconBg="bg-amber-100"
        icon={<svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
        title="Your brief has already been submitted"
        message="Thank you — your project team has already received your brief and will be in touch soon."
      />
    )
  }

  if (tokenState === 'done') {
    return (
      <StatusCard
        iconBg="bg-violet-100"
        icon={<svg className="w-8 h-8 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
        title="Your brief has been submitted successfully"
        message="Thank you for taking the time to fill this in — we will be in touch soon to discuss your project."
      />
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  const isReview   = step === STEPS.length
  const isLastStep = step === STEPS.length
  const progress   = (step / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-violet-50/30 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 h-14 flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-10">
        <span className="text-base font-bold tracking-tight">
          <span className="text-violet-600">Forge</span>
          <span className="text-gray-900"> Agency</span>
        </span>
        {(clientName || projectName) && (
          <span className="text-sm text-gray-400 hidden sm:block">
            {[clientName, projectName].filter(Boolean).join(' · ')}
          </span>
        )}
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-10">

        {/* Welcome — only on step 1 */}
        {step === 1 && (
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome{clientName ? `, ${clientName}` : ''}!</h1>
            <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
              Thank you for choosing us — please fill in as much detail as you can to help us build your perfect website.
            </p>
          </div>
        )}

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">
              Step {step} of {STEPS.length} — {STEPS[step - 1].label}
            </span>
            <span className="text-xs text-gray-400 tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {STEPS.map(s => (
              <div
                key={s.num}
                className="flex flex-col items-center gap-1"
                style={{ width: `${100 / STEPS.length}%` }}
              >
                <div className={`w-2 h-2 rounded-full transition-all ${s.num < step ? 'bg-violet-600' : s.num === step ? 'bg-violet-600 ring-2 ring-violet-200' : 'bg-gray-300'}`} />
                <span className={`text-[10px] hidden sm:block ${s.num === step ? 'text-violet-600 font-semibold' : 'text-gray-400'}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {step === 1 && <Step1 f={f} set={set} />}
          {step === 2 && <Step2 f={f} set={set} />}
          {step === 3 && <Step3 f={f} set={set} onLogoChange={handleLogoChange} uploadingLogo={uploadingLogo} />}
          {step === 4 && <Step4 f={f} set={set} onImagesChange={handleImagesChange} uploadingImages={uploadingImages} />}
          {step === 5 && <StepReview f={f} />}

          {submitError && (
            <div className="mt-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {submitError}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 1}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {isLastStep ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 shadow-sm shadow-violet-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit Brief
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 shadow-sm shadow-violet-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Your information is kept private and only shared with your Forge Agency project team.
        </p>
      </main>
    </div>
  )
}
