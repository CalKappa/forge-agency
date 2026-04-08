import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { safeUpdate } from '../lib/supabaseHelpers'
import { streamAnthropicCall } from '../lib/streamHelper'
import { AGENT_CONFIG, COLOR_CLASSES } from '../lib/agents'
import { jsPDF } from 'jspdf'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'
import { usePipeline } from '../hooks/usePipeline'
import { saveFilesToDisk, openProjectFolder } from '../lib/fileSystemHelpers'

// ── Constants ─────────────────────────────────────────────────────────────────
const STAGES = ['Not Started', 'Research', 'Design', 'Dev', 'Review', 'Delivered']

const STAGE_CONFIG = {
  'Not Started': { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     ring: 'ring-red-500',     fill: 'bg-red-500'     },
  Research:      { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30',    ring: 'ring-blue-500',    fill: 'bg-blue-500'    },
  Design:        { bg: 'bg-violet-500/15',  text: 'text-violet-400',  border: 'border-violet-500/30',  ring: 'ring-violet-500',  fill: 'bg-violet-500'  },
  Dev:           { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30',  ring: 'ring-orange-500',  fill: 'bg-orange-500'  },
  Review:        { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30',   ring: 'ring-amber-500',   fill: 'bg-amber-500'   },
  Delivered:     { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', ring: 'ring-emerald-500', fill: 'bg-emerald-500' },
}

const INVOICE_STATUS = {
  paid:    { label: 'Paid',    bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  sent:    { label: 'Sent',    bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  overdue: { label: 'Overdue', bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
  draft:   { label: 'Draft',   bg: 'bg-zinc-700/40',    text: 'text-zinc-400',    border: 'border-zinc-700'        },
}

const SYMBOL = { GBP: '£', USD: '$', EUR: '€' }
function fmt(amount, currency = 'GBP') {
  return `${SYMBOL[currency] ?? currency + ' '}${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Page extractor ────────────────────────────────────────────────────────────
const PAGE_EXTRACTOR_SYSTEM = `Output ONLY a valid JSON array of page objects. Every page must have a unique filename. Never include the same page twice. The homepage must appear exactly once with filename index.html. For filenames use only lowercase letters, numbers and hyphens — no special characters, no ampersands, no spaces. For page names use plain readable English with no special characters — replace ampersands with the word and. Each object must have two keys: name which is the page name for example Home, About, Services, Contact, and filename which is the HTML filename for example index.html, about.html, services.html, contact.html. Output only the raw JSON array with no explanation and no markdown code blocks.`

const AUTORUN_STAGES = [
  { key: 'researcher', label: 'Researcher', description: 'auto approve and move to Designer' },
  { key: 'designer',   label: 'Designer',   description: 'auto approve and move to Developer' },
  { key: 'developer',  label: 'Developer',  description: 'auto approve and move to Reviewer' },
  { key: 'reviewer',   label: 'Reviewer',   description: 'auto approve and mark as Ready for Delivery' },
]

function autoRunStorageKey(projectId) {
  return `forge_autorun_${projectId}`
}

function sanitiseExtractedPages(pages) {
  return pages
    .map(p => ({
      name:     p.name.replace(/&/g, 'and').replace(/[^a-zA-Z0-9 \-\.]/g, '').trim(),
      filename: p.filename.replace(/&/g, 'and').replace(/[^a-zA-Z0-9\s\-\.]/g, '').replace(/\s+/g, '-').toLowerCase(),
    }))
    .filter((page, index, self) => index === self.findIndex(p => p.filename === page.filename))
}

// ── Agent system prompts ──────────────────────────────────────────────────────
const RESEARCHER_SYSTEM = `You are an expert web research analyst for a web design agency. When given a client brief you will research the industry, target audience, competitor websites, content strategy and SEO keywords. Produce a thorough structured research report. Always start with a title and one-paragraph summary. Use ## for main section headings, ### for subheadings, **bold** for key terms, - for bullet lists, and --- between major sections. Use clear markdown formatting throughout.`

const DESIGNER_BRIEF_SYSTEM = `You are an expert UI/UX designer for a web design agency. You will be given a client brief and a research report. Produce a detailed design brief. Always start with a title and one-paragraph summary. Use ## for main section headings such as Brand Direction, Colour Palette, Typography, Layout Structure, Component Specifications, and User Experience Notes. Use ### for subheadings, **bold** for key values like hex codes and font names, - for bullet lists, and --- between major sections. Use clear markdown formatting throughout.`

const DESIGNER_SUMMARY_SYSTEM = `You are a design brief summariser. Take the following detailed design brief and extract only the essential information needed to generate an SVG wireframe layout. Output a concise summary of maximum 300 words covering: page sections and their layout structure, key content elements in each section, and any important layout notes. Do not include colour hex codes, typography details, or brand philosophy.`

const DEV_SUMMARY_SYSTEM = `You are a technical summariser. Take the following design brief and research report and extract only the information a web developer needs to build the site. Output a concise summary of maximum 400 words covering: the list of pages to build, colour palette with hex codes, typography choices with font names, key layout requirements per page, any specific components or interactions required, and technical integrations needed. Ignore brand philosophy, market research, competitor analysis and anything that is not directly relevant to writing HTML CSS and JavaScript. Always include a dedicated Animation Requirements section in your summary containing: the animation style preference, any hero animation preferences, and any custom special effects described. This section must never be omitted even if the brief is very long.`

const SVG_JSON_RULE = `Output ONLY a valid JSON array with no explanation and no markdown code blocks. Each item in the array represents a shape and must have these fields: type (either rect or text), x (number), y (number), width (number, required for rect), height (number, required for rect), label (string, plain ASCII text only, required for text elements), fontSize (number, for text only, default 14). No other fields. No special characters in any string values.`

const SVG_SPACING_RULES = ` STRICT SPACING RULES: Never place a text element within 20px of another element. Every rect must have at least 10px padding from its container rect — inner rects must start at least 10px inside the outer rect on all sides. Text elements inside a rect must have their y position set to the rect y plus at least 25px so text never sits on the edge of a box. Never overlap two rect elements unless one is intentionally a container for the other. Section label text (short uppercase words like HERO or ABOUT) must be placed at least 30px above the first content element in that section.`

const SVG_NAV_SYSTEM     = SVG_JSON_RULE + SVG_SPACING_RULES + ` You are generating the navigation bar wireframe. Work within the vertical band y=0 to y=80. The minimum height for this section is 80px. Width is 1200px. Design a navigation layout appropriate for this site type and brand aesthetic — the arrangement of the logo, links and any utility elements should reflect the brand personality described in the brief. A playful or creative brand might use an unconventional layout; a corporate or professional brand might use a clean structured grid.`
const SVG_HERO_SYSTEM    = SVG_JSON_RULE + SVG_SPACING_RULES + ` You are generating the hero section wireframe. Work within the vertical band y=100 to y=600. The minimum height for this section is 500px. Width is 1200px. Create a hero section appropriate for this type of site and brand — do not default to a standard split layout. A bold brand may use a full-bleed tall hero with a single dominant element; a minimal brand may use compact typographic content; a portfolio site may lead with a large image placeholder; a service business may use overlapping content zones. Decide the hero height and internal arrangement based on the brief, mood and site type. Include only the content elements appropriate for this particular brand.`
const SVG_CONTENT_A_SYSTEM = SVG_JSON_RULE + SVG_SPACING_RULES + ` You are generating the first content area wireframe. Work within the vertical band y=620 to y=1020. The minimum height for this section is 400px. Width is 1200px. Design this section based on the site type and brand aesthetic — it could be a features grid, services overview, about summary, portfolio highlights or any section appropriate to the brief. The number of columns, proportions and internal arrangement should vary based on the brand personality: asymmetric and varied for playful brands, structured and grid-based for corporate brands.`
const SVG_CONTENT_B_SYSTEM = SVG_JSON_RULE + SVG_SPACING_RULES + ` You are generating the second content area wireframe covering two distinct sections. Work within the vertical band y=1040 to y=1640. The minimum height for this section is 600px total, at least 400px per sub-section. Width is 1200px. Choose two section types appropriate to this site — for example testimonials and a CTA band, a portfolio grid and a contact teaser, a team section and a stats row, or any combination that fits the brief. Do not use generic placeholder names — infer appropriate section types from the brief. Each section should have a background rect, a heading, and content elements arranged to reflect the brand aesthetic. Vary the proportions and layout between the two sections.`
const SVG_FOOTER_SYSTEM  = SVG_JSON_RULE + SVG_SPACING_RULES + ` You are generating the footer wireframe. Work within the vertical band y=1660 to y=1810. The minimum height for this section is 150px. Width is 1200px. Design a footer appropriate for this site type and brand — include elements relevant to the site such as logo, navigation links, contact details, social links or newsletter signup, chosen and arranged based on the brief. A minimal brand may use a single-row footer; a content-rich site may use a multi-column layout.`

const LAYOUT_SEEDS = [
  'Asymmetric split layout with large image left and text right',
  'Centered editorial layout with full width hero and narrow content column',
  'Bold typographic layout with oversized text and minimal imagery',
  'Grid based modular layout with equal columns and structured sections',
  'Diagonal and angled sections breaking the standard horizontal layout',
  'Overlapping elements with layered depth and offset cards',
  'Minimal whitespace heavy layout with sparse content and large negative space',
  'Dynamic zigzag layout alternating image and text left and right per section',
]

const DEVELOPER_STACK_SYSTEM = `You are an expert web developer. Based on the client brief, research report and design brief provided, output ONLY two sections: first a Tech Stack section recommending specific technologies with a one sentence reason for each choice, second a File Structure section showing the complete folder and file structure for the project as a simple indented text tree. Be concise and specific. Use markdown formatting.`

const DEVELOPER_CSS_SYSTEM = `You are an expert web developer. Based on the design brief output ONLY a complete external CSS stylesheet. No HTML, no JavaScript, no style tags — just raw CSS rules. Use the exact colours, fonts, spacing and layout from the design brief. Define all colours and fonts as CSS custom properties at the top. Use clear, consistent class names and IDs that will be referenced by the HTML and JavaScript. Output raw CSS only with no explanation and no markdown code blocks.

CRITICAL CSS RULE — Never use width: 1200px or any other fixed pixel width on any container, wrapper, section or div. Always use width: 100% combined with max-width: 1200px and margin: 0 auto for centering. The correct pattern is always: width: 100%; max-width: 1200px; margin: 0 auto; — never just width: 1200px alone. This applies to every container class including .container, .wrapper, .content, .inner, .section-inner and any similar class. A fixed pixel width will break the layout on screens narrower than that width and will fail the quality check.

Quality requirements you must follow without exception: Use a max-width of 1400px or wider for the main container — never restrict content to a narrow column on large screens. Always use width: 100% with a max-width and margin: 0 auto for centering — never use a fixed pixel width that would look narrow on large monitors. All layouts must be fully responsive with proper breakpoints at 1200px, 1024px, 768px and 480px. The mobile navigation hamburger menu must be fully implemented in CSS with a visible hamburger icon at 768px and below — use a checkbox hack or CSS classes toggled by JavaScript. Typography must scale fluidly — use clamp() for font sizes where appropriate. Never use fixed heights on sections — use min-height with padding instead. Images must use max-width: 100% and height: auto. Flexbox and Grid layouts must have proper fallbacks and wrapping. Test every layout mentally at 320px, 768px, 1280px and 2560px widths before outputting.

You must always include rules for these three JavaScript-driven state classes: (1) .scrolled — applied to the header when the user scrolls past 80px, style with a solid background colour and box-shadow so the header is readable over page content; (2) .is-open — applied to the mobile menu element when the hamburger is clicked, use display: block and max-height: 100vh so the menu becomes visible; (3) .error — applied to form inputs that fail validation, style with a red border (border-color: #ef4444) and a light red background (background-color: #fef2f2). These classes are always added by script.js so they must always have a matching CSS rule.

You must always define CSS rules for every class that JavaScript commonly toggles. Include these rules in every stylesheet without exception: .expanded — used for accordion and expandable content, set max-height to a large value like 1000px with overflow hidden and transition max-height 0.3s ease. .active — used for active navigation links and active states, set appropriate highlight colour using the primary accent. .is-open — used for open dropdown menus and mobile nav, set display block or max-height to a large value. .is-visible — used for elements revealed on scroll, set opacity 1 and transform none. .scrolled — used for header scroll state, set appropriate background and box shadow. .open — used for open states on toggles, set display block. .hidden — set display none. .visible — set opacity 1 and visibility visible. .collapsed — set max-height 0 and overflow hidden. Never output a CSS file that is missing rules for any of these classes.

You must always define CSS rules for these commonly used JavaScript toggle classes: .active, .is-open, .is-visible, .scrolled, .animated, .in-view. Define each one with sensible default styles that match the design — for example .active on a nav link should apply the primary accent colour and an underline, .active on a menu or dropdown should set display: block or max-height to a large value, .active on a tab panel should set display: block, .active on a hamburger button should transform the three bar spans into an X shape using rotate transforms. Never let the JavaScript use a class that has no corresponding CSS rule.

You must add clear comments throughout the CSS file explaining what each block of styles affects. Use this exact format for major sections:
/* ============================================
   SECTION NAME - affects [html element/class description]
   ============================================ */
before every group of related styles. For individual properties or small groups add inline comments like this: /* affects the hero headline font size on desktop */ or /* controls mobile menu slide-in animation */. Every CSS rule that targets a specific component must have a comment above it explaining which part of the HTML it styles. Group all related styles together under their section comment — for example all navigation styles under a NAVIGATION comment, all hero styles under a HERO comment, all card styles under a CARDS comment and so on. Never output CSS without comments. This is mandatory for maintainability.

MANDATORY RESPONSIVE DESIGN REQUIREMENTS — these are non-negotiable and must be implemented on every single project without exception: 1) Always include a viewport meta tag in the HTML head: meta name=viewport content=width=device-width initial-scale=1.0. 2) Never use fixed pixel widths on layout containers — always use width 100% with a max-width for desktop. 3) All grid layouts must use CSS Grid with repeat(auto-fit, minmax(280px, 1fr)) or Flexbox with flex-wrap wrap so columns automatically stack on small screens. 4) Include these three breakpoints as a minimum in every stylesheet: max-width 1024px for tablet, max-width 768px for mobile landscape, max-width 480px for mobile portrait. 5) At 768px and below: the navigation must collapse to a hamburger menu, all multi-column layouts must become single column, font sizes must reduce by 20 to 30 percent, padding and margins must reduce, any fixed heights must be removed or changed to min-height auto. 6) At 480px and below: body font size minimum 16px for readability, buttons must be minimum 44px tall for touch targets, images must be width 100%, no horizontal scrolling under any circumstances — test by mentally tracing every element at 320px width. 7) Use clamp() for fluid typography on headings: clamp(1.5rem, 4vw, 3rem) so text scales smoothly between mobile and desktop. 8) Never use position absolute on elements inside sections without checking they do not break layout on mobile.

HERO VISIBILITY — CRITICAL: Always set opacity: 1 and visibility: visible as the default state on hero headlines, hero subheadings, hero CTAs and any other above-the-fold content. Never set these elements to opacity: 0 in CSS — let JavaScript handle initial hidden states only when absolutely necessary and always with a guaranteed animation to restore visibility.`

const DEVELOPER_JS_SYSTEM = `You are an expert web developer. You are given the CSS stylesheet already written. Use the exact same class names and IDs from that CSS. Write all interactions, animations, navigation behaviour, form handling and any other dynamic functionality. IntersectionObserver callbacks must add the exact same class names that the CSS uses to reveal elements — never use animate-in if the CSS expects visible, or any other mismatch. Output raw JavaScript only with no HTML, no CSS, no script tags, no explanation and no markdown code blocks.

GSAP ANIMATION LIBRARY — MANDATORY:
Always use GSAP as the primary animation library. The HTML file will already include these two CDN script tags in the head before script.js — do not add them in your JavaScript output, they are handled by the HTML developer:
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
At the very top of your script, after the opening comment block, register ScrollTrigger: gsap.registerPlugin(ScrollTrigger);
Wrap all GSAP setup code in a DOMContentLoaded listener. Wrap all ScrollTrigger animations in a window load listener to ensure all elements and images are fully ready before scroll positions are calculated.

ANIMATION STYLE — READ FROM BRIEF AND IMPLEMENT ACCORDINGLY:
The brief will specify an Animation style field. Implement it as follows:
- Subtle and professional: use gentle opacity and y-axis fade-ins on scroll. fromVars: { opacity: 0, y: 30 }, toVars: { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }. Use ScrollTrigger with start: 'top 85%'.
- Modern and dynamic: use staggered reveals, parallax section backgrounds, and smooth scale transforms on scroll. Mix fromVars including y, scale and opacity. Use scrub: 1 for parallax elements. Apply stagger: 0.15 on grouped elements.
- Bold and creative: use dramatic x or y axis slides (x: ±100, y: 80), rotation effects (rotation: 10), staggered timeline sequences (gsap.timeline with ScrollTrigger), and scale animations (scale: 0.8). Make entrances feel intentional and energetic.
- Minimal: apply only a single simple fade-in on DOMContentLoaded for the entire page body (opacity 0 to 1, duration 0.4). No ScrollTrigger, no scroll animations whatsoever.
- Custom: read the special effects description from the brief and implement the requested effects as closely as possible using GSAP.

ANIMATION VARIETY — MANDATORY RULES:
Never use the same animation pattern twice in the same file. Vary entrance directions across sections — some from bottom (y: 40), some from left (x: -60), some from right (x: 60). Vary durations between 0.4 and 1.2 seconds. Vary easing between 'power2.out', 'back.out(1.2)' and 'expo.out'. Always use stagger (stagger: 0.1 to 0.2) on grouped elements such as cards, team members, testimonials, service items, and list items.

HERO ANIMATION — READ FROM BRIEF AND IMPLEMENT:
The brief will specify a Hero animation preference field. Implement each selected option:
- Fade in: gsap.from(heroElement, { opacity: 0, y: 20, duration: 1, ease: 'power2.out' }) on DOMContentLoaded.
- Parallax scroll: add a ScrollTrigger scrub parallax to the hero background image — gsap.to(heroBg, { yPercent: 40, ease: 'none', scrollTrigger: { trigger: heroSection, start: 'top top', end: 'bottom top', scrub: true } }).
- Typewriter text: implement a GSAP character-by-character text reveal on the hero headline — split the text into individual character spans and stagger animate them in with opacity and slight y movement.
- Gradient animation: use gsap.to() with repeat: -1 and yoyo: true to smoothly cycle the hero background through 3 brand-relevant colours using CSS custom properties or direct style changes.
- Video background: add a note in the code: /* VIDEO BACKGROUND REQUESTED — add a <video> tag as the hero background in HTML with autoplay muted loop playsinline attributes */.
- Particle background: add a note in the code: /* PARTICLE BACKGROUND REQUESTED — load tsParticles via CDN: <script src="https://cdn.jsdelivr.net/npm/tsparticles@2/tsparticles.bundle.min.js"></script> then initialise with tsParticles.load("tsparticles", { particles: { number: { value: 80 }, color: { value: "#ffffff" }, opacity: { value: 0.3 }, size: { value: 3 }, move: { enable: true, speed: 1 } } }) */.
- Custom: implement the specific hero animation described in the brief using GSAP.
If multiple hero animations are selected implement all of them.

FILE HEADER COMMENT — MANDATORY:
Add a comment block at the very top of every JavaScript file in this exact format:
/*
 * Animation Style: [animation style from brief]
 * Hero Animation: [hero animation preferences from brief, comma separated]
 * GSAP Effects Used: [list every GSAP effect implemented, one per line, e.g. fade-in on scroll (sections), stagger reveal (cards), parallax (hero bg), typewriter (hero headline)]
 */

You must implement a fully working mobile navigation menu. The hamburger button must toggle a visible class on the mobile menu making it slide in or fade in. Add event listeners for the hamburger button click, close the menu when a nav link is clicked, and close the menu when clicking outside it. Also implement smooth scroll for anchor links, an IntersectionObserver for scroll animations that adds the exact class names defined in the CSS — check the CSS before using any class name in classList.add(), header scroll behaviour that adds a scrolled class when the user scrolls past 80px, and form validation with proper error and success states.

Advanced JavaScript requirements you must implement correctly without exception: 1) Accordion and FAQ components — any accordion, FAQ, dropdown or collapsible element must be fully functional. Implement using this exact pattern: add a click event listener to every trigger button, on click toggle an is-open or active class on the parent container, use CSS max-height transition from 0 to max-content for smooth animation, set aria-expanded attribute to true or false on the trigger, never leave accordion content permanently visible — it must always start closed and only open on click. 2) Tabs — any tabbed interface must show only the active tab content and hide all others using display none and display block, switching on click with an active class on the selected tab button. 3) Sliders and carousels — any slider must actually slide, implement with CSS transform translateX and JavaScript tracking the current index, include previous and next button functionality and dot indicator updates. 4) Modal and lightbox — any modal must be hidden by default with display none, shown on trigger click, closed on overlay click or close button click, with body scroll locked while open. 5) Smooth scroll — all anchor links must use smooth scrolling, implement with document.querySelectorAll and scrollIntoView with behavior smooth. 6) Form validation — all forms must validate on submit, check required fields are not empty, validate email format with regex, show inline error messages below invalid fields, only submit if all validation passes. 7) Counter and number animations — any stat counters must animate from 0 to the target number on scroll into view using IntersectionObserver. 8) Before outputting your JavaScript mentally trace through every interactive element in the HTML and confirm each one has a working event listener. List every interactive component at the end of your output as a comment showing: component name, trigger selector, action taken — this acts as a self-audit to confirm nothing was missed.

SUPABASE AUTH — IMPLEMENT WHEN AUTHENTICATION IS REQUESTED:
When the brief specifies that authentication is required you must implement a fully working Supabase Auth integration. Here is exactly how to do it: 1) Add the Supabase JS client via CDN by adding this script tag in the HTML head: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script> — note this must be added before script.js and is handled by the HTML developer, do not add script tags in your JavaScript output. 2) Initialise the Supabase client at the top of script.js using: const supabaseUrl = 'YOUR_SUPABASE_URL' and const supabaseKey = 'YOUR_SUPABASE_ANON_KEY' and const supabase = window.supabase.createClient(supabaseUrl, supabaseKey) — use placeholder values that the client will replace with their own Supabase project credentials. 3) Implement email and password sign up using supabase.auth.signUp with email and password. 4) Implement email and password login using supabase.auth.signInWithPassword. 5) If Google login is requested implement using supabase.auth.signInWithOAuth with provider google. 6) If magic link is requested implement using supabase.auth.signInWithOtp with email. 7) Implement sign out using supabase.auth.signOut. 8) Implement session checking using supabase.auth.getSession on page load — if a session exists show the authenticated state of the page, if no session exists redirect to the login page or show the login form. 9) Implement an auth state listener using supabase.auth.onAuthStateChange to handle login and logout events in real time. 10) For protected content — wrap any protected sections in a div with class protected-content and set it to display none by default, only showing it when a valid session is detected. 11) Add a comment block at the top of the auth section of the JS file in this exact format: /* SUPABASE AUTH SETUP — Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_ANON_KEY with your project credentials from supabase.com/dashboard */

SUPABASE STORAGE — IMPLEMENT WHEN DOWNLOADABLE FILES ARE REQUESTED:
When downloadable files are requested implement Supabase Storage integration as follows: 1) For public downloads create a function called downloadFile that takes a bucket name and file path, calls supabase.storage.from(bucketName).getPublicUrl(filePath) to get the public URL, then triggers a download by creating a temporary anchor element with the href set to the public URL and the download attribute set to the filename and clicking it programmatically. 2) For protected downloads create a function called downloadProtectedFile that first checks for a valid Supabase auth session using supabase.auth.getSession — if no session exists redirect to the login page; if a session exists call supabase.storage.from(bucketName).createSignedUrl(filePath, 60) to generate a temporary signed URL valid for 60 seconds, then trigger the download using the same anchor approach. 3) Add click event listeners to all download buttons in the HTML — read the data-bucket and data-file attributes from each button and pass them to the appropriate download function. 4) Add a comment block above the storage section of the JS file in this exact format: /* SUPABASE STORAGE SETUP — Create a storage bucket in your Supabase dashboard and upload your files there. Update the bucket name and file paths in the download buttons to match your uploaded files. Set the bucket to public for public downloads or private for protected downloads */

CRITICAL ANIMATION RULE — Never animate hero text or hero content with opacity 0 as a starting state unless you are 100% certain the animation will complete successfully. For hero sections specifically always use this safe pattern: set the initial state AFTER the element is visible by using gsap.from() instead of gsap.set() followed by gsap.to(). Use gsap.from(".hero-content", { opacity: 0, y: 30, duration: 1, ease: "power2.out" }) which starts invisible and animates to the natural visible state — never use gsap.set(".hero-content", { opacity: 0 }) without a guaranteed follow-up animation. Always wrap hero animations in a window load event listener not DOMContentLoaded to ensure all resources are ready before animating. Always add a failsafe by setting a CSS rule .hero-content { opacity: 1 } as the default and only overriding it with GSAP — this way if GSAP fails to load or the animation errors the content remains visible. Never use ScrollTrigger on hero elements since the hero is already in view on page load — ScrollTrigger animations only trigger when elements scroll into view which means if the hero is the starting point the animation may never fire.`

const DEVELOPER_HTML_SYSTEM = `You are an expert web developer. You are given the CSS and JavaScript files already written. Use the exact same class names and IDs from those files. In the head section include: meta charset UTF-8, meta viewport, the page title, any Google Fonts links from the CSS, and a link tag with rel=stylesheet href=styles.css. Just before the closing body tag include the following script tags in this exact order: first the GSAP CDN script, then the ScrollTrigger CDN script, then the main script.js — like this:
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
<script src="script.js"></script>
No inline styles, no inline JavaScript. Output raw HTML only with no explanation and no markdown code blocks.

The HTML must include a properly structured mobile navigation with a hamburger button element containing three span elements for the three bars, and a mobile menu div that is hidden by default and shown by JavaScript. The hamburger button must have a clear class name that matches what the CSS and JavaScript expect. Every section must span the full browser width with content centred inside a max-width container — never restrict the section itself to a narrow width. Use semantic HTML5 elements throughout — header, nav, main, section, article, aside, footer.

You must add a clear HTML comment before every section and major component marking what it is. Use this exact format:
<!-- ============================================
     SECTION NAME - brief description
     ============================================ -->
before every section element, header, footer, navigation, hero, and any other major component. Never output HTML without section comments. This is mandatory for code readability and maintainability.

The head section of every HTML file must always include this exact meta tag as the second line after the charset meta tag: meta name=viewport content=width=device-width initial-scale=1.0 — never omit this tag under any circumstances as without it the site will not be responsive on mobile devices.

SUPABASE AUTH — HTML REQUIREMENTS WHEN AUTHENTICATION IS REQUESTED:
When authentication is required include a login modal or login page with: an email input field, a password input field, a submit button labelled Sign in, a sign up link below the form, a Forgot password link, and if Google login is requested a Sign in with Google button with the Google logo. Also include a user account indicator in the navigation — when the user is logged out show a Login button that opens the login modal or links to login.html; when the user is logged in show the user email address and a Logout button. Both states should be in the HTML with one hidden by default — use class logged-out-nav and logged-in-nav so JavaScript can toggle between them. When the Supabase CDN script is required add this script tag in the head before script.js: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

SUPABASE STORAGE — HTML REQUIREMENTS WHEN DOWNLOADABLE FILES ARE REQUESTED:
When downloadable files are requested include a downloads section or downloads page with a clean file listing. Each file entry should show: a file type icon (use an inline SVG or a simple emoji like 📄 for PDF, 🖼 for image, 🎬 for video, 🎵 for audio, 📦 for ZIP), the file name, a file size placeholder in parentheses such as (2.4 MB), and a Download button. Each download button must have a data-bucket attribute set to your-bucket-name and a data-file attribute set to the filename including extension such as filename.pdf. Style the download button with a clear download arrow icon and a distinct hover state using the primary accent colour. Group files by type if multiple file types are present.`

const DEVELOPER_PAGES_SYSTEM = `You are an expert web developer. Based on the client brief and design brief output ONLY a detailed implementation guide for all remaining pages and components that need to be built after the homepage. For each page or component include: the filename, the key HTML structure needed, any specific CSS notes, and any JavaScript interactions required. Use markdown formatting.

SUPABASE AUTH — ADDITIONAL PAGES WHEN AUTHENTICATION IS REQUESTED:
When authentication is required include these dedicated pages in the implementation guide: 1) login.html — a standalone login page with an email and password form, a Sign in with Google button if Google login is requested, a magic link option if magic link is requested, a link to signup.html, and a Forgot password link. On load check for an existing session using supabase.auth.getSession and redirect to the members area if already logged in. 2) signup.html — a standalone sign up page with email, password, and confirm password fields, a submit button that calls supabase.auth.signUp, and a success message telling the user to check their email. Include a link back to login.html. 3) A members area or dashboard page (e.g. dashboard.html or members.html) — for authenticated users only. On load call supabase.auth.getSession and redirect to login.html if no session exists. Show the user email, a personalised welcome message, the protected content from the brief, and a visible Logout button. Include implementation notes explaining that the page is protected and the session check must be the first thing that runs on DOMContentLoaded.

SUPABASE STORAGE — ADDITIONAL PAGES WHEN DOWNLOADABLE FILES ARE REQUESTED:
When downloadable files are requested include a dedicated downloads.html page in the implementation guide with: a full file library layout showing all available files as cards or rows, search functionality using an input that filters the visible file list by filename in real time using JavaScript, filter buttons by file type so users can show only PDFs, only images etc., a file count indicator showing how many files are shown versus total, and implementation notes for: how to create the storage bucket in the Supabase dashboard, how to set bucket permissions to public or private, how to upload files and copy their paths, and how to update the data-bucket and data-file attributes in the HTML to match the uploaded files. If protected downloads are requested add a note that the page should check for a valid session on load and redirect to login.html if none exists.`

const SETUP_GUIDE_SYSTEM = `You are a technical writer creating a simple step-by-step setup guide for a non-technical website owner. Based on the features requested write a clear friendly guide explaining how to set up their Supabase project. Use simple numbered steps with no jargon. Where it helps understanding, describe what the user will see on screen. Cover only the features that were requested. Structure the guide with clear markdown headings. Write in a warm and reassuring tone — the reader is not a developer.

Always include these sections when relevant to the features requested:
1. How to create a free Supabase account
2. How to create a new Supabase project
3. Where to find your project URL and anon key
4. How to enable the authentication providers selected (email/password, Google login, magic link)
5. How to create a storage bucket and set its permissions
6. How to upload files to the storage bucket
7. How to update the website files with your Supabase credentials
8. How to test that login and file downloads are working

End the guide with this exact note as a final section: ---\n\n*This guide was prepared by Forge Agency. If you need help with setup, please contact us.*`

const PROJ_ORCHESTRATOR_SYSTEM = `You are the orchestrator for an AI web design agency. You will be given a detailed structured client brief. Break it down into four clearly labelled task lists for: 1) Researcher — what to research about the industry, audience, competitors and SEO. 2) Designer — what design decisions to make, what pages to wireframe, what brand direction to follow. 3) Developer — what pages to build, what technical requirements to implement, what integrations to set up. 4) Reviewer — what specific things to check against the brief during the quality review. Be specific and actionable for each agent. Use markdown formatting with clear headings.`

const _FIX = (role) => `You are an expert ${role} making a targeted fix to your previous output. You will be given the original brief, your previous output and a specific issue to fix. Your job is to fix ONLY what has been described and leave everything else completely identical. Do not rewrite, restructure or improve anything that was not mentioned in the fix request. Output only the complete fixed version with no explanation, no preamble and no commentary.`

const RESEARCHER_FIX_SYSTEM      = _FIX('web research analyst')
const DESIGNER_FIX_SYSTEM        = _FIX('UI/UX designer')
const DEVELOPER_STACK_FIX_SYSTEM = _FIX('web developer specialising in tech stack and project structure')
const DEVELOPER_CSS_FIX_SYSTEM   = `You are an expert CSS specialist making a targeted fix. Fix ONLY what has been described. The HTML and JavaScript files are provided for reference — your output must remain compatible with them. Output only the complete fixed CSS file with no explanation and no markdown code blocks.`
const DEVELOPER_JS_FIX_SYSTEM    = `You are an expert JavaScript developer making a targeted fix. Fix ONLY what has been described. The HTML and CSS files are provided for reference — use the exact same class names and IDs. Output only the complete fixed JavaScript file with no explanation and no markdown code blocks.`
const DEVELOPER_HTML_FIX_SYSTEM  = `You are an expert HTML developer making a targeted fix. Fix ONLY what has been described. The CSS and JavaScript files are provided for reference — use the exact same class names and IDs. Output only the complete fixed HTML file with no explanation and no markdown code blocks.`
const DEVELOPER_PAGES_FIX_SYSTEM = _FIX('web developer specialising in multi-page implementation planning')

const REVIEWER_SYSTEM = `You are a senior quality assurance reviewer for a web design agency. You have just reviewed a complete website build. Write your review as if you are a knowledgeable colleague giving honest feedback to the project team — use natural conversational language, not a technical checklist. Structure your report as follows using markdown formatting: Start with a friendly opening paragraph giving your overall impression of the build in 3-4 sentences. Then write a section called What is working well — write this as flowing prose describing the strongest aspects of the build, minimum 2 paragraphs. Then write a section called Areas that need attention — describe each issue conversationally explaining what the problem is, why it matters to the end user or the client, and what the fix should be. Group related issues together rather than listing them one by one. Then write a section called Priority fixes — list the top 5 most important things to fix before launch, written as clear plain English action items. Then write a section called Nice to have improvements — things that would make the site better but are not blocking launch. End with a short paragraph giving an overall score out of 10 with a genuine explanation of why you gave that score. Throughout the report write as if you are talking to a colleague — use we and the team naturally, avoid bullet point lists where possible and write in paragraphs instead, never use jargon without explaining it, and be constructive and encouraging even when flagging problems.`

const REVIEWER_FIX_SYSTEM = `You are a senior quality assurance reviewer making a targeted revision to your previous review report. Fix ONLY what has been described. The client brief, research report, design brief and code files are provided for reference. Output only the complete revised review report with no explanation and no preamble.`

function devHtmlPageSystem(pageName) {
  return `You are an expert web developer. Generate the complete HTML file for the ${pageName} page. Use the shared styles.css and script.js files already generated. Make sure the navigation links to all other pages using their correct filenames. Use the design brief and the specific wireframe for this page as reference. Output raw HTML only with no explanation and no markdown code blocks.

The following script tags must be included on every page in this exact order. In the head section before the closing head tag include: first link rel=stylesheet href=styles.css. Just before the closing body tag include these four tags in order: first script src=https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js, second script src=https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js, third script src=script.js. Never omit the GSAP script tags — they must be present on every page for animations to work.

Add appropriate CSS classes and IDs to all elements that will be animated: hero sections should have class hero-animate, section headings should have class heading-animate, cards and grid items should have class card-animate, and the hero headline should have class hero-headline if a typewriter effect is requested in the brief.

The HTML must include a properly structured mobile navigation with a hamburger button element containing three span elements for the three bars, and a mobile menu div that is hidden by default and shown by JavaScript. The hamburger button must have a clear class name that matches what the CSS and JavaScript expect. Every section must span the full browser width with content centred inside a max-width container — never restrict the section itself to a narrow width. Use semantic HTML5 elements throughout — header, nav, main, section, article, aside, footer.

You must add a clear HTML comment before every section and major component marking what it is. Use this exact format:
<!-- ============================================
     SECTION NAME - brief description
     ============================================ -->
before every section element, header, footer, navigation, hero, and any other major component. Never output HTML without section comments. This is mandatory for code readability and maintainability.`
}

function devHtmlPageFixSystem(pageName) {
  return `You are an expert HTML developer making a targeted fix to the ${pageName} page. Fix ONLY what has been described. The CSS and JavaScript files are provided for reference — use the exact same class names and IDs. Make sure navigation links to all other pages use correct filenames. Output only the complete fixed HTML file with no explanation and no markdown code blocks.`
}

// ── Wireframe section helpers (module-level, reused by designer + regenerate) ─

async function callJsonSection(system, userContent, label, tokenCallsList) {
  const { text: raw, inputTokens, outputTokens } = await streamAnthropicCall({
    messages:     [{ role: 'user', content: userContent }],
    systemPrompt: system,
    model:        'claude-sonnet-4-20250514',
    maxTokens:    30000,
  })
  if (tokenCallsList) tokenCallsList.push({ label, input_tokens: inputTokens, output_tokens: outputTokens })
  console.log(`[Designer] raw JSON for ${label} (${raw.length} chars):`, raw.slice(0, 500))
  const shapes = parseJsonSection(raw, label)
  console.log(`[Designer] parsed shapes for ${label}:`, shapes.length)
  return shapes
}

async function generatePageWireframe(briefSummary, page, tokenCallsList, moodboardJson, excludeSeed) {
  // Pick a random layout seed, excluding the current one if requested
  const availableSeeds = excludeSeed
    ? LAYOUT_SEEDS.filter(s => s !== excludeSeed)
    : LAYOUT_SEEDS
  const layoutSeed = availableSeeds[Math.floor(Math.random() * availableSeeds.length)]

  // Build brand context from moodboard if available
  let brandCtx = ''
  if (moodboardJson) {
    try {
      const mb = typeof moodboardJson === 'string' ? JSON.parse(moodboardJson) : moodboardJson
      const moodWords = (mb.mood_words ?? []).join(', ')
      const uiStyle   = mb.ui_style ?? ''
      const imagery   = mb.imagery_direction ?? ''
      brandCtx = `\n\nBrand Context:\n- Mood: ${moodWords}\n- UI Component Style: ${uiStyle}\n- Imagery Direction: ${imagery}`
    } catch { /* moodboard parse failed — proceed without it */ }
  }

  const RAND = `You must produce a unique layout — vary the arrangement, proportions and composition from standard templates. Do not use the same layout twice. Consider the site type, brand aesthetic and content requirements when deciding on layout. For example a portfolio site hero should look different from a corporate site hero. The overall layout style for this wireframe must follow this approach: ${layoutSeed}. All sections must feel consistent with this layout direction. `

  const ctx = `Design Brief Summary:\n\n${briefSummary}${brandCtx}\n\nLayout Style: ${layoutSeed}\n\nThis wireframe is for the ${page.name} page (filename: ${page.filename}).`
  const pageNote = ` This wireframe is for the ${page.name} page (${page.filename}). Generate layout structure appropriate for this specific page type.`

  const [nav, hero, contentA, contentB, footer] = await Promise.all([
    callJsonSection(RAND + SVG_NAV_SYSTEM      + pageNote, ctx, `${page.filename}-Nav`,      tokenCallsList),
    callJsonSection(RAND + SVG_HERO_SYSTEM     + pageNote, ctx, `${page.filename}-Hero`,     tokenCallsList),
    callJsonSection(RAND + SVG_CONTENT_A_SYSTEM + pageNote, ctx, `${page.filename}-ContentA`, tokenCallsList),
    callJsonSection(RAND + SVG_CONTENT_B_SYSTEM + pageNote, ctx, `${page.filename}-ContentB`, tokenCallsList),
    callJsonSection(RAND + SVG_FOOTER_SYSTEM   + pageNote, ctx, `${page.filename}-Footer`,   tokenCallsList),
  ])
  return { svg: buildSvgFromShapes([nav, hero, contentA, contentB, footer]), layoutSeed }
}

// ── Orchestrator response parser ──────────────────────────────────────────────
const PIPELINE_AGENTS = ['Researcher', 'Designer', 'Developer', 'Reviewer']

// Matches a line that IS an agent section heading — strips all markdown decoration
// Covers: ## Researcher  ## 1. Researcher  ## 1) Researcher  **Researcher**
//         # Researcher   1. Researcher:   **1. Researcher**  ### Researcher Tasks
const AGENT_HEADING_RE = /^[ \t]*(?:#{1,3}[ \t]+)?(?:\*{1,2})?(?:\d+[.)]\s+)?(?:\*{0,2})(Researcher|Designer|Developer|Reviewer)(?:\*{0,2})(?:[ \t]+(?:Tasks?|Phase|Section|Agent|Work|Report|Brief))?[ \t]*[:\-]?[ \t]*(?:\*{0,2})[ \t]*$/i

function parseResponse(text) {
  if (!text) return null

  // Normalise line endings so \r\n doesn't break heading detection
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  console.log('[Orchestrator] parseResponse — raw preview:', normalised.slice(0, 400))

  const lines = normalised.split('\n')
  const hits = []

  for (let i = 0; i < lines.length; i++) {
    const m = AGENT_HEADING_RE.exec(lines[i])
    if (m) hits.push({ name: m[1], lineIndex: i })
  }

  console.log('[Orchestrator] parseResponse — heading hits:', hits.map(h => `${h.name}@L${h.lineIndex}`))

  if (hits.length < 2) {
    console.log('[Orchestrator] parseResponse — method: FALLBACK (only', hits.length, 'heading(s) matched)')
    return null
  }

  console.log('[Orchestrator] parseResponse — method: SECTIONS (' + hits.length + ' headings found)')

  const sectionMap = {}
  hits.forEach((hit, i) => {
    const content = lines
      .slice(hit.lineIndex + 1, hits[i + 1]?.lineIndex ?? lines.length)
      .join('\n')
      .trim()
    sectionMap[hit.name.toLowerCase()] = content
  })

  return PIPELINE_AGENTS.map(name => ({
    name,
    content: sectionMap[name.toLowerCase()] ?? '',
  }))
}

// ── Developer output parser ───────────────────────────────────────────────────

function splitDeveloperOutput(text) {
  const sections = { techStack: '', fileStructure: '', homepageCode: '', remainingWork: '' }
  if (!text) return sections

  const patterns = [
    { key: 'techStack',      re: /(?:^|\n)#+\s*(?:\d+[\.\)]\s*)?(?:recommended\s+)?tech(?:nology)?\s*stack/i },
    { key: 'fileStructure',  re: /(?:^|\n)#+\s*(?:\d+[\.\)]\s*)?(?:complete\s+)?file\s*structure/i },
    { key: 'homepageCode',   re: /(?:^|\n)#+\s*(?:\d+[\.\)]\s*)?(?:full\s+)?(?:html|homepage)\s*(?:and\s+css\s+)?code/i },
    { key: 'remainingWork',  re: /(?:^|\n)#+\s*(?:\d+[\.\)]\s*)?remaining\s*(?:pages|work|components)/i },
  ]

  const hits = []
  for (const { key, re } of patterns) {
    const m = re.exec(text)
    if (m) hits.push({ key, index: m.index })
  }
  hits.sort((a, b) => a.index - b.index)

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index
    const end   = hits[i + 1]?.index ?? text.length
    sections[hits[i].key] = text.slice(start, end).trim()
  }

  // Fallback: put everything in techStack so nothing is lost
  if (hits.length === 0) sections.techStack = text

  return sections
}

// ── Developer file helpers ────────────────────────────────────────────────────

// Strip markdown code fences (```html, ```css, ```javascript, ``` etc.) from raw API output.
function stripCodeFences(text) {
  return text
    .replace(/^```(?:html|css|javascript|js)?\s*\n?/gim, '')
    .replace(/^```\s*$/gim, '')
    .trim()
}

// CSS rules to patch in for commonly-missing JavaScript-driven state classes.
const CSS_PATCH_RULES = {
  scrolled: `
/* Header scrolled state — added by script.js when user scrolls past 80px */
.scrolled {
  background: #ffffff;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.12);
}`,
  'is-open': `
/* Mobile menu open state — toggled by script.js hamburger handler */
.is-open {
  display: block;
  max-height: 100vh;
  overflow-y: auto;
}`,
  error: `
/* Form field error state — applied by script.js validation */
.error {
  border-color: #ef4444 !important;
  background-color: #fef2f2 !important;
}`,
  active: `
/* Active state — toggled by script.js for nav links, tabs, menus and hamburger button */

/* Nav link active state — highlights the current page link */
nav a.active,
.nav-link.active {
  color: var(--color-primary, #7c3aed);
  text-decoration: underline;
  text-underline-offset: 4px;
  font-weight: 600;
}

/* Dropdown / menu active state — makes a submenu or mobile menu visible */
.menu.active,
.dropdown.active,
.nav-menu.active,
.mobile-menu.active {
  display: block;
  max-height: 100vh;
  overflow-y: auto;
}

/* Tab content active state — shows the selected tab panel */
.tab-content.active,
.tab-panel.active {
  display: block;
}

/* Hamburger button active state — transforms three bars into an X */
.hamburger.active span:nth-child(1),
.menu-toggle.active span:nth-child(1) {
  transform: translateY(8px) rotate(45deg);
}
.hamburger.active span:nth-child(2),
.menu-toggle.active span:nth-child(2) {
  opacity: 0;
}
.hamburger.active span:nth-child(3),
.menu-toggle.active span:nth-child(3) {
  transform: translateY(-8px) rotate(-45deg);
}`,
}

// Cross-file validation: log any classList.add() class names in JS that have no CSS rule.
function validateCrossFileClasses(css, js) {
  if (!css || !js) return
  const addRe = /classList\.add\(['"]([^'"]+)['"]\)/g
  const mismatches = []
  let m
  while ((m = addRe.exec(js)) !== null) {
    const cls = m[1]
    // Check if the CSS contains a rule using this class (e.g. .visible { or .visible:)
    if (!new RegExp(`\\.${cls}[\\s{:,\\[\\+~>]`).test(css)) mismatches.push(cls)
  }
  if (mismatches.length > 0) {
    console.warn('[Dev validation] ⚠ classList.add() class names with NO matching CSS rule:', mismatches)
  } else {
    console.log('[Dev validation] ✓ All classList.add() class names have a matching CSS rule')
  }
}

// ── Post-generation quality check ────────────────────────────────────────────

function stripMediaBlocks(css) {
  let result = ''
  let depth = 0
  let inMedia = false
  let i = 0
  while (i < css.length) {
    if (!inMedia && css.slice(i, i + 6) === '@media') {
      while (i < css.length && css[i] !== '{') i++
      inMedia = true
      depth = 1
      i++
    } else if (inMedia) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') { depth--; if (depth === 0) inMedia = false }
      i++
    } else {
      result += css[i]
      i++
    }
  }
  return result
}

function runQualityCheck(cssText, jsText, htmlOutputs) {
  const warnings = []

  // CSS: fixed widths > 800px outside media queries
  if (cssText) {
    const outsideMedia = stripMediaBlocks(cssText)
    const fixedWidthRe = /\bwidth\s*:\s*(\d+)px/g
    let m
    while ((m = fixedWidthRe.exec(outsideMedia)) !== null) {
      if (parseInt(m[1], 10) > 800) {
        warnings.push(`CSS: fixed width ${m[1]}px found outside a media query — use max-width with width: 100% instead`)
        break
      }
    }
  }

  // JS: hamburger menu event listener
  if (jsText) {
    const hasHamburger = /hamburger|nav[-_]toggle|menu[-_]toggle|menuBtn|navBtn|\.toggle\(/i.test(jsText)
    if (!hasHamburger) {
      warnings.push('JS: no hamburger menu event listener detected — mobile navigation may not work')
    }
  }

  // HTML: hamburger button element in each file
  const htmlRecs = htmlOutputs.filter(o => o.output_text?.trim())
  for (const rec of htmlRecs) {
    const filename = rec.agent_name.startsWith('Developer-HTML-')
      ? rec.agent_name.slice('Developer-HTML-'.length)
      : 'index.html'
    const hasHamburger = /hamburger|nav[-_]toggle|menu[-_]toggle/i.test(rec.output_text)
    if (!hasHamburger) {
      warnings.push(`HTML (${filename}): no hamburger button element found — add a button with three span bars for the mobile menu`)
    }
  }

  return warnings
}

// ── Wireframe helpers ─────────────────────────────────────────────────────────

function parseJsonSection(raw, label) {
  const cleaned = raw
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim()

  // Attempt 1: parse as-is
  try { return JSON.parse(cleaned) } catch {}

  // Attempt 2: repair truncated array — find last complete object and close the array
  if (!cleaned.endsWith(']')) {
    const lastBrace = cleaned.lastIndexOf('}')
    if (lastBrace !== -1) {
      const repaired = cleaned.substring(0, lastBrace + 1) + ']'
      try { return JSON.parse(repaired) } catch {}
    }
  }

  // Attempt 3: extract any [...] substring
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (match) { try { return JSON.parse(match[0]) } catch {} }

  console.error(`[Designer] Failed to parse JSON for ${label}:`, cleaned.slice(0, 300))
  return []
}

const SECTION_META = [
  { name: 'NAV',       dividerY: 80   },
  { name: 'HERO',      dividerY: 600  },
  { name: 'ABOUT',     dividerY: 1020 },
  { name: 'EXP+SKILLS',dividerY: 1640 },
  { name: 'FOOTER',    dividerY: 1810 },
]

function buildSvgFromShapes(sections) {
  const ns  = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('xmlns', ns)
  svg.setAttribute('width', '1200')
  svg.setAttribute('height', '1900')

  // White background
  const bg = document.createElementNS(ns, 'rect')
  bg.setAttribute('width', '1200')
  bg.setAttribute('height', '1900')
  bg.setAttribute('fill', 'white')
  svg.appendChild(bg)

  // Collect text elements for collision detection before appending
  const pendingTexts = [] // { el, yVal }

  // Draw each section's shapes
  sections.forEach((shapes, sectionIdx) => {
    const meta = SECTION_META[sectionIdx]

    // Section label: positioned 15px above the first rect in this section
    // font-size 10, color #999999 so it never collides with content
    if (meta) {
      const firstRect = shapes.find(s => s.type === 'rect')
      const sectionStartY = sectionIdx === 0 ? 0 : (SECTION_META[sectionIdx - 1]?.dividerY ?? 0)
      const labelY = firstRect
        ? Math.max(Number(firstRect.y) - 15, sectionStartY + 10)
        : sectionStartY + 10

      const lbl = document.createElementNS(ns, 'text')
      lbl.setAttribute('x', '8')
      lbl.setAttribute('y', String(labelY))
      lbl.setAttribute('font-family', 'Arial')
      lbl.setAttribute('font-size', '10')
      lbl.setAttribute('fill', '#999999')
      lbl.textContent = meta.name
      svg.appendChild(lbl)
    }

    for (const shape of shapes) {
      if (shape.type === 'rect') {
        const x = Number(shape.x)      || 0
        const y = Number(shape.y)      || 0
        const w = Number(shape.width)  || 0
        const h = Number(shape.height) || 0

        const el = document.createElementNS(ns, 'rect')
        el.setAttribute('x',            String(x))
        el.setAttribute('y',            String(y))
        el.setAttribute('width',        String(w))
        el.setAttribute('height',       String(h))
        el.setAttribute('fill',         '#f5f5f5')
        el.setAttribute('stroke',       '#cccccc')
        el.setAttribute('stroke-width', '1')
        svg.appendChild(el)

        // If the rect has a label, centre it inside the box
        // Enforce y >= rect.y + 25 so text never sits on the box edge
        if (shape.label) {
          const tx = document.createElementNS(ns, 'text')
          tx.setAttribute('x',           String(x + w / 2))
          const textY = Math.max(y + 25, y + h / 2 + 5)
          tx.setAttribute('font-family', 'Arial')
          tx.setAttribute('font-size',   String(Number(shape.fontSize) || 14))
          tx.setAttribute('fill',        '#333333')
          tx.setAttribute('text-anchor', 'middle')
          tx.textContent = String(shape.label)
          pendingTexts.push({ el: tx, yVal: textY })
        }
      } else if (shape.type === 'text') {
        const el = document.createElementNS(ns, 'text')
        const yVal = Number(shape.y) || 0
        el.setAttribute('x',           String(Number(shape.x) || 0))
        el.setAttribute('font-family', 'Arial')
        el.setAttribute('font-size',   String(Number(shape.fontSize) || 14))
        el.setAttribute('fill',        '#333333')
        el.textContent = String(shape.label ?? '')
        pendingTexts.push({ el, yVal })
      }
    }

    // Horizontal divider line at the bottom of this section
    if (meta) {
      const div = document.createElementNS(ns, 'rect')
      div.setAttribute('x',      '0')
      div.setAttribute('y',      String(meta.dividerY))
      div.setAttribute('width',  '1200')
      div.setAttribute('height', '1')
      div.setAttribute('fill',   '#cccccc')
      svg.appendChild(div)
    }
  })

  // Collision detection: sort all text elements by y, then push any element
  // that is within 16px of the previous one down by 20px
  pendingTexts.sort((a, b) => a.yVal - b.yVal)
  for (let i = 1; i < pendingTexts.length; i++) {
    if (pendingTexts[i].yVal - pendingTexts[i - 1].yVal < 16) {
      pendingTexts[i].yVal = pendingTexts[i - 1].yVal + 20
    }
  }

  // Append all text elements with final y values
  for (const { el, yVal } of pendingTexts) {
    el.setAttribute('y', String(yVal))
    svg.appendChild(el)
  }

  return new XMLSerializer().serializeToString(svg)
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let i = 0
  let key = 0

  function parseInline(str) {
    // Handle **bold**
    const parts = str.split(/(\*\*[^*]+\*\*)/)
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  while (i < lines.length) {
    const line = lines[i]

    // --- horizontal rule
    if (/^\s*---\s*$/.test(line)) {
      elements.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid #3f3f46', margin: '12px 0' }} />)
      i++
      continue
    }

    // ## heading
    if (/^##\s/.test(line)) {
      elements.push(
        <p key={key++} style={{ fontSize: 15, fontWeight: 700, color: '#e4e4e7', margin: '16px 0 4px' }}>
          {parseInline(line.replace(/^##\s+/, ''))}
        </p>
      )
      i++
      continue
    }

    // ### subheading
    if (/^###\s/.test(line)) {
      elements.push(
        <p key={key++} style={{ fontSize: 13, fontWeight: 600, color: '#d4d4d8', margin: '12px 0 3px' }}>
          {parseInline(line.replace(/^###\s+/, ''))}
        </p>
      )
      i++
      continue
    }

    // bullet list — collect consecutive - lines
    if (/^-\s/.test(line)) {
      const items = []
      while (i < lines.length && /^-\s/.test(lines[i])) {
        items.push(<li key={items.length} style={{ marginBottom: 3 }}>{parseInline(lines[i].replace(/^-\s+/, ''))}</li>)
        i++
      }
      elements.push(
        <ul key={key++} style={{ paddingLeft: 20, margin: '4px 0 8px', listStyleType: 'disc' }}>
          {items}
        </ul>
      )
      continue
    }

    // numbered list — collect consecutive `N. ` lines
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={items.length} style={{ marginBottom: 3 }}>{parseInline(lines[i].replace(/^\d+\.\s+/, ''))}</li>)
        i++
      }
      elements.push(
        <ol key={key++} style={{ paddingLeft: 20, margin: '4px 0 8px', listStyleType: 'decimal' }}>
          {items}
        </ol>
      )
      continue
    }

    // blank line
    if (line.trim() === '') {
      i++
      continue
    }

    // regular paragraph
    elements.push(
      <p key={key++} style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.7, margin: '3px 0' }}>
        {parseInline(line)}
      </p>
    )
    i++
  }

  return <div style={{ fontFamily: 'sans-serif' }}>{elements}</div>
}

// ── PDF export ────────────────────────────────────────────────────────────────

function downloadPdf({ agentName, projectName, clientName, date, bodyText, note, filename }) {
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const usable = pageW - margin * 2
  let y = margin

  function checkPage(needed = 7) {
    if (y + needed > pageH - margin - 10) {
      doc.addPage()
      y = margin
    }
  }

  function drawText(text, opts = {}) {
    const { size = 11, bold = false, color = [60, 60, 60], indent = 0 } = opts
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, usable - indent)
    for (const line of lines) {
      checkPage()
      doc.text(line, margin + indent, y)
      y += size * 0.45
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Forge Agency', margin, y)
  y += 7
  doc.setDrawColor(180, 180, 180)
  doc.line(margin, y, pageW - margin, y)
  y += 6

  drawText(`Project: ${projectName}`, { size: 14, bold: false, color: [40, 40, 40] })
  y += 1
  drawText(`Client: ${clientName}`, { size: 14, bold: false, color: [40, 40, 40] })
  y += 5

  drawText(agentName, { size: 14, bold: true, color: [30, 30, 30] })
  y += 1
  drawText(`Generated: ${date}`, { size: 10, bold: false, color: [130, 130, 130] })
  y += 6

  if (note) {
    drawText(note, { size: 10, bold: false, color: [110, 110, 110] })
    y += 5
  }

  // ── Body — parse markdown ─────────────────────────────────────────────────
  const lines = (bodyText ?? '').split('\n')
  let listCounter = 0

  for (const line of lines) {
    // --- divider
    if (/^\s*---\s*$/.test(line)) {
      checkPage(5)
      doc.setDrawColor(200, 200, 200)
      doc.line(margin, y, pageW - margin, y)
      y += 5
      continue
    }
    // ## heading
    if (/^##\s/.test(line)) {
      y += 3
      checkPage(8)
      drawText(line.replace(/^##\s+/, '').replace(/\*\*/g, ''), { size: 16, bold: true, color: [50, 50, 50] })
      y += 2
      listCounter = 0
      continue
    }
    // ### subheading
    if (/^###\s/.test(line)) {
      y += 2
      checkPage(6)
      drawText(line.replace(/^###\s+/, '').replace(/\*\*/g, ''), { size: 14, bold: true, color: [70, 70, 70] })
      y += 1
      listCounter = 0
      continue
    }
    // bullet
    if (/^-\s/.test(line)) {
      checkPage()
      drawText('• ' + line.replace(/^-\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1'), { size: 11, indent: 5, color: [60, 60, 60] })
      continue
    }
    // numbered list
    if (/^\d+\.\s/.test(line)) {
      listCounter++
      checkPage()
      drawText(`${listCounter}. ` + line.replace(/^\d+\.\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1'), { size: 11, indent: 5, color: [60, 60, 60] })
      continue
    }
    // blank line
    if (line.trim() === '') {
      y += 3
      listCounter = 0
      continue
    }
    // normal paragraph
    checkPage()
    drawText(line.replace(/\*\*([^*]+)\*\*/g, '$1'), { size: 11, color: [60, 60, 60] })
  }

  // ── Footer note ───────────────────────────────────────────────────────────
  y += 10
  checkPage(8)
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, pageW - margin, y)
  y += 5
  drawText(`Generated by Forge Agency AI Pipeline · ${date}`, { size: 9, color: [160, 160, 160] })

  doc.save(filename)
}

// ── Moodboard PDF export ──────────────────────────────────────────────────────

function downloadMoodboardPdf({ projectName, clientName, date, moodboard, filename }) {
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const usable = pageW - margin * 2
  let y = margin

  function checkPage(needed = 8) {
    if (y + needed > pageH - margin - 10) { doc.addPage(); y = margin }
  }
  function drawText(text, opts = {}) {
    const { size = 10, bold = false, color = [60, 60, 60], indent = 0 } = opts
    doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...color)
    const lines = doc.splitTextToSize(String(text), usable - indent)
    for (const ln of lines) { checkPage(); doc.text(ln, margin + indent, y); y += size * 0.44 }
  }
  function sectionHeading(label) {
    y += 5; checkPage(10)
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80)
    doc.text(label.toUpperCase(), margin, y); y += 2
    doc.setDrawColor(200, 200, 200); doc.line(margin, y, pageW - margin, y); y += 5
  }

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFillColor(139, 92, 246)
  doc.rect(0, 0, pageW, 2, 'F')
  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
  doc.text('Forge Agency', margin, y + 4); y += 10
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130)
  doc.text('Design Moodboard', margin, y); y += 7
  doc.setDrawColor(220, 220, 220); doc.line(margin, y, pageW - margin, y); y += 6
  drawText(`Project: ${projectName}`, { size: 12, bold: true, color: [30, 30, 30] }); y += 1
  drawText(`Client: ${clientName}`,   { size: 10, color: [80, 80, 80] }); y += 1
  drawText(`Date: ${date}`,           { size: 10, color: [130, 130, 130] }); y += 5

  // ── Colour Palette ────────────────────────────────────────────────────────
  sectionHeading('Colour Palette')
  const palette = moodboard.palette ?? []
  const swatchW = usable / Math.max(palette.length, 1)
  for (let i = 0; i < palette.length; i++) {
    const { hex = '#cccccc', label = '' } = palette[i]
    const xPos = margin + i * swatchW
    const r = parseInt(hex.slice(1, 3), 16) || 200
    const g = parseInt(hex.slice(3, 5), 16) || 200
    const b = parseInt(hex.slice(5, 7), 16) || 200
    doc.setFillColor(r, g, b)
    doc.rect(xPos, y, swatchW - 2, 18, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
    const hexLines = doc.splitTextToSize(hex, swatchW - 4)
    doc.text(hexLines[0], xPos + 1, y + 21)
    const labelLines = doc.splitTextToSize(label, swatchW - 4)
    doc.text(labelLines[0], xPos + 1, y + 25)
  }
  y += 30

  // ── Typography ────────────────────────────────────────────────────────────
  sectionHeading('Typography')
  const { heading: hFont, body: bFont } = moodboard.typography ?? {}
  const colW = (usable - 5) / 2
  // Heading box
  doc.setDrawColor(220, 220, 220); doc.rect(margin, y, colW, 28, 'S')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
  doc.text('HEADING FONT', margin + 3, y + 5)
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
  const hName = hFont?.font ?? 'System Font'
  doc.text(hName, margin + 3, y + 12)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
  const hSample = doc.splitTextToSize(hFont?.sample ?? '', colW - 6)
  doc.text(hSample.slice(0, 2), margin + 3, y + 18)
  // Body box
  const bx = margin + colW + 5
  doc.setDrawColor(220, 220, 220); doc.rect(bx, y, colW, 28, 'S')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
  doc.text('BODY FONT', bx + 3, y + 5)
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
  const bName = bFont?.font ?? 'System Font'
  doc.text(bName, bx + 3, y + 12)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
  const bSample = doc.splitTextToSize(bFont?.sample ?? '', colW - 6)
  doc.text(bSample.slice(0, 2), bx + 3, y + 18)
  y += 34

  // ── Mood Words ────────────────────────────────────────────────────────────
  sectionHeading('Mood Words')
  const words = moodboard.mood_words ?? []
  let wx = margin
  const pillH = 8; const pillPad = 4
  for (const word of words) {
    const ww = doc.getStringUnitWidth(word) * 10 * 0.352 + pillPad * 2
    if (wx + ww > pageW - margin) { wx = margin; y += pillH + 3 }
    checkPage(pillH + 4)
    doc.setFillColor(139, 92, 246, 0.15); doc.setDrawColor(139, 92, 246)
    doc.setFillColor(230, 220, 255)
    doc.roundedRect(wx, y - pillH + 2, ww, pillH, 2, 2, 'FD')
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 50, 180)
    doc.text(word, wx + pillPad, y)
    wx += ww + 3
  }
  y += pillH + 5

  // ── Textures ──────────────────────────────────────────────────────────────
  sectionHeading('Textures & Surfaces')
  for (const tex of (moodboard.textures ?? [])) {
    checkPage(10)
    doc.setFillColor(139, 92, 246); doc.rect(margin, y - 3.5, 2, 5.5, 'F')
    drawText(tex, { size: 10, color: [60, 60, 60], indent: 5 }); y += 2
  }

  // ── Imagery Direction ─────────────────────────────────────────────────────
  sectionHeading('Imagery Direction')
  drawText(moodboard.imagery_direction ?? '', { size: 10, color: [60, 60, 60] }); y += 3

  // ── UI Style ──────────────────────────────────────────────────────────────
  sectionHeading('UI Component Style')
  doc.setFontSize(10); doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(80, 80, 80)
  const uiLines = doc.splitTextToSize(`"${moodboard.ui_style ?? ''}"`, usable - 6)
  for (const ln of uiLines) { checkPage(); doc.text(ln, margin + 3, y); y += 5 }

  // ── Footer ────────────────────────────────────────────────────────────────
  y += 8; checkPage(8)
  doc.setDrawColor(220, 220, 220); doc.line(margin, y, pageW - margin, y); y += 5
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150)
  doc.text(`Generated by Forge Agency AI Pipeline · ${date}`, margin, y)
  doc.save(filename)
}

// ── Developer combined PDF export ────────────────────────────────────────────

function downloadDeveloperPdf({ projectName, clientName, date, stackText, htmlText, cssText, jsText, filename }) {
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const usable = pageW - margin * 2
  let y = margin

  function checkPage(needed = 7) {
    if (y + needed > pageH - margin - 10) { doc.addPage(); y = margin }
  }

  function drawText(text, opts = {}) {
    const { size = 11, bold = false, color = [60, 60, 60], indent = 0, mono = false } = opts
    doc.setFontSize(size)
    doc.setFont(mono ? 'courier' : 'helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, usable - indent)
    for (const line of lines) { checkPage(); doc.text(line, margin + indent, y); y += size * 0.45 }
  }

  function drawSectionHeading(title) {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(title, margin, y)
    y += 5
    doc.setDrawColor(180, 180, 180)
    doc.line(margin, y, pageW - margin, y)
    y += 6
  }

  function renderMarkdownBody(text) {
    const lines = (text ?? '').split('\n')
    let counter = 0
    for (const line of lines) {
      if (/^\s*---\s*$/.test(line)) { checkPage(5); doc.setDrawColor(200,200,200); doc.line(margin,y,pageW-margin,y); y+=5; continue }
      if (/^##\s/.test(line))  { y+=3; checkPage(8); drawText(line.replace(/^##\s+/,'').replace(/\*\*/g,''), {size:14,bold:true,color:[50,50,50]}); y+=2; counter=0; continue }
      if (/^###\s/.test(line)) { y+=2; checkPage(6); drawText(line.replace(/^###\s+/,'').replace(/\*\*/g,''), {size:12,bold:true,color:[70,70,70]}); y+=1; counter=0; continue }
      if (/^-\s/.test(line))   { checkPage(); drawText('• '+line.replace(/^-\s+/,'').replace(/\*\*([^*]+)\*\*/g,'$1'), {size:11,indent:5,color:[60,60,60]}); continue }
      if (/^\d+\.\s/.test(line)) { counter++; checkPage(); drawText(`${counter}. `+line.replace(/^\d+\.\s+/,'').replace(/\*\*([^*]+)\*\*/g,'$1'), {size:11,indent:5,color:[60,60,60]}); continue }
      if (line.trim() === '') { y+=3; counter=0; continue }
      checkPage(); drawText(line.replace(/\*\*([^*]+)\*\*/g,'$1'), {size:11,color:[60,60,60]})
    }
  }

  function renderCodeBody(text) {
    const lines = (text ?? '').split('\n')
    for (const line of lines) {
      if (line.trim() === '') { y += 2; continue }
      checkPage()
      drawText(line, { size: 9, mono: true, color: [40, 40, 40] })
    }
  }

  // ── Cover header ─────────────────────────────────────────────────────────
  doc.setFontSize(20); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30)
  doc.text('Forge Agency', margin, y); y += 7
  doc.setDrawColor(180,180,180); doc.line(margin,y,pageW-margin,y); y += 6
  drawText(`Project: ${projectName}`, {size:14,color:[40,40,40]}); y+=1
  drawText(`Client: ${clientName}`,   {size:14,color:[40,40,40]}); y+=5
  drawText('Developer Output — Full Report', {size:14,bold:true,color:[30,30,30]}); y+=1
  drawText(`Generated: ${date}`, {size:10,color:[130,130,130]}); y+=8

  // ── Section 1: Tech Stack ─────────────────────────────────────────────────
  drawSectionHeading('1. Tech Stack & File Structure')
  renderMarkdownBody(stackText)

  // ── Section 2: HTML Structure ─────────────────────────────────────────────
  doc.addPage(); y = margin
  drawSectionHeading('2. HTML Structure')
  renderCodeBody(htmlText)

  // ── Section 3: CSS Stylesheet ─────────────────────────────────────────────
  doc.addPage(); y = margin
  drawSectionHeading('3. CSS Stylesheet')
  renderCodeBody(cssText)

  // ── Section 4: JavaScript ─────────────────────────────────────────────────
  doc.addPage(); y = margin
  drawSectionHeading('4. JavaScript')
  renderCodeBody(jsText)

  // ── Footer on last page ───────────────────────────────────────────────────
  y += 10; checkPage(8)
  doc.setDrawColor(220,220,220); doc.line(margin,y,pageW-margin,y); y+=5
  drawText(`Generated by Forge Agency AI Pipeline · ${date}`, {size:9,color:[160,160,160]})

  doc.save(filename)
}

// ── Developer sub-section component ──────────────────────────────────────────

function DevSubSection({ label, record, project, renderContent, extraButton, copyText, fileDownload, defaultOpen = false, onFix, onFresh, storageKey, onApprove, approved }) {
  const [open,          setOpen]          = useState(defaultOpen)
  const [copied,        setCopied]        = useState(false)
  const [subMode,       setSubMode]       = useState(null) // null | 'chooser' | 'fix' | 'fresh'
  const [subText,       setSubText]       = useState('')
  const [subRunning,    setSubRunning]    = useState(false)
  const [subStreamText, setSubStreamText] = useState('')

  function handleCopy() {
    navigator.clipboard.writeText(copyText ?? record.output_text ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleFileDownload() {
    if (!fileDownload) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([record.output_text ?? ''], { type: 'text/plain' }))
    a.download = fileDownload
    a.click()
  }

  async function handleFix() {
    if (!subText.trim() || !onFix) return
    setSubRunning(true)
    setOpen(true)
    setSubMode(null)
    setSubStreamText('')
    const desc = subText
    setSubText('')
    try { await onFix(desc, (t) => setSubStreamText(t)) }
    finally { setSubRunning(false); setSubStreamText('') }
  }

  async function handleFresh() {
    if (!onFresh) return
    setSubRunning(true)
    setSubMode(null)
    const desc = subText
    setSubText('')
    try { await onFresh(desc) }
    finally { setSubRunning(false) }
  }

  const showSuggest = (onFix || onFresh) && !subRunning

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-2.5 bg-zinc-900/50 cursor-pointer hover:bg-zinc-800/50 transition-colors select-none" onClick={() => { if (!subRunning) setOpen(o => !o) }}>
        <div className="flex items-center gap-2">
          {subRunning && (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
          <span className={`text-xs font-medium uppercase tracking-wide ${subRunning ? 'text-emerald-400' : 'text-emerald-400'}`}>{label}</span>
          {subRunning && <span className="text-xs text-zinc-500">Applying fix…</span>}
          {approved && !subRunning && (
            <span className="flex-shrink-0 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">Approved</span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {extraButton}
          {showSuggest && (
            <button
              onClick={() => { setSubMode(m => m ? null : 'chooser'); setSubText('') }}
              className="px-2 py-1 rounded text-xs font-medium text-zinc-500 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              Suggest changes
            </button>
          )}
          {copyText !== undefined && !subRunning && (
            <button onClick={handleCopy} className="px-2 py-1 rounded text-xs font-medium text-zinc-500 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
          {fileDownload && !subRunning && (
            <button onClick={handleFileDownload} className="px-2 py-1 rounded text-xs font-medium text-zinc-500 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors">
              Download .{fileDownload.split('.').pop()}
            </button>
          )}
          {!subRunning && <ChevronLeftIcon className="w-3.5 h-3.5 text-zinc-500" style={{ transform: open ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />}
        </div>
      </div>

      {/* Live fix streaming display */}
      {subRunning && (
        <ScrollBox storageKey={storageKey ? `${storageKey}-fix` : 'dev-fix'} isStreaming={subRunning} contentLength={subStreamText.length} className="px-5 py-4 bg-emerald-500/5">
          {subStreamText
            ? <pre className="whitespace-pre-wrap text-xs text-zinc-300 leading-relaxed font-mono">{subStreamText}</pre>
            : <span className="text-zinc-600 animate-pulse text-sm">Starting…</span>
          }
        </ScrollBox>
      )}

      {/* Normal content */}
      {open && !subRunning && (
        <ScrollBox storageKey={storageKey ?? 'dev-content'} isStreaming={false} contentLength={(record?.output_text ?? '').length} className="px-5 py-4">
          {renderContent()}
        </ScrollBox>
      )}

      {/* ── Per-subsection Fix / Fresh chooser ── */}
      {subMode === 'chooser' && (
        <div className="px-5 py-4 bg-zinc-900/60 border-t border-zinc-800 space-y-3">
          <p className="text-xs font-medium text-zinc-400">How would you like to proceed?</p>
          <div className="grid grid-cols-2 gap-3">
            {onFix && (
              <button
                onClick={() => setSubMode('fix')}
                className="flex flex-col items-start gap-1 px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left"
              >
                <span className="text-sm font-medium text-zinc-200">Fix Issue</span>
                <span className="text-xs text-zinc-500">Targeted fix — keeps everything else the same</span>
              </button>
            )}
            {onFresh && (
              <button
                onClick={() => setSubMode('fresh')}
                className="flex flex-col items-start gap-1 px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left"
              >
                <span className="text-sm font-medium text-zinc-200">Start Fresh</span>
                <span className="text-xs text-zinc-500">Clean slate — agent starts over from scratch</span>
              </button>
            )}
          </div>
          <button onClick={() => setSubMode(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Cancel</button>
        </div>
      )}

      {subMode === 'fix' && (
        <div className="px-5 py-4 bg-zinc-900/60 border-t border-zinc-800 space-y-3">
          <input
            type="text"
            value={subText}
            onChange={e => setSubText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFix()}
            placeholder="Describe the issue to fix"
            className="w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
          />
          <div className="flex items-center gap-2">
            <button onClick={handleFix} disabled={!subText.trim()} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Apply Fix
            </button>
            <button onClick={() => setSubMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
          </div>
        </div>
      )}

      {subMode === 'fresh' && (
        <div className="px-5 py-4 bg-zinc-900/60 border-t border-zinc-800 space-y-3">
          <input
            type="text"
            value={subText}
            onChange={e => setSubText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFresh()}
            placeholder="Optional: specific direction for the new attempt"
            className="w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
          />
          <div className="flex items-center gap-2">
            <button onClick={handleFresh} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-red-700 text-white hover:bg-red-600 transition-colors">
              Start Fresh
            </button>
            <button onClick={() => setSubMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
          </div>
        </div>
      )}

      {/* ── Per-page approval bar ── */}
      {(onApprove || approved) && !subRunning && subMode === null && (
        approved ? (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/8 border-t border-emerald-500/20">
            <CheckIcon className="w-3 h-3 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Page approved</span>
          </div>
        ) : (
          <div className="flex items-center justify-between px-5 py-3 bg-zinc-950/60 border-t border-zinc-800">
            <span className="text-xs font-medium text-zinc-500">Review &amp; Approve Page</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onApprove}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
              >
                <CheckIcon className="w-3 h-3" />
                Approve Page
              </button>
              <button
                onClick={() => setSubMode('chooser')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                <RefreshIcon className="w-3 h-3" />
                Request Changes
              </button>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ── Auto-scrolling output box ─────────────────────────────────────────────────
// storageKey    — suffix for the localStorage preference key (forge_autoscroll_<key>)
// isStreaming   — true while content is being written; enables auto-scroll and resets ON each new stream
// contentLength — pass text.length so the scroll effect fires on every new chunk
// maxHeight     — CSS value, default '400px'
// className     — applied directly to the scrollable container (border, bg, padding etc.)
function ScrollBox({ storageKey, isStreaming, contentLength = 0, maxHeight = '400px', className = '', children }) {
  const lsKey = `forge_autoscroll_${storageKey}`

  const [autoScroll, setAutoScroll] = useState(() => {
    const stored = localStorage.getItem(lsKey)
    return stored !== null ? stored === 'true' : true
  })
  const [showDoneNotice, setShowDoneNotice] = useState(false)

  const scrollRef       = useRef(null)
  const prevStreamRef   = useRef(isStreaming)
  const autoScrollRef   = useRef(autoScroll)
  autoScrollRef.current = autoScroll

  // Enable auto-scroll at the start of each new generation; detect generation end
  useEffect(() => {
    const wasStreaming = prevStreamRef.current
    prevStreamRef.current = isStreaming

    if (isStreaming && !wasStreaming) {
      // New stream started — reset to auto-scroll ON
      setAutoScroll(true)
      setShowDoneNotice(false)
    }

    if (!isStreaming && wasStreaming) {
      // Stream just ended — show "done" notice if user is scrolled up
      const el = scrollRef.current
      if (el) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        if (distFromBottom > 50 && !autoScrollRef.current) {
          setShowDoneNotice(true)
        }
      }
    }
  }, [isStreaming])

  // Scroll to bottom whenever content grows (only when autoScroll is on)
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [contentLength, autoScroll])

  // Detect manual scroll-up during streaming → disable auto-scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function handleScroll() {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const atBottom = distFromBottom < 50
      if (!atBottom && autoScrollRef.current && prevStreamRef.current) {
        // User scrolled up during active streaming
        setAutoScroll(false)
        localStorage.setItem(lsKey, 'false')
      }
      if (atBottom && showDoneNotice) {
        setShowDoneNotice(false)
      }
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey, showDoneNotice])

  function toggleAutoScroll() {
    const next = !autoScroll
    setAutoScroll(next)
    localStorage.setItem(lsKey, String(next))
    if (next && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  function jumpToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    setShowDoneNotice(false)
    setAutoScroll(true)
    localStorage.setItem(lsKey, 'true')
  }

  return (
    <div className="relative">
      {/* Auto-scroll toggle */}
      <button
        onClick={toggleAutoScroll}
        title={autoScroll ? 'Auto scroll on — click to pause' : 'Auto scroll off — click to resume'}
        className={`absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors backdrop-blur-sm ${
          autoScroll
            ? 'bg-zinc-700/90 text-zinc-300 hover:bg-zinc-600/90'
            : 'bg-zinc-800/90 text-zinc-500 hover:bg-zinc-700/90 hover:text-zinc-300'
        }`}
      >
        {autoScroll ? <ScrollDownIcon className="w-3 h-3" /> : <ScrollOffIcon className="w-3 h-3" />}
        Auto scroll
      </button>

      {/* Scrollable area */}
      <div ref={scrollRef} className={`overflow-y-auto ${className}`} style={{ maxHeight }}>
        {children}
      </div>

      {/* Generation complete notice */}
      {showDoneNotice && (
        <div className="absolute bottom-2 inset-x-0 flex justify-center px-4 z-10 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 shadow-lg text-xs text-zinc-300">
            <CheckCircleIcon className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            <span>Generation complete — scroll down to see full output</span>
            <span className="text-zinc-700">·</span>
            <button onClick={jumpToBottom} className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
              Jump to bottom
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StreamingSubSection({ label, stepLabel, text, storageKey }) {
  return (
    <div>
      <div className="flex items-center justify-between px-5 py-2.5 bg-emerald-500/5 select-none">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wide">{label}</span>
        </div>
        <span className="text-xs text-zinc-500">{stepLabel}</span>
      </div>
      <ScrollBox storageKey={storageKey} isStreaming={true} contentLength={text.length} className="px-5 py-4">
        {text
          ? <pre className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed font-sans">{text}</pre>
          : <span className="text-zinc-600 animate-pulse text-sm">Starting…</span>
        }
      </ScrollBox>
    </div>
  )
}

function PendingSubSection({ label }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900/30">
      <div className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse" />
      <span className="text-xs font-medium text-zinc-600 uppercase tracking-wide">{label}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { projectId } = useParams()

  // Core data
  const [project,          setProject]          = useState(null)
  const [briefs,           setBriefs]           = useState([])
  const [invoices,         setInvoices]         = useState([])
  const [agentOutputs,     setAgentOutputs]     = useState([])
  const [loading,          setLoading]          = useState(true)

  // General stage advancement
  const [advancing,                   setAdvancing]                   = useState(false)
  const [isSendingOrchestrator,       setIsSendingOrchestrator]       = useState(false)
  const [orchestratorStreamDisplay,   setOrchestratorStreamDisplay]   = useState('')

  // Researcher state
  const [isGenerating,     setIsGenerating]     = useState(false)
  const [streamingDisplay, setStreamingDisplay] = useState('')
  const [researchMode,     setResearchMode]     = useState(null) // null | 'chooser' | 'fix' | 'fresh'
  const [feedbackText,     setFeedbackText]     = useState('')
  const [approving,        setApproving]        = useState(false)
  const [submitting,       setSubmitting]       = useState(false)

  // Designer state
  const [isDesigning,          setIsDesigning]          = useState(false)
  const [designStreamDisplay,  setDesignStreamDisplay]  = useState('')
  const [designMode,           setDesignMode]           = useState(null) // null | 'chooser' | 'fix' | 'fresh'
  const [designFeedbackText,   setDesignFeedbackText]   = useState('')
  const [approvingDesign,      setApprovingDesign]      = useState(false)
  const [submittingDesign,     setSubmittingDesign]     = useState(false)
  const [goingBack,            setGoingBack]            = useState(false)
  const [isRegenerating,       setIsRegenerating]       = useState(false)
  const [isRedetectingPages,   setIsRedetectingPages]   = useState(false)
  const [pagesEditing,         setPagesEditing]         = useState(false)
  const [editedPages,          setEditedPages]          = useState([])
  const pageExtractionInFlight = useRef(false)
  const [regenPageFilename,    setRegenPageFilename]    = useState(null) // agent_name of wireframe being regenerated
  const [wireframeProgress,    setWireframeProgress]    = useState(null) // { current, total, pageName } during generation
  const [wireframeOpen,        setWireframeOpen]        = useState({})   // { [wfId]: bool } — default open
  const [wireframePageModal,   setWireframePageModal]   = useState(null) // { researchOutputId, briefText, researchText, pages, selected: Set<string> }
  const [autoRunModal,         setAutoRunModal]         = useState(false)
  const [autoRunSelected,      setAutoRunSelected]      = useState(new Set())
  const [autoRunSettings,      setAutoRunSettings]      = useState({ autoResearcher: false, autoDesigner: false, autoDeveloper: false, autoReviewer: false })
  const [autoApprovedStages,   setAutoApprovedStages]   = useState(new Set())
  const [autoRunActive,        setAutoRunActive]        = useState(false)
  const [autoRunCurrentStage,  setAutoRunCurrentStage]  = useState(null) // 'researcher'|'designer'|'developer'|'reviewer'
  const [autoRunTotalStages,   setAutoRunTotalStages]   = useState(0)
  const [autoRunCompleteModal, setAutoRunCompleteModal] = useState(false)
  const [flashedStages,        setFlashedStages]        = useState(new Set()) // briefly green-highlighted
  const [failedAutoRunStage,   setFailedAutoRunStage]   = useState(null)      // stage key of failure
  const autoRunSettingsRef    = useRef({ autoResearcher: false, autoDesigner: false, autoDeveloper: false, autoReviewer: false })
  const autoRunAbortedRef     = useRef(false)
  const autoRunTotalStagesRef = useRef(0)
  const autoApprovedCountRef  = useRef(0)

  // Developer state
  const [isDeveloping,         setIsDeveloping]         = useState(false)
  const [devCurrentStep,       setDevCurrentStep]       = useState(null)
  const [devCurrentStepLabel,  setDevCurrentStepLabel]  = useState('')
  const [devCurrentStepText,   setDevCurrentStepText]   = useState('')
  const [devMode,              setDevMode]              = useState(null) // null | 'chooser' | 'fix' | 'fresh'
  const [devFeedbackText,      setDevFeedbackText]      = useState('')
  const [pageStatuses,         setPageStatuses]         = useState({}) // { [filename]: 'pending'|'generating'|'complete'|'failed' }
  const [approvedPages,        setApprovedPages]        = useState(new Set()) // filenames approved via per-page review
  const [pageSelectModal,      setPageSelectModal]      = useState(null)  // null | { approvedFilename, remainingPages }
  const [pageSelectChoice,     setPageSelectChoice]     = useState('')    // filename of selected radio option
  const [skipToReview,         setSkipToReview]         = useState(false) // user chose to skip remaining pages
  const [approvingDev,         setApprovingDev]         = useState(false)
  const [submittingDev,        setSubmittingDev]        = useState(false)
  const [goingBackToDev,       setGoingBackToDev]       = useState(false)
  const [isPatchingCss,        setIsPatchingCss]        = useState(false)
  const [setupGuideOpen,       setSetupGuideOpen]       = useState(false)
  const [isGeneratingGuide,    setIsGeneratingGuide]    = useState(false)

  // Reviewer state
  const [isReviewing,          setIsReviewing]          = useState(false)
  const [reviewStreamDisplay,  setReviewStreamDisplay]  = useState('')
  const [reviewMode,           setReviewMode]           = useState(null) // null | 'chooser' | 'fix' | 'fresh'
  const [reviewFeedbackText,   setReviewFeedbackText]   = useState('')
  const [approvingReview,      setApprovingReview]      = useState(false)
  const [submittingReview,     setSubmittingReview]     = useState(false)
  const [goingBackFromReview,  setGoingBackFromReview]  = useState(false)
  const [deliveryModalOpen,    setDeliveryModalOpen]    = useState(false)
  const [briefLinkModal,       setBriefLinkModal]       = useState(null)  // null | { url, emailDraft }
  const [briefLinkCopied,      setBriefLinkCopied]      = useState(false)
  const [briefToken,           setBriefToken]           = useState(null)  // most recent client_brief_tokens record

  // Section open/close state — most recent section auto-opens, handled in load()
  const [briefOpen,        setBriefOpen]        = useState(false)
  const [orchestratorOpen, setOrchestratorOpen] = useState(true)
  const [researchOpen,     setResearchOpen]     = useState(false)
  const [designOpen,           setDesignOpen]           = useState(false)
  const [moodboardOpen,        setMoodboardOpen]        = useState(false)
  const [isRegeneratingMoodboard, setIsRegeneratingMoodboard] = useState(false)
  const [devOpen,        setDevOpen]        = useState(false)
  const [reviewOpen,     setReviewOpen]     = useState(false)

  const confirm     = useConfirm()
  const navigate    = useNavigate()
  const showToast   = useToast()
  const pipeline    = usePipeline()

  const streamRef             = useRef('')
  const designStreamRef       = useRef('')
  const reviewStreamRef       = useRef('')
  const orchestratorStreamRef = useRef('')
  // Monotonically-increasing generation counter — only the latest load() wins
  const loadGenRef      = useRef(0)
  // Track previous orchestrator text to detect completion for browser notification
  const orchPrevTextRef   = useRef(null)
  const orchMountedRef    = useRef(false)
  // Elapsed-time timer for Orchestrator status panel
  const [orchElapsed,     setOrchElapsed]     = useState(0)   // seconds since brief submitted_at
  const [orchCompletedIn, setOrchCompletedIn] = useState(null) // seconds — set when Orchestrator completes
  const orchTimerRef      = useRef(null)

  // Derived state declared early so all useEffect dependency arrays below can reference
  // them without a temporal dead zone (TDZ) error.
  const orchestratorOutput = agentOutputs.find(o => o.agent_name === 'Orchestrator') ?? null
  const pipelineRunningEarly = pipeline.isRunningForProject(projectId)
  const orchIsStreaming     = isSendingOrchestrator || (pipelineRunningEarly && pipeline.pipeline.agentName === 'Orchestrator')

  useEffect(() => {
    load()
    loadBriefToken()

    const channel = supabase
      .channel(`project-detail-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },             () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefs' },               () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' },             () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_outputs' },        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_brief_tokens',
          filter: `project_id=eq.${projectId}` },                                               () => loadBriefToken())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [projectId])

  // Restore running-state from PipelineContext when navigating back to a project
  // that has an in-flight stream. This makes "isGenerating" etc. correct immediately
  // on mount so the streaming display renders without waiting for chunks.
  useEffect(() => {
    const p = pipeline.pipeline
    if (p.projectId !== projectId || p.status !== 'running') return
    const name = p.agentName ?? ''
    if (name === 'researcher')          { setIsGenerating(true);       setResearchOpen(true) }
    else if (name === 'designer')       { setIsDesigning(true);        setDesignOpen(true)   }
    else if (name.startsWith('Developer-')) { setIsDeveloping(true);   setDevOpen(true)      }
    else if (name === 'reviewer')       { setIsReviewing(true);        setReviewOpen(true)   }
    else if (name === 'Orchestrator')   { setIsSendingOrchestrator(true); setOrchestratorOpen(true) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Inject Google Fonts for moodboard typography preview
  useEffect(() => {
    const designRec = agentOutputs.find(o => o.agent_name === 'designer') ?? null
    if (!designRec?.output_moodboard) return
    try {
      const mb = JSON.parse(designRec.output_moodboard)
      const fonts = [mb.typography?.heading?.font, mb.typography?.body?.font].filter(Boolean)
      if (fonts.length === 0) return
      const id = 'forge-moodboard-fonts'
      if (document.getElementById(id)) document.getElementById(id).remove()
      const link = document.createElement('link')
      link.id   = id
      link.rel  = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?${fonts.map(f => `family=${encodeURIComponent(f)}:wght@400;700`).join('&')}&display=swap`
      document.head.appendChild(link)
    } catch { /* invalid JSON — ignore */ }
  }, [agentOutputs])

  // Retry loading agent_outputs up to 5 times if Orchestrator record is missing
  // (structured brief submissions may have a slight delay before the record appears)
  const orchRetryRef = useRef(0)
  useEffect(() => {
    if (loading) return
    const hasOrchestrator = agentOutputs.some(o => o.agent_name === 'Orchestrator')
    const hasBrief = briefs.length > 0 && !briefs[0].orchestrator_response
    if (hasOrchestrator || !hasBrief || orchRetryRef.current >= 5) return

    orchRetryRef.current += 1
    console.log(`[orchRetry] attempt ${orchRetryRef.current} — Orchestrator record not yet found`)
    const t = setTimeout(() => load(), 3000)
    return () => clearTimeout(t)
  }, [loading, agentOutputs, briefs])

  // Fire a browser notification when the Orchestrator finishes for this project
  useEffect(() => {
    const newText = orchestratorOutput?.output_text ?? null
    if (!orchMountedRef.current) {
      // First render — record baseline without notifying
      orchMountedRef.current = true
      orchPrevTextRef.current = newText
      return
    }
    if (!orchPrevTextRef.current && newText && project?.name) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`Client brief processed for ${project.name}`, {
          body: 'Pipeline ready to start.',
        })
      }
    }
    orchPrevTextRef.current = newText
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestratorOutput?.output_text])

  // Orchestrator elapsed-time timer — starts from brief submitted_at, stops when complete
  useEffect(() => {
    // Clear any existing timer first
    if (orchTimerRef.current) clearInterval(orchTimerRef.current)

    const briefSubmittedAt = briefs[0]?.submitted_at ?? null

    if (!orchIsStreaming && !orchestratorOutput) {
      // Waiting state (brief submitted but Orchestrator not started yet) — show elapsed since submission
      if (briefSubmittedAt) {
        const tick = () => setOrchElapsed(Math.floor((Date.now() - new Date(briefSubmittedAt).getTime()) / 1000))
        tick()
        orchTimerRef.current = setInterval(tick, 1000)
      }
      return () => { if (orchTimerRef.current) clearInterval(orchTimerRef.current) }
    }

    if (orchIsStreaming) {
      // Running — keep ticking
      if (briefSubmittedAt) {
        const tick = () => setOrchElapsed(Math.floor((Date.now() - new Date(briefSubmittedAt).getTime()) / 1000))
        tick()
        orchTimerRef.current = setInterval(tick, 1000)
      }
      return () => { if (orchTimerRef.current) clearInterval(orchTimerRef.current) }
    }

    if (orchestratorOutput && briefSubmittedAt) {
      // Completed — compute final duration once from the output record's created_at vs brief submitted_at
      const endTime   = orchestratorOutput.created_at ? new Date(orchestratorOutput.created_at).getTime() : Date.now()
      const startTime = new Date(briefSubmittedAt).getTime()
      const elapsed   = Math.max(0, Math.floor((endTime - startTime) / 1000))
      setOrchCompletedIn(elapsed)
      setOrchElapsed(elapsed)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchIsStreaming, orchestratorOutput, briefs[0]?.submitted_at])

  async function loadBriefToken() {
    const { data } = await supabase
      .from('client_brief_tokens')
      .select('id, token, status, submitted_at, expires_at, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setBriefToken(data ?? null)
  }

  async function load() {
    // Claim a generation slot. If a newer load() starts before this one
    // finishes fetching, the newer one will have a higher gen and this
    // result will be silently discarded — preventing Realtime race conditions
    // where an INSERT-triggered load() resolves after a later UPDATE-triggered one.
    const gen = ++loadGenRef.current

    const [projectRes, briefsRes, invoicesRes, outputsRes] = await Promise.all([
      supabase.from('projects').select('*, clients(name)').eq('id', projectId).single(),
      supabase.from('briefs').select('id, brief_text, submitted_at, orchestrator_response').eq('project_id', projectId).order('submitted_at', { ascending: false }),
      supabase.from('invoices').select('*, clients(name)').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('agent_outputs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ])

    // Discard stale results — a newer load() has already applied fresher data
    if (gen !== loadGenRef.current) {
      console.log(`[load] gen=${gen} discarded (current=${loadGenRef.current}) — stale Realtime load dropped`)
      return
    }

    setProject(projectRes.data     ?? null)
    setBriefs(briefsRes.data       ?? [])
    setInvoices(invoicesRes.data   ?? [])
    const outputs = outputsRes.data ?? []
    const orchRecord    = outputs.find(o => o.agent_name === 'Orchestrator') ?? null
    const designRecord  = outputs.find(o => o.agent_name === 'designer')     ?? null
    console.log('[load] agent_outputs raw result:', outputsRes.data, '| Orchestrator record:', orchRecord ?? 'not found')
    console.log('[load] Orchestrator output_text (first 500 chars):', orchRecord?.output_text?.slice(0, 500) ?? '(none)')
    console.log('[load] Designer record — output_wireframe length:', designRecord?.output_wireframe?.length ?? 0, '| output_moodboard length:', designRecord?.output_moodboard?.length ?? 0)
    setAgentOutputs(outputs)
    // Sync per-page approvals from DB — any Developer-HTML-* record with status 'approved'
    setApprovedPages(new Set(
      outputs
        .filter(o => o.agent_name.startsWith('Developer-HTML-') && o.status === 'approved')
        .map(o => o.agent_name.replace('Developer-HTML-', ''))
    ))
    setLoading(false)

    // Auto-open the most recent section when it first appears.
    // Use functional updates so a section that is already open is never forced closed
    // (e.g. the Design section must stay open after the Developer stage starts).
    const hasDev      = outputs.some(o => ['Developer-Stack','Developer-CSS','Developer-JS','Developer-Pages'].includes(o.agent_name) || o.agent_name === 'Developer-HTML' || o.agent_name.startsWith('Developer-HTML-'))
    const hasDesign   = outputs.some(o => o.agent_name === 'designer')
    const hasResearch = outputs.some(o => o.agent_name === 'researcher')
    const hasReview   = outputs.some(o => o.agent_name === 'reviewer')
    setBriefOpen(!hasResearch)
    setResearchOpen(prev => prev || (hasResearch && !hasDesign))
    setDesignOpen(prev => prev || (hasDesign && !hasDev))
    setDevOpen(prev => prev || (hasDev && !hasReview))
    setReviewOpen(prev => prev || hasReview)
  }

  // ── Revision helper ───────────────────────────────────────────────────────

  async function saveRevision(agentName, outputRecord) {
    const { error } = await supabase.from('agent_output_revisions').insert({
      project_id:       projectId,
      agent_name:       agentName,
      output_text:      outputRecord.output_text      ?? null,
      output_wireframe: outputRecord.output_wireframe ?? null,
      token_usage:      outputRecord.token_usage      ?? null,
      original_id:      outputRecord.id,
    })
    if (error) console.warn('[saveRevision] Could not save revision (table may not exist):', error.message)
  }

  // ── Shared Developer step runner (used by pipeline and per-step fix/fresh) ─

  async function runDevStep(stepLabel, system, userContent, agentName, opts = {}) {
    // opts.existingRecordId — if provided, resets and updates in-place instead of INSERT
    // opts.maxTokens       — override default 8000 token limit
    // opts.transform       — function applied to text before saving (e.g. stripCodeFences)
    setDevCurrentStep(agentName)
    setDevCurrentStepLabel(stepLabel)
    setDevCurrentStepText('')

    let recordId
    if (opts.existingRecordId) {
      recordId = opts.existingRecordId
      await safeUpdate('agent_outputs', recordId, { output_text: '', status: 'pending' })
    } else {
      // Select-then-update-or-insert: never create a duplicate for the same project+agentName
      const { data: existingRecs } = await supabase
        .from('agent_outputs')
        .select('id')
        .eq('project_id', projectId)
        .eq('agent_name', agentName)
        .order('created_at', { ascending: false })
        .limit(1)
      const existingId = existingRecs?.[0]?.id ?? null
      if (existingId) {
        recordId = existingId
        await safeUpdate('agent_outputs', recordId, { output_text: '', status: 'pending' })
      } else {
        const { data: record, error: insertErr } = await supabase
          .from('agent_outputs')
          .insert({ project_id: projectId, agent_name: agentName, output_text: '', status: 'pending' })
          .select().single()
        if (insertErr) throw new Error(`[Developer] INSERT FAILED for ${agentName}: ${insertErr.message}`)
        if (!record?.id)  throw new Error(`[Developer] INSERT for ${agentName} returned no record id`)
        recordId = record.id
      }
    }

    let text = ''
    const { inputTokens: devIn, outputTokens: devOut, stopReason: devStop } = await streamAnthropicCall({
      messages:     [{ role: 'user', content: userContent }],
      systemPrompt: system,
      model:        'claude-sonnet-4-20250514',
      maxTokens:    opts.maxTokens ?? 30000,
      onChunk: (chunk) => {
        text += chunk
        setDevCurrentStepText(text)
        pipeline.append(chunk)
      },
    })
    if (devStop === 'max_tokens') console.warn(`[Developer] WARNING: ${agentName} cut off at token limit`)
    if (!text.trim()) throw new Error(`[Developer] ABORT: ${agentName} produced empty output`)

    if (opts.transform) text = opts.transform(text)

    const tokenUsage = { input_tokens: devIn, output_tokens: devOut, total_tokens: devIn + devOut, stop_reason: devStop }
    const { error: updateErr } = await safeUpdate('agent_outputs', recordId, { output_text: text, token_usage: tokenUsage }, { output_text: text })
    if (updateErr) throw new Error(`[Developer] UPDATE FAILED for ${agentName}: ${updateErr.message}`)

    // Verify content committed before continuing
    for (let attempt = 1; attempt <= 8; attempt++) {
      const { data } = await supabase.from('agent_outputs').select('output_text').eq('id', recordId).single()
      if (data?.output_text?.trim()) { console.log(`[Developer] ✓ ${agentName} verified in DB`); break }
      console.warn(`[Developer] ${agentName} verify attempt ${attempt}/8: empty`)
      await new Promise(r => setTimeout(r, 250 * attempt))
    }

    setDevCurrentStep(null)
    await load()
    return text
  }

  // ── Replication helpers ───────────────────────────────────────────────────

  async function fetchReplicationConfig() {
    const { data } = await supabase
      .from('projects')
      .select('is_replication, replication_url')
      .eq('id', projectId)
      .single()
    return {
      isReplication:  data?.is_replication  ?? false,
      replicationUrl: data?.replication_url ?? '',
    }
  }

  function replicationAddition(agentType, url) {
    if (!url) return ''
    const map = {
      researcher:   `\n\nThis is a site replication project. The client wants to replicate this site as closely as possible: ${url}. Use web search to thoroughly analyse this site. Document the exact page structure, navigation layout, section order on each page, content types used, colour scheme, typography style, spacing and overall visual style. Your research report must be a detailed blueprint of how the existing site is built so the Designer and Developer can recreate it accurately. Do not suggest improvements or alternative approaches — focus entirely on documenting what already exists.`,
      designer:     `\n\nThis is a site replication project. You must replicate the design of ${url} as closely as possible using the research report as your blueprint. Extract the exact colour palette from the research findings and use those hex codes. Match the typography style, spacing, layout structure and visual hierarchy of the original site. Replace any real branding, logos and images with placeholder equivalents but keep the layout and design identical. Do not be creative or suggest alternatives — your job is to accurately recreate the existing design.`,
      developer:    `\n\nThis is a site replication project. You must replicate the site at ${url} as closely as possible. Use the design brief and research report as your blueprint. Match the HTML structure, CSS styling, layout patterns, component designs and interactions of the original site exactly. Use placeholder text and images where real content exists. Do not deviate from the original design — accuracy of replication is the top priority.`,
      orchestrator: `\n\nThis is a site replication project. The goal is to replicate ${url} as accurately as possible with placeholder branding. Instruct each agent to focus on accurate replication rather than original design.`,
    }
    return map[agentType] ?? ''
  }

  // ── Auto-run helpers ──────────────────────────────────────────────────────

  function stopAutoRun() {
    autoRunAbortedRef.current = true
    setAutoRunActive(false)
    setAutoRunCurrentStage(null)
    showToast('Auto-run stopped — remaining stages will need manual approval.', 'warning')
  }

  function flashStage(stageKey) {
    setFlashedStages(prev => new Set([...prev, stageKey]))
    setTimeout(() => setFlashedStages(prev => { const n = new Set(prev); n.delete(stageKey); return n }), 2000)
  }

  function handleAutoRunError(stageKey) {
    if (autoRunAbortedRef.current) return // already stopped
    autoRunAbortedRef.current = true
    setAutoRunActive(false)
    setAutoRunCurrentStage(null)
    setFailedAutoRunStage(stageKey)
    const stageLabel = AUTORUN_STAGES.find(s => s.key === stageKey)?.label ?? stageKey
    showToast(`Auto-run paused — an error occurred during the ${stageLabel} stage. Please review and try again manually.`, 'error')
  }

  function completeAutoRunStage(stageKey, nextStageKey) {
    autoApprovedCountRef.current++
    setAutoApprovedStages(prev => new Set([...prev, stageKey]))
    flashStage(stageKey)
    const isAllDone = autoApprovedCountRef.current >= autoRunTotalStagesRef.current
    if (isAllDone) {
      setAutoRunActive(false)
      setAutoRunCurrentStage(null)
      setAutoRunCompleteModal(true)
    } else if (nextStageKey) {
      setAutoRunCurrentStage(nextStageKey)
    }
    return isAllDone
  }

  // ── Researcher pipeline ───────────────────────────────────────────────────

  function openAutoRunModal() {
    const stored = localStorage.getItem(autoRunStorageKey(projectId))
    const saved  = stored ? new Set(JSON.parse(stored)) : new Set()
    setAutoRunSelected(saved)
    setAutoRunModal(true)
  }

  async function confirmAutoRunModal() {
    localStorage.setItem(autoRunStorageKey(projectId), JSON.stringify([...autoRunSelected]))
    const settings = {
      autoResearcher: autoRunSelected.has('researcher'),
      autoDesigner:   autoRunSelected.has('designer'),
      autoDeveloper:  autoRunSelected.has('developer'),
      autoReviewer:   autoRunSelected.has('reviewer'),
    }
    const totalStages = [...autoRunSelected].length
    setAutoRunSettings(settings)
    autoRunSettingsRef.current    = settings
    autoRunAbortedRef.current     = false
    autoRunTotalStagesRef.current = totalStages
    autoApprovedCountRef.current  = 0
    setAutoApprovedStages(new Set())
    setFlashedStages(new Set())
    setFailedAutoRunStage(null)
    if (totalStages > 0) {
      setAutoRunActive(true)
      setAutoRunTotalStages(totalStages)
      setAutoRunCurrentStage('researcher')
    }
    setAutoRunModal(false)
    await safeUpdate('projects', projectId, { current_stage: 'Research' })
    setProject(prev => ({ ...prev, current_stage: 'Research' }))
    const brief = briefs[0] ?? null
    const pages = project?.pages ?? []
    await runResearcher(brief?.brief_text ?? `Project: ${project.name}`, null, pages)
  }

  async function sendToOrchestrator() {
    const briefText = latestBrief?.brief_text
    if (!briefText) return

    const ok = await confirm({
      title:        'Send to Orchestrator',
      message:      'This will send the brief to the Orchestrator agent which will break it down into task lists for all four agents. If an Orchestrator response already exists it will be replaced. Continue?',
      confirmLabel: 'Send to Orchestrator',
      variant:      'primary',
    })
    if (!ok) return

    const { isReplication: orchRepl, replicationUrl: orchReplUrl } = await fetchReplicationConfig()
    setIsSendingOrchestrator(true)
    setOrchestratorStreamDisplay('')
    orchestratorStreamRef.current = ''
    setOrchestratorOpen(true)
    pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'Orchestrator', stepLabel: 'Project Breakdown' })

    try {
      const orchSystem = PROJ_ORCHESTRATOR_SYSTEM + (orchRepl ? replicationAddition('orchestrator', orchReplUrl) : '')
      const { inputTokens: orchIn, outputTokens: orchOut, stopReason: orchStop } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: briefText }],
        systemPrompt: orchSystem,
        maxTokens:    30000,
        onChunk: (chunk) => {
          orchestratorStreamRef.current += chunk
          setOrchestratorStreamDisplay(orchestratorStreamRef.current)
          pipeline.append(chunk)
        },
      })

      const orchText   = orchestratorStreamRef.current
      const tokenUsage = {
        input_tokens:  orchIn,
        output_tokens: orchOut,
        total_tokens:  orchIn + orchOut,
        stop_reason:   orchStop,
      }

      if (orchestratorOutput) {
        await safeUpdate('agent_outputs', orchestratorOutput.id, { output_text: orchText, token_usage: tokenUsage })
      } else {
        await supabase.from('agent_outputs').insert({
          project_id:  projectId,
          agent_name:  'Orchestrator',
          output_text: orchText,
          status:      'approved',
          token_usage: tokenUsage,
        })
      }

      pipeline.complete()
      await load()
      showToast('Orchestrator has broken down the project successfully')
    } catch (err) {
      console.error('[Orchestrator] Error:', err)
      pipeline.errorPipeline(err.message)
      showToast('Orchestrator failed: ' + (err.message ?? 'Unknown error'), 'error')
    } finally {
      setIsSendingOrchestrator(false)
      setOrchestratorStreamDisplay('')
      orchestratorStreamRef.current = ''
    }
  }

  async function runResearcher(briefText, feedback, pages = []) {
    setIsGenerating(true)
    setResearchMode(null)
    setFeedbackText('')
    streamRef.current = ''

    const { data: record, error: insertErr } = await supabase
      .from('agent_outputs')
      .insert({ project_id: projectId, agent_name: 'researcher', output_text: '', status: 'pending' })
      .select()
      .single()

    if (insertErr) {
      console.error('Failed to create researcher record:', insertErr.message)
      setIsGenerating(false)
      return
    }

    const { isReplication: researchRepl, replicationUrl: researchReplUrl } = await fetchReplicationConfig()
    const pagesCtx = pages?.length ? `\n\nThis site has the following pages: ${pages.map(p => `${p.name} (${p.filename})`).join(', ')}. Consider the content and research needs for each page.` : ''
    let userContent = `Client Brief:\n\n${briefText}${pagesCtx}`
    if (feedback) userContent += `\n\n---\n\nAdditional instructions from the project manager:\n\n${feedback}`
    const researchSystem = RESEARCHER_SYSTEM + (researchRepl ? replicationAddition('researcher', researchReplUrl) : '')

    pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'researcher', stepLabel: 'Research Report' })
    try {
      const { inputTokens: rIn, outputTokens: rOut, stopReason: rStop } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: userContent }],
        systemPrompt: researchSystem,
        model:        'claude-sonnet-4-20250514',
        maxTokens:    30000,
        onChunk: (chunk) => {
          streamRef.current += chunk
          setStreamingDisplay(streamRef.current)
          pipeline.append(chunk)
        },
      })
      const researchTokenUsage = { input_tokens: rIn, output_tokens: rOut, total_tokens: rIn + rOut, stop_reason: rStop }
      const { error: researchSaveErr } = await safeUpdate('agent_outputs', record.id, { output_text: streamRef.current, token_usage: researchTokenUsage }, { output_text: streamRef.current })
      if (researchSaveErr) throw new Error(`Researcher save failed: ${researchSaveErr.message}`)
      pipeline.complete()
      await load()

      // Auto-approve researcher if enabled
      if (autoRunSettingsRef.current.autoResearcher && !autoRunAbortedRef.current) {
        completeAutoRunStage('researcher', 'designer')
        const capturedBriefText    = briefText
        const capturedResearchText = streamRef.current
        const capturedPages        = project?.pages?.length
          ? project.pages
          : [{ name: 'Home', filename: 'index.html' }]
        const defaultSelected = capturedPages.some(p => p.filename === 'index.html')
          ? ['index.html']
          : capturedPages.slice(0, 1).map(p => p.filename)
        setApproving(true)
        await Promise.all([
          safeUpdate('agent_outputs', record.id, { status: 'approved' }),
          safeUpdate('projects', projectId, { current_stage: 'Design' }),
        ])
        await load()
        setApproving(false)
        await runDesigner(capturedBriefText, capturedResearchText, null, capturedPages, defaultSelected)
      }
    } catch (err) {
      console.error('Researcher agent error:', err)
      pipeline.errorPipeline(err.message)
      handleAutoRunError('researcher')
    } finally {
      setIsGenerating(false)
    }
  }

  function approveResearch() {
    if (!researchOutput) return
    const capturedBriefText    = briefs[0]?.brief_text ?? `Project: ${project.name}`
    const capturedResearchText = researchOutput.output_text
    const capturedPages        = project?.pages?.length
      ? project.pages
      : [{ name: 'Home', filename: 'index.html' }]

    const defaultSelected = new Set(
      capturedPages.some(p => p.filename === 'index.html')
        ? ['index.html']
        : capturedPages.slice(0, 1).map(p => p.filename)
    )

    setWireframePageModal({
      researchOutputId: researchOutput.id,
      briefText:        capturedBriefText,
      researchText:     capturedResearchText,
      pages:            capturedPages,
      selected:         defaultSelected,
    })
  }

  async function confirmWireframeModal() {
    if (!wireframePageModal) return
    const { researchOutputId, briefText, researchText, pages, selected } = wireframePageModal
    const selectedFilenames = pages.filter(p => selected.has(p.filename)).map(p => p.filename)
    setWireframePageModal(null)
    setApproving(true)

    await Promise.all([
      safeUpdate('agent_outputs', researchOutputId, { status: 'approved' }),
      safeUpdate('projects', projectId, { current_stage: 'Design' }),
    ])
    await load()
    setApproving(false)
    await runDesigner(briefText, researchText, null, pages, selectedFilenames)
  }

  async function submitResearchFix() {
    if (!feedbackText.trim() || !researchOutput) return
    setSubmitting(true)
    setResearchMode(null)
    await saveRevision('researcher', researchOutput)
    const briefText   = briefs[0]?.brief_text ?? `Project: ${project.name}`
    const userContent = `Original Client Brief:\n\n${briefText}\n\n---\n\nYour Previous Output:\n\n${researchOutput.output_text}\n\n---\n\nIssue to Fix:\n\n${feedbackText.trim()}`
    const capturedId  = researchOutput.id
    await safeUpdate('agent_outputs', capturedId, { output_text: '', status: 'pending' })
    await load()
    setIsGenerating(true)
    streamRef.current = ''
    pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'researcher', stepLabel: 'Research Fix' })
    try {
      const { inputTokens: rfIn, outputTokens: rfOut, stopReason: rfStop } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: userContent }],
        systemPrompt: RESEARCHER_FIX_SYSTEM,
        model:        'claude-sonnet-4-20250514',
        maxTokens:    30000,
        onChunk: (chunk) => {
          streamRef.current += chunk
          setStreamingDisplay(streamRef.current)
          pipeline.append(chunk)
        },
      })
      const tokenUsage = { input_tokens: rfIn, output_tokens: rfOut, total_tokens: rfIn + rfOut, stop_reason: rfStop }
      const { error: saveErr } = await safeUpdate('agent_outputs', capturedId, { output_text: streamRef.current, token_usage: tokenUsage }, { output_text: streamRef.current })
      if (saveErr) throw new Error(saveErr.message)
      pipeline.complete()
      await load()
    } catch (err) {
      console.error('Research fix error:', err)
      pipeline.errorPipeline(err.message)
    } finally {
      setIsGenerating(false)
      setFeedbackText('')
      setSubmitting(false)
    }
  }

  async function submitResearchFresh() {
    if (!await confirm({ title: 'Start Fresh', message: 'This will delete the current research report and start completely fresh. The researcher will not see its previous work. Are you sure?', confirmLabel: 'Start Fresh', variant: 'danger' })) return
    const direction = feedbackText.trim()
    setSubmitting(true)
    setResearchMode(null)
    if (researchOutput) await saveRevision('researcher', researchOutput)
    await supabase.from('agent_outputs').delete().eq('project_id', projectId).eq('agent_name', 'researcher')
    await load()
    await runResearcher(briefs[0]?.brief_text ?? `Project: ${project.name}`, direction || null)
    setFeedbackText('')
    setSubmitting(false)
  }

  // ── Designer pipeline ─────────────────────────────────────────────────────

  async function runDesigner(briefText, researchText, feedback, pages = [], selectedWireframePages = ['index.html']) {
    setIsDesigning(true)
    setDesignMode(null)
    setDesignFeedbackText('')
    designStreamRef.current = ''

    const { data: record, error: insertErr } = await supabase
      .from('agent_outputs')
      .insert({ project_id: projectId, agent_name: 'designer', output_text: '', status: 'pending' })
      .select()
      .single()

    if (insertErr) {
      console.error('Failed to create designer record:', insertErr.message)
      setIsDesigning(false)
      return
    }

    // Fetch pages + replication config from DB
    const { data: projData } = await supabase.from('projects').select('pages, is_replication, replication_url').eq('id', projectId).single()
    const dbPages = projData?.pages
    const designRepl    = projData?.is_replication  ?? false
    const designReplUrl = projData?.replication_url ?? ''
    console.log('[Designer] pages fetched from projects table (raw):', JSON.stringify(dbPages))
    if (!dbPages?.length && !pages?.length) {
      setIsDesigning(false)
      showToast('No pages detected for this project — please use the Redetect Pages button on the brief section before running the Designer.')
      return
    }
    const effectivePages = dbPages?.length ? dbPages : pages?.length ? pages : [{ name: 'Home', filename: 'index.html' }]
    console.log('[Designer] effectivePages used for wireframe generation:', JSON.stringify(effectivePages))

    const pagesCtx = `\n\nThis site has the following pages: ${effectivePages.map(p => `${p.name} (${p.filename})`).join(', ')}.`
    let baseContext = `Client Brief:\n\n${briefText}\n\n---\n\nResearch Report:\n\n${researchText}${pagesCtx}`
    if (feedback) baseContext += `\n\n---\n\nFeedback from the project manager:\n\n${feedback}`

    const designerBriefSystem = DESIGNER_BRIEF_SYSTEM + (designRepl ? replicationAddition('designer', designReplUrl) : '')

    pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'designer', stepLabel: 'Design Brief' })
    try {
      const designTokenCalls = []

      // ── Step 1: Design brief ───────────────────────────────────────────────
      let designBriefText = ''
      const { inputTokens: dbIn, outputTokens: dbOut, stopReason: dbStopReason } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: baseContext }],
        systemPrompt: designerBriefSystem,
        model:        'claude-sonnet-4-20250514',
        maxTokens:    30000,
        onChunk: (chunk) => {
          designBriefText += chunk
          setDesignStreamDisplay(designBriefText)
          pipeline.append(chunk)
        },
      })
      designTokenCalls.push({ label: 'Design Brief', input_tokens: dbIn, output_tokens: dbOut })

      // ── Step 2: Summarise design brief ────────────────────────────────────
      setDesignStreamDisplay(designBriefText + '\n\n--- Summarising design brief…')
      const { text: briefSummary, inputTokens: sumIn, outputTokens: sumOut } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: designBriefText }],
        systemPrompt: DESIGNER_SUMMARY_SYSTEM,
        model:        'claude-haiku-4-5-20251001',
        maxTokens:    30000,
      })
      designTokenCalls.push({ label: 'Summary', input_tokens: sumIn, output_tokens: sumOut })

      // ── Save design brief text first ───────────────────────────────────────
      const dTotalIn  = designTokenCalls.reduce((s, c) => s + c.input_tokens,  0)
      const dTotalOut = designTokenCalls.reduce((s, c) => s + c.output_tokens, 0)
      const designTokenUsage = {
        calls:         designTokenCalls,
        input_tokens:  dTotalIn,
        output_tokens: dTotalOut,
        total_tokens:  dTotalIn + dTotalOut,
        stop_reason:   dbStopReason,
      }
      const { error: designSaveErr } = await safeUpdate('agent_outputs', record.id, { output_text: designBriefText, token_usage: designTokenUsage }, { output_text: designBriefText })
      if (designSaveErr) throw new Error(`Designer save failed: ${designSaveErr.message}`)

      // ── Step 3: Moodboard JSON ─────────────────────────────────────────────
      setDesignStreamDisplay(designBriefText + '\n\n--- Generating moodboard…')
      let moodboardJson = null
      const { text: moodboardRaw, inputTokens: mbIn, outputTokens: mbOut } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: designBriefText }],
        systemPrompt: 'You are a UI/UX designer creating a moodboard brief for a web design project. Based on the design brief provided output ONLY a valid JSON object with no explanation and no markdown code blocks. The JSON must have these keys: palette which is an array of 6 colour objects each with a hex string and a label string describing the colour role for example Primary Background or Accent CTA, typography which is an object with two keys heading containing font name and sample text and body containing font name and sample text, textures which is an array of 3 strings describing visual texture or pattern directions for example Subtle grain overlay on hero or Clean flat surfaces with sharp edges, mood_words which is an array of 8 single words capturing the visual mood for example Sophisticated, Minimal, Bold, imagery_direction which is a string of 2 to 3 sentences describing the photography and imagery style, ui_style which is a string describing the overall UI component style for example Rounded cards with soft shadows and generous whitespace.',
        model:        'claude-sonnet-4-20250514',
        maxTokens:    8000,
      })
      designTokenCalls.push({ label: 'Moodboard', input_tokens: mbIn, output_tokens: mbOut })
      const mbStripped = moodboardRaw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      try {
        JSON.parse(mbStripped) // validate — throws if malformed
        moodboardJson = mbStripped
      } catch (mbParseErr) {
        console.warn('[Designer] moodboard JSON parse failed — raw response:', moodboardRaw.slice(0, 300), 'error:', mbParseErr.message)
      }
      if (moodboardJson) {
        const mbTotalIn  = designTokenCalls.reduce((s, c) => s + c.input_tokens,  0)
        const mbTotalOut = designTokenCalls.reduce((s, c) => s + c.output_tokens, 0)
        const updatedTokenUsage = { ...designTokenUsage, calls: designTokenCalls, input_tokens: mbTotalIn, output_tokens: mbTotalOut, total_tokens: mbTotalIn + mbTotalOut }
        await safeUpdate('agent_outputs', record.id, { output_moodboard: moodboardJson, token_usage: updatedTokenUsage })
        console.log('[Designer] Moodboard generation complete — saved to Supabase, length:', moodboardJson.length)
      } else {
        console.warn('[Designer] Moodboard generation complete — JSON invalid, not saved')
      }

      // ── Step 4: wireframes ────────────────────────────────────────────────
      // In auto-approval mode guarantee the homepage/first page is always generated.
      // Compute the pages to wireframe: honour selectedWireframePages when possible,
      // but fall back to effectivePages[0] so a filename mismatch never silently
      // skips the wireframe step and lets auto-approval fire with no wireframe saved.
      let wireframePages = effectivePages.filter(p => selectedWireframePages.includes(p.filename))
      const isAutoMode = autoRunSettingsRef.current.autoDesigner && !autoRunAbortedRef.current
      if (wireframePages.length === 0) {
        if (isAutoMode) {
          // Fallback: always generate at least the first page in auto mode
          wireframePages = [effectivePages[0]]
          console.log('[Designer] selectedWireframePages did not match any effectivePages — falling back to first page:', effectivePages[0]?.filename)
        } else {
          console.log('[Designer] No wireframe pages selected — skipping wireframe generation')
        }
      }
      if (wireframePages.length > 0) {
        for (let i = 0; i < wireframePages.length; i++) {
          const page = wireframePages[i]
          setWireframeProgress({ current: i + 1, total: wireframePages.length, pageName: page.name })
          setDesignStreamDisplay(designBriefText + `\n\n--- Generating wireframe for ${page.name} (${page.filename})…`)
          pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'designer', stepLabel: `Wireframe — ${page.name}` })
          const { svg, layoutSeed } = await generatePageWireframe(briefSummary, page, designTokenCalls, moodboardJson)
          const wfAgentName = `Designer-Wireframe-${page.filename}`
          const { data: existingWf } = await supabase
            .from('agent_outputs')
            .select('id')
            .eq('project_id', projectId)
            .eq('agent_name', wfAgentName)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (existingWf) {
            await safeUpdate('agent_outputs', existingWf.id, { output_wireframe: svg, output_text: layoutSeed, status: 'pending' })
          } else {
            await supabase.from('agent_outputs').insert({
              project_id:       projectId,
              agent_name:       wfAgentName,
              output_wireframe: svg,
              output_text:      layoutSeed,
              status:           'pending',
            })
          }
          console.log(`[Designer] Wireframe generation complete — saved for ${page.filename}`)
        }
        setWireframeProgress(null)
      }

      pipeline.complete()
      // Clear isDesigning NOW so the wireframe and moodboard sections become
      // visible immediately. Without this, isDesigning stays true through the
      // entire runDeveloper call (finally only runs after the awaited chain),
      // which keeps designIsStreaming = true and hides both sections.
      setIsDesigning(false)
      await load()

      // Auto-approve designer if enabled — inline to avoid stale designOutput closure.
      // Both moodboard and wireframe saves are awaited above before this check runs.
      console.log('[Designer] Proceeding to auto-approval check — moodboard saved:', !!moodboardJson, '| wireframes generated:', wireframePages.length)
      if (autoRunSettingsRef.current.autoDesigner && !autoRunAbortedRef.current) {
        completeAutoRunStage('designer', 'developer')
        setApprovingDesign(true)
        await Promise.all([
          safeUpdate('agent_outputs', record.id, { status: 'approved' }),
          safeUpdate('projects', projectId, { current_stage: 'Dev' }),
        ])
        await load()
        setApprovingDesign(false)
        // Use local-scope variables (briefText, researchText, designBriefText, effectivePages)
        // instead of state-derived values which are stale in this async closure
        await runDeveloper(briefText, researchText, designBriefText, null, effectivePages)
      }
    } catch (err) {
      console.error('Designer agent error:', err)
      pipeline.errorPipeline(err.message)
      handleAutoRunError('designer')
    } finally {
      setIsDesigning(false)
    }
  }

  async function approveDesign() {
    if (!designOutput) return
    setApprovingDesign(true)
    await Promise.all([
      safeUpdate('agent_outputs', designOutput.id, { status: 'approved' }),
      safeUpdate('projects', projectId, { current_stage: 'Dev' }),
    ])
    const capturedBrief    = briefs[0]?.brief_text ?? `Project: ${project.name}`
    const capturedResearch = agentOutputs.find(o => o.agent_name === 'researcher')?.output_text ?? ''
    const capturedDesign   = designOutput.output_text ?? ''
    const capturedPages    = project?.pages ?? []
    await load()
    setApprovingDesign(false)
    await runDeveloper(capturedBrief, capturedResearch, capturedDesign, null, capturedPages)
  }

  async function submitDesignFix() {
    if (!designFeedbackText.trim() || !designOutput) return
    setSubmittingDesign(true)
    setDesignMode(null)
    await saveRevision('designer', designOutput)
    const briefText   = briefs[0]?.brief_text ?? `Project: ${project.name}`
    const userContent = `Original Client Brief:\n\n${briefText}\n\n---\n\nYour Previous Output:\n\n${designOutput.output_text}\n\n---\n\nIssue to Fix:\n\n${designFeedbackText.trim()}`
    const capturedId  = designOutput.id
    await safeUpdate('agent_outputs', capturedId, { output_text: '', status: 'pending' })
    await load()
    setIsDesigning(true)
    designStreamRef.current = ''
    pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'designer', stepLabel: 'Design Fix' })
    try {
      const { inputTokens: dfIn, outputTokens: dfOut, stopReason: dfStop } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: userContent }],
        systemPrompt: DESIGNER_FIX_SYSTEM,
        model:        'claude-sonnet-4-20250514',
        maxTokens:    30000,
        onChunk: (chunk) => {
          designStreamRef.current += chunk
          setDesignStreamDisplay(designStreamRef.current)
          pipeline.append(chunk)
        },
      })
      const tokenUsage = { input_tokens: dfIn, output_tokens: dfOut, total_tokens: dfIn + dfOut, stop_reason: dfStop }
      const { error: saveErr } = await safeUpdate('agent_outputs', capturedId, { output_text: designStreamRef.current, token_usage: tokenUsage }, { output_text: designStreamRef.current })
      if (saveErr) throw new Error(saveErr.message)
      pipeline.complete()
      await load()
    } catch (err) {
      console.error('Design fix error:', err)
      pipeline.errorPipeline(err.message)
    } finally {
      setIsDesigning(false)
      setDesignFeedbackText('')
      setSubmittingDesign(false)
    }
  }

  async function submitDesignFresh() {
    if (!await confirm({ title: 'Start Fresh', message: 'This will delete the current design brief and wireframe and start completely fresh. The designer will not see its previous work. Are you sure?', confirmLabel: 'Start Fresh', variant: 'danger' })) return
    const direction      = designFeedbackText.trim()
    const latestResearch = agentOutputs.find(o => o.agent_name === 'researcher')
    setSubmittingDesign(true)
    setDesignMode(null)
    if (designOutput) await saveRevision('designer', designOutput)
    await supabase.from('agent_outputs').delete().eq('project_id', projectId).eq('agent_name', 'designer')
    await load()
    await runDesigner(briefs[0]?.brief_text ?? `Project: ${project.name}`, latestResearch?.output_text ?? '', direction || null, project?.pages ?? [])
    setDesignFeedbackText('')
    setSubmittingDesign(false)
  }

  async function regenerateMoodboard() {
    if (!designOutput) return
    setIsRegeneratingMoodboard(true)
    try {
      const { text: moodboardRaw } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: designOutput.output_text }],
        systemPrompt: 'You are a UI/UX designer creating a moodboard brief for a web design project. Based on the design brief provided output ONLY a valid JSON object with no explanation and no markdown code blocks. The JSON must have these keys: palette which is an array of 6 colour objects each with a hex string and a label string describing the colour role for example Primary Background or Accent CTA, typography which is an object with two keys heading containing font name and sample text and body containing font name and sample text, textures which is an array of 3 strings describing visual texture or pattern directions for example Subtle grain overlay on hero or Clean flat surfaces with sharp edges, mood_words which is an array of 8 single words capturing the visual mood for example Sophisticated, Minimal, Bold, imagery_direction which is a string of 2 to 3 sentences describing the photography and imagery style, ui_style which is a string describing the overall UI component style for example Rounded cards with soft shadows and generous whitespace.',
        model:        'claude-sonnet-4-20250514',
        maxTokens:    8000,
      })
      const stripped = moodboardRaw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      JSON.parse(stripped) // validate
      await safeUpdate('agent_outputs', designOutput.id, { output_moodboard: stripped })
      await load()
      console.log('[Designer] moodboard regenerated — length:', stripped.length)
    } catch (err) {
      console.error('[Designer] moodboard regeneration failed:', err.message)
    } finally {
      setIsRegeneratingMoodboard(false)
    }
  }

  async function goBackToResearch() {
    if (!await confirm({ title: 'Go Back to Research', message: 'Going back to Research will delete the Designer, Developer and Reviewer outputs for this project. This cannot be undone.', confirmLabel: 'Delete and Go Back', variant: 'danger' })) return
    setGoingBack(true)
    // Delete all dev, designer, reviewer records including per-page variants
    const toDelete = agentOutputs.filter(o =>
      o.agent_name === 'designer' || o.agent_name === 'reviewer' ||
      o.agent_name === 'Developer-HTML' ||
      ['Developer-Stack','Developer-CSS','Developer-JS','Developer-Pages'].includes(o.agent_name) ||
      o.agent_name.startsWith('Developer-HTML-') ||
      o.agent_name.startsWith('Designer-Wireframe-')
    )
    if (toDelete.length) await supabase.from('agent_outputs').delete().in('id', toDelete.map(r => r.id))
    const { data: researcherRecord } = await supabase.from('agent_outputs').select('id').eq('project_id', projectId).eq('agent_name', 'researcher').single()
    if (researcherRecord?.id) await safeUpdate('agent_outputs', researcherRecord.id, { status: 'pending' })
    await safeUpdate('projects', projectId, { current_stage: 'Research' })
    setPageStatuses({})
    await load()
    setGoingBack(false)
  }

  async function runDeveloper(briefText, researchText, designText, feedback, pages = []) {
    setIsDeveloping(true)
    setDevMode(null)
    setDevFeedbackText('')
    setApprovedPages(new Set())
    setPageSelectModal(null)
    setPageSelectChoice('')
    setSkipToReview(false)

    const { isReplication: devRepl, replicationUrl: devReplUrl } = await fetchReplicationConfig()
    const devReplSnippet = devRepl ? replicationAddition('developer', devReplUrl) : ''

    const effectivePages  = pages?.length ? pages : [{ name: 'Home', filename: 'index.html' }]
    setPageStatuses(Object.fromEntries(effectivePages.map(p => [p.filename, 'pending'])))
    const allPagesCtx     = `\n\nAll pages in this site: ${effectivePages.map(p => `${p.name} → ${p.filename}`).join(', ')}.`
    const totalSteps      = 3 + effectivePages.length

    // ── Pre-step: summarise design brief + research down to developer-relevant context ──
    const devSummaryInput = `Design Brief:\n\n${designText}\n\n---\n\nResearch Report:\n\n${researchText}`
    let devSummary
    try {
      const { text } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: devSummaryInput }],
        systemPrompt: DEV_SUMMARY_SYSTEM,
        model:        'claude-haiku-4-5-20251001',
        maxTokens:    2000,
      })
      devSummary = text
      console.log(`[Developer] Context reduction — full: ${devSummaryInput.length} chars → summary: ${devSummary.length} chars (${Math.round((1 - devSummary.length / devSummaryInput.length) * 100)}% reduction)`)
    } catch (sumErr) {
      console.error('[Developer] Summary step failed:', sumErr.message)
      throw sumErr
    }
    // Persist summary (requires developer_summary column: ALTER TABLE agent_outputs ADD COLUMN developer_summary text;)
    try {
      const { data: existingSumRec } = await supabase
        .from('agent_outputs').select('id')
        .eq('project_id', projectId).eq('agent_name', 'Developer-Summary').maybeSingle()
      if (existingSumRec) {
        await safeUpdate('agent_outputs', existingSumRec.id, { developer_summary: devSummary })
      } else {
        await supabase.from('agent_outputs').insert({
          project_id:        projectId,
          agent_name:        'Developer-Summary',
          developer_summary: devSummary,
          status:            'pending',
        })
      }
    } catch (saveErr) {
      console.warn('[Developer] Summary save failed (column may not exist yet):', saveErr.message)
    }

    const summaryContext      = `Developer Summary:\n\n${devSummary}${allPagesCtx}`
    const summaryWithFeedback = summaryContext + (feedback ? `\n\n---\n\nFeedback:\n\n${feedback}` : '')

    async function checkDevIntegrity(cssText, jsText) {
      console.log('[Dev integrity] ── final pipeline integrity check ──')
      const { data } = await supabase.from('agent_outputs').select('id, agent_name, output_text').eq('project_id', projectId)
      if (!data) return
      for (const page of effectivePages) {
        const rec = data.find(r => r.agent_name === `Developer-HTML-${page.filename}`)
        if (!rec || !rec.output_text?.trim()) console.warn(`[Dev integrity] WARNING: Developer-HTML-${page.filename} MISSING or empty`)
        else console.log(`[Dev integrity] ✓ Developer-HTML-${page.filename}: ${rec.output_text.length} chars`)
      }

      // Auto-fix: replace fixed pixel widths and append missing .expanded rule
      const cssRec = data.find(r => r.agent_name === 'Developer-CSS')
      if (cssRec?.output_text) {
        let patched = cssRec.output_text
        const toasts = []

        // Fix 1: fixed pixel widths outside media queries
        const outsideMedia = stripMediaBlocks(patched)
        const fixedWidthRe = /\bwidth\s*:\s*(\d+)px/g
        let hasFixedWidth = false
        let m
        while ((m = fixedWidthRe.exec(outsideMedia)) !== null) {
          if (parseInt(m[1], 10) > 800) { hasFixedWidth = true; break }
        }
        if (hasFixedWidth) {
          patched = patched.replace(/\bwidth\s*:\s*(\d{3,4})px/g, (match, px) => {
            if (parseInt(px, 10) > 800) return `width: 100%; max-width: ${px}px`
            return match
          })
          console.log('[Dev integrity] ✓ Auto-fixed: replaced fixed pixel width(s) with max-width pattern in Developer-CSS')
          toasts.push('Auto-fixed: replaced fixed width 1200px with max-width pattern')
        }

        // Fix 2: missing .expanded rule
        if (!/\.expanded\s*\{/.test(patched)) {
          patched += '\n\n.expanded { max-height: 1000px; overflow: hidden; transition: max-height 0.4s ease; }'
          console.log('[Dev integrity] ✓ Auto-fixed: appended missing .expanded rule to Developer-CSS')
          toasts.push('Auto-fixed: added missing .expanded CSS rule')
        }

        if (toasts.length > 0) {
          await safeUpdate('agent_outputs', cssRec.id, { output_text: patched })
          for (const msg of toasts) showToast(msg, 'success')
          validateCrossFileClasses(patched, jsText)
          return
        }
      }

      validateCrossFileClasses(cssText, jsText)
    }

    pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'Developer-Stack', stepLabel: `Step 1 of ${totalSteps}: Tech Stack` })
    try {
      // Step 1: Tech Stack and File Structure
      await runDevStep(`Step 1 of ${totalSteps}: Tech Stack and File Structure`, DEVELOPER_STACK_SYSTEM + devReplSnippet, summaryWithFeedback, 'Developer-Stack')

      // Step 2: CSS — generated from design brief
      pipeline.setStep('Developer-CSS', `Step 2 of ${totalSteps}: CSS Stylesheet`, Math.round(1 / totalSteps * 100))
      const cssText = await runDevStep(`Step 2 of ${totalSteps}: CSS Stylesheet`, DEVELOPER_CSS_SYSTEM + devReplSnippet, summaryContext, 'Developer-CSS', { transform: stripCodeFences })

      // Step 3: JS — receives the CSS so it can use matching class names
      pipeline.setStep('Developer-JS', `Step 3 of ${totalSteps}: JavaScript`, Math.round(2 / totalSteps * 100))
      const jsCtx  = `${summaryContext}\n\n---\n\nCSS stylesheet (styles.css) already written:\n\n${cssText}`
      const jsText = await runDevStep(`Step 3 of ${totalSteps}: JavaScript`, DEVELOPER_JS_SYSTEM + devReplSnippet, jsCtx, 'Developer-JS', { transform: stripCodeFences })

      // Step 4: Generate index.html only — remaining pages generated after per-page approval
      const indexPage = effectivePages.find(p => p.filename === 'index.html') ?? effectivePages[0]
      console.log(`[Developer] HTML generation — starting with: ${indexPage.filename} (${indexPage.name}). ${effectivePages.length > 1 ? `${effectivePages.length - 1} further page(s) pending per-page approval.` : 'Single-page project.'}`)
      setPageStatuses(prev => ({ ...prev, [indexPage.filename]: 'generating' }))
      pipeline.setStep(`Developer-HTML-${indexPage.filename}`, `Step 4 of ${totalSteps}: HTML – ${indexPage.name}`, Math.round(3 / totalSteps * 100))
      const { data: indexWireRec } = await supabase
        .from('agent_outputs')
        .select('output_wireframe')
        .eq('project_id', projectId)
        .eq('agent_name', `Designer-Wireframe-${indexPage.filename}`)
        .maybeSingle()
      const indexWireCtx = indexWireRec?.output_wireframe
        ? `\n\n---\n\nWireframe context: A wireframe SVG exists for the ${indexPage.name} page (${indexPage.filename}). Follow its layout structure.`
        : ''
      console.log(`[Developer] Wireframe for ${indexPage.filename}: ${indexWireRec?.output_wireframe ? 'found' : 'not found'}`)
      const indexHtmlCtx = `${summaryContext}\n\n---\n\nCSS stylesheet (styles.css) already written:\n\n${cssText}\n\n---\n\nJavaScript (script.js) already written:\n\n${jsText}${indexWireCtx}`
      try {
        await runDevStep(
          `Step 4 of ${totalSteps}: HTML for ${indexPage.name} (${indexPage.filename})`,
          devHtmlPageSystem(indexPage.name) + devReplSnippet,
          indexHtmlCtx,
          `Developer-HTML-${indexPage.filename}`,
          { transform: stripCodeFences }
        )
        console.log(`[Developer] ✓ Saved Developer-HTML-${indexPage.filename} successfully`)
        setPageStatuses(prev => ({ ...prev, [indexPage.filename]: 'complete' }))
      } catch (pageErr) {
        console.error(`[Developer] ✗ HTML generation FAILED for ${indexPage.filename}:`, pageErr.message)
        setPageStatuses(prev => ({ ...prev, [indexPage.filename]: 'failed' }))
      }

      await checkDevIntegrity(cssText, jsText)
      pipeline.complete()

      // ── Save all Developer files to local disk ──
      {
        const filesToSave = [
          { filename: 'styles.css', content: cssText },
          { filename: 'script.js', content: jsText },
        ]
        const { data: htmlRecs } = await supabase
          .from('agent_outputs')
          .select('agent_name, output_text')
          .eq('project_id', projectId)
        for (const rec of htmlRecs ?? []) {
          if (rec.agent_name.startsWith('Developer-HTML-') && rec.output_text?.trim()) {
            filesToSave.push({ filename: rec.agent_name.slice('Developer-HTML-'.length), content: rec.output_text })
          }
        }
        await saveFilesToDisk(project?.clients?.name ?? '', project?.name ?? '', filesToSave, showToast)
      }

      // ── Setup guide: generate when auth or downloads are requested ──
      const needsSetupGuide = /Authentication:\s*Required|Downloadable files:\s*Required/i.test(briefText)
      if (needsSetupGuide) {
        console.log('[Developer] Auth/storage detected in brief — generating Client Setup Guide')
        setIsGeneratingGuide(true)
        try {
          const guideContext = `Project: ${project?.name ?? 'Unnamed'}\nClient: ${project?.clients?.name ?? 'Unknown'}\n\n---\n\nBrief excerpt (technical requirements):\n\n${briefText}`
          const { text: guideText } = await streamAnthropicCall({
            messages:     [{ role: 'user', content: guideContext }],
            systemPrompt: SETUP_GUIDE_SYSTEM,
            model:        'claude-haiku-4-5-20251001',
            maxTokens:    4000,
          })
          const existing = await supabase.from('agent_outputs').select('id').eq('project_id', projectId).eq('agent_name', 'Developer-SetupGuide').maybeSingle()
          if (existing.data?.id) {
            await safeUpdate('agent_outputs', existing.data.id, { output_text: guideText, status: 'pending' })
          } else {
            await supabase.from('agent_outputs').insert({ project_id: projectId, agent_name: 'Developer-SetupGuide', output_text: guideText, status: 'pending' })
          }
          console.log('[Developer] ✓ Client Setup Guide saved')
          await load()
          setSetupGuideOpen(true)
        } catch (guideErr) {
          console.warn('[Developer] Setup guide generation failed:', guideErr.message)
        } finally {
          setIsGeneratingGuide(false)
        }
      }

      // Auto-approve developer if enabled — inline to avoid stale agentOutputs closure.
      // agentOutputs state is frozen at the render when runDeveloper was called (before any
      // dev records existed), so we query the DB fresh to find the records to approve.
      if (autoRunSettingsRef.current.autoDeveloper && !autoRunAbortedRef.current) {
        completeAutoRunStage('developer', 'reviewer')
        setApprovingDev(true)
        const { data: freshRecs } = await supabase
          .from('agent_outputs')
          .select('id, agent_name, output_text')
          .eq('project_id', projectId)
        const devRecsToApprove = (freshRecs ?? []).filter(o =>
          ['Developer-Stack','Developer-CSS','Developer-JS','Developer-HTML','Developer-Pages'].includes(o.agent_name) ||
          o.agent_name.startsWith('Developer-HTML-')
        )
        await Promise.all([
          ...devRecsToApprove.map(r => safeUpdate('agent_outputs', r.id, { status: 'approved' })),
          safeUpdate('projects', projectId, { current_stage: 'Review' }),
        ])
        // Build HTML context from fresh records; use local cssText/jsText/briefText etc.
        const htmlPageRecs = (freshRecs ?? []).filter(o => o.agent_name.startsWith('Developer-HTML-'))
        const htmlText = htmlPageRecs.length
          ? htmlPageRecs.map(r => `=== ${r.agent_name.replace('Developer-HTML-', '')} ===\n\n${r.output_text}`).join('\n\n---\n\n')
          : ((freshRecs ?? []).find(o => o.agent_name === 'Developer-HTML')?.output_text ?? '')
        await load()
        setApprovingDev(false)
        await runReviewer(briefText, researchText, designText, htmlText, cssText, jsText)
      }
    } catch (err) {
      console.error('Developer agent error:', err)
      pipeline.errorPipeline(err.message)
      handleAutoRunError('developer')
    } finally {
      setIsDeveloping(false)
      setDevCurrentStep(null)
    }
  }

  async function retryHtmlPage(page) {
    const css    = agentOutputs.find(o => o.agent_name === 'Developer-CSS')?.output_text ?? ''
    const js     = agentOutputs.find(o => o.agent_name === 'Developer-JS')?.output_text  ?? ''
    const design = agentOutputs.find(o => o.agent_name === 'designer')?.output_text      ?? ''
    const allPages    = project?.pages ?? []
    const allPagesCtx = allPages.length ? `\n\nAll pages in this site: ${allPages.map(p => `${p.name} → ${p.filename}`).join(', ')}.` : ''
    const { data: wireRec } = await supabase
      .from('agent_outputs').select('output_wireframe')
      .eq('project_id', projectId).eq('agent_name', `Designer-Wireframe-${page.filename}`).maybeSingle()
    const wireCtx = wireRec?.output_wireframe
      ? `\n\n---\n\nWireframe context: A wireframe SVG exists for the ${page.name} page (${page.filename}). Follow its layout structure.`
      : ''
    const ctx = `Design Brief:\n\n${design}${allPagesCtx}\n\n---\n\nCSS stylesheet (styles.css):\n\n${css}\n\n---\n\nJavaScript (script.js):\n\n${js}${wireCtx}`
    console.log(`[Developer] Retrying HTML for ${page.filename}`)
    setPageStatuses(prev => ({ ...prev, [page.filename]: 'generating' }))
    setIsDeveloping(true)
    try {
      await runDevStep(
        `HTML for ${page.name} (${page.filename})`,
        devHtmlPageSystem(page.name),
        ctx,
        `Developer-HTML-${page.filename}`,
        { transform: stripCodeFences }
      )
      console.log(`[Developer] ✓ Retry succeeded for ${page.filename}`)
      setPageStatuses(prev => ({ ...prev, [page.filename]: 'complete' }))
    } catch (err) {
      console.error(`[Developer] ✗ Retry FAILED for ${page.filename}:`, err.message)
      setPageStatuses(prev => ({ ...prev, [page.filename]: 'failed' }))
    } finally {
      setIsDeveloping(false)
    }
  }

  // Generate a single HTML page — called after per-page approval to build the next page
  async function runSingleHtmlPage(page) {
    setIsDeveloping(true)
    setPageStatuses(prev => ({ ...prev, [page.filename]: 'generating' }))
    const { data: freshData } = await supabase
      .from('agent_outputs')
      .select('agent_name, output_text, developer_summary')
      .eq('project_id', projectId)
    const css        = freshData?.find(o => o.agent_name === 'Developer-CSS')?.output_text ?? ''
    const js         = freshData?.find(o => o.agent_name === 'Developer-JS')?.output_text  ?? ''
    const allPages   = project?.pages ?? []
    const allPagesCtx = allPages.length ? `\n\nAll pages in this site: ${allPages.map(p => `${p.name} → ${p.filename}`).join(', ')}.` : ''
    const devSumRec  = freshData?.find(o => o.agent_name === 'Developer-Summary')
    const baseCtx    = devSumRec?.developer_summary
      ? `Developer Summary:\n\n${devSumRec.developer_summary}${allPagesCtx}`
      : `Pages in this site:${allPagesCtx}`
    const { data: wireRec } = await supabase
      .from('agent_outputs').select('output_wireframe')
      .eq('project_id', projectId).eq('agent_name', `Designer-Wireframe-${page.filename}`).maybeSingle()
    const wireCtx = wireRec?.output_wireframe
      ? `\n\n---\n\nWireframe context: A wireframe SVG exists for the ${page.name} page (${page.filename}). Follow its layout structure.`
      : ''
    console.log(`[Developer] Wireframe for ${page.filename}: ${wireRec?.output_wireframe ? 'found' : 'not found'}`)
    const htmlCtx = `${baseCtx}\n\n---\n\nCSS stylesheet (styles.css) already written:\n\n${css}\n\n---\n\nJavaScript (script.js) already written:\n\n${js}${wireCtx}`
    console.log(`[Developer] Generating HTML for ${page.filename} (${page.name}) via per-page approval flow`)
    try {
      await runDevStep(
        `HTML for ${page.name} (${page.filename})`,
        devHtmlPageSystem(page.name),
        htmlCtx,
        `Developer-HTML-${page.filename}`,
        { transform: stripCodeFences }
      )
      console.log(`[Developer] ✓ Saved Developer-HTML-${page.filename} successfully`)
      setPageStatuses(prev => ({ ...prev, [page.filename]: 'complete' }))
    } catch (err) {
      console.error(`[Developer] ✗ HTML generation FAILED for ${page.filename}:`, err.message)
      setPageStatuses(prev => ({ ...prev, [page.filename]: 'failed' }))
    } finally {
      setIsDeveloping(false)
    }
  }

  // Mark a page as approved and show the page-selection modal for the next page (if any)
  async function handleApprovePageStep(filename) {
    // Persist approval to DB immediately
    const htmlRec = agentOutputs.find(o => o.agent_name === `Developer-HTML-${filename}`)
    if (htmlRec) {
      await safeUpdate('agent_outputs', htmlRec.id, { status: 'approved' })
    }

    // Optimistic update so the UI responds before load() completes
    const newApproved = new Set(approvedPages)
    newApproved.add(filename)
    setApprovedPages(newApproved)

    // Re-fetch so Pages Progress syncs from DB immediately
    await load()

    const allPages = project?.pages ?? []
    if (allPages.length <= 1) return // single-page site — overall Approve button will appear

    // Find remaining unbuilt pages
    const { data: existingOutputs } = await supabase
      .from('agent_outputs').select('agent_name').eq('project_id', projectId)
    const generatedSet = new Set(
      (existingOutputs ?? [])
        .filter(o => o.agent_name.startsWith('Developer-HTML-'))
        .map(o => o.agent_name.replace('Developer-HTML-', ''))
    )
    const remainingPages = allPages.filter(p => !generatedSet.has(p.filename))
    if (remainingPages.length === 0) return // all pages built — overall Approve button becomes visible

    // Pre-select the first remaining page and open the modal
    setPageSelectChoice(remainingPages[0].filename)
    setPageSelectModal({ approvedFilename: filename, remainingPages })
  }

  // Called when user confirms a page selection in the modal
  async function handleBuildSelectedPage() {
    const allPages = project?.pages ?? []
    const page = allPages.find(p => p.filename === pageSelectChoice)
    setPageSelectModal(null)
    setPageSelectChoice('')
    if (page) await runSingleHtmlPage(page)
  }

  // Called when user clicks "Skip remaining pages and go to Review"
  function handleSkipToReview() {
    setSkipToReview(true)
    setPageSelectModal(null)
    setPageSelectChoice('')
  }

  async function patchMissingCssClasses(missingClasses) {
    const cssRec = agentOutputs.find(o => o.agent_name === 'Developer-CSS')
    if (!cssRec || !missingClasses.length) return
    setIsPatchingCss(true)
    const rulesToAppend = missingClasses
      .filter(cls => CSS_PATCH_RULES[cls])
      .map(cls => CSS_PATCH_RULES[cls])
      .join('\n')
    if (!rulesToAppend) { setIsPatchingCss(false); return }
    await saveRevision('Developer-CSS', cssRec)
    const patched = (cssRec.output_text ?? '') + '\n' + rulesToAppend
    await safeUpdate('agent_outputs', cssRec.id, { output_text: patched }, { output_text: patched })
    await load()
    setIsPatchingCss(false)
    showToast(`Patched ${missingClasses.length} missing class${missingClasses.length > 1 ? 'es' : ''}: ${missingClasses.join(', ')}`)
  }

  async function approveDev() {
    const allDevRecs = agentOutputs.filter(o =>
      ['Developer-Stack','Developer-CSS','Developer-JS','Developer-HTML','Developer-Pages'].includes(o.agent_name) ||
      o.agent_name.startsWith('Developer-HTML-')
    )
    if (!allDevRecs.length) return
    setApprovingDev(true)
    await Promise.all([
      ...allDevRecs.map(r => safeUpdate('agent_outputs', r.id, { status: 'approved' })),
      safeUpdate('projects', projectId, { current_stage: 'Review' }),
    ])
    await load()
    setApprovingDev(false)
    // Auto-trigger Reviewer
    const brief    = briefs[0]?.brief_text ?? `Project: ${project.name}`
    const research = agentOutputs.find(o => o.agent_name === 'researcher')?.output_text ?? ''
    const design   = agentOutputs.find(o => o.agent_name === 'designer')?.output_text   ?? ''
    const css      = agentOutputs.find(o => o.agent_name === 'Developer-CSS')?.output_text ?? ''
    const js       = agentOutputs.find(o => o.agent_name === 'Developer-JS')?.output_text  ?? ''
    // Build combined HTML context — multi-page or legacy single file
    const htmlPageRecs = agentOutputs.filter(o => o.agent_name.startsWith('Developer-HTML-'))
    const htmlText = htmlPageRecs.length
      ? htmlPageRecs.map(r => `=== ${r.agent_name.replace('Developer-HTML-', '')} ===\n\n${r.output_text}`).join('\n\n---\n\n')
      : (agentOutputs.find(o => o.agent_name === 'Developer-HTML')?.output_text ?? '')
    await runReviewer(brief, research, design, htmlText, css, js)
  }

  async function runReviewer(briefText, researchText, designText, htmlText, cssText, jsText, feedback = null) {
    setIsReviewing(true)
    setReviewStreamDisplay('')
    reviewStreamRef.current = ''

    // Delete any existing reviewer record
    await supabase.from('agent_outputs').delete().eq('project_id', projectId).eq('agent_name', 'reviewer')

    const { data: record, error: insertErr } = await supabase
      .from('agent_outputs')
      .insert({ project_id: projectId, agent_name: 'reviewer', output_text: '', status: 'pending' })
      .select().single()
    if (insertErr) { console.error('[Reviewer] INSERT FAILED:', insertErr.message); setIsReviewing(false); return }

    let userContent = `Client Brief:\n\n${briefText}\n\n---\n\nResearch Report:\n\n${researchText}\n\n---\n\nDesign Brief:\n\n${designText}\n\n---\n\nHTML Files:\n\n${htmlText}\n\n---\n\nCSS File (styles.css):\n\n${cssText}\n\n---\n\nJavaScript File (script.js):\n\n${jsText}`
    if (feedback) userContent += `\n\n---\n\nAdditional review instructions:\n\n${feedback}`

    pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'reviewer', stepLabel: 'Reviewer Report' })
    try {
      const { inputTokens: rvIn, outputTokens: rvOut, stopReason: rvStop } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: userContent }],
        systemPrompt: REVIEWER_SYSTEM,
        maxTokens:    30000,
        onChunk: (chunk) => {
          reviewStreamRef.current += chunk
          setReviewStreamDisplay(reviewStreamRef.current)
          pipeline.append(chunk)
        },
      })
      const tokenUsage = { input_tokens: rvIn, output_tokens: rvOut, total_tokens: rvIn + rvOut, stop_reason: rvStop }
      const { error: saveErr } = await safeUpdate('agent_outputs', record.id, { output_text: reviewStreamRef.current, token_usage: tokenUsage }, { output_text: reviewStreamRef.current })
      if (saveErr) console.error('[Reviewer] Save failed:', saveErr.message)
      pipeline.complete()
      await load()

      // Auto-approve reviewer if enabled (inline to show complete modal instead of delivery modal)
      if (autoRunSettingsRef.current.autoReviewer && !autoRunAbortedRef.current) {
        completeAutoRunStage('reviewer', null)
        await Promise.all([
          safeUpdate('agent_outputs', record.id, { status: 'approved' }),
          safeUpdate('projects', projectId, { current_stage: 'Delivered' }),
        ])
        await load()
      }
    } catch (err) {
      console.error('Reviewer agent error:', err)
      pipeline.errorPipeline(err.message)
      handleAutoRunError('reviewer')
    } finally {
      setIsReviewing(false)
    }
  }

  async function approveReview() {
    const reviewerRec = agentOutputs.find(o => o.agent_name === 'reviewer')
    if (!reviewerRec) return
    setApprovingReview(true)
    await Promise.all([
      safeUpdate('agent_outputs', reviewerRec.id, { status: 'approved' }),
      safeUpdate('projects', projectId, { current_stage: 'Delivered' }),
    ])
    await load()
    setApprovingReview(false)
    setDeliveryModalOpen(true)
  }

  async function submitReviewerFix() {
    if (!reviewFeedbackText.trim()) return
    const reviewerRec = agentOutputs.find(o => o.agent_name === 'reviewer')
    if (!reviewerRec) return
    setSubmittingReview(true)
    setReviewMode(null)
    await saveRevision('reviewer', reviewerRec)
    const brief    = briefs[0]?.brief_text ?? `Project: ${project.name}`
    const research = agentOutputs.find(o => o.agent_name === 'researcher')?.output_text ?? ''
    const design   = agentOutputs.find(o => o.agent_name === 'designer')?.output_text   ?? ''
    const css      = agentOutputs.find(o => o.agent_name === 'Developer-CSS')?.output_text ?? ''
    const js       = agentOutputs.find(o => o.agent_name === 'Developer-JS')?.output_text  ?? ''
    const htmlFixPageRecs = agentOutputs.filter(o => o.agent_name.startsWith('Developer-HTML-'))
    const html = htmlFixPageRecs.length
      ? htmlFixPageRecs.map(r => `=== ${r.agent_name.replace('Developer-HTML-', '')} ===\n\n${r.output_text}`).join('\n\n---\n\n')
      : (agentOutputs.find(o => o.agent_name === 'Developer-HTML')?.output_text ?? '')
    const uc = `Client Brief:\n\n${brief}\n\n---\n\nResearch Report:\n\n${research}\n\n---\n\nDesign Brief:\n\n${design}\n\n---\n\nHTML Files:\n\n${html}\n\n---\n\nCSS File:\n\n${css}\n\n---\n\nJavaScript File:\n\n${js}\n\n---\n\nYour Previous Review:\n\n${reviewerRec.output_text}\n\n---\n\nIssue to Fix:\n\n${reviewFeedbackText.trim()}`
    await safeUpdate('agent_outputs', reviewerRec.id, { output_text: '', status: 'pending' })
    await load()
    setIsReviewing(true)
    reviewStreamRef.current = ''
    setReviewStreamDisplay('')
    pipeline.start({ projectId, projectName: project?.name, clientName: project?.clients?.name, agentName: 'reviewer', stepLabel: 'Review Fix' })
    try {
      const { inputTokens: rfxIn, outputTokens: rfxOut, stopReason: rfxStop } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: uc }],
        systemPrompt: REVIEWER_FIX_SYSTEM,
        maxTokens:    30000,
        onChunk: (chunk) => {
          reviewStreamRef.current += chunk
          setReviewStreamDisplay(reviewStreamRef.current)
          pipeline.append(chunk)
        },
      })
      const tu = { input_tokens: rfxIn, output_tokens: rfxOut, total_tokens: rfxIn + rfxOut, stop_reason: rfxStop }
      const { error } = await safeUpdate('agent_outputs', reviewerRec.id, { output_text: reviewStreamRef.current, token_usage: tu }, { output_text: reviewStreamRef.current })
      if (error) console.error('[Reviewer fix] Save failed:', error.message)
      pipeline.complete()
      await load()
    } catch (err) {
      console.error('Reviewer fix error:', err)
      pipeline.errorPipeline(err.message)
    } finally {
      setIsReviewing(false)
      setSubmittingReview(false)
      setReviewFeedbackText('')
    }
  }

  async function submitReviewerFresh() {
    if (!await confirm({ title: 'Start Fresh', message: 'This will delete the current Reviewer report and regenerate it from scratch. Are you sure?', confirmLabel: 'Start Fresh', variant: 'danger' })) return
    const direction = reviewFeedbackText.trim()
    const reviewerRec = agentOutputs.find(o => o.agent_name === 'reviewer')
    if (reviewerRec) await saveRevision('reviewer', reviewerRec)
    setSubmittingReview(true)
    setReviewMode(null)
    setReviewFeedbackText('')
    const brief    = briefs[0]?.brief_text ?? `Project: ${project.name}`
    const research = agentOutputs.find(o => o.agent_name === 'researcher')?.output_text ?? ''
    const design   = agentOutputs.find(o => o.agent_name === 'designer')?.output_text   ?? ''
    const css      = agentOutputs.find(o => o.agent_name === 'Developer-CSS')?.output_text ?? ''
    const js       = agentOutputs.find(o => o.agent_name === 'Developer-JS')?.output_text  ?? ''
    const htmlFreshPageRecs = agentOutputs.filter(o => o.agent_name.startsWith('Developer-HTML-'))
    const html = htmlFreshPageRecs.length
      ? htmlFreshPageRecs.map(r => `=== ${r.agent_name.replace('Developer-HTML-', '')} ===\n\n${r.output_text}`).join('\n\n---\n\n')
      : (agentOutputs.find(o => o.agent_name === 'Developer-HTML')?.output_text ?? '')
    await runReviewer(brief, research, design, html, css, js, direction || null)
    setSubmittingReview(false)
  }

  async function goBackToDev() {
    if (!await confirm({ title: 'Go Back to Dev', message: 'Going back to Dev will delete the Reviewer report and reset the Developer outputs to pending. This cannot be undone.', confirmLabel: 'Delete and Go Back', variant: 'danger' })) return
    setGoingBackFromReview(true)
    await supabase.from('agent_outputs').delete().eq('project_id', projectId).eq('agent_name', 'reviewer')
    const devRecs = agentOutputs.filter(o =>
      ['Developer-Stack', 'Developer-HTML', 'Developer-CSS', 'Developer-Pages', 'Developer-JS'].includes(o.agent_name) ||
      o.agent_name.startsWith('Developer-HTML-')
    )
    await Promise.all(devRecs.map(r => safeUpdate('agent_outputs', r.id, { status: 'pending' })))
    await safeUpdate('projects', projectId, { current_stage: 'Dev' })
    await load()
    setGoingBackFromReview(false)
  }

  async function submitDevFix() {
    if (!devFeedbackText.trim()) return
    const research   = agentOutputs.find(o => o.agent_name === 'researcher')
    const design     = agentOutputs.find(o => o.agent_name === 'designer')
    const toSaveRevs = agentOutputs.filter(o =>
      ['Developer-Stack','Developer-HTML','Developer-CSS','Developer-Pages','Developer-JS'].includes(o.agent_name) ||
      o.agent_name.startsWith('Developer-HTML-')
    )
    setSubmittingDev(true)
    setDevMode(null)
    for (const r of toSaveRevs) await saveRevision(r.agent_name, r)
    const toDeleteIds = toSaveRevs.map(r => r.id)
    if (toDeleteIds.length) await supabase.from('agent_outputs').delete().in('id', toDeleteIds)
    await load()
    await runDeveloper(briefs[0]?.brief_text ?? `Project: ${project.name}`, research?.output_text ?? '', design?.output_text ?? '', devFeedbackText.trim(), project?.pages ?? [])
    setDevFeedbackText('')
    setSubmittingDev(false)
  }

  async function submitDevFresh() {
    if (!await confirm({ title: 'Start Fresh', message: 'This will delete all current developer outputs and start completely fresh. The developer will not see its previous work. Are you sure?', confirmLabel: 'Start Fresh', variant: 'danger' })) return
    const direction  = devFeedbackText.trim()
    const research   = agentOutputs.find(o => o.agent_name === 'researcher')
    const design     = agentOutputs.find(o => o.agent_name === 'designer')
    const toSaveRevs = agentOutputs.filter(o =>
      ['Developer-Stack','Developer-HTML','Developer-CSS','Developer-Pages','Developer-JS'].includes(o.agent_name) ||
      o.agent_name.startsWith('Developer-HTML-')
    )
    setSubmittingDev(true)
    setDevMode(null)
    for (const r of toSaveRevs) await saveRevision(r.agent_name, r)
    const toDeleteIds = toSaveRevs.map(r => r.id)
    if (toDeleteIds.length) await supabase.from('agent_outputs').delete().in('id', toDeleteIds)
    await load()
    await runDeveloper(briefs[0]?.brief_text ?? `Project: ${project.name}`, research?.output_text ?? '', design?.output_text ?? '', direction || null, project?.pages ?? [])
    setDevFeedbackText('')
    setSubmittingDev(false)
  }

  async function goBackToDesign() {
    if (!await confirm({ title: 'Go Back to Design', message: 'Going back to Design will delete the Developer and Reviewer outputs for this project. This cannot be undone.', confirmLabel: 'Delete and Go Back', variant: 'danger' })) return
    setGoingBackToDev(true)
    // Delete static-named dev records + reviewer
    await supabase.from('agent_outputs').delete().eq('project_id', projectId)
      .in('agent_name', ['Developer-Stack', 'Developer-HTML', 'Developer-CSS', 'Developer-Pages', 'Developer-JS', 'reviewer'])
    // Delete per-page HTML records
    const perPageHtmlIds = agentOutputs.filter(o => o.agent_name.startsWith('Developer-HTML-')).map(r => r.id)
    if (perPageHtmlIds.length) await supabase.from('agent_outputs').delete().in('id', perPageHtmlIds)
    const { data: designerRecord } = await supabase.from('agent_outputs').select('id').eq('project_id', projectId).eq('agent_name', 'designer').single()
    if (designerRecord?.id) await safeUpdate('agent_outputs', designerRecord.id, { status: 'pending' })
    await safeUpdate('projects', projectId, { current_stage: 'Design' })
    await load()
    setGoingBackToDev(false)
  }

  async function regenerateWireframePage(wfRecord, excludeSeed) {
    const designRec = agentOutputs.find(o => o.agent_name === 'designer')
    if (!designRec?.output_text) return
    setRegenPageFilename(wfRecord.agent_name)
    try {
      const filename = wfRecord.agent_name.replace('Designer-Wireframe-', '')
      const allPages = project?.pages ?? []
      const page = allPages.find(p => p.filename === filename)
        ?? { name: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), filename }

      const regenTokenCalls = []
      const { text: briefSummary, inputTokens: rSumIn, outputTokens: rSumOut } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: designRec.output_text }],
        systemPrompt: DESIGNER_SUMMARY_SYSTEM,
        model:        'claude-haiku-4-5-20251001',
        maxTokens:    30000,
      })
      regenTokenCalls.push({ label: 'Summary', input_tokens: rSumIn, output_tokens: rSumOut })

      const regenMoodboard = designRec.output_moodboard ?? null
      const { svg, layoutSeed } = await generatePageWireframe(briefSummary, page, regenTokenCalls, regenMoodboard, excludeSeed)
      const { error: regenSaveErr } = await safeUpdate('agent_outputs', wfRecord.id, { output_wireframe: svg, output_text: layoutSeed })
      if (regenSaveErr) throw new Error(`Regenerate save failed: ${regenSaveErr.message}`)

      await load()
    } catch (err) {
      console.error('Regenerate wireframe error:', err)
    } finally {
      setRegenPageFilename(null)
    }
  }

  async function redetectPages() {
    const briefText = briefs[0]?.brief_text
    if (!briefText) return
    if (pageExtractionInFlight.current) {
      console.warn('[PageExtractor] Already running — ignoring duplicate call')
      return
    }
    pageExtractionInFlight.current = true
    setIsRedetectingPages(true)
    try {
      console.log('[PageExtractor] Manual redetect triggered for project:', projectId)
      const { text: raw } = await streamAnthropicCall({
        messages:     [{ role: 'user', content: briefText }],
        systemPrompt: PAGE_EXTRACTOR_SYSTEM,
        model:        'claude-haiku-4-5-20251001',
        maxTokens:    8000,
      })
      console.log('[PageExtractor] Raw API response:', raw)
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(cleaned)
      console.log('[PageExtractor] Parsed pages:', JSON.stringify(parsed))
      const pages = sanitiseExtractedPages(parsed)
      console.log('[PageExtractor] Final clean pages:', JSON.stringify(pages))
      if (Array.isArray(pages) && pages.length) {
        console.log('[PageExtractor] Clearing existing pages before save...')
        await safeUpdate('projects', projectId, { pages: null })
        console.log('[PageExtractor] Saving to Supabase — exact array:', JSON.stringify(pages))
        await safeUpdate('projects', projectId, { pages })
        await load()
        showToast(`${pages.length} page${pages.length !== 1 ? 's' : ''} detected`)
      } else {
        showToast('No pages could be detected from the brief')
      }
    } catch (err) {
      console.error('[PageExtractor] Redetect failed:', err.message)
      showToast('Page detection failed')
    } finally {
      pageExtractionInFlight.current = false
      setIsRedetectingPages(false)
    }
  }

  // ── Send brief to client ──────────────────────────────────────────────────

  async function sendBriefToClient() {
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: inserted, error } = await supabase.from('client_brief_tokens').insert({
      token,
      project_id: projectId,
      client_id:  project.client_id,
      status:     'pending',
      expires_at: expiresAt,
    }).select('id, token, status, submitted_at, expires_at, created_at').single()
    if (error) { showToast('Failed to generate brief link'); return }
    // Optimistically update state so the button swaps to "Awaiting" immediately
    setBriefToken(inserted)
    const url = `https://forge-agency-lemon.vercel.app/brief/${token}`
    const clientName  = project.clients?.name ?? 'there'
    const projectName = project.name ?? 'your project'
    const emailDraft  = `Subject: We need a few details about your project

Hi ${clientName},

To get started on ${projectName}, we'd love to learn a bit more about your business, brand and goals.

Please take 5–10 minutes to fill in our quick brief form using the link below:

${url}

The link is valid for 7 days. Once submitted, we'll review your answers and be in touch shortly.

Looking forward to working with you!

Best,
The Forge Agency Team`
    setBriefLinkModal({ url, emailDraft })
    setBriefLinkCopied(false)
  }

  // ── Delete project ────────────────────────────────────────────────────────

  async function deleteProject() {
    const ok = await confirm({
      title: 'Delete Project',
      message: `Deleting this project will permanently remove all agent outputs, wireframes, revisions and files associated with it. This cannot be undone. Are you sure you want to delete ${project.name}?`,
      confirmLabel: 'Delete Project',
      variant: 'danger',
    })
    if (!ok) return
    await supabase.from('agent_output_revisions').delete().eq('project_id', projectId)
    await supabase.from('agent_outputs').delete().eq('project_id', projectId)
    await supabase.from('projects').delete().eq('id', projectId)
    showToast('Project deleted successfully')
    navigate(`/clients/${project.client_id}`)
  }

  async function deleteBrief() {
    const brief = briefs[0]
    if (!brief) return

    const ok = await confirm({
      title: 'Delete Brief',
      message: 'Deleting this brief will also clear all agent outputs including the Orchestrator breakdown, Researcher report, Designer brief, wireframe, all Developer files and the Reviewer report. The project will return to Not Started. This cannot be undone. Are you sure?',
      confirmLabel: 'Delete Brief',
      variant: 'danger',
    })
    if (!ok) return

    // 1 & 2 — clear all agent output revisions and outputs for this project
    await supabase.from('agent_output_revisions').delete().eq('project_id', projectId)
    await supabase.from('agent_outputs').delete().eq('project_id', projectId)

    // 3 — delete the brief record
    await supabase.from('briefs').delete().eq('project_id', projectId)

    // 4 — delete structured brief if one exists (ignore error if table empty / no match)
    await supabase.from('briefs_structured').delete().eq('project_id', projectId)

    // 5 — reset project back to Not Started and clear derived fields
    await safeUpdate('projects', projectId, {
      current_stage:   'Not Started',
      pages:           null,
      is_replication:  null,
      replication_url: null,
    })

    // 6 — refresh page state
    await load()

    // 7 — success toast
    showToast('Brief and all agent outputs cleared — you can now add a new brief to this project.')

    // 8 — log activity event
    await supabase.from('agent_messages').insert({
      agent_key: 'orchestrator',
      role:      'user',
      content:   `Brief deleted for project "${project?.name ?? projectId}" (client: ${project?.clients?.name ?? '—'}) — project reset to Not Started`,
    })
  }

  // ── General stage advance ─────────────────────────────────────────────────

  async function advanceStage() {
    if (!project) return
    const idx = STAGES.indexOf(project.current_stage)
    if (idx === -1 || idx === STAGES.length - 1) return
    setAdvancing(true)
    await safeUpdate('projects', projectId, { current_stage: STAGES[idx + 1] })
    setAdvancing(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <DetailSkeleton />
  if (!project) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-sm text-zinc-500">Project not found</p>
      <Link to="/projects" className="text-xs text-violet-400 hover:text-violet-300">← Back to projects</Link>
    </div>
  )

  const currentIdx     = STAGES.indexOf(project.current_stage)
  const nextStage      = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null
  const latestBrief    = briefs[0] ?? null
  // orchestratorOutput is declared above the useEffects to avoid TDZ in dependency arrays
  const researchOutput     = agentOutputs.find(o => o.agent_name === 'researcher') ?? null
  const designOutput       = agentOutputs.find(o => o.agent_name === 'designer')   ?? null

  const isNotStarted      = project.current_stage === 'Not Started'
  const isResearch        = project.current_stage === 'Research'
  const hasBrief          = briefs.length > 0

  // ── Pipeline-context derived state ────────────────────────────────────────
  // These stay true even after navigating away and back, because the context
  // persists at root level while the in-flight stream keeps calling pipeline.append().
  // NOTE: pipelineRunning and orchIsStreaming are also declared early (above the first
  // useEffect) so they can be used in dependency arrays without a TDZ error. The values
  // here alias those early declarations so the rest of the render body is unchanged.
  const pipelineRunning    = pipelineRunningEarly
  const researchIsStreaming = isGenerating  || (pipelineRunning && pipeline.pipeline.agentName === 'researcher')
  const designIsStreaming   = isDesigning   || (pipelineRunning && pipeline.pipeline.agentName === 'designer')
  const devIsStreaming      = isDeveloping  || (pipelineRunning && (pipeline.pipeline.agentName?.startsWith('Developer-') ?? false))
  const reviewIsStreaming   = isReviewing   || (pipelineRunning && pipeline.pipeline.agentName === 'reviewer')
  // orchIsStreaming already declared early — reuse it here (no re-declaration needed)
  // Display text: local state takes priority (fresh stream); fall back to context (resumed after nav)
  const researchLiveText  = streamingDisplay        || pipeline.liveText(projectId, 'researcher')
  const designLiveText    = designStreamDisplay     || pipeline.liveText(projectId, 'designer')
  const devLiveText       = devCurrentStepText      || pipeline.devLiveText(projectId)
  const devLiveStepLabel  = devCurrentStepLabel     || (devIsStreaming ? pipeline.pipeline.stepLabel ?? '' : '')
  const devLiveStep       = devCurrentStep          || (devIsStreaming ? pipeline.pipeline.agentName ?? null : null)
  const reviewLiveText    = reviewStreamDisplay     || pipeline.liveText(projectId, 'reviewer')
  const orchLiveText      = orchestratorStreamDisplay || pipeline.liveText(projectId, 'Orchestrator')

  const isAgentRunning    = isGenerating || isDesigning || isRegenerating || !!regenPageFilename || isDeveloping || isReviewing || pipelineRunning
  const showAdvance       = !isNotStarted && !isResearch && project.current_stage !== 'Design' && project.current_stage !== 'Dev' && project.current_stage !== 'Review' && nextStage
  const showDesignSection = currentIdx >= STAGES.indexOf('Design')
  const showDevSection    = currentIdx >= STAGES.indexOf('Dev')
  const showReviewSection = currentIdx >= STAGES.indexOf('Review')
  const reviewerOutput    = agentOutputs.find(o => o.agent_name === 'reviewer') ?? null
  const devStackOutput    = agentOutputs.find(o => o.agent_name === 'Developer-Stack') ?? null
  const devHtmlOutput     = agentOutputs.find(o => o.agent_name === 'Developer-HTML')  ?? null
  const devCssOutput      = agentOutputs.find(o => o.agent_name === 'Developer-CSS')   ?? null
  const devPagesOutput      = agentOutputs.find(o => o.agent_name === 'Developer-Pages')      ?? null
  const devJsOutput         = agentOutputs.find(o => o.agent_name === 'Developer-JS')          ?? null
  const devSetupGuideOutput = agentOutputs.find(o => o.agent_name === 'Developer-SetupGuide') ?? null
  // Per-page records (multi-page pipeline)
  const devHtmlOutputs    = agentOutputs.filter(o => o.agent_name.startsWith('Developer-HTML-'))
  // Primary status record — use Stack as representative
  const devOutput         = devStackOutput ?? devHtmlOutput ?? devCssOutput ?? devPagesOutput ?? devJsOutput ?? devHtmlOutputs[0] ?? null
  // Per-page status helpers
  const projectPages = project?.pages ?? []
  function getPageStatus(filename) {
    if (pageStatuses[filename]) return pageStatuses[filename]
    const rec = devHtmlOutputs.find(o => o.agent_name === `Developer-HTML-${filename}`)
    if (rec?.status === 'approved') return 'approved'
    return rec?.output_text?.trim() ? 'complete' : 'pending'
  }
  const allPagesSettled  = projectPages.length > 0 && !isDeveloping &&
    projectPages.every(p => { const s = getPageStatus(p.filename); return s === 'complete' || s === 'failed' || s === 'approved' })
  const allPagesApproved = projectPages.length === 0
    ? true
    : skipToReview || projectPages.every(p => approvedPages.has(p.filename))
  const failedPagesCount = projectPages.filter(p => getPageStatus(p.filename) === 'failed').length

  // Missing classList.add() classes — computed from live CSS + JS outputs
  const missingCssClasses = (() => {
    const css = devCssOutput?.output_text ?? ''
    const js  = devJsOutput?.output_text  ?? ''
    if (!css || !js) return []
    const addRe = /classList\.add\(['"]([^'"]+)['"]\)/g
    const missing = []
    let m
    while ((m = addRe.exec(js)) !== null) {
      const cls = m[1]
      if (!new RegExp(`\\.${cls}[\\s{:,\\[\\+~>]`).test(css)) missing.push(cls)
    }
    return missing
  })()

  // Quality warnings — computed once files exist and dev is not yet approved
  const _cssForQC  = devCssOutput?.output_text ?? ''
  const _jsForQC   = devJsOutput?.output_text  ?? ''
  const _htmlForQC = devHtmlOutputs.length
    ? devHtmlOutputs
    : devHtmlOutput ? [devHtmlOutput] : []
  const qualityWarnings = (devOutput && devOutput.status !== 'approved' && (_cssForQC || _jsForQC || _htmlForQC.length > 0))
    ? runQualityCheck(_cssForQC, _jsForQC, _htmlForQC)
    : []

  const wireframeOutputs  = Array.from(
    agentOutputs
      .filter(o => o.agent_name.startsWith('Designer-Wireframe-'))
      .reduce((map, o) => {
        const existing = map.get(o.agent_name)
        if (!existing || new Date(o.created_at) > new Date(existing.created_at)) map.set(o.agent_name, o)
        return map
      }, new Map())
      .values()
  )

  const wireframeCoverageData = (() => {
    if (!designOutput || projectPages.length === 0) return null
    const wireframeFilenames = new Set(wireframeOutputs.map(wf => wf.agent_name.replace('Designer-Wireframe-', '')))
    const withWireframe = projectPages.filter(p => wireframeFilenames.has(p.filename))
    const skipped       = projectPages.filter(p => !wireframeFilenames.has(p.filename))
    return { withWireframe, skipped }
  })()

  // ── Token usage totals ────────────────────────────────────────────────────
  const devRecords = [devStackOutput, devHtmlOutput, devCssOutput, devPagesOutput, devJsOutput, ...devHtmlOutputs].filter(Boolean)
  const devTotalTokens = devRecords.reduce((s, r) => s + (r.token_usage?.total_tokens ?? 0), 0)
  const devTokenTooltip = devRecords
    .filter(r => r.token_usage?.total_tokens)
    .map(r => `${r.agent_name.replace('Developer-', '')}: ${r.token_usage.total_tokens.toLocaleString()}`)
    .join('\n')

  const allTokenInputs  = agentOutputs.reduce((s, o) => s + (o.token_usage?.input_tokens  ?? 0), 0)
  const allTokenOutputs = agentOutputs.reduce((s, o) => s + (o.token_usage?.output_tokens ?? 0), 0)
  const projectTotalTokens = allTokenInputs + allTokenOutputs
  const projectCostGBP = (allTokenInputs * 0.000003 + allTokenOutputs * 0.000015) * 0.79

  return (
    <>
    <div className="max-w-4xl space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Link to="/projects" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              <ChevronLeftIcon className="w-3.5 h-3.5" />
              Projects
            </Link>
          </div>
          <h1 className="text-xl font-semibold text-white">{project.name}</h1>
          <div className="flex items-center gap-1.5 text-sm text-zinc-500">
            <ClientIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{project.clients?.name ?? '—'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isNotStarted && (
            <div className="relative group">
              <button
                onClick={hasBrief ? openAutoRunModal : undefined}
                disabled={isAgentRunning || !hasBrief}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white transition-colors ${hasBrief ? 'hover:bg-blue-500' : 'opacity-40 cursor-not-allowed'} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <PlayIcon className="w-3.5 h-3.5" />
                Start Project
              </button>
              {!hasBrief && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover:block">
                  <div className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-3 py-2 whitespace-nowrap shadow-lg">
                    A brief is required before starting the project — add one using the New Brief button above.
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
                </div>
              )}
            </div>
          )}
          {showAdvance && (
            <button
              onClick={advanceStage}
              disabled={advancing || isAgentRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightIcon className="w-3.5 h-3.5" />
              {advancing ? 'Moving…' : `Move to ${nextStage}`}
            </button>
          )}
          {!nextStage && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-500">
              <CheckIcon className="w-3.5 h-3.5" />
              Delivered
            </span>
          )}
          {briefToken?.status === 'submitted' ? (
            /* ── Submitted: green received badge ── */
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Client brief received{briefToken.submitted_at ? ` · ${new Date(briefToken.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </span>
          ) : briefToken?.status === 'pending' ? (
            /* ── Pending: disabled button + amber badge ── */
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                Awaiting client brief
              </span>
              <div className="relative group">
                <button
                  disabled
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-zinc-700 text-zinc-600 opacity-50 cursor-not-allowed"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                  Send Brief to Client
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover:block">
                  <div className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-3 py-2 whitespace-nowrap shadow-lg">
                    Brief link already sent — awaiting client submission.
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
                </div>
              </div>
            </div>
          ) : (
            /* ── No token: normal button ── */
            <button
              onClick={sendBriefToClient}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-blue-600/60 text-blue-400 hover:bg-blue-950/40 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
              Send Brief to Client
            </button>
          )}
          <button
            onClick={deleteProject}
            disabled={isAgentRunning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-red-800/60 text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* ── Replication mode banner ── */}
      {project.is_replication && project.replication_url && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" />
          </svg>
          <span className="text-sm font-medium text-blue-300">Replication Mode</span>
          <span className="text-zinc-500 text-sm">—</span>
          <span className="text-sm text-zinc-400">replicating</span>
          <a
            href={project.replication_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors truncate min-w-0"
          >
            {project.replication_url}
          </a>
        </div>
      )}

      {/* ── Auto-run active banner ── */}
      {autoRunActive && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/8 overflow-hidden">
          {/* Top strip */}
          <div className="flex items-center justify-between px-5 py-3.5 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-sm font-semibold text-amber-300">Auto-run active</span>
              <span className="text-zinc-500 text-sm hidden sm:inline">—</span>
              <span className="text-sm text-zinc-400 hidden sm:inline">Pipeline is running automatically</span>
            </div>
            <button
              onClick={stopAutoRun}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors"
            >
              <StopIcon className="w-3 h-3" />
              Stop Auto-run
            </button>
          </div>
          {/* Progress section */}
          <div className="px-5 pb-4 space-y-2.5">
            {autoRunCurrentStage && (
              <p className="text-xs text-zinc-400">
                Currently running: <span className="text-amber-300 font-medium">{AUTORUN_STAGES.find(s => s.key === autoRunCurrentStage)?.label ?? autoRunCurrentStage}</span>
              </p>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{autoApprovedStages.size} of {autoRunTotalStages} stages complete</span>
                <span>{autoRunTotalStages > 0 ? Math.round((autoApprovedStages.size / autoRunTotalStages) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800">
                <div
                  className="h-1.5 rounded-full bg-amber-400 transition-all duration-500"
                  style={{ width: autoRunTotalStages > 0 ? `${(autoApprovedStages.size / autoRunTotalStages) * 100}%` : '0%' }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {AUTORUN_STAGES.filter(s => autoRunSettings[`auto${s.key.charAt(0).toUpperCase() + s.key.slice(1)}`]).map(s => (
                <span
                  key={s.key}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    autoApprovedStages.has(s.key)
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : s.key === autoRunCurrentStage
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 animate-pulse'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                  }`}
                >
                  {autoApprovedStages.has(s.key) ? '✓ ' : s.key === autoRunCurrentStage ? '▶ ' : ''}{s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Token usage summary ── */}
      {projectTotalTokens > 0 && (
        <div className="flex items-center gap-6 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="text-zinc-600">Pipeline tokens:</span>
            <span className="text-zinc-400 font-medium">{projectTotalTokens.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-zinc-600">Input:</span>
            <span>{allTokenInputs.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-zinc-600">Output:</span>
            <span>{allTokenOutputs.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="text-zinc-600">Est. cost:</span>
            <span className="text-zinc-300 font-medium">£{projectCostGBP.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* ── Stage pipeline ── */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-5">Stage</p>
        <div className="flex items-center">
          {STAGES.map((stage, i) => {
            const isPast   = i < currentIdx
            const isActive = i === currentIdx
            const sc       = STAGE_CONFIG[stage]
            return (
              <div key={stage} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isPast   ? `${sc.fill} border-transparent` :
                    isActive ? `${sc.bg} ${sc.border} ring-2 ${sc.ring} ring-offset-2 ring-offset-zinc-900` :
                               'bg-zinc-800 border-zinc-700'
                  }`}>
                    {isPast
                      ? <CheckIcon className="w-3.5 h-3.5 text-white" />
                      : <span className={`text-xs font-semibold ${isActive ? sc.text : 'text-zinc-600'}`}>{i + 1}</span>
                    }
                  </div>
                  <span className={`text-xs font-medium whitespace-nowrap ${isActive ? sc.text : isPast ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {stage}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-5 rounded-full transition-colors ${i < currentIdx ? sc.fill : 'bg-zinc-800'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Client Brief ── */}
      {latestBrief && (
        <div className="space-y-0">
          <div
            onClick={() => setBriefOpen(o => !o)}
            className={`flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors select-none ${briefOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-300">Client Brief</span>
              {latestBrief.orchestrator_response && (
                <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Processed</span>
              )}
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => downloadPdf({
                  agentName:   'Client Brief',
                  projectName: project.name,
                  clientName:  project.clients?.name ?? '—',
                  date:        new Date(latestBrief.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                  bodyText:    latestBrief.brief_text,
                  filename:    `Forge-Agency-Brief-${project.name.replace(/\s+/g, '-')}.pdf`,
                })}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                Download PDF
              </button>
              <div className="relative group">
                <button
                  onClick={hasBrief ? sendToOrchestrator : undefined}
                  disabled={isSendingOrchestrator || !hasBrief}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-violet-400 border border-violet-500/40 bg-violet-500/10 transition-colors ${hasBrief ? 'hover:bg-violet-500/20 hover:border-violet-500/60' : 'opacity-40 cursor-not-allowed'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isSendingOrchestrator ? (
                    <>
                      <SpinnerIcon className="w-3 h-3 animate-spin" />
                      Sending to orchestrator…
                    </>
                  ) : (
                    <>
                      <SparkleIcon className="w-3 h-3" />
                      Send to Orchestrator
                    </>
                  )}
                </button>
                {!hasBrief && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover:block">
                    <div className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-3 py-2 whitespace-nowrap shadow-lg">
                      A brief is required before sending to the Orchestrator.
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
                  </div>
                )}
              </div>
              <ChevronLeftIcon
                className="w-4 h-4 text-zinc-500"
                style={{ transform: briefOpen ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </div>
          </div>
          {briefOpen && (
            <div className="max-h-[400px] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-b-lg p-5">
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{latestBrief.brief_text}</p>
              {latestBrief.orchestrator_response && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Orchestrator Response</p>
                  <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{latestBrief.orchestrator_response}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Orchestrator breakdown ── */}
      {(orchestratorOutput || orchIsStreaming || hasBrief) && (() => {
        // Three states for the status indicator
        const orchStatus = orchIsStreaming
          ? { dot: 'bg-blue-400 animate-pulse', label: 'Generating breakdown…', color: 'text-blue-400' }
          : orchestratorOutput?.output_text
          ? { dot: 'bg-emerald-400', label: 'Orchestrator complete', color: 'text-emerald-400' }
          : { dot: 'bg-amber-400 animate-pulse', label: 'Orchestrator is analysing the brief…', color: 'text-amber-400' }

        // Helper: format seconds as "Xm Ys" or just "Xs"
        const fmtDuration = (s) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
        // Elapsed time capped at 90s for progress bar (the typical max)
        const ORCH_TYPICAL_MAX = 90
        const progressPct = Math.min(100, Math.round((orchElapsed / ORCH_TYPICAL_MAX) * 100))
        // Sequential status messages
        const orchPhaseMsg = orchElapsed >= 45
          ? 'Finalising agent instructions'
          : orchElapsed >= 15
          ? 'Breaking down tasks for each agent'
          : 'Reading and interpreting your brief'

        return (
        <div className="space-y-0">
          <div
            onClick={() => setOrchestratorOpen(o => !o)}
            className={`flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors select-none ${orchestratorOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-300">Orchestrator — Project breakdown</span>
              <span className="text-xs font-medium text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full border border-violet-400/20">Orchestrator</span>
              {/* Live status indicator — compact in header */}
              {orchestratorOutput ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400" />
                  <span className="text-xs text-emerald-400">
                    Complete{orchCompletedIn != null ? ` · ${fmtDuration(orchCompletedIn)}` : ''}
                  </span>
                </span>
              ) : orchIsStreaming ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400 animate-pulse" />
                  <span className="text-xs text-amber-400 tabular-nums">Running · {orchElapsed}s</span>
                </span>
              ) : hasBrief ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400 animate-pulse" />
                  <span className="text-xs text-amber-400">Waiting to start…</span>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {orchIsStreaming && orchLiveText && (
                <span className="text-xs text-violet-400 tabular-nums">
                  {orchLiveText.length.toLocaleString()} chars
                </span>
              )}
              {!orchIsStreaming && orchestratorOutput?.token_usage?.total_tokens > 0 && (
                <span
                  title={`Input: ${orchestratorOutput.token_usage.input_tokens.toLocaleString()} · Output: ${orchestratorOutput.token_usage.output_tokens.toLocaleString()}`}
                  className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full cursor-default select-none"
                >
                  {orchestratorOutput.token_usage.total_tokens.toLocaleString()} tokens
                </span>
              )}
              {!isSendingOrchestrator && orchestratorOutput?.output_text && (
                <button
                  onClick={() => downloadPdf({
                    agentName:   'Orchestrator — Project Breakdown',
                    projectName: project.name,
                    clientName:  project.clients?.name ?? '—',
                    date:        new Date(orchestratorOutput.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                    bodyText:    orchestratorOutput.output_text,
                    filename:    `Forge-Agency-Orchestrator-${project.name.replace(/\s+/g, '-')}.pdf`,
                  })}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  Download PDF
                </button>
              )}
              <ChevronLeftIcon
                className="w-4 h-4 text-zinc-500"
                style={{ transform: orchestratorOpen ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </div>
          </div>
          {orchestratorOpen && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-b-lg">
              {(orchIsStreaming || (!orchIsStreaming && !orchestratorOutput && hasBrief)) ? (
                /* Running or waiting state — show detailed status panel */
                <div className="px-6 py-6 space-y-5">
                  {/* Top row: pulsing dot + primary message + timer */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3 w-3 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                      </span>
                      <span className="text-sm font-medium text-zinc-200">Orchestrator is analysing your brief</span>
                    </div>
                    <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">Running for {orchElapsed}s</span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all duration-1000 ease-linear"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Sequential phase message */}
                  <p className="text-xs text-zinc-400">{orchPhaseMsg}</p>

                  {/* Overtime warning */}
                  {orchElapsed >= 120 && (
                    <div className="rounded-md bg-amber-500/10 border border-amber-500/25 px-4 py-3">
                      <p className="text-xs text-amber-400 leading-relaxed">
                        This is taking longer than usual — the Orchestrator is still working. You can wait or come back later and the result will appear automatically.
                      </p>
                    </div>
                  )}
                </div>
              ) : orchestratorOutput && orchCompletedIn != null && !(() => {
                // Peek ahead — if sections parse successfully we skip the completion banner and go straight to cards
                const orchText = orchestratorOutput?.output_text ?? ''
                const sections = parseResponse(orchText)
                return sections?.some(s => s.content.trim().length > 0)
              })() ? (
                /* Completed banner — only shown when fallback rendering is used (no parsed sections) */
                <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800 bg-emerald-500/5">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-medium text-emerald-400">
                    Orchestrator complete · {fmtDuration(orchCompletedIn)}
                  </span>
                </div>
              ) : null}
              {!orchIsStreaming && !orchestratorOutput ? null : (!orchIsStreaming && orchestratorOutput) ? (() => {
                const orchText = orchestratorOutput?.output_text ?? ''
                const sections = parseResponse(orchText)
                const hasSections = sections?.some(s => s.content.trim().length > 0)
                if (hasSections) {
                  return (
                    <div className="p-5 space-y-4">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent task breakdown</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {sections.map(({ name, content }) => {
                          const agentKey = name.toLowerCase()
                          const agent    = AGENT_CONFIG[agentKey]
                          const c        = agent ? COLOR_CLASSES[agent.color] : null
                          return (
                            <div key={name} className="rounded-md bg-zinc-900 border border-zinc-800 p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                {c && (
                                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${c.badge}`}>
                                    <AgentIcon agentKey={agentKey} className={`w-3 h-3 ${c.icon}`} />
                                  </div>
                                )}
                                <span className={`text-xs font-semibold ${c ? c.heading : 'text-zinc-300'}`}>{name}</span>
                              </div>
                              {content ? (
                                <div className="text-xs text-zinc-400 leading-relaxed space-y-1">
                                  {content.split('\n').filter(l => l.trim()).map((line, i) => {
                                    const raw      = line.trim()
                                    const isBullet  = /^[-*•]\s/.test(raw)
                                    const isNum     = /^\d+[.)]\s/.test(raw)
                                    const isHeading = /^#{1,3}\s/.test(raw)
                                    const stripped  = raw
                                      .replace(/^[-*•]\s+/, '')
                                      .replace(/^\d+[.)]\s+/, '')
                                      .replace(/^#{1,3}\s+/, '')
                                    // Render **bold** inline
                                    const inlined = stripped.split(/(\*\*[^*]+\*\*)/).map((seg, j) =>
                                      seg.startsWith('**') && seg.endsWith('**')
                                        ? <strong key={j} className="text-zinc-200 font-medium">{seg.slice(2, -2)}</strong>
                                        : seg
                                    )
                                    if (isHeading) return (
                                      <p key={i} className="text-xs font-semibold text-zinc-300 pt-1">{inlined}</p>
                                    )
                                    if (isBullet || isNum) return (
                                      <div key={i} className="flex items-start gap-1.5">
                                        <span className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${c ? c.dot : 'bg-zinc-600'}`} />
                                        <span>{inlined}</span>
                                      </div>
                                    )
                                    return <p key={i} className="text-zinc-500">{inlined}</p>
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-zinc-600 italic">No tasks listed</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                }
                // Fallback — sections not parsed; render full response with proper markdown
                return (
                  <ScrollBox storageKey="orchestrator" isStreaming={false} contentLength={orchText.length} maxHeight="500px" className="">
                    <div className="p-5">
                      {orchText ? renderMarkdown(orchText) : <p className="text-xs text-zinc-600 italic">No Orchestrator output yet</p>}
                    </div>
                  </ScrollBox>
                )
              })() : null}
            </div>
          )}
        </div>
        )
      })()}

      {/* ── Pages detected — only shown once Orchestrator has completed ── */}
      {orchestratorOutput && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Pages detected</p>
            <div className="flex items-center gap-2">
              {!pagesEditing && (
                <>
                  <button
                    onClick={() => { setEditedPages(project?.pages?.length ? [...project.pages] : []); setPagesEditing(true) }}
                    disabled={isRedetectingPages || isAgentRunning}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <EditIcon className="w-3 h-3" />
                    Edit Pages
                  </button>
                  <button
                    onClick={redetectPages}
                    disabled={isRedetectingPages || isAgentRunning}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRedetectingPages ? (
                      <>
                        <SpinnerIcon className="w-3 h-3 animate-spin" />
                        Detecting…
                      </>
                    ) : (
                      <>
                        <RefreshIcon className="w-3 h-3" />
                        Redetect Pages
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {pagesEditing ? (
            <div className="space-y-3">
              <div className="space-y-2">
                {editedPages.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={p.name}
                      onChange={e => setEditedPages(prev => prev.map((pg, idx) => idx === i ? { ...pg, name: e.target.value } : pg))}
                      placeholder="Page name"
                      className="flex-1 px-2.5 py-1.5 rounded-md bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                    <input
                      value={p.filename}
                      onChange={e => setEditedPages(prev => prev.map((pg, idx) => idx === i ? { ...pg, filename: e.target.value } : pg))}
                      placeholder="filename.html"
                      className="flex-1 px-2.5 py-1.5 rounded-md bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 font-mono"
                    />
                    <button
                      onClick={() => setEditedPages(prev => prev.filter((_, idx) => idx !== i))}
                      className="p-1 rounded text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setEditedPages(prev => [...prev, { name: '', filename: '' }])}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                Add page
              </button>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={async () => {
                    const cleaned = sanitiseExtractedPages(editedPages.filter(p => p.name.trim() && p.filename.trim()))
                    console.log('[PageEditor] Saving edited pages:', JSON.stringify(cleaned))
                    await safeUpdate('projects', projectId, { pages: cleaned })
                    await load()
                    setPagesEditing(false)
                    showToast('Pages saved')
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setPagesEditing(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : project?.pages?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {project.pages.map(p => (
                <span key={p.filename} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 text-xs text-zinc-300">
                  {p.name}
                  <span className="text-zinc-600">({p.filename})</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-400">
              No pages detected yet. Click <span className="font-medium">Redetect Pages</span> to extract them from the brief.
            </p>
          )}
        </div>
      )}

      {/* ── Research Report ── */}
      {!isNotStarted && (
        <div className={`space-y-0 rounded-lg transition-shadow duration-300 ${flashedStages.has('researcher') ? 'ring-2 ring-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : ''} ${failedAutoRunStage === 'researcher' ? 'ring-2 ring-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.12)]' : ''}`}>
          <div
            onClick={() => setResearchOpen(o => !o)}
            className={`flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors select-none ${researchOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-300">Research Report</span>
              {researchOutput?.status === 'approved' && (
                <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Approved</span>
              )}
              {researchOutput?.status === 'rejected' && (
                <span className="text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Rejected</span>
              )}
              {researchOutput && researchOutput.status !== 'approved' && researchOutput.status !== 'rejected' && (
                <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">Pending</span>
              )}
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {researchIsStreaming && researchLiveText && (
                <span className="text-xs text-blue-400 tabular-nums">
                  {researchLiveText.length.toLocaleString()} chars
                </span>
              )}
              {!researchIsStreaming && researchOutput?.token_usage?.total_tokens > 0 && (
                <span
                  title={`Input: ${researchOutput.token_usage.input_tokens.toLocaleString()} · Output: ${researchOutput.token_usage.output_tokens.toLocaleString()}`}
                  className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full cursor-default select-none"
                >
                  {researchOutput.token_usage.total_tokens.toLocaleString()} tokens
                </span>
              )}
              {researchOutput?.output_text && (
                <button
                  onClick={() => downloadPdf({
                    agentName:   'Researcher — Research Report',
                    projectName: project.name,
                    clientName:  project.clients?.name ?? '—',
                    date:        new Date(researchOutput.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                    bodyText:    researchOutput.output_text,
                    filename:    `Forge-Agency-Researcher-${project.name.replace(/\s+/g, '-')}.pdf`,
                  })}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  Download PDF
                </button>
              )}
              <ChevronLeftIcon
                className="w-4 h-4 text-zinc-500"
                style={{ transform: researchOpen ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </div>
          </div>

          {researchOpen && (
            <>
              {autoApprovedStages.has('researcher') && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 mb-2">
                  <span className="font-medium">Auto approved</span>
                  <span className="text-amber-500/70">—</span>
                  <span>review this output at any time and request changes if needed</span>
                </div>
              )}
              {researchIsStreaming ? (
                <ScrollBox storageKey="researcher" isStreaming={true} contentLength={researchLiveText.length} className="bg-zinc-950 border border-zinc-800 rounded-b-lg">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-zinc-800 bg-blue-500/5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                    <span className="text-xs text-blue-400 font-medium">Researcher is working…</span>
                  </div>
                  <div className="p-5">
                    <pre className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed font-sans">
                      {researchLiveText || <span className="text-zinc-600 animate-pulse">Generating research report…</span>}
                    </pre>
                  </div>
                </ScrollBox>
              ) : researchOutput ? (
                <ScrollBox storageKey="researcher" isStreaming={false} contentLength={researchOutput.output_text?.length ?? 0} className="bg-zinc-950 border border-zinc-800 rounded-b-lg p-5">
                  {renderMarkdown(researchOutput.output_text)}
                </ScrollBox>
              ) : (
                <div className="bg-zinc-950 border border-zinc-800 rounded-b-lg px-5 py-10 flex items-center justify-center">
                  <p className="text-xs text-zinc-600">No research report yet</p>
                </div>
              )}
            </>
          )}

          {researchOutput?.status === 'pending' && !researchMode && (
            <div className="flex items-center gap-3 flex-wrap pt-3">
              <button
                onClick={approveResearch}
                disabled={approving || isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                {approving ? 'Approving…' : 'Approve and move to Design'}
              </button>
              <button
                onClick={() => setResearchMode('chooser')}
                disabled={isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
                Request Changes
              </button>
            </div>
          )}

          {researchOutput?.status === 'pending' && researchMode === 'chooser' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-4 mt-3">
              <p className="text-xs font-medium text-zinc-400">How would you like to proceed?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setResearchMode('fix')}
                  className="flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-zinc-200">Fix Issue</span>
                  <span className="text-xs text-zinc-500">Targeted fix — keeps everything else the same</span>
                </button>
                <button
                  onClick={() => setResearchMode('fresh')}
                  className="flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-zinc-200">Start Fresh</span>
                  <span className="text-xs text-zinc-500">Clean slate — agent starts over from scratch</span>
                </button>
              </div>
              <button onClick={() => setResearchMode(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Cancel</button>
            </div>
          )}

          {researchOutput?.status === 'pending' && researchMode === 'fix' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 mt-3">
              <input
                type="text"
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitResearchFix()}
                placeholder="Describe the issue to fix"
                className="w-full px-3 py-2.5 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitResearchFix}
                  disabled={!feedbackText.trim() || submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  {submitting ? 'Running…' : 'Apply Fix'}
                </button>
                <button onClick={() => setResearchMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
              </div>
            </div>
          )}

          {researchOutput?.status === 'pending' && researchMode === 'fresh' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 mt-3">
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Optional: provide any specific direction for the new attempt"
                rows={4}
                className="w-full px-3 py-2.5 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitResearchFresh}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-red-700 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  {submitting ? 'Running…' : 'Start Fresh'}
                </button>
                <button onClick={() => setResearchMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
              </div>
            </div>
          )}

          {researchOutput?.status === 'approved' && (
            <p className="text-xs text-zinc-600 pt-3">Research approved — project moved to Design stage.</p>
          )}
        </div>
      )}

      {/* ── Design Brief ── */}
      {showDesignSection && (
        <div className={`space-y-0 rounded-lg transition-shadow duration-300 ${flashedStages.has('designer') ? 'ring-2 ring-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : ''} ${failedAutoRunStage === 'designer' ? 'ring-2 ring-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.12)]' : ''}`}>
          <div
            onClick={() => setDesignOpen(o => !o)}
            className={`flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors select-none ${designOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-300">Design Brief</span>
              {designOutput?.status === 'approved' && (
                <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Approved</span>
              )}
              {designOutput?.status === 'rejected' && (
                <span className="text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Rejected</span>
              )}
              {designOutput && designOutput.status !== 'approved' && designOutput.status !== 'rejected' && (
                <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">Pending</span>
              )}
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {designIsStreaming && designLiveText && (
                <span className="text-xs text-violet-400 tabular-nums">
                  {designLiveText.length.toLocaleString()} chars
                </span>
              )}
              {!designIsStreaming && designOutput?.token_usage?.total_tokens > 0 && (
                <span
                  title={designOutput.token_usage.calls
                    ? designOutput.token_usage.calls.map(c => `${c.label}: ${(c.input_tokens + c.output_tokens).toLocaleString()}`).join('\n')
                    : `Input: ${designOutput.token_usage.input_tokens.toLocaleString()} · Output: ${designOutput.token_usage.output_tokens.toLocaleString()}`}
                  className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full cursor-default select-none"
                >
                  {designOutput.token_usage.total_tokens.toLocaleString()} tokens
                </span>
              )}
              {designOutput?.output_text && (
                <button
                  onClick={() => downloadPdf({
                    agentName:   'Designer — Design Brief',
                    projectName: project.name,
                    clientName:  project.clients?.name ?? '—',
                    date:        new Date(designOutput.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                    bodyText:    designOutput.output_text,
                    note:        'Note: Wireframe available separately via the View Homepage Wireframe button.',
                    filename:    `Forge-Agency-Designer-${project.name.replace(/\s+/g, '-')}.pdf`,
                  })}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  Download PDF
                </button>
              )}
              <ChevronLeftIcon
                className="w-4 h-4 text-zinc-500"
                style={{ transform: designOpen ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </div>
          </div>

          {designOpen && (
            <>
              {autoApprovedStages.has('designer') && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 mb-2">
                  <span className="font-medium">Auto approved</span>
                  <span className="text-amber-500/70">—</span>
                  <span>review this output at any time and request changes if needed</span>
                </div>
              )}
              {designIsStreaming ? (
                <ScrollBox storageKey="designer" isStreaming={true} contentLength={designLiveText.length} className="bg-zinc-950 border border-zinc-800 rounded-b-lg">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-zinc-800 bg-violet-500/5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-violet-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                    </span>
                    <span className="text-xs text-violet-400 font-medium">Designer is working…</span>
                  </div>
                  <div className="p-5">
                    <pre className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed font-sans">
                      {designLiveText || <span className="text-zinc-600 animate-pulse">Generating design brief and wireframe…</span>}
                    </pre>
                  </div>
                </ScrollBox>
              ) : designOutput ? (
                <ScrollBox storageKey="designer" isStreaming={false} contentLength={designOutput.output_text?.length ?? 0} className="bg-zinc-950 border border-zinc-800 rounded-b-lg p-5">
                  {renderMarkdown(designOutput.output_text)}
                </ScrollBox>
              ) : (
                <div className="bg-zinc-950 border border-zinc-800 rounded-b-lg px-5 py-10 flex items-center justify-center">
                  <p className="text-xs text-zinc-600">No design brief yet</p>
                </div>
              )}
            </>
          )}

          {/* ── Moodboard ── */}
          {showDesignSection && designOutput && !designIsStreaming && (() => {
            let mb = null
            try { mb = designOutput.output_moodboard ? JSON.parse(designOutput.output_moodboard) : null } catch { mb = null }
            return (
              <div className="rounded-lg overflow-hidden mt-3">
                {/* Header */}
                <div
                  onClick={() => setMoodboardOpen(o => !o)}
                  className={`flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors select-none ${moodboardOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <PaletteIcon className="w-4 h-4 text-violet-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-zinc-300">Moodboard</span>
                    {mb && <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Ready</span>}
                    {!mb && !isRegeneratingMoodboard && <span className="text-xs text-zinc-600 italic">Not generated yet</span>}
                    {isRegeneratingMoodboard && (
                      <span className="flex items-center gap-1.5 text-xs text-violet-400">
                        <SpinnerIcon className="w-3 h-3 animate-spin" />
                        Regenerating…
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {mb && (
                      <button
                        onClick={() => downloadMoodboardPdf({
                          projectName: project.name,
                          clientName:  project.clients?.name ?? '—',
                          date:        new Date(designOutput.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                          moodboard:   mb,
                          filename:    `Forge-Agency-Moodboard-${project.name.replace(/\s+/g, '-')}.pdf`,
                        })}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
                      >
                        Download PDF
                      </button>
                    )}
                    <button
                      onClick={() => regenerateMoodboard()}
                      disabled={isRegeneratingMoodboard || isAgentRunning}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshIcon className="w-3 h-3" />
                      {isRegeneratingMoodboard ? 'Regenerating…' : 'Regenerate'}
                    </button>
                    <ChevronLeftIcon
                      className="w-4 h-4 text-zinc-500"
                      style={{ transform: moodboardOpen ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                    />
                  </div>
                </div>

                {/* Body */}
                {moodboardOpen && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-b-lg p-5 space-y-6">
                    {!mb ? (
                      <div className="flex items-center justify-center py-10">
                        <p className="text-xs text-zinc-600 italic">No moodboard data — click Regenerate to generate one</p>
                      </div>
                    ) : (
                      <>
                        {/* Colour Palette */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Colour Palette</p>
                          <div className="flex flex-wrap gap-3">
                            {(mb.palette ?? []).map((swatch, i) => (
                              <div key={i} className="flex flex-col items-center gap-1">
                                <div
                                  className="rounded-md border border-white/10 shadow-sm"
                                  style={{ width: 80, height: 80, backgroundColor: swatch.hex }}
                                />
                                <span className="text-xs font-mono text-zinc-400">{swatch.hex}</span>
                                <span className="text-xs text-zinc-500 text-center max-w-[80px] leading-tight">{swatch.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Typography */}
                        {mb.typography && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Typography</p>
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                { key: 'heading', label: 'Heading Font', sizeStyle: { fontSize: 28, fontWeight: 700 } },
                                { key: 'body',    label: 'Body Font',    sizeStyle: { fontSize: 14, fontWeight: 400 } },
                              ].map(({ key, label, sizeStyle }) => {
                                const entry = mb.typography[key]
                                if (!entry) return null
                                return (
                                  <div key={key} className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 space-y-2">
                                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{label}</div>
                                    <div className="text-xs text-violet-400 font-medium">{entry.font}</div>
                                    <div
                                      style={{ fontFamily: `'${entry.font}', sans-serif`, ...sizeStyle, lineHeight: 1.3, color: '#e4e4e7', wordBreak: 'break-word' }}
                                    >
                                      {entry.sample}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Mood Words */}
                        {mb.mood_words?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Mood Words</p>
                            <div className="flex flex-wrap gap-2">
                              {mb.mood_words.map((word, i) => (
                                <span key={i} className="px-3 py-1 rounded-full text-sm font-medium border border-violet-500/30 bg-violet-500/10 text-violet-300">
                                  {word}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Textures + Imagery */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Textures &amp; Surfaces</p>
                          <div className="space-y-2">
                            {(mb.textures ?? []).map((tex, i) => (
                              <div key={i} className="flex items-start gap-3 pl-3 border-l-2 border-violet-500/40">
                                <span className="text-sm text-zinc-300 leading-relaxed">{tex}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {mb.imagery_direction && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Imagery Direction</p>
                            <div className="pl-3 border-l-2 border-violet-500/40">
                              <p className="text-sm text-zinc-300 leading-relaxed">{mb.imagery_direction}</p>
                            </div>
                          </div>
                        )}

                        {/* UI Style */}
                        {mb.ui_style && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">UI Component Style</p>
                            <blockquote className="pl-4 border-l-2 border-violet-500/40">
                              <p className="text-sm text-zinc-400 italic leading-relaxed">"{mb.ui_style}"</p>
                            </blockquote>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Wireframe subsections — per-page collapsible */}
          {(wireframeOutputs.length > 0 || designOutput?.output_wireframe) && !designIsStreaming && (
            <div className="mt-3 space-y-1.5">
              {(wireframeOutputs.length > 0
                ? wireframeOutputs
                : [{ id: designOutput.id, agent_name: 'Designer-Wireframe-index.html', _legacy: true }]
              ).map(wf => {
                const filename    = wf.agent_name.replace('Designer-Wireframe-', '')
                const allPages    = project?.pages ?? []
                const pageInfo    = allPages.find(p => p.filename === filename)
                const displayName = pageInfo?.name ?? filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                const isRegenThis = regenPageFilename === wf.agent_name
                const isOpen      = wireframeOpen[wf.id] !== false // default open
                const isGeneratingThis = wireframeProgress?.pageName === displayName && designIsStreaming

                return (
                  <div key={wf.id} className="rounded-lg border border-zinc-800 overflow-hidden">
                    {/* Subsection header */}
                    <button
                      onClick={() => setWireframeOpen(prev => ({ ...prev, [wf.id]: !isOpen }))}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800/80 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <WireframeIcon className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-zinc-300">{displayName}</span>
                        <span className="text-xs text-zinc-600">{filename}</span>
                        {isRegenThis && (
                          <span className="flex items-center gap-1 text-xs text-violet-400">
                            <SpinnerIcon className="w-3 h-3 animate-spin" />
                            Regenerating…
                          </span>
                        )}
                        {!isRegenThis && wf.output_text && (
                          <span className="text-xs text-zinc-600 italic truncate">Layout: {wf.output_text}</span>
                        )}
                      </div>
                      <ChevronIcon className={`w-3.5 h-3.5 text-zinc-500 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Subsection body */}
                    {isOpen && (
                      <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950 flex items-center gap-2 flex-wrap">
                        <button
                          onClick={async () => {
                            const { data } = await supabase.from('agent_outputs').select('output_wireframe').eq('id', wf.id).single()
                            if (!data?.output_wireframe) return
                            window.open(URL.createObjectURL(new Blob([data.output_wireframe], { type: 'image/svg+xml' })), '_blank')
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                        >
                          <ExternalLinkIcon className="w-3 h-3" />
                          View Wireframe
                        </button>
                        {!wf._legacy && (
                          <>
                            <button
                              onClick={() => regenerateWireframePage(wf)}
                              disabled={isAgentRunning}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RefreshIcon className="w-3 h-3" />
                              {isRegenThis ? 'Regenerating…' : 'Regenerate Wireframe'}
                            </button>
                            <button
                              onClick={() => regenerateWireframePage(wf, wf.output_text ?? undefined)}
                              disabled={isAgentRunning}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RefreshIcon className="w-3 h-3" />
                              Regenerate with different layout
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Wireframe coverage note */}
          {!designIsStreaming && wireframeCoverageData && (
            <div className="mt-3 px-3 py-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-xs text-zinc-400 leading-relaxed">
              {wireframeCoverageData.withWireframe.length > 0 && (
                <span>
                  <span className="text-zinc-300 font-medium">Wireframes generated for:</span>{' '}
                  {wireframeCoverageData.withWireframe.map(p => p.name).join(', ')}.
                </span>
              )}
              {wireframeCoverageData.withWireframe.length > 0 && wireframeCoverageData.skipped.length > 0 && ' '}
              {wireframeCoverageData.skipped.length > 0 && (
                <span>
                  <span className="text-zinc-500 font-medium">Skipped:</span>{' '}
                  {wireframeCoverageData.skipped.map(p => p.name).join(', ')}.
                </span>
              )}
            </div>
          )}

          {/* Progress indicator during wireframe generation */}
          {designIsStreaming && wireframeProgress && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-violet-500/10 border border-violet-500/20">
              <SpinnerIcon className="w-3.5 h-3.5 text-violet-400 animate-spin flex-shrink-0" />
              <span className="text-xs text-violet-300 font-medium">
                Generating wireframe for {wireframeProgress.pageName}
                {wireframeProgress.total > 1 ? ` (${wireframeProgress.current} of ${wireframeProgress.total})` : ''}…
              </span>
            </div>
          )}

          {/* Action buttons — pending, no mode open */}
          {designOutput?.status === 'pending' && !designMode && (
            <div className="flex items-center gap-3 flex-wrap pt-3">
              <button
                onClick={approveDesign}
                disabled={approvingDesign || isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                {approvingDesign ? 'Approving…' : 'Approve and move to Dev'}
              </button>
              <button
                onClick={() => setDesignMode('chooser')}
                disabled={isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
                Request Changes
              </button>
              <button
                onClick={goBackToResearch}
                disabled={goingBack || isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
                {goingBack ? 'Going back…' : 'Go back to Research'}
              </button>
            </div>
          )}

          {/* Chooser */}
          {designOutput?.status === 'pending' && designMode === 'chooser' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-4 mt-3">
              <p className="text-xs font-medium text-zinc-400">How would you like to proceed?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDesignMode('fix')}
                  className="flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-zinc-200">Fix Issue</span>
                  <span className="text-xs text-zinc-500">Targeted fix — keeps everything else the same</span>
                </button>
                <button
                  onClick={() => setDesignMode('fresh')}
                  className="flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-zinc-200">Start Fresh</span>
                  <span className="text-xs text-zinc-500">Clean slate — agent starts over from scratch</span>
                </button>
              </div>
              <button onClick={() => setDesignMode(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Cancel</button>
            </div>
          )}

          {/* Fix form */}
          {designOutput?.status === 'pending' && designMode === 'fix' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 mt-3">
              <input
                type="text"
                value={designFeedbackText}
                onChange={e => setDesignFeedbackText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitDesignFix()}
                placeholder="Describe the issue to fix"
                className="w-full px-3 py-2.5 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitDesignFix}
                  disabled={!designFeedbackText.trim() || submittingDesign}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  {submittingDesign ? 'Running…' : 'Apply Fix'}
                </button>
                <button onClick={() => setDesignMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
              </div>
            </div>
          )}

          {/* Fresh form */}
          {designOutput?.status === 'pending' && designMode === 'fresh' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 mt-3">
              <textarea
                value={designFeedbackText}
                onChange={e => setDesignFeedbackText(e.target.value)}
                placeholder="Optional: provide any specific direction for the new attempt"
                rows={4}
                className="w-full px-3 py-2.5 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitDesignFresh}
                  disabled={submittingDesign}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-red-700 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  {submittingDesign ? 'Running…' : 'Start Fresh'}
                </button>
                <button onClick={() => setDesignMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
              </div>
            </div>
          )}

          {designOutput?.status === 'approved' && (
            <p className="text-xs text-zinc-600 pt-3">Design approved — project moved to Dev stage.</p>
          )}
        </div>
      )}

      {/* ── Developer Output ── */}
      {showDevSection && (
        <div className={`space-y-0 rounded-lg transition-shadow duration-300 ${flashedStages.has('developer') ? 'ring-2 ring-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : ''} ${failedAutoRunStage === 'developer' ? 'ring-2 ring-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.12)]' : ''}`}>
          {/* Main section header */}
          <div
            onClick={() => setDevOpen(o => !o)}
            className={`flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors select-none ${devOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-300">Developer Output</span>
              {devOutput?.status === 'approved' && <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Approved</span>}
              {devOutput?.status === 'rejected'  && <span className="text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Rejected</span>}
              {devOutput && devOutput.status !== 'approved' && devOutput.status !== 'rejected' && <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">Pending</span>}
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {devIsStreaming && devLiveText && (
                <span className="text-xs text-orange-400 tabular-nums">
                  {devLiveText.length.toLocaleString()} chars
                </span>
              )}
              {!devIsStreaming && devTotalTokens > 0 && (
                <span
                  title={devTokenTooltip}
                  className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full cursor-default select-none"
                >
                  {devTotalTokens.toLocaleString()} tokens
                </span>
              )}
              {devOutput && (
                <button
                  onClick={() => downloadDeveloperPdf({
                    projectName: project.name,
                    clientName:  project.clients?.name ?? '—',
                    date:        new Date(devOutput.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                    stackText:   devStackOutput?.output_text ?? '',
                    htmlText:    devHtmlOutput?.output_text  ?? '',
                    cssText:     devCssOutput?.output_text   ?? '',
                    jsText:      devJsOutput?.output_text    ?? '',
                    filename:    `${project.name.replace(/\s+/g, '-')}-developer-output.pdf`,
                  })}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  Download PDF
                </button>
              )}
              {devOutput && (
                <button
                  onClick={() => openProjectFolder(project?.clients?.name ?? '', project?.name ?? '', showToast)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  Open Folder
                </button>
              )}
              <ChevronLeftIcon className="w-4 h-4 text-zinc-500" style={{ transform: devOpen ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </div>
          </div>

          {devOpen && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-b-lg divide-y divide-zinc-800">
              {autoApprovedStages.has('developer') && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
                  <span className="font-medium">Auto approved</span>
                  <span className="text-amber-500/70">—</span>
                  <span>review this output at any time and request changes if needed</span>
                </div>
              )}

              {/* ── Pages Progress indicator ── */}
              {projectPages.length > 0 && (devOutput || isDeveloping) && (
                <div className="px-5 py-4 border-b border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Pages Progress</span>
                    <span className="text-xs text-zinc-500">
                      {approvedPages.size} of {projectPages.length} approved
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${projectPages.length > 0 ? (approvedPages.size / projectPages.length) * 100 : 0}%` }}
                    />
                  </div>
                  {/* Per-page status list */}
                  <div className="space-y-1.5">
                    {projectPages.map(pg => {
                      const pgStatus = getPageStatus(pg.filename)
                      const isApproved  = approvedPages.has(pg.filename)
                      const isBuilding  = pgStatus === 'generating' || devLiveStep === `Developer-HTML-${pg.filename}`
                      const isComplete  = pgStatus === 'complete'
                      const isFailed    = pgStatus === 'failed'

                      let icon, label, labelCls
                      if (isApproved) {
                        icon     = <CheckIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        label    = 'Approved'
                        labelCls = 'text-emerald-400'
                      } else if (isBuilding) {
                        icon     = <SpinnerIcon className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
                        label    = 'Building…'
                        labelCls = 'text-blue-400'
                      } else if (isComplete) {
                        icon     = <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-400 flex-shrink-0 inline-block" />
                        label    = 'Awaiting approval'
                        labelCls = 'text-amber-400'
                      } else if (isFailed) {
                        icon     = <span className="w-3.5 h-3.5 rounded-full bg-red-500 flex-shrink-0 inline-block" />
                        label    = 'Failed'
                        labelCls = 'text-red-400'
                      } else {
                        icon     = <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 flex-shrink-0 inline-block" />
                        label    = 'Not started'
                        labelCls = 'text-zinc-600'
                      }

                      return (
                        <div key={pg.filename} className="flex items-center gap-2.5">
                          {icon}
                          <span className="text-xs text-zinc-300 min-w-0 truncate">{pg.name}</span>
                          <span className="text-xs text-zinc-600 truncate">{pg.filename}</span>
                          <span className={`text-xs ml-auto flex-shrink-0 ${labelCls}`}>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Sub-section: Tech Stack and Files ── */}
              {devLiveStep === 'Developer-Stack' ? (
                <StreamingSubSection label="Tech Stack and Files" stepLabel={devLiveStepLabel} text={devLiveText} storageKey="developer-stack" />
              ) : devStackOutput ? (
                <DevSubSection
                  key={devStackOutput.id}
                  label="Tech Stack and Files"
                  storageKey="developer-stack"
                  record={devStackOutput}
                  project={project}
                  defaultOpen={devIsStreaming}
                  renderContent={() => renderMarkdown(devStackOutput.output_text)}
                  onFix={async (issue, onProgress) => {
                    const rec = devStackOutput
                    const brief = briefs[0]?.brief_text ?? `Project: ${project.name}`
                    const uc = `Original Client Brief:\n\n${brief}\n\n---\n\nYour Previous Output:\n\n${rec.output_text}\n\n---\n\nIssue to Fix:\n\n${issue}`
                    await saveRevision('Developer-Stack', rec)
                    let fixed = ''
                    const { inputTokens: stkIn, outputTokens: stkOut, stopReason: stkStop } = await streamAnthropicCall({ messages: [{ role: 'user', content: uc }], systemPrompt: DEVELOPER_STACK_FIX_SYSTEM, model: 'claude-sonnet-4-20250514', maxTokens: 30000, onChunk: (chunk) => { fixed += chunk; onProgress(fixed) } })
                    const tu = { input_tokens: stkIn, output_tokens: stkOut, total_tokens: stkIn + stkOut, stop_reason: stkStop }
                    const { error } = await safeUpdate('agent_outputs', rec.id, { output_text: fixed, token_usage: tu }, { output_text: fixed })
                    if (error) throw new Error(error.message)
                    await load()
                  }}
                  onFresh={async (direction) => {
                    if (!await confirm({ title: 'Start Fresh', message: 'This will delete the current Tech Stack output and regenerate it from scratch. Are you sure?', confirmLabel: 'Start Fresh', variant: 'danger' })) return
                    setIsDeveloping(true)
                    const ctx = `Client Brief:\n\n${briefs[0]?.brief_text ?? ''}\n\n---\n\nResearch Report:\n\n${agentOutputs.find(o => o.agent_name === 'researcher')?.output_text ?? ''}\n\n---\n\nDesign Brief:\n\n${designOutput?.output_text ?? ''}`
                    await saveRevision('Developer-Stack', devStackOutput)
                    await supabase.from('agent_outputs').delete().eq('id', devStackOutput.id)
                    try { await runDevStep('Tech Stack and Files', DEVELOPER_STACK_SYSTEM, direction ? `${ctx}\n\n---\n\nSpecific direction:\n\n${direction}` : ctx, 'Developer-Stack') }
                    catch (err) { console.error('[Stack fresh]', err) } finally { setIsDeveloping(false) }
                  }}
                />
              ) : isDeveloping ? (
                <PendingSubSection label="Tech Stack and Files" />
              ) : null}

              {/* ── Sub-section: CSS Stylesheet ── */}
              {devLiveStep === 'Developer-CSS' ? (
                <StreamingSubSection label="CSS Stylesheet" stepLabel={devLiveStepLabel} text={devLiveText} storageKey="developer-css" />
              ) : devCssOutput ? (
                <DevSubSection
                  key={devCssOutput.id}
                  label="CSS Stylesheet"
                  storageKey="developer-css"
                  record={devCssOutput}
                  project={project}
                  defaultOpen={devIsStreaming}
                  renderContent={() => <pre className="whitespace-pre-wrap text-xs text-zinc-300 leading-relaxed font-mono">{devCssOutput.output_text}</pre>}
                  copyText={devCssOutput.output_text ?? ''}
                  fileDownload={`${project.name.replace(/\s+/g, '-')}-styles.css`}
                  onFix={async (issue, onProgress) => {
                    const brief = briefs[0]?.brief_text ?? `Project: ${project.name}`
                    const uc = `Original Client Brief:\n\n${brief}\n\n---\n\nJavaScript file (for reference):\n\n${devJsOutput?.output_text ?? ''}\n\n---\n\nHTML file (for reference):\n\n${devHtmlOutput?.output_text ?? ''}\n\n---\n\nCSS file to fix:\n\n${devCssOutput.output_text}\n\n---\n\nIssue to Fix:\n\n${issue}`
                    await saveRevision('Developer-CSS', devCssOutput)
                    let fixed = ''
                    const { inputTokens: cssIn, outputTokens: cssOut, stopReason: cssStop } = await streamAnthropicCall({ messages: [{ role: 'user', content: uc }], systemPrompt: DEVELOPER_CSS_FIX_SYSTEM, model: 'claude-sonnet-4-20250514', maxTokens: 30000, onChunk: (chunk) => { fixed += chunk; onProgress(fixed) } })
                    const tu = { input_tokens: cssIn, output_tokens: cssOut, total_tokens: cssIn + cssOut, stop_reason: cssStop }
                    fixed = stripCodeFences(fixed)
                    const { error } = await safeUpdate('agent_outputs', devCssOutput.id, { output_text: fixed, token_usage: tu }, { output_text: fixed })
                    if (error) throw new Error(error.message)
                    await load()
                    await saveFilesToDisk(project?.clients?.name ?? '', project?.name ?? '', [{ filename: 'styles.css', content: fixed }], showToast)
                  }}
                  onFresh={async (direction) => {
                    if (!await confirm({ title: 'Start Fresh', message: 'This will delete the current CSS stylesheet and regenerate it from scratch. Are you sure?', confirmLabel: 'Start Fresh', variant: 'danger' })) return
                    setIsDeveloping(true)
                    const ctx = `Design Brief:\n\n${designOutput?.output_text ?? ''}` + (direction ? `\n\n---\n\nSpecific direction:\n\n${direction}` : '')
                    await saveRevision('Developer-CSS', devCssOutput)
                    await supabase.from('agent_outputs').delete().eq('id', devCssOutput.id)
                    try { await runDevStep('CSS Stylesheet', DEVELOPER_CSS_SYSTEM, ctx, 'Developer-CSS', { transform: stripCodeFences }) }
                    catch (err) { console.error('[CSS fresh]', err) } finally { setIsDeveloping(false) }
                  }}
                />
              ) : isDeveloping ? (
                <PendingSubSection label="CSS Stylesheet" />
              ) : null}

              {/* ── Missing CSS classes warning ── */}
              {missingCssClasses.length > 0 && devCssOutput && !isDeveloping && (
                <div className="flex items-center gap-3 px-5 py-3 bg-amber-500/8 border-b border-amber-500/20 flex-wrap">
                  <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <span className="text-xs text-amber-400 flex-1 min-w-0">
                    <span className="font-medium">Missing CSS classes</span>
                    <span className="text-amber-500/80"> — used in script.js but not defined in CSS: </span>
                    {missingCssClasses.map((cls, i) => (
                      <span key={cls}>
                        <code className="bg-amber-500/15 px-1 py-0.5 rounded text-amber-300">.{cls}</code>
                        {i < missingCssClasses.length - 1 && <span className="text-amber-500/60">, </span>}
                      </span>
                    ))}
                  </span>
                  {missingCssClasses.some(cls => CSS_PATCH_RULES[cls]) && (
                    <button
                      onClick={() => patchMissingCssClasses(missingCssClasses)}
                      disabled={isPatchingCss}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPatchingCss ? 'Patching…' : 'Patch CSS'}
                    </button>
                  )}
                </div>
              )}

              {/* ── Sub-section: JavaScript ── */}
              {devLiveStep === 'Developer-JS' ? (
                <StreamingSubSection label="JavaScript" stepLabel={devLiveStepLabel} text={devLiveText} storageKey="developer-js" />
              ) : devJsOutput ? (
                <DevSubSection
                  key={devJsOutput.id}
                  label="JavaScript"
                  storageKey="developer-js"
                  record={devJsOutput}
                  project={project}
                  defaultOpen={devIsStreaming}
                  renderContent={() => <pre className="whitespace-pre-wrap text-xs text-zinc-300 leading-relaxed font-mono">{devJsOutput.output_text}</pre>}
                  copyText={devJsOutput.output_text ?? ''}
                  fileDownload={`${project.name.replace(/\s+/g, '-')}-main.js`}
                  onFix={async (issue, onProgress) => {
                    const brief = briefs[0]?.brief_text ?? `Project: ${project.name}`
                    const uc = `Original Client Brief:\n\n${brief}\n\n---\n\nCSS file (for reference — use these exact class names):\n\n${devCssOutput?.output_text ?? ''}\n\n---\n\nHTML file (for reference):\n\n${devHtmlOutput?.output_text ?? ''}\n\n---\n\nJavaScript file to fix:\n\n${devJsOutput.output_text}\n\n---\n\nIssue to Fix:\n\n${issue}`
                    await saveRevision('Developer-JS', devJsOutput)
                    let fixed = ''
                    const { inputTokens: jsIn, outputTokens: jsOut, stopReason: jsStop } = await streamAnthropicCall({ messages: [{ role: 'user', content: uc }], systemPrompt: DEVELOPER_JS_FIX_SYSTEM, model: 'claude-sonnet-4-20250514', maxTokens: 30000, onChunk: (chunk) => { fixed += chunk; onProgress(fixed) } })
                    const tu = { input_tokens: jsIn, output_tokens: jsOut, total_tokens: jsIn + jsOut, stop_reason: jsStop }
                    fixed = stripCodeFences(fixed)
                    const { error } = await safeUpdate('agent_outputs', devJsOutput.id, { output_text: fixed, token_usage: tu }, { output_text: fixed })
                    if (error) throw new Error(error.message)
                    await load()
                    await saveFilesToDisk(project?.clients?.name ?? '', project?.name ?? '', [{ filename: 'script.js', content: fixed }], showToast)
                  }}
                  onFresh={async (direction) => {
                    if (!await confirm({ title: 'Start Fresh', message: 'This will delete the current JavaScript file and regenerate it from scratch. Are you sure?', confirmLabel: 'Start Fresh', variant: 'danger' })) return
                    setIsDeveloping(true)
                    const ctx = `Design Brief:\n\n${designOutput?.output_text ?? ''}\n\n---\n\nCSS stylesheet (styles.css):\n\n${devCssOutput?.output_text ?? ''}` + (direction ? `\n\n---\n\nSpecific direction:\n\n${direction}` : '')
                    await saveRevision('Developer-JS', devJsOutput)
                    await supabase.from('agent_outputs').delete().eq('id', devJsOutput.id)
                    try { await runDevStep('JavaScript', DEVELOPER_JS_SYSTEM, ctx, 'Developer-JS', { transform: stripCodeFences }) }
                    catch (err) { console.error('[JS fresh]', err) } finally { setIsDeveloping(false) }
                  }}
                />
              ) : isDeveloping ? (
                <PendingSubSection label="JavaScript" />
              ) : null}

              {/* ── Sub-section: Pages (per-page HTML) ── */}
              {(projectPages.length > 0 || isDeveloping) && (
                <div>
                  <div className="flex items-center gap-2.5 px-5 py-2.5 bg-zinc-900/30">
                    <span className="text-xs font-medium uppercase tracking-wide text-emerald-400">Pages</span>
                    <span className="text-xs text-zinc-600">{projectPages.length} page{projectPages.length !== 1 ? 's' : ''}</span>
                  </div>

                  {projectPages.length === 0 && isDeveloping && (
                    <PendingSubSection label="HTML pages (queued)" />
                  )}

                  {projectPages.map(pg => {
                    const agName   = `Developer-HTML-${pg.filename}`
                    const htmlRec  = devHtmlOutputs.find(o => o.agent_name === agName)
                    const pgStatus = getPageStatus(pg.filename)
                    const isLive   = devLiveStep === agName

                    if (isLive) {
                      return <StreamingSubSection key={pg.filename} label={`${pg.name} — ${pg.filename}`} stepLabel={devLiveStepLabel} text={devLiveText} storageKey={`developer-html-${pg.filename}`} />
                    }

                    if ((pgStatus === 'complete' || pgStatus === 'approved') && htmlRec) {
                      const isPageApproved = htmlRec.status === 'approved'
                      return (
                        <DevSubSection
                          key={htmlRec.id}
                          label={`${pg.name} — ${pg.filename}`}
                          storageKey={`developer-html-${pg.filename}`}
                          record={htmlRec}
                          project={project}
                          defaultOpen={false}
                          renderContent={() => <pre className="whitespace-pre-wrap text-xs text-zinc-300 leading-relaxed font-mono">{htmlRec.output_text}</pre>}
                          copyText={htmlRec.output_text ?? ''}
                          fileDownload={pg.filename}
                          onApprove={!isAgentRunning && !isPageApproved ? () => handleApprovePageStep(pg.filename) : undefined}
                          approved={isPageApproved}
                          extraButton={
                            htmlRec.output_text && (
                              <button
                                onClick={() => {
                                  const css  = devCssOutput?.output_text ?? ''
                                  const js   = devJsOutput?.output_text  ?? ''
                                  const html = htmlRec.output_text ?? ''
                                  const preview = html
                                    .replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']styles\.css["'][^>]*>/gi, `<style>\n${css}\n</style>`)
                                    .replace(/<script[^>]+src=["']script\.js["'][^>]*><\/script>/gi, `<script>\n${js}\n</script>`)
                                  window.open(URL.createObjectURL(new Blob([preview], { type: 'text/html' })), '_blank')
                                }}
                                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 transition-colors"
                              >
                                <ExternalLinkIcon className="w-3 h-3" />
                                View in Browser
                              </button>
                            )
                          }
                          onFix={async (issue, onProgress) => {
                            const brief = briefs[0]?.brief_text ?? `Project: ${project.name}`
                            const uc = `Original Client Brief:\n\n${brief}\n\n---\n\nCSS file (styles.css — use these exact class names):\n\n${devCssOutput?.output_text ?? ''}\n\n---\n\nJavaScript file (script.js):\n\n${devJsOutput?.output_text ?? ''}\n\n---\n\nHTML file to fix (${pg.filename}):\n\n${htmlRec.output_text}\n\n---\n\nIssue to Fix:\n\n${issue}`
                            await saveRevision(htmlRec.agent_name, htmlRec)
                            let fixed = ''
                            const { inputTokens: hpIn, outputTokens: hpOut, stopReason: hpStop } = await streamAnthropicCall({ messages: [{ role: 'user', content: uc }], systemPrompt: devHtmlPageFixSystem(pg.name), model: 'claude-sonnet-4-20250514', maxTokens: 30000, onChunk: (chunk) => { fixed += chunk; onProgress(fixed) } })
                            const tu = { input_tokens: hpIn, output_tokens: hpOut, total_tokens: hpIn + hpOut, stop_reason: hpStop }
                            fixed = stripCodeFences(fixed)
                            const { error } = await safeUpdate('agent_outputs', htmlRec.id, { output_text: fixed, token_usage: tu }, { output_text: fixed })
                            if (error) throw new Error(error.message)
                            await load()
                            await saveFilesToDisk(project?.clients?.name ?? '', project?.name ?? '', [{ filename: pg.filename, content: fixed }], showToast)
                          }}
                          onFresh={async (direction) => {
                            if (!await confirm({ title: 'Start Fresh', message: `This will delete the current ${pg.filename} file and regenerate it from scratch. Are you sure?`, confirmLabel: 'Start Fresh', variant: 'danger' })) return
                            setIsDeveloping(true)
                            const allPagesCtx = projectPages.length ? `\n\nAll pages in this site: ${projectPages.map(p => `${p.name} → ${p.filename}`).join(', ')}.` : ''
                            const ctx = `Design Brief:\n\n${designOutput?.output_text ?? ''}${allPagesCtx}\n\n---\n\nCSS stylesheet (styles.css):\n\n${devCssOutput?.output_text ?? ''}\n\n---\n\nJavaScript (script.js):\n\n${devJsOutput?.output_text ?? ''}` + (direction ? `\n\n---\n\nSpecific direction:\n\n${direction}` : '')
                            await saveRevision(htmlRec.agent_name, htmlRec)
                            await supabase.from('agent_outputs').delete().eq('id', htmlRec.id)
                            setPageStatuses(prev => ({ ...prev, [pg.filename]: 'pending' }))
                            try {
                              await runDevStep(`HTML — ${pg.filename}`, devHtmlPageSystem(pg.name), ctx, agName, { transform: stripCodeFences })
                              setPageStatuses(prev => ({ ...prev, [pg.filename]: 'complete' }))
                            } catch (err) {
                              console.error(`[HTML fresh ${pg.filename}]`, err)
                              setPageStatuses(prev => ({ ...prev, [pg.filename]: 'failed' }))
                            } finally { setIsDeveloping(false) }
                          }}
                        />
                      )
                    }

                    if (pgStatus === 'failed') {
                      return (
                        <div key={pg.filename} className="flex items-center justify-between px-5 py-3 bg-zinc-900/50 border-t border-zinc-800">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400 truncate">{pg.name} — {pg.filename}</span>
                            <span className="flex-shrink-0 text-xs font-medium text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full border border-red-400/20">Failed</span>
                          </div>
                          <button
                            onClick={() => retryHtmlPage(pg)}
                            disabled={isDeveloping || isAgentRunning}
                            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RefreshIcon className="w-3 h-3" />
                            Retry
                          </button>
                        </div>
                      )
                    }

                    if (pgStatus === 'generating') {
                      return (
                        <div key={pg.filename} className="flex items-center gap-3 px-5 py-3 bg-zinc-900/50 border-t border-zinc-800">
                          <SpinnerIcon className="w-3.5 h-3.5 text-emerald-400 animate-spin flex-shrink-0" />
                          <span className="text-xs font-medium uppercase tracking-wide text-emerald-400 truncate">{pg.name} — {pg.filename}</span>
                          <span className="text-xs text-zinc-500 animate-pulse flex-shrink-0">Generating…</span>
                        </div>
                      )
                    }

                    // pending
                    return (
                      <div key={pg.filename} className="flex items-center gap-3 px-5 py-3 bg-zinc-900/50 border-t border-zinc-800">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 truncate">{pg.name} — {pg.filename}</span>
                        <span className="flex-shrink-0 text-xs font-medium text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">Pending</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Legacy Developer-Pages guide (backward compat) ── */}
              {devLiveStep === 'Developer-Pages' ? (
                <StreamingSubSection label="Additional Pages" stepLabel={devLiveStepLabel} text={devLiveText} storageKey="developer-pages" />
              ) : devPagesOutput ? (
                <DevSubSection
                  key={devPagesOutput.id}
                  label="Additional Pages"
                  storageKey="developer-pages"
                  record={devPagesOutput}
                  project={project}
                  defaultOpen={false}
                  renderContent={() => renderMarkdown(devPagesOutput.output_text)}
                  onFix={async (issue, onProgress) => {
                    const rec = devPagesOutput
                    const brief = briefs[0]?.brief_text ?? `Project: ${project.name}`
                    const uc = `Original Client Brief:\n\n${brief}\n\n---\n\nYour Previous Output:\n\n${rec.output_text}\n\n---\n\nIssue to Fix:\n\n${issue}`
                    await saveRevision('Developer-Pages', rec)
                    let fixed = ''
                    const { inputTokens: pgIn, outputTokens: pgOut, stopReason: pgStop } = await streamAnthropicCall({ messages: [{ role: 'user', content: uc }], systemPrompt: DEVELOPER_PAGES_FIX_SYSTEM, model: 'claude-sonnet-4-20250514', maxTokens: 30000, onChunk: (chunk) => { fixed += chunk; onProgress(fixed) } })
                    const tu = { input_tokens: pgIn, output_tokens: pgOut, total_tokens: pgIn + pgOut, stop_reason: pgStop }
                    const { error } = await safeUpdate('agent_outputs', rec.id, { output_text: fixed, token_usage: tu }, { output_text: fixed })
                    if (error) throw new Error(error.message)
                    await load()
                  }}
                  onFresh={async (direction) => {
                    if (!await confirm({ title: 'Start Fresh', message: 'This will delete the current Additional Pages output and regenerate it from scratch. Are you sure?', confirmLabel: 'Start Fresh', variant: 'danger' })) return
                    setIsDeveloping(true)
                    const ctx = `Client Brief:\n\n${briefs[0]?.brief_text ?? ''}\n\n---\n\nDesign Brief:\n\n${designOutput?.output_text ?? ''}`
                    await saveRevision('Developer-Pages', devPagesOutput)
                    await supabase.from('agent_outputs').delete().eq('id', devPagesOutput.id)
                    try { await runDevStep('Additional Pages', DEVELOPER_PAGES_SYSTEM, direction ? `${ctx}\n\n---\n\nSpecific direction:\n\n${direction}` : ctx, 'Developer-Pages') }
                    catch (err) { console.error('[Pages fresh]', err) } finally { setIsDeveloping(false) }
                  }}
                />
              ) : null}

              {/* ── Sub-section: Client Setup Guide ── */}
              {isGeneratingGuide ? (
                <div className="border-t border-zinc-800 px-5 py-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
                  <span className="text-xs text-zinc-500">Generating Client Setup Guide…</span>
                </div>
              ) : devSetupGuideOutput ? (
                <div className="border-t border-zinc-800">
                  {/* Collapsible header */}
                  <button
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/50 transition-colors"
                    onClick={() => setSetupGuideOpen(o => !o)}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                      </svg>
                      <span className="text-sm font-medium text-zinc-200">Client Setup Guide</span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-400 border border-blue-500/25">Supabase</span>
                    </div>
                    <svg className={`w-4 h-4 text-zinc-500 transition-transform ${setupGuideOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {setupGuideOpen && (
                    <div className="px-5 pb-5 space-y-4">
                      {/* Guide content */}
                      <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-5">
                        {renderMarkdown(devSetupGuideOutput.output_text)}
                      </div>

                      {/* Download PDF button */}
                      <button
                        onClick={() => {
                          const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                          downloadPdf({
                            agentName:   'Client Setup Guide',
                            projectName: project?.name ?? 'Project',
                            clientName:  project?.clients?.name ?? 'Client',
                            date,
                            bodyText:    devSetupGuideOutput.output_text,
                            filename:    `${(project?.name ?? 'project').toLowerCase().replace(/\s+/g, '-')}-setup-guide.pdf`,
                          })
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download Setup Guide PDF
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {!devIsStreaming && !devOutput && (
                <div className="px-5 py-10 flex items-center justify-center">
                  <p className="text-xs text-zinc-600">No developer output yet — approve the design to trigger the Developer agent</p>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          {devOutput && devOutput.status !== 'approved' && !devMode && (allPagesSettled || projectPages.length === 0 || skipToReview) && !isDeveloping && allPagesApproved && (
            <div className="flex items-center gap-3 flex-wrap pt-3">
              {skipToReview && (() => {
                const unbuiltCount = projectPages.filter(p => getPageStatus(p.filename) === 'pending').length
                return unbuiltCount > 0 ? (
                  <p className="w-full text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                    ⚠ {unbuiltCount} page{unbuiltCount !== 1 ? 's were' : ' was'} not built — the Reviewer will note any missing pages.
                  </p>
                ) : null
              })()}
              {failedPagesCount > 0 && (
                <p className="w-full text-xs text-amber-400">
                  ⚠ {failedPagesCount} page{failedPagesCount !== 1 ? 's' : ''} failed to generate. You can retry failed pages above or proceed to review.
                </p>
              )}
              {qualityWarnings.length > 0 && (
                <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Quality Warnings</p>
                  {qualityWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-300/90 leading-relaxed">⚠ {w}</p>
                  ))}
                </div>
              )}
              <button onClick={approveDev} disabled={approvingDev || isAgentRunning} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <CheckIcon className="w-3.5 h-3.5" />
                {approvingDev ? 'Approving…' : 'Approve and move to Review'}
              </button>
              <button onClick={() => setDevMode('chooser')} disabled={isAgentRunning} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50">
                <RefreshIcon className="w-3.5 h-3.5" />
                Request Changes
              </button>
              <button onClick={goBackToDesign} disabled={goingBackToDev || isAgentRunning} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50">
                <ChevronLeftIcon className="w-3.5 h-3.5" />
                {goingBackToDev ? 'Going back…' : 'Go back to Design'}
              </button>
            </div>
          )}

          {/* Chooser */}
          {devOutput?.status === 'pending' && devMode === 'chooser' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-4 mt-3">
              <p className="text-xs font-medium text-zinc-400">How would you like to proceed?</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setDevMode('fix')} className="flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left">
                  <span className="text-sm font-medium text-zinc-200">Fix Issue</span>
                  <span className="text-xs text-zinc-500">Targeted fix — keeps everything else the same</span>
                </button>
                <button onClick={() => setDevMode('fresh')} className="flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left">
                  <span className="text-sm font-medium text-zinc-200">Start Fresh</span>
                  <span className="text-xs text-zinc-500">Clean slate — agent starts over from scratch</span>
                </button>
              </div>
              <button onClick={() => setDevMode(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Cancel</button>
            </div>
          )}

          {/* Fix form */}
          {devOutput?.status === 'pending' && devMode === 'fix' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 mt-3">
              <input type="text" value={devFeedbackText} onChange={e => setDevFeedbackText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitDevFix()} placeholder="Describe the issue to fix" className="w-full px-3 py-2.5 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors" />
              <div className="flex items-center gap-2">
                <button onClick={submitDevFix} disabled={!devFeedbackText.trim() || submittingDev} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <RefreshIcon className="w-3.5 h-3.5" />
                  {submittingDev ? 'Running…' : 'Apply Fix'}
                </button>
                <button onClick={() => setDevMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
              </div>
            </div>
          )}

          {/* Fresh form */}
          {devOutput?.status === 'pending' && devMode === 'fresh' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 mt-3">
              <textarea value={devFeedbackText} onChange={e => setDevFeedbackText(e.target.value)} placeholder="Optional: provide any specific direction for the new attempt" rows={4} className="w-full px-3 py-2.5 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors resize-none" />
              <div className="flex items-center gap-2">
                <button onClick={submitDevFresh} disabled={submittingDev} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-red-700 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <RefreshIcon className="w-3.5 h-3.5" />
                  {submittingDev ? 'Running…' : 'Start Fresh'}
                </button>
                <button onClick={() => setDevMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
              </div>
            </div>
          )}

          {devOutput?.status === 'approved' && (
            <p className="text-xs text-zinc-600 pt-3">Developer output approved — Reviewer agent triggered automatically.</p>
          )}
        </div>
      )}

      {/* ── Reviewer Report ── */}
      {showReviewSection && (
        <div className={`space-y-0 rounded-lg transition-shadow duration-300 ${flashedStages.has('reviewer') ? 'ring-2 ring-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : ''} ${failedAutoRunStage === 'reviewer' ? 'ring-2 ring-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.12)]' : ''}`}>
          <div
            onClick={() => setReviewOpen(o => !o)}
            className={`flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors select-none ${reviewOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-300">Reviewer Report</span>
              {reviewerOutput?.status === 'approved' && (
                <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Approved</span>
              )}
              {reviewerOutput && reviewerOutput.status !== 'approved' && (
                <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">Pending</span>
              )}
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {reviewIsStreaming && reviewLiveText && (
                <span className="text-xs text-amber-400 tabular-nums">
                  {reviewLiveText.length.toLocaleString()} chars
                </span>
              )}
              {!reviewIsStreaming && reviewerOutput?.token_usage?.total_tokens > 0 && (
                <span
                  title={`Input: ${reviewerOutput.token_usage.input_tokens.toLocaleString()} · Output: ${reviewerOutput.token_usage.output_tokens.toLocaleString()}`}
                  className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full cursor-default select-none"
                >
                  {reviewerOutput.token_usage.total_tokens.toLocaleString()} tokens
                </span>
              )}
              {reviewerOutput?.output_text && (
                <button
                  onClick={() => downloadPdf({
                    agentName:   'Reviewer — Quality Assurance Report',
                    projectName: project.name,
                    clientName:  project.clients?.name ?? '—',
                    date:        new Date(reviewerOutput.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
                    bodyText:    reviewerOutput.output_text,
                    filename:    `Forge-Agency-Reviewer-${project.name.replace(/\s+/g, '-')}.pdf`,
                  })}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  Download PDF
                </button>
              )}
              <ChevronLeftIcon
                className="w-4 h-4 text-zinc-500"
                style={{ transform: reviewOpen ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </div>
          </div>

          {reviewOpen && (
            <>
              {autoApprovedStages.has('reviewer') && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 mb-2">
                  <span className="font-medium">Auto approved</span>
                  <span className="text-amber-500/70">—</span>
                  <span>review this output at any time and request changes if needed</span>
                </div>
              )}
              {reviewIsStreaming ? (
                <ScrollBox storageKey="reviewer" isStreaming={true} contentLength={reviewLiveText.length} className="bg-zinc-950 border border-zinc-800 rounded-b-lg">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-zinc-800 bg-amber-500/5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </span>
                    <span className="text-xs text-amber-400 font-medium">Reviewer is working…</span>
                  </div>
                  <div className="p-5">
                    <pre className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed font-sans">
                      {reviewLiveText || <span className="text-zinc-600 animate-pulse">Generating review report…</span>}
                    </pre>
                  </div>
                </ScrollBox>
              ) : reviewerOutput ? (
                <ScrollBox storageKey="reviewer" isStreaming={false} contentLength={reviewerOutput.output_text?.length ?? 0} className="bg-zinc-950 border border-zinc-800 rounded-b-lg p-5">
                  {renderMarkdown(reviewerOutput.output_text)}
                </ScrollBox>
              ) : (
                <div className="bg-zinc-950 border border-zinc-800 rounded-b-lg px-5 py-10 flex items-center justify-center">
                  <p className="text-xs text-zinc-600">No review report yet</p>
                </div>
              )}
            </>
          )}

          {/* Action buttons */}
          {reviewerOutput?.status === 'pending' && !reviewMode && !reviewIsStreaming && (
            <div className="flex items-center gap-3 flex-wrap pt-3">
              <button
                onClick={approveReview}
                disabled={approvingReview || isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                {approvingReview ? 'Approving…' : 'Approve and mark as Delivered'}
              </button>
              <button
                onClick={() => setReviewMode('chooser')}
                disabled={isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
                Request Changes
              </button>
              <button
                onClick={goBackToDev}
                disabled={goingBackFromReview || isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
                {goingBackFromReview ? 'Going back…' : 'Go back to Dev'}
              </button>
            </div>
          )}

          {/* Chooser */}
          {reviewerOutput?.status === 'pending' && reviewMode === 'chooser' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-4 mt-3">
              <p className="text-xs font-medium text-zinc-400">How would you like to proceed?</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setReviewMode('fix')} className="flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left">
                  <span className="text-sm font-medium text-zinc-200">Fix Issue</span>
                  <span className="text-xs text-zinc-500">Targeted fix — keeps everything else the same</span>
                </button>
                <button onClick={() => setReviewMode('fresh')} className="flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors text-left">
                  <span className="text-sm font-medium text-zinc-200">Start Fresh</span>
                  <span className="text-xs text-zinc-500">Clean slate — Reviewer starts over from scratch</span>
                </button>
              </div>
              <button onClick={() => setReviewMode(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Cancel</button>
            </div>
          )}

          {/* Fix form */}
          {reviewerOutput?.status === 'pending' && reviewMode === 'fix' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 mt-3">
              <input
                type="text"
                value={reviewFeedbackText}
                onChange={e => setReviewFeedbackText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitReviewerFix()}
                placeholder="Describe the issue to fix in the review"
                className="w-full px-3 py-2.5 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitReviewerFix}
                  disabled={!reviewFeedbackText.trim() || submittingReview}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  {submittingReview ? 'Running…' : 'Apply Fix'}
                </button>
                <button onClick={() => setReviewMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
              </div>
            </div>
          )}

          {/* Fresh form */}
          {reviewerOutput?.status === 'pending' && reviewMode === 'fresh' && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 mt-3">
              <textarea
                value={reviewFeedbackText}
                onChange={e => setReviewFeedbackText(e.target.value)}
                placeholder="Optional: specific direction for the new review attempt"
                rows={4}
                className="w-full px-3 py-2.5 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitReviewerFresh}
                  disabled={submittingReview}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-red-700 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  {submittingReview ? 'Running…' : 'Start Fresh'}
                </button>
                <button onClick={() => setReviewMode('chooser')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Back</button>
              </div>
            </div>
          )}

          {reviewerOutput?.status === 'approved' && (
            <p className="text-xs text-zinc-600 pt-3">Review approved — project marked as Delivered.</p>
          )}
        </div>
      )}

      {/* ── Agent quick-launch ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent chats</span>
          <div className="flex-1 h-px bg-zinc-800" />
          {!latestBrief && <span className="text-xs text-zinc-600">Submit a brief to pre-load context</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.values(AGENT_CONFIG).map(agent => {
            const c = COLOR_CLASSES[agent.color]
            return (
              <Link
                key={agent.key}
                to={`/agents/${agent.key}`}
                state={latestBrief ? { briefText: latestBrief.brief_text } : undefined}
                className="flex flex-col rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-4 gap-3 transition-colors group"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${c.badge}`}>
                  <AgentIcon agentKey={agent.key} className={`w-4 h-4 ${c.icon}`} />
                </div>
                <div>
                  <p className={`text-xs font-semibold ${c.heading}`}>{agent.label}</p>
                  <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{agent.description}</p>
                </div>
                <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors mt-auto">
                  Open chat →
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Briefs ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Briefs</span>
          <span className="text-xs text-zinc-600">{briefs.length}</span>
          <div className="flex-1 h-px bg-zinc-800" />
          {briefs.length === 0 && (
            <Link
              to={`/briefs/new?clientId=${project.client_id}&projectId=${projectId}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              + New brief
            </Link>
          )}
        </div>
        {briefs.length === 0 ? (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-10 flex flex-col items-center gap-2">
            <p className="text-xs text-zinc-600">No briefs submitted for this project yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {briefs.map((brief, i) => (
              <BriefCard
                key={brief.id}
                brief={brief}
                index={briefs.length - i}
                orchestratorOutput={orchestratorOutput}
                isSendingOrchestrator={isSendingOrchestrator}
                onSendToOrchestrator={sendToOrchestrator}
              />
            ))}
            <div className="flex items-center gap-3 pt-1">
              {isNotStarted && (
                <button
                  onClick={openAutoRunModal}
                  disabled={isAgentRunning}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlayIcon className="w-3.5 h-3.5" />
                  Start Project
                </button>
              )}
              <button
                onClick={deleteBrief}
                disabled={isAgentRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-red-800/60 text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Brief
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Invoices ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Invoices</span>
          <span className="text-xs text-zinc-600">{invoices.length}</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>
        {invoices.length === 0 ? (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-10 flex flex-col items-center gap-2">
            <p className="text-xs text-zinc-600">No invoices linked to this project</p>
          </div>
        ) : (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Invoice</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {invoices.map(inv => {
                  const s = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft
                  const due = inv.due_date
                    ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'
                  return (
                    <tr key={inv.id} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-zinc-300">{inv.invoice_number ?? '—'}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-medium text-zinc-200">{fmt(inv.amount, inv.currency)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-zinc-500 hidden sm:table-cell">{due}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>

    {/* ── Page selection modal ── */}
    {pageSelectModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setPageSelectModal(null)} />
        <div className="relative z-10 w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-violet-500" />
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">Build next page</h2>
              <p className="text-sm text-zinc-400">
                <span className="text-zinc-200 font-medium">{pageSelectModal.approvedFilename}</span> has been approved. Which page would you like to build next?
              </p>
            </div>

            <div className="space-y-2">
              {pageSelectModal.remainingPages.map(pg => (
                <label
                  key={pg.filename}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                    pageSelectChoice === pg.filename
                      ? 'border-violet-500/60 bg-violet-500/10'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="nextPage"
                    value={pg.filename}
                    checked={pageSelectChoice === pg.filename}
                    onChange={() => setPageSelectChoice(pg.filename)}
                    className="accent-violet-500 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{pg.name}</p>
                    <p className="text-xs text-zinc-500">{pg.filename}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleBuildSelectedPage}
                disabled={!pageSelectChoice}
                className="w-full py-2.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Build Page
              </button>
              <button
                onClick={handleSkipToReview}
                className="w-full py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Skip remaining pages and go to Review
              </button>
              <button
                onClick={() => setPageSelectModal(null)}
                className="w-full py-2 rounded-md text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Delivery congratulations modal ── */}
    {/* ── Send Brief to Client modal ── */}
    {briefLinkModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setBriefLinkModal(null)} />
        <div className="relative z-10 w-full max-w-lg rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-violet-500" />
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Send Brief to Client</h2>
              <button onClick={() => setBriefLinkModal(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-zinc-400">A unique link has been generated for this project. Share it with your client so they can fill in their brief.</p>
            {/* URL row */}
            <div className="flex items-center gap-2 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5">
              <span className="flex-1 text-xs text-zinc-300 truncate font-mono">{briefLinkModal.url}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(briefLinkModal.url); setBriefLinkCopied(true); setTimeout(() => setBriefLinkCopied(false), 2000) }}
                className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                {briefLinkCopied ? 'Copied!' : 'Copy Link'}
              </button>
              <a
                href={briefLinkModal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
              >
                Open
              </a>
            </div>
            {/* Email draft */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-400">Email draft</p>
              <textarea
                readOnly
                value={briefLinkModal.emailDraft}
                rows={10}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-xs text-zinc-300 font-mono resize-none focus:outline-none"
              />
              <button
                onClick={() => { navigator.clipboard.writeText(briefLinkModal.emailDraft); showToast('Email draft copied') }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Copy email draft
              </button>
            </div>
            <p className="text-xs text-zinc-600">This link expires in 7 days and can only be submitted once.</p>
          </div>
        </div>
      </div>
    )}

    {deliveryModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setDeliveryModalOpen(false)} />
        <div className="relative z-10 w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
          {/* Emerald top bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />
          <div className="px-8 py-8 space-y-5 text-center">
            <div className="flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircleIcon className="w-7 h-7 text-emerald-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-white">Project complete!</h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                <strong className="text-zinc-200">{project.name}</strong> has been reviewed and approved. It is now marked as Delivered and ready to hand off to the client.
              </p>
            </div>
            <div className="rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-left space-y-1.5">
              <p className="text-xs font-medium text-zinc-400">What's next</p>
              <ul className="space-y-1 text-xs text-zinc-500">
                <li>· Send the final files to the client</li>
                <li>· Raise an invoice from the Billing tab</li>
                <li>· Archive any working files from the Files section</li>
              </ul>
            </div>
            <button
              onClick={() => setDeliveryModalOpen(false)}
              className="w-full py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    )}
      {/* ── Auto-run complete modal ── */}
      {autoRunCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAutoRunCompleteModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
            {/* Amber-to-emerald top bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-emerald-400 to-emerald-500" />
            <div className="px-8 py-8 space-y-5 text-center">
              <div className="flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircleIcon className="w-7 h-7 text-emerald-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-white">Pipeline complete</h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  <strong className="text-zinc-200">{project.name}</strong> has been fully processed and is ready for review.
                </p>
              </div>
              <div className="rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-left space-y-2">
                <p className="text-xs font-medium text-zinc-400">Auto-approved stages</p>
                <div className="space-y-1">
                  {AUTORUN_STAGES.filter(s => autoApprovedStages.has(s.key)).map(s => (
                    <div key={s.key} className="flex items-center gap-2 text-xs text-zinc-300">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                        <CheckIcon className="w-2.5 h-2.5 text-emerald-400" />
                      </span>
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setAutoRunCompleteModal(false)}
                className="w-full py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Auto-run settings modal ── */}
      {autoRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={() => setAutoRunModal(false)}
          />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Auto-run settings</h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-5">
              Choose which stages you want to approve automatically and move to the next agent without manual review.
            </p>

            {/* Select All / Deselect All */}
            <div className="flex justify-end mb-3">
              <button
                onClick={() => {
                  const allSelected = autoRunSelected.size === AUTORUN_STAGES.length
                  setAutoRunSelected(allSelected ? new Set() : new Set(AUTORUN_STAGES.map(s => s.key)))
                }}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                {autoRunSelected.size === AUTORUN_STAGES.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Stage checkboxes */}
            <div className="space-y-1.5 mb-6">
              {AUTORUN_STAGES.map(stage => (
                <label
                  key={stage.key}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={autoRunSelected.has(stage.key)}
                    onChange={() => {
                      setAutoRunSelected(prev => {
                        const next = new Set(prev)
                        if (next.has(stage.key)) next.delete(stage.key)
                        else next.add(stage.key)
                        return next
                      })
                    }}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 accent-violet-500 flex-shrink-0"
                  />
                  <span className="text-sm text-zinc-200 flex-1 min-w-0">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-zinc-500"> — {stage.description}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setAutoRunModal(false)}
                className="px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAutoRunModal}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <PlayIcon className="w-3.5 h-3.5" />
                Start Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wireframe page selection modal ── */}
      {wireframePageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={() => setWireframePageModal(null)}
          />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Select pages to wireframe</h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-5">
              Choose which pages you would like the Designer to generate a wireframe for.
            </p>

            {/* Select All / Deselect All */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500">
                {wireframePageModal.selected.size} of {wireframePageModal.pages.length} selected
              </span>
              <button
                onClick={() => {
                  const allSelected = wireframePageModal.selected.size === wireframePageModal.pages.length
                  setWireframePageModal(prev => ({
                    ...prev,
                    selected: allSelected
                      ? new Set()
                      : new Set(prev.pages.map(p => p.filename)),
                  }))
                }}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                {wireframePageModal.selected.size === wireframePageModal.pages.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Page checkboxes */}
            <div className="space-y-1.5 mb-6 max-h-60 overflow-y-auto">
              {wireframePageModal.pages.map(page => (
                <label
                  key={page.filename}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={wireframePageModal.selected.has(page.filename)}
                    onChange={() => {
                      setWireframePageModal(prev => {
                        const next = new Set(prev.selected)
                        if (next.has(page.filename)) next.delete(page.filename)
                        else next.add(page.filename)
                        return { ...prev, selected: next }
                      })
                    }}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-violet-500 accent-violet-500 focus:ring-violet-500 focus:ring-offset-zinc-900 flex-shrink-0"
                  />
                  <span className="text-sm font-medium text-zinc-200 flex-1 min-w-0 truncate">{page.name}</span>
                  <span className="text-xs text-zinc-500 flex-shrink-0">{page.filename}</span>
                </label>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setWireframePageModal(null)}
                className="px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmWireframeModal}
                disabled={wireframePageModal.selected.size === 0 || approving}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PenIcon className="w-3.5 h-3.5" />
                Start Designer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Brief card ────────────────────────────────────────────────────────────────
function BriefCard({ brief, index, orchestratorOutput, isSendingOrchestrator, onSendToOrchestrator }) {
  const [open, setOpen] = useState(true)
  // Use brief.orchestrator_response (quick panel) OR agent_outputs Orchestrator record (structured brief)
  const orchText = brief.orchestrator_response || orchestratorOutput?.output_text || null
  const sections = parseResponse(orchText)
  const submittedAt = new Date(brief.submitted_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400">Brief #{index}</span>
            <span className="text-zinc-700">·</span>
            <time className="text-xs text-zinc-500">{submittedAt}</time>
          </div>
          {orchText && (
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {open ? 'Collapse' : 'Expand'}
              <ChevronIcon className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-zinc-300 leading-relaxed">{brief.brief_text}</p>
      </div>
      {orchText && open && (
        <div className="p-5 space-y-4">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent breakdown</p>
          {sections ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sections.map(({ name, content }) => {
                const agentKey = name.toLowerCase()
                const agent = AGENT_CONFIG[agentKey]
                const c = agent ? COLOR_CLASSES[agent.color] : null
                return (
                  <div key={name} className="rounded-md bg-zinc-950 border border-zinc-800 p-3.5 space-y-2">
                    <div className="flex items-center gap-2">
                      {c && (
                        <div className={`w-5 h-5 rounded flex items-center justify-center border ${c.badge}`}>
                          <AgentIcon agentKey={agentKey} className={`w-3 h-3 ${c.icon}`} />
                        </div>
                      )}
                      <span className={`text-xs font-semibold ${c ? c.heading : 'text-zinc-400'}`}>{name}</span>
                    </div>
                    {content ? (
                      <div className="space-y-1">
                        {content.split('\n').filter(l => l.trim()).map((line, i) => {
                          const raw       = line.trim()
                          const isBullet  = /^[-*•]\s/.test(raw)
                          const isNum     = /^\d+[.)]\s/.test(raw)
                          const isHeading = /^#{1,3}\s/.test(raw)
                          const stripped  = raw
                            .replace(/^[-*•]\s+/, '')
                            .replace(/^\d+[.)]\s+/, '')
                            .replace(/^#{1,3}\s+/, '')
                          const inlined = stripped.split(/(\*\*[^*]+\*\*)/).map((seg, j) =>
                            seg.startsWith('**') && seg.endsWith('**')
                              ? <strong key={j} className="text-zinc-200 font-medium">{seg.slice(2, -2)}</strong>
                              : seg
                          )
                          if (isHeading) return (
                            <p key={i} className="text-xs font-semibold text-zinc-300 pt-1">{inlined}</p>
                          )
                          if (isBullet || isNum) return (
                            <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-400 leading-relaxed">
                              <span className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${c ? c.dot : 'bg-zinc-600'}`} />
                              <span>{inlined}</span>
                            </div>
                          )
                          return <p key={i} className="text-xs text-zinc-500">{inlined}</p>
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600 italic">No tasks parsed</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            // Fallback — sections not parsed; render with proper markdown
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 max-h-[400px] overflow-y-auto">
              {renderMarkdown(orchText)}
            </div>
          )}
        </div>
      )}
      {orchText && !open && (
        <div className="px-5 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">Orchestrator response hidden — click expand to view</p>
        </div>
      )}
      {!orchText && (
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between gap-3">
          {isSendingOrchestrator ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <p className="text-xs text-violet-400">Orchestrator is analysing your brief…</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-600 italic">No Orchestrator breakdown yet</p>
              {onSendToOrchestrator && (
                <button
                  onClick={onSendToOrchestrator}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600/20 text-violet-400 border border-violet-600/30 hover:bg-violet-600/30 transition-colors"
                >
                  Send to Orchestrator
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="max-w-4xl space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-zinc-800" />
        <div className="h-6 w-64 rounded bg-zinc-800" />
        <div className="h-3 w-32 rounded bg-zinc-800" />
      </div>
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5">
        <div className="h-3 w-12 rounded bg-zinc-800 mb-5" />
        <div className="flex items-center gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-zinc-800" />
                <div className="h-2.5 w-12 rounded bg-zinc-800" />
              </div>
              {i < 5 && <div className="flex-1 h-0.5 mx-2 mb-5 bg-zinc-800 rounded" />}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800" />
            <div className="space-y-1.5">
              <div className="h-3 w-20 rounded bg-zinc-800" />
              <div className="h-2.5 w-full rounded bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function AgentIcon({ agentKey, className }) {
  if (agentKey === 'researcher') return <SearchIcon className={className} />
  if (agentKey === 'designer')   return <PenIcon className={className} />
  if (agentKey === 'developer')  return <CodeIcon className={className} />
  if (agentKey === 'reviewer')   return <CheckIcon className={className} />
  return null
}

function ChevronLeftIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
}
function ChevronIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
}
function ArrowRightIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" /></svg>
}
function CheckIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
}
function CheckCircleIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
}
function ClientIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
}
function SearchIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>
}
function PenIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
}
function CodeIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline strokeLinecap="round" strokeLinejoin="round" points="16 18 22 12 16 6" /><polyline strokeLinecap="round" strokeLinejoin="round" points="8 6 2 12 8 18" /></svg>
}
function PlayIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
}
function RefreshIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" d="M20 9A8 8 0 0 0 5.07 7.5M4 15a8 8 0 0 0 14.93 1.5" /></svg>
}
function ExternalLinkIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline strokeLinecap="round" strokeLinejoin="round" points="15 3 21 3 21 9" /><line strokeLinecap="round" strokeLinejoin="round" x1="10" y1="14" x2="21" y2="3" /></svg>
}
function TrashIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" /></svg>
}
function SparkleIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
}
function SpinnerIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
}
function EditIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
}
function PlusIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
}
function ScrollDownIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
}
function StopIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
}
function WireframeIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><rect x="3" y="3" width="18" height="18" rx="2" /><path strokeLinecap="round" d="M3 9h18M9 21V9" /></svg>
}
function ScrollOffIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7M5 5l14 14" /></svg>
}
function PaletteIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.477 2 2 6.477 2 12c0 5.524 4.477 10 10 10a2 2 0 0 0 2-2v-.5a1.5 1.5 0 0 1 1.5-1.5H17a3 3 0 0 0 3-3c0-4.97-3.582-9-8-9z" /><circle cx="8.5" cy="13.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="7.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="7.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="16.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" /></svg>
}
