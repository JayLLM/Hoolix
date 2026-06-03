// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: '🚀 Start here',
    },
    {
      type: 'category',
      label: '⚡ Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/basic-usage',
      ],
    },
    {
      type: 'category',
      label: '🏗️ Architecture',
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/ingestion-pipeline',
        'architecture/rag-and-tools',
        'architecture/host-and-process',
      ],
    },
    {
      type: 'category',
      label: '🧰 API Reference',
      collapsed: true,
      items: [
        'api-reference/cli',
        'api-reference/core',
        'api-reference/ingestion',
        'api-reference/rag',
        'api-reference/mcp-host',
      ],
    },
    {
      type: 'category',
      label: '🧭 Guides',
      collapsed: true,
      items: [
        'guides/creating-servers',
        'guides/reindexing-and-verify',
        'guides/authentication',
        'guides/connecting-clients',
        'guides/multi-page-llms',
        'guides/advanced-rag',
        'guides/best-practices',
      ],
    },
    {
      type: 'category',
      label: '⚙️ Configuration',
      collapsed: true,
      items: [
        'configuration/environment',
        'configuration/paths-and-data',
        'configuration/registry-and-validation',
      ],
    },
    {
      type: 'category',
      label: '🤝 Contributing',
      collapsed: true,
      items: [
        'contributing/development-setup',
        'contributing/code-style',
        'contributing/pull-requests',
        'contributing/testing',
      ],
    },
    {
      type: 'category',
      label: '🛟 FAQ & Troubleshooting',
      collapsed: true,
      items: [
        'faq/common-issues',
        'faq/windows-specific',
        'faq/fetch-and-protection',
        'faq/binary-size-and-performance',
      ],
    },
    {
      type: 'doc',
      id: 'changelog',
      label: '✨ Changelog',
    },
  ],
};

module.exports = sidebars;
