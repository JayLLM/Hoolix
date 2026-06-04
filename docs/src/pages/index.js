import React, { useEffect, useRef, useState } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import FeatureCard from '../components/FeatureCard';

const terminalFrames = [
  {
    prompt: 'hoolix',
    output: ['TUI dashboard opened', 'trial, templates, create, verify, connect', 'masked secrets with copy-on-demand config'],
  },
  {
    prompt: 'hoolix create stack --source docs:https://react.dev/llms.txt --source github:vercel/next.js --yes',
    output: ['validated multi-source definition', 'indexed chunks with source provenance', 'next: hoolix verify stack'],
  },
  {
    prompt: 'hoolix create terraform --template terraform-aws-docs --yes',
    output: ['loaded official template', 'created template-backed MCP server', 'ready for verify, start, connect'],
  },
  {
    prompt: 'hoolix start stack --transport stdio --json',
    output: ['printed stdio MCP client config', 'HTTP transport also available', 'tools include source URLs'],
  },
];

function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.18 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal--visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function HeroTerminal() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((current) => (current + 1) % terminalFrames.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  const current = terminalFrames[frame];

  return (
    <div className="hero-terminal" aria-label="Animated Hoolix command line demo">
      <div className="hero-terminal__bar">
        <span />
        <span />
        <span />
        <strong>hoolix live</strong>
      </div>
      <div className="hero-terminal__body">
        <div className="hero-terminal__prompt">
          <span>$</span> {current.prompt}
        </div>
        {current.output.map((line) => (
          <div className="hero-terminal__line" key={line}>
            {line}
          </div>
        ))}
      </div>
      <div className="hero-terminal__metrics" aria-label="Key product metrics">
        <div>
          <strong>&lt;30s</strong>
          <span>connect flow</span>
        </div>
        <div>
          <strong>3 tools</strong>
          <span>grounded MCP</span>
        </div>
        <div>
          <strong>0 deps</strong>
          <span>after binary install</span>
        </div>
      </div>
    </div>
  );
}

function HomepageHeader() {
  return (
    <header className="home-hero">
      <div className="home-hero__glow home-hero__glow--one" />
      <div className="home-hero__glow home-hero__glow--two" />
      <div className="container home-hero__grid">
        <Reveal className="home-hero__copy">
          <div className="eyebrow">
            <span className="eyebrow__dot" />
            The MCP home base for docs, sources, templates, and teams
          </div>

          <Heading as="h1" className="home-hero__title">
            Hoolix turns knowledge into trusted MCP servers.
          </Heading>

          <p className="home-hero__subtitle">
            Build secure, source-grounded MCP servers from <strong>llms.txt</strong>, GitHub repositories, websites,
            private docs, custom sources, and official templates. Start in the TUI, automate with the CLI, or manage
            visually from the local dashboard.
          </p>

          <div className="home-hero__actions">
            <Link className="button button--primary button--lg button--glow" to="/docs/getting-started/quick-start">
              Start with the TUI
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/intro">
              Explore docs
            </Link>
            <Link className="button button--ghost button--lg" to="https://github.com/JayLLM/hoolix">
              Star on GitHub
            </Link>
          </div>

          <div className="home-hero__proof" aria-label="Platform highlights">
            <span>Windows · macOS · Linux</span>
          <span>TUI · CLI · GUI</span>
          <span>HTTP · stdio</span>
          </div>
        </Reveal>

        <Reveal className="home-hero__visual" delay={140}>
          <HeroTerminal />
        </Reveal>
      </div>
    </header>
  );
}

function LogoCloud() {
  const logos = ['Claude', 'Cursor', 'Windsurf', 'Grok Build', 'Continue', 'Cline', 'GitHub', 'llms.txt'];

  return (
    <section className="logo-cloud" aria-labelledby="logo-cloud-title">
      <div className="container">
        <p id="logo-cloud-title" className="logo-cloud__label">
          Built for teams shipping agent workflows on top of trusted documentation
        </p>
        <div className="logo-cloud__grid">
          {logos.map((logo) => (
            <span key={logo}>{logo}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: '📚',
      title: 'Source-native ingestion',
      description:
        'Single URLs, multi-source definitions, GitHub repos, private docs, custom plugins, and llms-full discovery keep source URLs real.',
      to: '/docs/architecture/ingestion-pipeline',
    },
    {
      icon: '🧠',
      title: 'Grounded RAG agents trust',
      description:
        'Fuse.js plus direct keyword search by default, optional hybrid semantic mode, rich metadata, and URL-backed answers for every tool call.',
      to: '/docs/architecture/rag-and-tools',
    },
    {
      icon: '🔐',
      title: 'Secure by default',
      description:
        'Per-server keys, Bearer auth, rotation, persistent rate limits, audit logs, stats, response caps, and timeout wrappers are built in.',
      to: '/docs/guides/authentication',
    },
    {
      icon: '🪄',
      title: 'TUI, CLI, and GUI',
      description:
        'Start in the TUI, automate with JSON CLI output, and use the local dashboard for templates, stats, and playground testing.',
      to: '/docs/api-reference/cli',
    },
    {
      icon: '🧪',
      title: 'Quality verification',
      description:
        'Run verify to inspect samples, grounding percentage, search modes, and readiness before exposing documentation to agent clients.',
      to: '/docs/guides/reindexing-and-verify',
    },
    {
      icon: '📦',
      title: 'Templates and bundles',
      description:
        'Create from official templates, export team-safe bundles, import shared servers, and keep secrets stripped when needed.',
      to: '/docs/guides/creating-servers',
    },
  ];

  return (
    <section className="portal-section" id="features">
      <div className="container">
        <Reveal className="section-heading">
          <span className="section-kicker">Feature stack</span>
          <h2>Everything agents need. Nothing in the hot path that they do not.</h2>
          <p>
            Hoolix is designed around trustworthy retrieval, delightful post-install UX, and secure MCP servers that
            feel production-ready on day one.
          </p>
        </Reveal>

        <div className="feature-grid">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 70}>
              <FeatureCard {...feature} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  const flow = [
    ['Explore', 'Open the TUI, launch a trial, or browse official templates.'],
    ['Create', 'Ingest one source, many sources, private docs, GitHub repos, or custom plugins.'],
    ['Verify', 'Inspect source health, samples, grounding, and retrieval quality.'],
    ['Host', 'Use authenticated Streamable HTTP or stdio, then connect your client.'],
  ];

  return (
    <section className="portal-section portal-section--alt" id="demo">
      <div className="container demo-grid">
        <Reveal className="section-heading section-heading--left">
          <span className="section-kicker">Live workflow</span>
          <h2>From a documentation URL to an agent-ready server.</h2>
          <p>
            Hoolix keeps the TUI friendly, the CLI scriptable, and the GUI visual while all three share the same
            definitions, catalog, ingestion, verification, analytics, and hosting services.
          </p>
          <Link className="button button--primary" to="/docs/getting-started/quick-start">
            Follow the quick start
          </Link>
        </Reveal>

        <Reveal className="workflow-card" delay={120}>
          {flow.map(([title, text], index) => (
            <div className="workflow-step" key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function DocsSection() {
  const docs = [
    ['Install', '/docs/getting-started/installation', 'Get the binary running on Windows, macOS, or Linux.'],
    ['Create servers', '/docs/guides/creating-servers', 'Choose source types, flags, and repeatable ingestion patterns.'],
    ['Connect clients', '/docs/guides/connecting-clients', 'Wire Hoolix into Claude Desktop, Cursor, Windsurf, and more.'],
    ['Architecture', '/docs/architecture', 'Understand ingestion, RAG, transport, data paths, and process management.'],
  ];

  return (
    <section className="portal-section" id="docs-experience">
      <div className="container">
        <Reveal className="section-heading">
          <span className="section-kicker">Documentation portal</span>
          <h2>A docs experience that feels part of the product.</h2>
          <p>
            Friendly quick starts, precise references, architecture notes, examples, and command recipes keep first-time
            users and power users moving.
          </p>
        </Reveal>
        <div className="docs-lanes">
          {docs.map(([title, to, text], index) => (
            <Reveal key={title} delay={index * 80}>
              <Link className="docs-lane" to={to}>
                <strong>{title}</strong>
                <span>{text}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section className="portal-section portal-section--compact" id="pricing">
      <div className="container">
        <Reveal className="pricing-card">
          <div>
            <span className="section-kicker">Pricing</span>
            <h2>Open source today. Premium-grade forever.</h2>
            <p>
              Hoolix is built as a best-in-class open-source developer tool. Host it locally, inspect every source
              URL, automate every workflow from the CLI, and share team-safe bundles when your server is ready.
            </p>
          </div>
          <Link className="button button--secondary button--lg" to="https://github.com/JayLLM/hoolix">
            View repository
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="final-cta">
      <div className="container">
        <Reveal>
          <h2>Give your agents documentation they can actually trust.</h2>
          <p>Open the TUI, create a trial or template-backed server, verify grounding, and connect your client in minutes.</p>
          <div className="final-cta__actions">
            <Link className="button button--primary button--lg button--glow" to="/docs/getting-started/installation">
              Install Hoolix
            </Link>
            <Link className="button button--ghost button--lg" to="/blog">
              Read the blog
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout
      title={`${siteConfig.title} — MCP home base for docs, sources, templates, and teams`}
      description="Hoolix turns docs, sources, GitHub repos, private knowledge, and templates into secure MCP servers with grounded RAG, TUI, CLI, GUI, HTTP, stdio, stats, and client connect flows."
      wrapperClassName="homepage"
    >
      <HomepageHeader />
      <main>
        <LogoCloud />
        <FeaturesSection />
        <DemoSection />
        <DocsSection />
        <PricingSection />
        <FinalCTA />
      </main>
    </Layout>
  );
}
