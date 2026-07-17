import { motion } from "framer-motion";
import { Sparkles, Zap, Palette, Globe, ArrowRight, Code2, Wand2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar, googleLogin } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

const features = [
  {
    icon: Wand2,
    title: "Prompt → Website",
    desc: "Describe any idea in one sentence. Get a full multi-page site with design, copy, and interactivity in seconds.",
    span: "md:col-span-2",
  },
  { icon: Palette, title: "Beautiful by default", desc: "Modern typography, thoughtful spacing, and cohesive palettes generated for your niche." },
  { icon: Zap, title: "Instant live preview", desc: "See your site render in a real browser frame the moment it's generated." },
  { icon: Code2, title: "Export clean code", desc: "Copy or download production-ready HTML, CSS and JavaScript. No lock-in." },
  { icon: Globe, title: "Fully responsive", desc: "Every generated site adapts to phones, tablets, and desktops." },
  { icon: Rocket, title: "Ship in minutes", desc: "Iterate with new prompts and keep every version safely in your project history." },
];

export const Landing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const cta = () => {
    if (user) navigate("/dashboard");
    else googleLogin();
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="orb bg-blue-500" style={{ width: 480, height: 480, top: -100, left: -100 }} />
        <div className="orb bg-purple-600" style={{ width: 520, height: 520, top: 80, right: -140 }} />
        <div className="grid-bg absolute inset-0 opacity-40" />

        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs font-medium mb-8"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            Powered by GPT-5.2
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05]"
          >
            Ship a stunning website
            <br />
            <span className="gradient-text">in one prompt.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Knowledge-Nexus AI turns a single sentence into a complete, responsive,
            production-ready website — with pages, design, and code you can export.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Button
              data-testid="hero-get-started-btn"
              onClick={cta}
              size="lg"
              className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-[0_0_35px_rgba(139,92,246,0.5)] transition-all hover:-translate-y-0.5 text-white px-7 h-12"
            >
              Get Started Free
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <a
              href="#features"
              data-testid="hero-features-link"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
            >
              See what&apos;s inside ↓
            </a>
          </motion.div>

          {/* Prompt preview mock */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-20 relative"
          >
            <div className="glass rounded-2xl p-1.5 max-w-3xl mx-auto shadow-2xl">
              <div className="flex items-center gap-1.5 px-4 py-2">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <div className="ml-4 text-xs text-muted-foreground font-mono">knowledge-nexus.ai/builder</div>
              </div>
              <div className="rounded-xl bg-zinc-950/60 dark:bg-zinc-950/80 p-8 text-left">
                <div className="text-xs text-muted-foreground font-mono mb-2">Prompt</div>
                <div className="font-mono text-sm mb-6 text-zinc-200">
                  <span className="text-purple-400">›</span> Create a modern restaurant website with menu and reservations.
                </div>
                <div className="text-xs text-muted-foreground font-mono mb-2">Output</div>
                <div className="grid grid-cols-4 gap-2">
                  {["Home", "About", "Menu", "Contact"].map((p) => (
                    <div key={p} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-center">
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-3">Features</div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">
              Everything you need to <span className="gradient-text">launch fast</span>.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className={`glass rounded-2xl p-6 hover:border-purple-500/30 transition-all ${f.span || ""}`}
                data-testid={`feature-card-${i}`}
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-purple-400" />
                </div>
                <div className="font-medium text-lg mb-1.5">{f.title}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14">
            <div className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-3">Workflow</div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight">Three steps. That&apos;s the whole thing.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: "01", t: "Sign in", d: "One click with Google. No forms." },
              { n: "02", t: "Describe your site", d: "Say what you want in plain English." },
              { n: "03", t: "Preview & export", d: "Copy the code or download the files." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-white/10 p-8">
                <div className="text-4xl font-mono text-purple-400/80 mb-6">{s.n}</div>
                <div className="text-xl font-medium mb-2">{s.t}</div>
                <div className="text-sm text-muted-foreground">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 px-6">
        <div className="max-w-4xl mx-auto glass rounded-3xl p-12 text-center relative overflow-hidden">
          <div className="orb bg-purple-600" style={{ width: 300, height: 300, top: -80, right: -80 }} />
          <div className="orb bg-blue-500" style={{ width: 300, height: 300, bottom: -100, left: -80 }} />
          <div className="relative">
            <h3 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4">Ready to build?</h3>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Join creators shipping websites 100× faster with AI. It&apos;s free to start.
            </p>
            <Button
              data-testid="cta-get-started-btn"
              onClick={cta}
              size="lg"
              className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-[0_0_35px_rgba(139,92,246,0.5)] text-white px-7 h-12"
            >
              Get Started with Google
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};
