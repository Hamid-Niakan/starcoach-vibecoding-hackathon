import mdx from '@next/mdx';

const withMDX = mdx({
  extension: /\.mdx?$/
});

const nextConfig = {
  output: "export",
  reactStrictMode: true,
  transpilePackages: ['@hackathon/contracts', '@hackathon/api-client', '@hackathon/chat-ui'],
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  trailingSlash: true,
};

export default withMDX(nextConfig);
