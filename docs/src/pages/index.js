import React, { useEffect, useRef, useState } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import FeatureCard from '../components/FeatureCard';

const terminalFrames = [
  {
    prompt: 'hoolix create linear --url https://linear.app/llms.txt --yes',
    output: ['✓ discovered llms-full.txt sibling', '✓ indexed 428 chunks with source URLs', '✓ generated auth key and registry entry'],
  },
  {
    prompt: 'hoolix verify linear',
    output: ['grounding: 100% URLs present', 'search_documentation: 42ms p95', 'recommendation: ready for Cursor + Claude'],
  },
  {
    prompt: 'hoolix connect linear --client cursor',
    output: ['✓ merged MCP config', '✓ copied bearer token', 'Next: restart Cursor and ask about Linear docs'],
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
            Official portal for agent-ready documentation
          </div>

          <Heading as="h1" className="home-hero__title">
            Turn docs into trusted MCP servers.
          </Heading>

          <p className="home-hero__subtitle">
            Hoolix transforms <strong>llms.txt</strong>, GitHub repositories, and websites into authenticated,
            hostable Streamable HTTP MCP servers with source-grounded RAG, verification, audit logs, and one-command
            client connection.
          </p>

          <div className="home-hero__actions">
            <Link className="button button--primary button--lg button--glow" to="/docs/getting-started/quick-start">
              Start in 2 minutes
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
            <span>Fuse.js + optional hybrid RAG</span>
            <span>Claude · Cursor · Windsurf</span>
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
      title: 'llms.txt-native ingestion',
      description:
        'Sibling llms-full discovery, manifest expansion, per-page chunking, GitHub tree fallback, and anti-bot resilience keep source URLs real.',
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
        'Per-server keys, Bearer auth, rotation, rate limits, audit logs, response caps, and timeout wrappers are built into the host process.',
      to: '/docs/guides/authentication',
    },
    {
      icon: '🪄',
      title: 'Connect magic',
      description:
        'A polished CLI and TUI create, verify, start, connect, rotate, and reindex servers with --json everywhere for automation.',
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
      title: 'Binary-first distribution',
      description:
        'Packaged binaries self-spawn hosted servers without requiring tsx, source files, or a runtime on your users’ machines.',
      to: '/docs/faq/binary-size-and-performance',
    },
  ];

  return (
    <section className="portal-section" id="features">
      <div className="container">
        <Reveal className="section-heading">
          <span className="section-kicker">Feature stack</span>
          <h2>Everything agents need. Nothing in the hot path that they do not.</h2>
          <p>
            Hoolix is designed around trustworthy retrieval, delightful post-install UX, and secure hostable MCP
            servers that feel production-ready on day one.
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
    ['Create', 'Ingest from llms.txt, GitHub, or any docs URL.'],
    ['Verify', 'Inspect search quality, samples, and grounding percentage.'],
    ['Host', 'Start authenticated Streamable HTTP with rate limits and audit.'],
    ['Connect', 'Patch Cursor, Claude, or any MCP client in one command.'],
  ];

  return (
    <section className="portal-section portal-section--alt" id="demo">
      <div className="container demo-grid">
        <Reveal className="section-heading section-heading--left">
          <span className="section-kicker">Live workflow</span>
          <h2>From a documentation URL to an agent-ready server.</h2>
          <p>
            The CLI stays hand-rolled and fast, the TUI is dynamically loaded only when needed, and hosted MCP servers
            keep every response grounded with source URLs.
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
            Premium sidebars, sticky table of contents, command-bar search, edit links, helpful prompts, copyable code,
            and careful contrast keep readers moving.
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
              URL, and automate every workflow from the CLI.
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
          <p>Install the binary, create your first server, verify grounding, and connect your client in minutes.</p>
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
      title={`${siteConfig.title} — Official homepage and documentation portal`}
      description="Hoolix turns documentation URLs into secure, hostable MCP servers with source-grounded RAG, verification, TUI, CLI automation, and client connect flows."
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
