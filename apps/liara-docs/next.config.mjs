import mdx from '@next/mdx';

const withMDX = mdx({
  extension: /\.mdx?$/
});

const nextConfig = {
  output: "export",
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_AI_GATEWAY_URL:
      process.env.NEXT_PUBLIC_AI_GATEWAY_URL ?? "http://localhost:4000",
  },
  transpilePackages: ['@hackathon/contracts', '@hackathon/api-client', '@hackathon/chat-ui'],
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  trailingSlash: true,
};

export default withMDX(nextConfig);
