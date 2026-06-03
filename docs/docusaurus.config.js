// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@tsconfig/docusaurus`).

const { themes } = require('prism-react-renderer');
const tailwindPlugin = require('./plugins/tailwind-plugin.cjs');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Hoolix',
  tagline: 'Turn documentation into trusted MCP servers',
  favicon: 'img/favicon.ico',

  url: 'https://jayllm.github.io',
  baseUrl: '/hoolix/',

  organizationName: 'JayLLM',
  projectName: 'hoolix',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  future: {
    faster: false,
  },
  trailingSlash: false,

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  headTags: [
    {
      tagName: 'meta',
      attributes: {
        property: 'og:type',
        content: 'website',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:title',
        content: 'Hoolix — Documentation into trusted MCP servers',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:description',
        content:
          'Create authenticated Streamable HTTP MCP servers from llms.txt, GitHub repositories, and websites with grounded RAG and production-grade DX.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
    },
    {
      tagName: 'script',
      attributes: {
        type: 'application/ld+json',
      },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Hoolix',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Windows, macOS, Linux',
        description:
          'A developer-first CLI and documentation portal that turns documentation URLs into authenticated, hostable MCP servers for AI agents.',
        url: 'https://jayllm.github.io/hoolix/',
        codeRepository: 'https://github.com/JayLLM/hoolix',
      }),
    },
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/JayLLM/hoolix/tree/main/docs/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
          remarkPlugins: [
            [require('@docusaurus/remark-plugin-npm2yarn'), { sync: true }],
          ],
        },
        blog: {
          showReadingTime: true,
          routeBasePath: 'blog',
          editUrl: 'https://github.com/JayLLM/hoolix/tree/main/docs/',
          blogTitle: 'Hoolix Blog',
          blogDescription: 'Release notes, architecture notes, and field guides for agent-ready documentation.',
          postsPerPage: 6,
        },
        theme: {
          customCss: ['./src/css/custom.css'],
        },
      }),
    ],
  ],

  plugins: [tailwindPlugin],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      metadata: [
        {
          name: 'keywords',
          content:
            'mcp, model context protocol, mcp server, llms.txt, rag, documentation, ai agents, claude, cursor, streamable http',
        },
        {
          name: 'theme-color',
          content: '#060914',
        },
      ],

      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },

      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: true,
        },
      },

      announcementBar: {
        id: 'hoolix-launch',
        content:
          '✨ New: build trusted MCP servers from llms.txt, GitHub, and websites — start with the 2-minute quick start.',
        backgroundColor: '#0f172a',
        textColor: '#dbeafe',
        isCloseable: true,
      },

      navbar: {
        hideOnScroll: false,
        title: 'Hoolix',
        logo: {
          alt: 'Hoolix',
          src: 'logo/light.svg',
          srcDark: 'logo/dark.svg',
          width: 140,
          height: 32,
        },
        items: [
          { to: '/', label: 'Home', position: 'left' },
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Docs',
          },
          {
            label: 'Features',
            position: 'left',
            items: [
              { label: 'Ingestion Pipeline', to: '/docs/architecture/ingestion-pipeline' },
              { label: 'Grounded RAG', to: '/docs/architecture/rag-and-tools' },
              { label: 'Authentication', to: '/docs/guides/authentication' },
              { label: 'Client Connect', to: '/docs/guides/connecting-clients' },
            ],
          },
          { to: '/blog', label: 'Blog', position: 'left' },
          {
            label: 'Resources',
            position: 'left',
            items: [
              { label: 'Quick Start', to: '/docs/getting-started/quick-start' },
              { label: 'CLI Reference', to: '/docs/api-reference/cli' },
              { label: 'Architecture', to: '/docs/architecture' },
              { label: 'Changelog', to: '/docs/changelog' },
            ],
          },
          {
            href: 'https://github.com/JayLLM/hoolix/discussions',
            label: 'Community',
            position: 'right',
            className: 'navbar-community-link',
          },
          {
            href: 'https://github.com/JayLLM/hoolix',
            label: 'GitHub',
            position: 'right',
            className: 'navbar-github-link',
          },
          {
            type: 'search',
            position: 'right',
          },
        ],
      },

      footer: {
        style: 'dark',
        links: [
          {
            title: 'Product',
            items: [
              { label: 'Features', to: '/' },
              { label: 'Interactive demo', to: '/' },
              { label: 'Pricing', to: '/' },
              { label: 'Blog', to: '/blog' },
            ],
          },
          {
            title: 'Documentation',
            items: [
              { label: 'Quick Start', to: '/docs/getting-started/quick-start' },
              { label: 'Create servers', to: '/docs/guides/creating-servers' },
              { label: 'Connect clients', to: '/docs/guides/connecting-clients' },
              { label: 'CLI Reference', to: '/docs/api-reference/cli' },
            ],
          },
          {
            title: 'Architecture',
            items: [
              { label: 'Overview', to: '/docs/architecture' },
              { label: 'Ingestion', to: '/docs/architecture/ingestion-pipeline' },
              { label: 'RAG & tools', to: '/docs/architecture/rag-and-tools' },
              { label: 'Host process', to: '/docs/architecture/host-and-process' },
            ],
          },
          {
            title: 'Community',
            items: [
              { label: 'GitHub', href: 'https://github.com/JayLLM/hoolix' },
              { label: 'Discussions', href: 'https://github.com/JayLLM/hoolix/discussions' },
              { label: 'Issues', href: 'https://github.com/JayLLM/hoolix/issues' },
              { label: 'Releases', href: 'https://github.com/JayLLM/hoolix/releases' },
            ],
          },
        ],
        logo: {
          alt: 'Hoolix',
          src: 'logo/light.svg',
          srcDark: 'logo/dark.svg',
          href: '/',
          width: 130,
        },
        copyright: `Copyright © ${new Date().getFullYear()} Hoolix contributors. Built with Docusaurus for agent-ready docs.`,
      },

      prism: {
        theme: themes.github,
        darkTheme: themes.dracula,
        additionalLanguages: ['bash', 'json', 'typescript', 'powershell', 'diff', 'yaml', 'toml'],
        magicComments: [
          {
            className: 'theme-code-block-highlighted-line',
            line: 'highlight-next-line',
            block: { start: 'highlight-start', end: 'highlight-end' },
          },
        ],
      },
    }),
};

module.exports = config;
