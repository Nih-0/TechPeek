const techListContainer = document.getElementById('tech-list-container');
const refreshButton = document.getElementById('refresh');
const loader = document.getElementById('loader');
const statusText = document.getElementById('status-text');

async function detect() {
  refreshButton.disabled = true;
  techListContainer.innerHTML = '';
  loader.style.display = 'block';
  statusText.textContent = 'Analyzing page...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showError('No active tab.');
    return;
  }

  if (!tab.url || !/^https?:\/\//.test(tab.url)) {
    showError('Cannot inspect this page.', tab.url || 'Unsupported URL scheme');
    return;
  }

  if (tab.url.includes('chromewebstore.google.com') || tab.url.includes('chrome.google.com/webstore')) {
    showError('Restricted Page', 'Chrome security policies prevent inspecting the Chrome Web Store.');
    return;
  }

  try {
    const execResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        try {
          const detected = [];
          
          const addTech = (name, category, version = null) => {
              if (!detected.some(t => t.name === name && t.category === category)) {
                  detected.push({ name, category, version });
              }
          };

          const hasSelector = (selector) => {
            try { return !!document.querySelector(selector); } 
            catch(e) { return false; }
          };
          const checkScriptSrc = (pattern) => {
              return Array.from(document.querySelectorAll('script[src]')).some(s => s.src.toLowerCase().includes(pattern.toLowerCase()));
          };
          const checkLinkHref = (pattern) => {
              return Array.from(document.querySelectorAll('link[href]')).some(l => l.href.toLowerCase().includes(pattern.toLowerCase()));
          };

          // --- Advanced Deep Scanning ---
          const resources = window.performance ? window.performance.getEntriesByType("resource").map(r => r.name.toLowerCase()) : [];
          const checkResource = (pattern) => {
              const lower = pattern.toLowerCase();
              return resources.some(url => url.includes(lower));
          };
          const pageHTML = document.documentElement.innerHTML;
          const containsString = (str) => pageHTML.includes(str);

          // --- 1. JavaScript Frameworks, Web Frameworks & Servers ---
          const isNextGlobal = window.next && typeof window.next === 'object' && ('version' in window.next || 'router' in window.next || 'emitter' in window.next);
          if (window.__NEXT_DATA__ || hasSelector('script[id="__NEXT_DATA__"]') || hasSelector('div[id="__next"]') || checkScriptSrc('_next/static') || isNextGlobal) {
              let version = window.next?.version || null;
              addTech("Next.js", "JavaScript frameworks", version);
              addTech("Next.js", "Web frameworks", version);
              addTech("Next.js", "Static site generators", version);
              addTech("Next.js", "Web servers", version);
          }

          const hasReactRenderers = window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && 
                window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers && 
                (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size === 'number' 
                  ? window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size > 0 
                  : Object.keys(window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers).length > 0);
                  
          if (hasReactRenderers || window.React || hasSelector('[data-reactroot]') || (function() {
              const el = document.querySelector('#root, #app, body');
              return el && Object.keys(el).some(k => k.startsWith('__react') || k.startsWith('_react'));
          })()) {
              let version = window.React?.version || null;
              addTech("React", "JavaScript frameworks", version);
          }

          if (window.Vue || hasSelector('[data-v-]') || window.__VUE_DEVTOOLS_GLOBAL_HOOK__ || (function() {
              const el = document.querySelector('*');
              return el && (el.__vue__ || el.__vue_app__);
          })()) {
              let version = window.Vue?.version || null;
              addTech("Vue.js", "JavaScript frameworks", version);
          }

          if (window.__NUXT__ || hasSelector('#__nuxt')) {
              addTech("Nuxt.js", "JavaScript frameworks");
              addTech("Nuxt.js", "Web frameworks");
          }

          if (window.ng || hasSelector('[ng-version]') || hasSelector('*[class*="_nghost"]')) {
              const el = document.querySelector('[ng-version]');
              const version = el ? el.getAttribute('ng-version') : null;
              addTech("Angular", "JavaScript frameworks", version);
          }

          if (hasSelector('script[src*="_app/immutable"]') || hasSelector('#svelte') || Array.from(document.querySelectorAll('*')).some(el => Array.from(el.classList).some(c => c.startsWith('svelte-')))) {
              addTech("Svelte", "JavaScript frameworks");
          }

          if (window.___loader || hasSelector('#___gatsby')) {
              addTech("Gatsby", "Static site generators");
          }

          if (window.jQuery || window.$) {
              const jq = window.jQuery || window.$;
              if (jq && jq.fn && jq.fn.jquery) {
                  addTech("jQuery", "JavaScript libraries", jq.fn.jquery);
              }
          }

          if (window.__$HYDRATION || hasSelector('[data-solid]')) addTech("Solid.js", "JavaScript frameworks");
          if (window.$qrls || hasSelector('[q\\:container]')) addTech("Qwik", "JavaScript frameworks");

          // --- 2. JavaScript Libraries & Miscellaneous ---
          const hasFramerMotion = !!(
              window.__framer_import_record || 
              window.__framer_import || window.__framer_metadata ||
              hasSelector('meta[name="generator"][content*="Framer"]') ||
              hasSelector('[data-projection-id]') || hasSelector('[data-framer-name]') ||
              Array.from(document.querySelectorAll('*')).some(el => Array.from(el.attributes).some(attr => attr.name.includes('framer'))) ||
              containsString('framer-motion')
          );
          if (hasFramerMotion) {
              addTech("Framer Motion", "JavaScript libraries");
          }

          if (window.Webflow || hasSelector('html[data-wf-page]') || hasSelector('html[data-wf-site]')) {
              addTech("Webflow", "Web frameworks");
          }

          const hasLottie = !!(
              window.lottie || window.lottieLight || window.Bodymovin || 
              hasSelector('lottie-player') || hasSelector('dotlottie-player') || 
              checkScriptSrc('lottie') || checkScriptSrc('bodymovin') || containsString('lottie')
          );
          if (hasLottie) addTech("LottieFiles", "Miscellaneous");

          if (window._ && window._.VERSION) {
              const name = typeof window._.forEach === 'function' && !window._.compile ? "Lodash" : "Underscore.js";
              addTech(name, "JavaScript libraries", window._.VERSION);
          }
          if (window.axios) addTech("Axios", "JavaScript libraries");
          
          // Core-js
          if (window['__core-js_shared__']) {
              const versions = window['__core-js_shared__'].versions || [];
              const version = versions.length > 0 ? versions[0].version : null;
              addTech("core-js", "JavaScript libraries", version);
          }

          // --- 3. UI Frameworks & Styling ---
          const hasTailwind = Array.from(document.styleSheets).some(sheet => {
              try { return Array.from(sheet.cssRules).some(rule => rule.cssText.includes('--tw-') || rule.cssText.includes('tailwind')); } 
              catch (e) { return false; }
          }) || checkLinkHref('tailwind') || (function() {
              const classes = document.body ? document.body.className || '' : '';
              return classes.includes('bg-') && classes.includes('text-') && (classes.includes('flex') || classes.includes('grid')) && (classes.includes('w-') || classes.includes('h-') || classes.includes('p-') || classes.includes('m-'));
          })();
          if (hasTailwind) addTech("Tailwind CSS", "UI frameworks");

          if (window.bootstrap || checkLinkHref('bootstrap') || hasSelector('.btn-primary, .col-md-, .navbar-expand-')) {
              addTech("Bootstrap", "UI frameworks");
          }

          const hasRadix = !!(
              hasSelector('[data-radix-collection]') || hasSelector('[data-radix-popper-content-wrapper]') || 
              Array.from(document.querySelectorAll('*')).some(el => Array.from(el.attributes).some(attr => attr.name.includes('radix'))) ||
              containsString('@radix-ui')
          );
          if (hasRadix) addTech("Radix UI", "UI frameworks");

          // --- 4. Analytics, CDP & Advertising ---
          if (window.ga || window.gtag || window.dataLayer || checkScriptSrc('google-analytics') || checkScriptSrc('gtag') || checkResource('google-analytics.com')) {
              addTech("Google Analytics", "Analytics");
          }
          if (window.posthog || checkScriptSrc('posthog') || checkResource('posthog.com')) addTech("PostHog", "Analytics");
          if (window.analytics || checkScriptSrc('analytics.js') || checkScriptSrc('segment.com') || checkScriptSrc('segment.io') || checkResource('api.segment.io')) {
              addTech("Segment", "Customer data platform");
          }
          if (window._bizo_data_partner_id || window._lr_partner_id || checkScriptSrc('snap.licdn.com') || checkResource('px.ads.linkedin.com') || checkResource('licdn.com/px')) addTech("LinkedIn Insight Tag", "Advertising");
          if (window.hj || window._hjSettings) addTech("Hotjar", "Analytics");
          if (window.va || checkScriptSrc('_vercel/insights') || checkScriptSrc('_vercel/speed-insights')) addTech("Vercel Analytics", "Analytics");
          if (window.sensorsDataAnalytic201505 || window.sensors || checkScriptSrc('sensorsdata')) addTech("Sensors Data", "Analytics");
          if (window.mixpanel) addTech("Mixpanel", "Analytics");
          if (window.amplitude) addTech("Amplitude", "Analytics");
          if (window.heap) addTech("Heap", "Analytics");
          if (checkScriptSrc('plausible.io')) addTech("Plausible", "Analytics");
          if (window.fathom || checkScriptSrc('usefathom.com')) addTech("Fathom", "Analytics");
          if (window.clarity || checkScriptSrc('clarity.ms')) addTech("Microsoft Clarity", "Analytics");
          
          if (window.fbq || checkScriptSrc('fbevents.js')) addTech("Facebook Pixel", "Advertising");
          if (window.ttq || checkScriptSrc('tiktok.com/i18n/pixel')) addTech("TikTok Pixel", "Advertising");

          // --- A/B Testing & Personalization ---
          if (window.optimizely) addTech("Optimizely", "A/B Testing");
          if (window._vwo_code || window.VWO) addTech("VWO", "A/B Testing");
          
          // --- Live Chat & Support ---
          if (window.Intercom || checkScriptSrc('widget.intercom.io')) addTech("Intercom", "Live Chat");
          if (window.zE || checkScriptSrc('zdassets.com')) addTech("Zendesk", "Live Chat");
          if (window.$crisp || checkScriptSrc('client.crisp.chat')) addTech("Crisp", "Live Chat");
          if (window.Tawk_API || checkScriptSrc('embed.tawk.to')) addTech("Tawk.to", "Live Chat");
          if (window.drift || checkScriptSrc('js.driftt.com')) addTech("Drift", "Live Chat");

          // --- CRM & Marketing ---
          if (window._hsq || checkScriptSrc('js.hs-scripts.com') || checkScriptSrc('js.hs-analytics.net')) addTech("HubSpot", "CRM");
          if (checkScriptSrc('pardot.com')) addTech("Pardot", "Marketing Automation");

          // Monitoring & Error Tracking
          if (window.DD_RUM) addTech("Datadog", "Analytics");
          if (window.newrelic) addTech("New Relic", "Analytics");
          if (window._LR || window.LogRocket) addTech("LogRocket", "Analytics");
          if (window.FS) addTech("FullStory", "Analytics");

          // --- 5. Tag Managers ---
          if (window.google_tag_manager || checkScriptSrc('gtm.js')) addTech("Google Tag Manager", "Tag managers");

          // --- 6. Cookie Compliance ---
          if (window.Cookiebot || checkScriptSrc('cookiebot')) addTech("Cookiebot", "Cookie compliance");
          if (window.CookieControl || checkScriptSrc('cookie-control')) addTech("Cookie Control", "Cookie compliance");

          // --- 7. CMS & E-commerce ---
          if (hasSelector('meta[name="generator" i][content*="WordPress"]') || checkLinkHref('/wp-content/') || checkLinkHref('/wp-includes/')) {
              addTech("WordPress", "CMS");
          }
          if (window.Shopify || checkLinkHref('/shopify/') || checkScriptSrc('shopify')) addTech("Shopify", "E-commerce");

          // --- 8. Issue Trackers & Performance ---
          if (window.Sentry || window.__SENTRY__ || window.Raven || checkScriptSrc('sentry')) {
              addTech("Sentry", "Issue trackers");
          }
          
          if (hasSelector('[fetchpriority]')) {
              addTech("Priority Hints", "Performance");
          }

          // --- Captchas & Security ---
          if (window.grecaptcha || checkScriptSrc('recaptcha/api.js')) addTech("reCAPTCHA", "Security");
          if (window.hcaptcha || checkScriptSrc('hcaptcha.com/1/api.js')) addTech("hCaptcha", "Security");
          if (window.turnstile || checkScriptSrc('challenges.cloudflare.com/turnstile')) addTech("Cloudflare Turnstile", "Security");

          // --- 9. Recruitment & Staffing ---
          if (window.Moka || checkScriptSrc('moka')) {
              addTech("Moka HR", "Recruitment & staffing");
          }
          
          // --- Authentication ---
          if (window.Auth0 || checkScriptSrc('cdn.auth0.com')) addTech("Auth0", "Authentication");
          if (window.Clerk || checkScriptSrc('clerk.dev') || checkScriptSrc('clerk.com')) addTech("Clerk", "Authentication");
          
          // --- 10. Payment Processors ---
          if (window.Stripe || checkScriptSrc('js.stripe.com')) addTech("Stripe", "Payment processors");
          if (window.paypal || checkScriptSrc('paypal.com/sdk')) addTech("PayPal", "Payment processors");
          if (window.braintree || checkScriptSrc('braintree')) addTech("Braintree", "Payment processors");
          if (window.Razorpay || checkScriptSrc('checkout.razorpay.com')) addTech("Razorpay", "Payment processors");
          if (window.Paddle || checkScriptSrc('paddle.com')) addTech("Paddle", "Payment processors");
          if (window.Square || checkScriptSrc('squareup.com')) addTech("Square", "Payment processors");

          // --- 11. Animation, Graphics & Video ---
          if (window.gsap || window.TweenMax || window.TweenLite || checkScriptSrc('gsap')) addTech("GSAP", "Animation");
          if (window.THREE) addTech("Three.js", "Animation");
          if (window.anime || checkScriptSrc('anime.js')) addTech("Anime.js", "Animation");
          if (window.AOS || checkScriptSrc('aos.js')) addTech("AOS", "Animation");
          if (window.ScrollReveal || checkScriptSrc('scrollreveal')) addTech("ScrollReveal", "Animation");
          
          if (window.YT || checkScriptSrc('youtube.com/iframe_api') || hasSelector('iframe[src*="youtube.com/embed"]') || hasSelector('iframe[src*="youtube-nocookie.com/embed"]')) addTech("YouTube", "Video Players");
          if (window.Vimeo || checkScriptSrc('player.vimeo.com') || hasSelector('iframe[src*="player.vimeo.com"]')) addTech("Vimeo", "Video Players");
          if (window.videojs || checkScriptSrc('video.js')) addTech("Video.js", "Video Players");

          // --- Maps ---
          if (window.google?.maps || checkScriptSrc('maps.googleapis.com')) addTech("Google Maps", "Maps");
          if (window.mapboxgl || checkScriptSrc('mapbox-gl')) addTech("Mapbox", "Maps");
          if (window.L || checkScriptSrc('leaflet')) addTech("Leaflet", "Maps");

          // --- 10. Fonts & Icons ---
          if (hasSelector('svg.lucide, svg[class*="lucide-"]') || checkScriptSrc('lucide')) addTech("Lucide", "Font scripts");
          if (checkLinkHref('fonts.googleapis.com')) addTech("Google Font API", "Font scripts");

          // --- Miscellaneous Meta Tags & Features ---
          if (hasSelector('meta[property^="og:"]')) addTech("Open Graph", "Miscellaneous");
          if (hasSelector('meta[name^="twitter:"]')) addTech("Twitter Cards", "Miscellaneous");
          if (hasSelector('link[rel="manifest"]') || window.matchMedia('(display-mode: standalone)').matches) addTech("PWA", "Miscellaneous");

          // --- Extra JS Libraries & Frameworks ---
          if (window.Polymer) addTech("Polymer", "JavaScript frameworks", window.Polymer.version || null);
          if (window.Hammer) addTech("Hammer.js", "JavaScript libraries", window.Hammer.VERSION || null);
          if (window.XRegExp) addTech("XRegExp", "JavaScript libraries", window.XRegExp.version || null);

          // --- 11. Databases & Development ---
          const hasSupabase = window.supabase || checkScriptSrc('supabase') || checkScriptSrc('@supabase');
          if (hasSupabase) {
              addTech("Supabase", "Development");
              addTech("PostgreSQL", "Databases");
          }
          
          if (window.firebase || checkScriptSrc('firebase')) {
              addTech("Firebase", "Development");
              addTech("NoSQL", "Databases");
          }
          
          if (window.Appwrite || checkScriptSrc('appwrite')) {
              addTech("Appwrite", "Development");
              addTech("MariaDB / MySQL", "Databases");
          }

          if (window.__TURBOPACK__ || checkScriptSrc('turbopack') || (window.next && window.next.version && checkScriptSrc('ts'))) {
              if (checkScriptSrc('turbopack') || window.__TURBOPACK__) {
                  addTech("Turbopack", "Development");
              }
          }
          
          // Infer SQL databases from known CMS/Frameworks
          if (detected.some(t => t.name === "WordPress" || t.name === "Magento")) {
              addTech("MySQL", "Databases");
          }
          
          // shadcn/ui (Often combined with Tailwind and Radix UI)
          if (hasTailwind && hasRadix) {
              const hasShadcnVars = Array.from(document.styleSheets).some(sheet => {
                  try {
                      return Array.from(sheet.cssRules).some(rule => 
                          rule.cssText.includes('--background:') && 
                          rule.cssText.includes('--foreground:') && 
                          rule.cssText.includes('--primary:')
                      );
                  } catch(e) { return false; }
              }) || hasSelector('.border-border, .bg-background, .text-foreground');
              
              if (hasShadcnVars || hasSelector('[class*="bg-background"][class*="text-foreground"]')) {
                  addTech("shadcn/ui", "UI frameworks");
              }
          }

          // --- 12. HTTP Headers Analysis via fetch ---
          return fetch(document.location.href, { method: 'HEAD' })
            .then(response => {
                const serverHeader = (response.headers.get('server') || '').toLowerCase();
                const viaHeader = (response.headers.get('via') || '').toLowerCase();
                const xPoweredBy = (response.headers.get('x-powered-by') || '').toLowerCase();
                const altSvc = (response.headers.get('alt-svc') || '').toLowerCase();
                
                if (altSvc.includes('h3=')) addTech("HTTP/3", "Miscellaneous");
                
                if (serverHeader.includes('tengine')) addTech("Tengine", "Web servers");
                else if (serverHeader.includes('nginx')) addTech("Nginx", "Web servers");
                else if (serverHeader.includes('apache')) addTech("Apache Server", "Web servers");
                
                if (serverHeader.includes('vercel') || response.headers.get('x-vercel-id')) {
                    addTech("Vercel", "PaaS");
                }
                if (serverHeader.includes('cloudflare')) addTech("Cloudflare", "PaaS");
                if (serverHeader.includes('amazon') || serverHeader.includes('s3') || response.headers.get('x-amz-request-id')) addTech("Amazon Web Services", "PaaS");
                if (response.headers.get('x-nf-request-id') || serverHeader.includes('netlify')) addTech("Netlify", "PaaS");
                if (viaHeader.includes('heroku') || (response.headers.get('x-served-by') || '').includes('heroku')) addTech("Heroku", "PaaS");

                if (xPoweredBy.includes('next.js') || serverHeader === 'next.js') {
                   // Ensure Next.js is recorded from headers if missing
                   let version = window.next?.version || null;
                   addTech("Next.js", "Web servers", version);
                }

                if (response.headers.get('x-supabase-api-version')) {
                    addTech("Supabase", "Development");
                    addTech("PostgreSQL", "Databases");
                }

                return { success: true, tech: detected };
            })
            .catch(err => {
                // If fetch fails (e.g., CORS, though HEAD on same origin shouldn't), return what we have
                return { success: true, tech: detected };
            });
        } catch (err) {
          return Promise.resolve({ success: false, error: err.message });
        }
      }
    });

    const execution = execResults && execResults[0] ? execResults[0].result : null;
    
    if (execution && execution.success) {
      renderTech(execution.tech);
    } else {
      showError('Detection Error', execution?.error || 'No result from page script.');
    }
  } catch (error) {
    showError('Detection failed.', error.message || String(error));
  } finally {
    refreshButton.disabled = false;
    loader.style.display = 'none';
  }
}

const iconMap = {
  "Next.js": "nextdotjs", "React": "react", "Vue.js": "vuedotjs", "Nuxt.js": "nuxtdotjs", 
  "Angular": "angular", "Svelte": "svelte", "Gatsby": "gatsby", "jQuery": "jquery", 
  "Solid.js": "solid", "Qwik": "qwik", "Tailwind CSS": "tailwindcss", "Bootstrap": "bootstrap", 
  "Radix UI": "radixui", "Google Analytics": "googleanalytics", "PostHog": "posthog", 
  "Segment": "segment", "Hotjar": "hotjar", "Vercel Analytics": "vercel", "Mixpanel": "mixpanel", 
  "Amplitude": "amplitude", "Heap": "heap", "Plausible": "plausibleanalytics", "Fathom": "fathom", 
  "Google Tag Manager": "googletagmanager", "WordPress": "wordpress", "Shopify": "shopify", 
  "Sentry": "sentry", "Auth0": "auth0", "Clerk": "clerk", "Stripe": "stripe", "PayPal": "paypal", 
  "Braintree": "braintree", "Razorpay": "razorpay", "Square": "square", "GSAP": "greensock", 
  "Three.js": "threedotjs", "YouTube": "youtube", "Vimeo": "vimeo", "Google Maps": "googlemaps", 
  "Mapbox": "mapbox", "Leaflet": "leaflet", "Supabase": "supabase", "PostgreSQL": "postgresql", 
  "Firebase": "firebase", "Appwrite": "appwrite", "MySQL": "mysql", "Nginx": "nginx", 
  "Apache Server": "apache", "Vercel": "vercel", "Cloudflare": "cloudflare", "Amazon Web Services": "amazonaws", 
  "Netlify": "netlify", "Heroku": "heroku", "Facebook Pixel": "meta", "TikTok Pixel": "tiktok", 
  "Optimizely": "optimizely", "Intercom": "intercom", "Zendesk": "zendesk", "HubSpot": "hubspot", 
  "Datadog": "datadog", "New Relic": "newrelic", "LogRocket": "logrocket", "Lodash": "lodash", 
  "Axios": "axios", "LottieFiles": "lottiefiles", "Framer Motion": "framer", "Framer": "framer", 
  "Webflow": "webflow", "shadcn/ui": "shadcnui", "Lucide": "lucide", "Turbopack": "turbopack",
  "Open Graph": "opengraph", "Twitter Cards": "twitter", "Polymer": "polymerproject",
  "Google Font API": "googlefonts", "PWA": "pwa"
};

function renderTech(techArray) {
  techListContainer.innerHTML = '';
  
  if (!techArray || techArray.length === 0) {
    techListContainer.innerHTML = '<div class="empty-state">No technologies detected.</div>';
    return;
  }

  // Group by category
  const grouped = {};
  techArray.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  const categoryOrder = [
    "JavaScript frameworks",
    "Web frameworks",
    "Static site generators",
    "UI frameworks",
    "JavaScript libraries",
    "Animation",
    "Video Players",
    "Maps",
    "Analytics",
    "Advertising",
    "Customer data platform",
    "Tag managers",
    "A/B Testing",
    "CRM",
    "Marketing Automation",
    "Live Chat",
    "Recruitment & staffing",
    "Payment processors",
    "Authentication",
    "Security",
    "Web servers",
    "PaaS",
    "Cookie compliance",
    "Performance",
    "CMS",
    "E-commerce",
    "Databases",
    "Development",
    "Issue trackers",
    "Font scripts",
    "Miscellaneous"
  ];

  categoryOrder.forEach(cat => {
    if (grouped[cat]) {
      const groupDiv = document.createElement("div");
      groupDiv.className = "category-group";

      const header = document.createElement("div");
      header.className = "category-header";
      header.textContent = cat;
      groupDiv.appendChild(header);

      const itemsGrid = document.createElement("div");
      itemsGrid.className = "tech-items-grid";

      grouped[cat].forEach(tech => {
        const techCard = document.createElement("div");
        techCard.className = "tech-card";

        // Icon Wrapper
        const iconWrapper = document.createElement("div");
        iconWrapper.className = "tech-icon-wrapper";

        // Add Icon
        const slug = iconMap[tech.name];
        if (slug) {
            const iconImg = document.createElement("img");
            iconImg.className = "tech-icon";
            // Use simpleicons CDN for beautiful SVGs. Omit color to get default brand color!
            iconImg.src = `https://cdn.simpleicons.org/${slug}`;
            iconImg.alt = tech.name;
            iconImg.onerror = () => { iconImg.style.display = 'none'; }; // Hide if fails to load
            iconWrapper.appendChild(iconImg);
        } else {
            // Fallback icon (first letter of the tech name)
            const fallback = document.createElement("div");
            fallback.className = "tech-icon-fallback";
            fallback.textContent = tech.name.charAt(0).toUpperCase();
            iconWrapper.appendChild(fallback);
        }
        techCard.appendChild(iconWrapper);

        const nameSpan = document.createElement("span");
        nameSpan.className = "tech-name";
        nameSpan.textContent = tech.name;
        techCard.appendChild(nameSpan);

        if (tech.version) {
          const verSpan = document.createElement("span");
          verSpan.className = "tech-version";
          verSpan.textContent = tech.version;
          techCard.appendChild(verSpan);
        }

        itemsGrid.appendChild(techCard);
      });

      groupDiv.appendChild(itemsGrid);
      techListContainer.appendChild(groupDiv);
    }
  });
}

function showError(title, message = '') {
  techListContainer.innerHTML = `
    <div class="empty-state">
      <strong>${title}</strong><br/>
      ${message}
    </div>
  `;
}

refreshButton.addEventListener('click', detect);
window.addEventListener('load', detect);
